import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import candidates from '../../contracts/fixtures/plan.stop-candidates.json' with { type: 'json' };
import withStop from '../../contracts/fixtures/plan.stop-5-min.json' with { type: 'json' };

type TestState = { phase: string; pending: string | null; lastAction?: string; selectedIndex: number; candidates: unknown[] };
interface Harness {
  hook: { requestStop: (kind: string, minutes?: number) => void; confirm: (answer: string, index?: number) => void;
    setDuration: (minutes: number) => void; clearLastAction: () => void; cancel: () => void; acceptResult: (plan: unknown, kind: string) => boolean };
  options: (options: Record<string, unknown>) => void;
  operations: { endpoint: string; body: Record<string, unknown> }[];
  messages: string[];
}
type TestWindow = Window & { __stops: Harness };
async function harness(page: Page) {
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition() { throw new Error('Stops must not request GPS'); },
      watchPosition() { throw new Error('Stops must not watch GPS'); },
    } });
  });
  await page.route(/\/src\/App\.tsx(?:\?.*)?$/, async (route) => {
    const original = await (await route.fetch()).text();
    const react = original.match(/from\s+["']([^"']*\/react\.js[^"']*)["']/)?.[1];
    if (!react) throw new Error('Vite React import is missing');
    await route.fulfill({ contentType: 'application/javascript', body: `
      import React from '${react}';
      import {useVoiceStops} from '/src/hooks/useVoiceStops.ts';
      import {dictionaries} from '/src/i18n/index.ts';
      const operations=[],messages=[];
      export function App(){
        const [ready,setReady]=React.useState(false);
        const [options,setOptions]=React.useState({sessionId:'first',plan:${JSON.stringify(candidates)},busy:false,uncertain:false,error:null});
        const hook=useVoiceStops({...options,t:dictionaries.en,onMutate:(endpoint,body)=>operations.push({endpoint,body}),onMessage:text=>messages.push(text)});
        React.useEffect(()=>setReady(true),[]);
        window.__stops={hook,operations,messages,options:patch=>setOptions(old=>({...old,...patch}))};
        return React.createElement('pre',{'data-testid':'state','data-ready':String(ready),'data-options':JSON.stringify(options)},JSON.stringify({phase:hook.phase,pending:hook.pending,lastAction:hook.lastAction,selectedIndex:hook.selectedIndex,candidates:hook.candidates}));
      }
    ` });
  });
  await page.goto('/');
  await expect(page.getByTestId('state')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('state')).toContainText('idle');
}
async function state(page: Page): Promise<TestState> { return JSON.parse(await page.getByTestId('state').innerText()) as TestState; }
async function operations(page: Page) { return page.evaluate(() => (window as TestWindow).__stops.operations); }
async function updateOptions(page: Page, options: Record<string, unknown>) {
  await page.evaluate((patch) => (window as TestWindow).__stops.options(patch), options);
  await expect.poll(async () => JSON.parse(await page.getByTestId('state').getAttribute('data-options') ?? '{}')).toMatchObject(options);
}
async function request(page: Page, kind = 'pharmacy', minutes?: number) {
  await page.evaluate(({ kind, minutes }) => (window as TestWindow).__stops.hook.requestStop(kind, minutes), { kind, minutes });
}
async function deliver(page: Page, plan = candidates, kind = 'candidates') {
  await page.evaluate(({ plan, kind }) => {
    const test = (window as TestWindow).__stops;
    test.hook.acceptResult(plan, kind); test.options({ plan, busy: false, error: null });
  }, { plan, kind });
}

test('interpreter accepts Jev, the six stop kinds and place_info while rejecting invalid durations and candidate indices', async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const path = '/src/api/interpret.ts';
    const { parseCommand } = await import(path) as typeof import('../src/api/interpret');
    const input = (action: string, params: Record<string, unknown>, via = 'jev') => ({ utterance: 'test', action, params, via });
    const kinds = ['supermarket', 'pharmacy', 'cafe', 'bakery', 'atm', 'shop'];
    const accepted = kinds.map((kind) => parseCommand(input('route_stop', { kind, duration_min: 15 })));
    const info = parseCommand(input('ask', { question: 'Is the pharmacy open?', tool: 'place_info', params: { place: { name: 'the pharmacy' } } }));
    const invalid = [input('route_stop', { kind: 'museum' }), input('route_stop', { kind: 'cafe', duration_min: 0 }),
      input('stop_duration', { minutes: 181 }), input('stop_duration', { minutes: 1.5 }), input('confirm', { answer: 'yes', index: -1 }),
      input('ask', { question: 'Is it open?', tool: 'place_info', params: { place: {} } }), input('help', {}, 'unknown')];
    return { accepted, info, rejected: invalid.map((value) => { try { parseCommand(value); return false; } catch { return true; } }) };
  });
  expect(result.accepted.map((command) => command.action)).toEqual(Array(6).fill('route_stop'));
  expect(result.info).toMatchObject({ action: 'ask', params: { tool: 'place_info', params: { place: { name: 'the pharmacy' } } } });
  expect(result.rejected).toEqual(Array(7).fill(true));
});

