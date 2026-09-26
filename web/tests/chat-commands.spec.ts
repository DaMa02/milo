import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Event { kind: string; text?: string; command?: { action: string; params: unknown } }
interface Harness {
  send: (text: string) => Promise<void>;
  cancel: () => void;
  events: Event[];
  setBusy: (value: boolean) => void;
  pending?: Promise<void>;
}
type TestWindow = Window & { __chat: Harness };
const context = { view: 'overview', pending: null, candidates: [], has_destination: false, routes: [] };

async function harness(page: Page, delayed = false) {
  const requests: Record<string, unknown>[] = [];
  const statusesAtRequest: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    if (new URL(route.request().url()).pathname !== '/api/interpret') throw new Error('Unexpected API request');
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(body);
    statusesAtRequest.push(await page.evaluate(() => (window as TestWindow).__chat.events.filter((event) => event.kind === 'status').length));
    if (delayed) await gate;
    await route.fulfill({ json: { utterance: body.utterance, action: 'chat',
      params: { text: 'This is a general answer about the destination.', web: false }, via: 'claude' } }).catch(() => {});
  });
  await page.route(/\/src\/App\.tsx(?:\?.*)?$/, async (route) => {
    const original = await (await route.fetch()).text();
    const react = original.match(/from\s+["']([^"']*\/react\.js[^"']*)["']/)?.[1];
    if (!react) throw new Error('Missing Vite React import');
    await route.fulfill({ contentType: 'application/javascript', body: `
      import React from '${react}';
      import {useVoiceCommands} from '/src/hooks/useVoiceCommands.ts';
      const events=[];
      export function App(){
        const [ready,setReady]=React.useState(false);
        const [busy,setBusy]=React.useState(false);
        const commands=useVoiceCommands({busy,context:${JSON.stringify(context)},
          onAction:command=>events.push({kind:'action',command}),onError:()=>events.push({kind:'error'}),
          onBusy:()=>events.push({kind:'busy'}),onStatus:text=>events.push({kind:'status',text})});
        React.useEffect(()=>setReady(true),[]);
        window.__chat={...window.__chat,...commands,events,setBusy};
        return React.createElement('p',{'data-testid':'ready','data-mounted':String(ready),'data-busy':String(busy)},String(commands.interpreting));
      }
    ` });
  });
  await page.goto('/');
  await expect(page.getByTestId('ready')).toHaveAttribute('data-mounted', 'true');
  await expect(page.getByTestId('ready')).toHaveText('false');
  return { requests, statusesAtRequest, release };
}
const events = (page: Page) => page.evaluate(() => (window as TestWindow).__chat.events);
const send = (page: Page, text: string) => page.evaluate((value) => (window as TestWindow).__chat.send(value), text);

test('chat accepts a nonempty answer and a boolean web flag and rejects malformed responses', async ({ page }) => {
  await harness(page);
  const result = await page.evaluate(async () => {
    const path = '/src/api/interpret.ts';
    const { parseCommand } = await import(path) as typeof import('../src/api/interpret');
    const command = (params: unknown) => ({ utterance: 'Tell me about it', action: 'chat', params, via: 'claude' });
    const valid = [false, true].map((web) => parseCommand(command({ text: 'A general answer.', web })));
    const invalid = [{ text: '', web: false }, { text: '  ', web: true }, { text: 'Answer' },
      { text: 'Answer', web: 'true' }, { text: 4, web: false }];
    return { valid, rejected: invalid.map((value) => { try { parseCommand(command(value)); return false; } catch { return true; } }) };
  });
  expect(result.valid).toEqual([false, true].map((web) => ({ action: 'chat', params: { text: 'A general answer.', web } })));
  expect(result.rejected).toEqual(Array(5).fill(true));
});

test('explicit search words announce before interpretation without changing the request or returned web flag', async ({ page }) => {
  const engine = await harness(page);
  const utterances = ['Search for the museum', 'look up the gallery', 'Find it ONLINE', 'Tell me about the research centre'];
  for (const text of utterances) await send(page, text);
  expect(engine.statusesAtRequest).toEqual([1, 2, 3, 3]);
  expect((await events(page)).filter((event) => event.kind === 'status')).toEqual(Array(3).fill({ kind: 'status', text: 'Searching the web.' }));
  expect(engine.requests).toEqual(utterances.map((utterance) => ({ utterance, lang: 'en', context })));
  expect((await events(page)).filter((event) => event.kind === 'action').map((event) => event.command)).toEqual(
    Array(4).fill({ action: 'chat', params: { text: 'This is a general answer about the destination.', web: false } }));
});

test('busy requests do not announce a search or contact the interpreter and local stop remains immediate', async ({ page }) => {
  const engine = await harness(page);
  await page.evaluate(() => (window as TestWindow).__chat.setBusy(true));
  await expect(page.getByTestId('ready')).toHaveAttribute('data-busy', 'true');
  await send(page, 'Search for a cafe');
  expect(await events(page)).toEqual([{ kind: 'busy' }]);
  await send(page, 'stop');
  expect(engine.requests).toEqual([]);
  expect((await events(page)).at(-1)).toEqual({ kind: 'action', command: { action: 'stop', params: {} } });
});

test('a cancelled search does not deliver a late chat response', async ({ page }) => {
  const engine = await harness(page, true);
  await page.evaluate(() => { const chat = (window as TestWindow).__chat; chat.pending = chat.send('Search online for the destination'); });
  await expect.poll(() => engine.requests.length).toBe(1);
  await page.evaluate(() => (window as TestWindow).__chat.cancel());
  engine.release();
  await page.evaluate(() => (window as TestWindow).__chat.pending);
  expect(await events(page)).toEqual([{ kind: 'status', text: 'Searching the web.' }]);
});
