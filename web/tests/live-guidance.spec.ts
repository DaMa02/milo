import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const origin = { lat: 45, lon: 9 };
const line = [[45, 9], [45, 9.0013]];
test.beforeEach(async ({ page }) => {
  // Any missing mock fails locally instead of reaching the API or a model.
  await page.route(/^http:\/\/[^/]+\/api\//, (route) => route.abort());
});
const response = (overrides: Record<string, unknown> = {}) => ({
  status: 'on_route', text: null, route_id: 'A', off_route_m: 0,
  remaining_m: 100, remaining_min: 2, next: { instruction: 'Continue east', distance_m: 100 },
  route_line: null, ...overrides,
});

async function harness(page: Page, demo = false) {
  await page.clock.install({ time: new Date('2026-09-26T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-26T12:00:00Z'));
  await page.addInitScript(() => {
    const state = { watches: 0, cleared: [] as number[], wakeRequests: 0, releases: 0, locks: [] as { released: boolean }[],
      callbacks: new Map<number, PositionCallback>() };
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition: (callback: PositionCallback) => { const id = ++state.watches; state.callbacks.set(id, callback); return id; },
      clearWatch: (id: number) => { state.cleared.push(id); state.callbacks.delete(id); },
      getCurrentPosition: () => { throw new Error('Unexpected one-shot GPS request'); },
    } });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      state.wakeRequests++;
      const lock = { released: false, release: async () => { lock.released = true; state.releases++; }, addEventListener: () => {}, removeEventListener: () => {} };
      state.locks.push(lock); return lock;
    } } });
    Object.assign(window, { __gps: state, __fix: (lat: number, lon: number, heading: number | null = null) => {
      const fix = { coords: { latitude: lat, longitude: lon, accuracy: 5, altitude: null, altitudeAccuracy: null, heading, speed: null }, timestamp: Date.now() };
      state.callbacks.forEach((callback) => callback(fix));
    } });
  });
  await page.route(/\/src\/App\.tsx(?:\?.*)?$/, async (route) => {
    const original = await (await route.fetch()).text();
    const react = original.match(/from\s+["']([^"']*\/react\.js[^"']*)["']/)?.[1];
    if (!react) throw new Error('Vite React module not found');
    await route.fulfill({ contentType: 'application/javascript', body: `
      import React from '${react}';
      import {useLiveGuidance} from '/src/hooks/useLiveGuidance.ts';
      import {dictionaries} from '/src/i18n/index.ts';
      function Guidance({sessionId}) {
        const [messages,setMessages]=React.useState([]);
        const [errors,setErrors]=React.useState([]);
        const onMessage=React.useCallback(text=>setMessages(value=>[...value,text]),[]);
        const onError=React.useCallback(text=>setErrors(value=>[...value,text]),[]);
        const guidance=useLiveGuidance({sessionId,origin:{lat:45,lon:9},onMessage,onError,t:dictionaries.en,demo:${demo}});
        window.__guidance=guidance;
        return React.createElement(React.Fragment,null,
          React.createElement('button',{onClick:()=>guidance.start()},'Start'),
          React.createElement('button',{onClick:()=>guidance.stop()},'Stop'),
          React.createElement('p',{'data-testid':'active'},String(guidance.active)),
          React.createElement('p',{'data-testid':'status'},guidance.status),
          React.createElement('p',{'data-testid':'messages'},JSON.stringify(messages)),
          React.createElement('p',{'data-testid':'errors'},JSON.stringify(errors)),
          React.createElement('p',{'data-testid':'line'},JSON.stringify(guidance.routeLine)));
      }
      export function App(){
        const [session,setSession]=React.useState('first');
        const [mounted,setMounted]=React.useState(true);
        return React.createElement(React.Fragment,null,
          React.createElement('button',{onClick:()=>setSession('second')},'Change session'),
          React.createElement('button',{onClick:()=>setMounted(false)},'Unmount'),
          mounted?React.createElement(Guidance,{sessionId:session}):null);
      }` });
  });
  await page.goto('/');
}