test('candidate confirmation uses only the offered OSM ID and asks for a valid duration before writing', async ({ page }) => {
  await harness(page); await request(page);
  expect(await operations(page)).toEqual([{ endpoint: 'stop/candidates', body: { kind: 'pharmacy' } }]);
  await deliver(page);
  await expect.poll(() => state(page)).toMatchObject({ pending: 'stop', phase: 'choosing', selectedIndex: 0, lastAction: 'route_stop' });
  expect(await page.evaluate(() => (window as TestWindow).__stops.messages.at(-1))).toContain(candidates.text);
  await page.evaluate(() => (window as TestWindow).__stops.hook.confirm('yes', 99));
  expect(await operations(page)).toHaveLength(1);
  await page.evaluate(() => (window as TestWindow).__stops.hook.confirm('no'));
  await expect.poll(async () => (await state(page)).selectedIndex).toBe(1);
  await page.evaluate(() => (window as TestWindow).__stops.hook.confirm('yes', 0));
  await expect.poll(async () => (await state(page)).phase).toBe('duration');
  for (const minutes of [0, 181, 1.5]) await page.evaluate((value) => (window as TestWindow).__stops.hook.setDuration(value), minutes);
  expect(await operations(page)).toHaveLength(1);
  await page.evaluate(() => (window as TestWindow).__stops.hook.setDuration(10));
  expect(await operations(page)).toEqual([{ endpoint: 'stop/candidates', body: { kind: 'pharmacy' } },
    { endpoint: 'stop', body: { osm_id: candidates.stop_candidates[0].osm_id, duration_min: 10 } }]);
});

test('a supplied duration is applied after confirmation and later duration commands update the confirmed stop', async ({ page }) => {
  await harness(page); await request(page, 'cafe', 5); await deliver(page);
  await page.evaluate(() => (window as TestWindow).__stops.hook.confirm('yes', 0));
  expect((await operations(page)).at(-1)).toEqual({ endpoint: 'stop', body: { osm_id: candidates.stop_candidates[0].osm_id, duration_min: 5 } });
  await deliver(page, withStop as typeof candidates, 'plan');
  await expect.poll(() => state(page)).toMatchObject({ phase: 'idle', pending: null, lastAction: 'route_stop' });
  await page.evaluate(() => (window as TestWindow).__stops.hook.setDuration(180));
  expect((await operations(page)).at(-1)).toEqual({ endpoint: 'stop', body: { osm_id: withStop.stop.osm_id, duration_min: 180 } });
});

test('empty candidates and rejected mutations do not create a stop or replace the existing plan', async ({ page }) => {
  await harness(page); await request(page, 'atm');
  await deliver(page, { ...candidates, stop_candidates: [] });
  await expect.poll(() => state(page)).toMatchObject({ phase: 'idle', pending: null, candidates: [] });
  await request(page, 'shop', 15); await deliver(page);
  await page.evaluate(() => (window as TestWindow).__stops.hook.confirm('yes'));
  await updateOptions(page, { busy: true });
  await updateOptions(page, { busy: false, error: 'The change was rejected.' });
  await expect.poll(() => state(page)).toMatchObject({ phase: 'idle', pending: null, candidates: [] });
  expect(await operations(page)).toHaveLength(3);
});

test('cancelled, changed-plan and uncertain contexts cannot reuse candidates or overlap writes', async ({ page }) => {
  await harness(page); await request(page, 'bakery', 15);
  await page.evaluate(() => (window as TestWindow).__stops.hook.cancel());
  await request(page, 'supermarket', 5);
  expect(await operations(page)).toHaveLength(1);
  await deliver(page);
  await expect.poll(() => state(page)).toMatchObject({ phase: 'idle', pending: null, candidates: [] });
  await request(page, 'supermarket', 5); await deliver(page);
  await updateOptions(page, { plan: { ...candidates, plan_version: 3 } });
  await page.evaluate(() => (window as TestWindow).__stops.hook.confirm('yes', 0));
  expect(await operations(page)).toHaveLength(2);
  await updateOptions(page, { uncertain: true });
  await request(page, 'supermarket', 5);
  expect(await operations(page)).toHaveLength(2);
});

test('session replacement drops a late search and no route is selected implicitly', async ({ page }) => {
  await harness(page); await request(page, 'pharmacy', 5);
  await updateOptions(page, { sessionId: 'second' });
  await expect.poll(() => state(page)).toMatchObject({ phase: 'idle', pending: null, candidates: [] });
  await deliver(page);
  await expect.poll(() => state(page)).toMatchObject({ phase: 'idle', pending: null, candidates: [] });
  await updateOptions(page, { plan: { ...candidates, selected_route_id: null } });
  await request(page, 'pharmacy', 5);
  expect(await operations(page)).toHaveLength(1);
});

test('clearing the last action preserves candidate choice and the supplied duration', async ({ page }) => {
  await harness(page); await request(page, 'pharmacy', 15); await deliver(page);
  await expect.poll(() => state(page)).toMatchObject({ phase: 'choosing', lastAction: 'route_stop' });
  await page.evaluate(() => (window as TestWindow).__stops.hook.confirm('no'));
  await expect.poll(async () => (await state(page)).selectedIndex).toBe(1);
  const before = await state(page);
  expect(before.lastAction).toBe('route_stop');
  await page.evaluate(() => (window as TestWindow).__stops.hook.clearLastAction());
  await expect.poll(async () => (await state(page)).lastAction).toBeUndefined();
  const after = await state(page);
  expect(after.lastAction).toBeUndefined();
  expect({ ...after, lastAction: before.lastAction }).toEqual(before);
  expect(await operations(page)).toHaveLength(1);
  await page.evaluate(() => (window as TestWindow).__stops.hook.confirm('yes'));
  expect((await operations(page)).at(-1)).toEqual({ endpoint: 'stop',
    body: { osm_id: candidates.stop_candidates[1].osm_id, duration_min: 15 } });
});