async function fix(page: Page, heading: number | null = null) {
  await page.evaluate(({ origin, heading }) => {
    (window as unknown as { __fix: (lat: number, lon: number, heading: number | null) => void }).__fix(origin.lat, origin.lon, heading);
  }, { origin, heading });
  await page.clock.runFor(1);
}
async function gps(page: Page) {
  return page.evaluate(() => {
    const state = (window as unknown as { __gps: { watches: number; cleared: number[]; wakeRequests: number; releases: number } }).__gps;
    return { watches: state.watches, cleared: state.cleared, wakeRequests: state.wakeRequests, releases: state.releases };
  });
}

test('GPS requests are throttled, never overlap, omit unknown heading and do not speak null text', async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/session/*/navigate', async (route) => {
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) await held;
    await route.fulfill({ json: response(requests.length === 1 ? { route_line: line } : { text: 'Continue east.' }) }).catch(() => {});
  });
  await harness(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await fix(page);
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject(origin);
  expect(requests[0]).not.toHaveProperty('heading_deg');
  await fix(page, 90);
  await page.clock.runFor(1500);
  await fix(page, 90);
  expect(requests).toHaveLength(1);
  release();
  await expect(page.getByTestId('status')).toHaveText('on_route');
  await expect(page.getByTestId('messages')).toHaveText('[]');
  await page.clock.runFor(1);
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toHaveProperty('heading_deg', 90);
  await expect(page.getByTestId('messages')).toHaveText('["Continue east."]');
  await fix(page, 180);
  await page.clock.runFor(998);
  expect(requests).toHaveLength(2);
  await expect(page.getByTestId('line')).toHaveText(JSON.stringify(line));
});

for (const terminal of ['arrived', 'no_route'] as const) {
  test(`${terminal} stops GPS and releases the screen wake lock`, async ({ page }) => {
    await page.route('**/api/session/*/navigate', (route) => route.fulfill({ json: response({
      status: terminal, text: terminal === 'arrived' ? 'You have arrived.' : 'No route is selected.',
      route_id: terminal === 'no_route' ? null : 'A', remaining_m: terminal === 'no_route' ? null : 0,
      remaining_min: terminal === 'no_route' ? null : 0, off_route_m: terminal === 'no_route' ? null : 0, next: null,
    }) }));
    await page.route('**/api/session/*/navigate/stop', (route) => route.fulfill({ json: { status: 'stopped' } }));
    await harness(page);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect.poll(async () => (await gps(page)).wakeRequests).toBe(1);
    await fix(page);
    await expect(page.getByTestId('active')).toHaveText('false');
    await expect(page.getByTestId('status')).toHaveText(terminal === 'no_route' ? 'error' : 'arrived');
    await expect.poll(async () => (await gps(page)).cleared).toEqual([1]);
    await expect.poll(async () => (await gps(page)).releases).toBe(1);
    await expect(page.getByTestId('errors')).toHaveText('[]');
  });
}

test('explicit stop immediately cleans up and ignores an in-flight response', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let started = false;
  const stops: string[] = [];
  await page.route('**/api/session/*/navigate', async (route) => {
    started = true; await held;
    await route.fulfill({ json: response({ text: 'Obsolete instruction', route_line: line }) }).catch(() => {});
  });
  await page.route('**/api/session/*/navigate/stop', (route) => {
    stops.push(route.request().method()); return route.fulfill({ json: { status: 'stopped' } });
  });
  await harness(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await fix(page); await expect.poll(() => started).toBe(true);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.getByTestId('active')).toHaveText('false');
  await expect.poll(async () => (await gps(page)).cleared).toEqual([1]);
  await expect.poll(async () => (await gps(page)).releases).toBe(1);
  await expect.poll(() => stops).toEqual(['POST']);
  release(); await page.clock.runFor(3000);
  await expect(page.getByTestId('messages')).toHaveText('[]');
  await expect(page.getByTestId('active')).toHaveText('false');
});

test('changing session and unmounting dispose their GPS watches and wake locks', async ({ page }) => {
  const paths: string[] = [];
  await page.route('**/api/session/*/navigate', (route) => {
    paths.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: response({ text: 'Current session instruction.' }) });
  });
  await page.route('**/api/session/*/navigate/stop', (route) => route.fulfill({ json: { status: 'stopped' } }));
  await harness(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(async () => (await gps(page)).wakeRequests).toBe(1);
  await page.getByRole('button', { name: 'Change session', exact: true }).click();
  await expect(page.getByTestId('active')).toHaveText('false');
  await expect.poll(async () => (await gps(page)).cleared).toEqual([1]);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await fix(page);
  await expect.poll(() => paths).toEqual(['/api/session/second/navigate']);
  await page.getByRole('button', { name: 'Unmount', exact: true }).click();
  await expect.poll(async () => (await gps(page)).cleared).toEqual([1, 2]);
  await expect.poll(async () => (await gps(page)).releases).toBe(2);
});

test('demo uses the origin without GPS and inserts exactly three fixes about 50 metres off route', async ({ page }) => {
  const fixes: { lat: number; lon: number }[] = [];
  await page.route('**/api/session/*/navigate', (route) => {
    fixes.push(route.request().postDataJSON());
    return route.fulfill({ json: response({ text: `Demo fix ${fixes.length}.`, route_line: fixes.length === 1 ? line : null }) });
  });
  await page.route('**/api/session/*/navigate/stop', (route) => route.fulfill({ json: { status: 'stopped' } }));
  await harness(page, true);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.clock.runFor(1);
  await expect.poll(() => fixes.length).toBe(1);
  await expect(page.getByTestId('messages')).toContainText('Demo fix 1.');
  expect(fixes[0]).toMatchObject(origin);
  for (let step = 0; step < 13; step++) {
    const before = fixes.length;
    await page.clock.runFor(1000);
    await expect.poll(() => fixes.length).toBeGreaterThan(before);
    // Wait for the response to be consumed before advancing its next timer.
    await expect(page.getByTestId('messages')).toContainText(`Demo fix ${before + 1}.`);
  }
  expect((await gps(page)).watches).toBe(0);
  const offsets = fixes.map((point) => Math.abs(point.lat - origin.lat) * 111_320);
  const offRoute = offsets.map((metres, index) => ({ metres, index })).filter(({ metres }) => metres > 40);
  expect(offRoute).toHaveLength(3);
  expect(offRoute.map(({ index }) => index)).toEqual([offRoute[0].index, offRoute[0].index + 1, offRoute[0].index + 2]);
  offRoute.forEach(({ metres }) => expect(metres).toBeCloseTo(50, 0));
  expect(offsets[offRoute[2].index + 1]).toBeLessThan(1);
  const alongMetres = (fixes[offRoute[0].index].lon - origin.lon) * 111_320 * Math.cos(Math.PI / 4);
  expect(alongMetres).toBeGreaterThanOrEqual(30);
  expect(alongMetres).toBeLessThanOrEqual(60);
});

test('returning to a visible page reacquires a browser-released wake lock', async ({ page }) => {
  await page.route('**/api/session/*/navigate/stop', (route) => route.fulfill({ json: { status: 'stopped' } }));
  await harness(page);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(async () => (await gps(page)).wakeRequests).toBe(1);
  await page.evaluate(() => {
    const state = (window as unknown as { __gps: { locks: { released: boolean }[] } }).__gps;
    state.locks[0].released = true;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect((await gps(page)).wakeRequests).toBe(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await gps(page)).wakeRequests).toBe(2);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect.poll(async () => (await gps(page)).releases).toBe(1);
  await expect.poll(async () => (await gps(page)).cleared).toEqual([1]);
});
