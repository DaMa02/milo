import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import initial from '../../contracts/fixtures/plan.initial-comparison.json' with { type: 'json' };

// Browser integration with controlled GPS, engine responses and synthetic tiles.
// No map server, interpretation model, microphone or paid endpoint is contacted.
const sessionPath = '/api/session/map-test';
const routeLine = [[initial.origin.lat, initial.origin.lon], [45.4454, 9.2075], [initial.destination.lat, initial.destination.lon]];
const changedLine = [[initial.origin.lat, initial.origin.lon], [45.4448, 9.2064], [initial.destination.lat, initial.destination.lon]];
const firstInstruction = 'Keep left at the next junction.';
const nextInstruction = 'Continue along this pavement.';
const map = (page: Page) => page.locator('.live-map');
const journeyMap = (page: Page) => page.getByRole('region', { name: 'Journey map', exact: true });
const latest = (page: Page) => page.getByRole('region', { name: 'Latest answer', exact: true });
const input = (page: Page) => page.getByRole('textbox', { name: 'Type a question or command', exact: true });
const talk = (page: Page) => page.getByRole('button', { name: /^Talk/ });
interface Fix { lat: number; lon: number; heading?: number }
interface BrowserState { watches: number; microphones: number; emit: (fix: Fix) => void }
type TestWindow = Window & { __mapTest: BrowserState };
interface Request { path: string; method: string; body: Record<string, unknown> }

async function installEngine(page: Page, tiles: 'ready' | 'pending' = 'ready') {
  const requests: Request[] = [], unexpected: string[] = [], errors: string[] = [];
  const state = { tileRequests: 0, routeChanged: false, failCreation: false };
  let releaseTiles!: () => void;
  const tilesGate = new Promise<void>((resolve) => { releaseTiles = resolve; });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const callbacks = new Map<number, PositionCallback>();
    const state: BrowserState = { watches: 0, microphones: 0, emit(fix) {
      for (const callback of callbacks.values()) callback({ coords: { latitude: fix.lat, longitude: fix.lon,
        accuracy: 6, heading: fix.heading ?? null, altitude: null, altitudeAccuracy: null, speed: null }, timestamp: Date.now() } as GeolocationPosition);
    } };
    Object.assign(window, { __mapTest: state });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(callback: PositionCallback) { const id = ++state.watches; callbacks.set(id, callback); return id; },
      clearWatch(id: number) { callbacks.delete(id); },
      getCurrentPosition() { throw new Error('The test confirms a named origin instead of requesting GPS'); },
    } });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
    class Orientation extends Event { static async requestPermission() { return 'granted'; } }
    Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, value: Orientation });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      async getUserMedia() { state.microphones += 1; return { getTracks: () => [{ stop() {} }] }; },
    } });
    class AudioContextMock {
      state = 'running'; async resume() {} async close() { this.state = 'closed'; }
      createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData(values: Float32Array) { values.fill(0.05); } }; }
      createMediaStreamSource() { return { connect() {} }; }
    }
    class Recorder {
      static isTypeSupported(mime: string) { return mime === 'audio/mp4'; }
      state = 'inactive'; mimeType = 'audio/mp4'; ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = 'recording'; }
      stop() { this.state = 'inactive'; queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(['simulated audio'], { type: this.mimeType }) }); this.onstop?.();
      }); }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: AudioContextMock });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder });
    class AudioMock {
      src = ''; onended = null; onerror = null;
      play() { return Promise.resolve(); } pause() {} removeAttribute() {} load() {}
    }
    class Utterance { text: string; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, 'Audio', { configurable: true, value: AudioMock });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak() {}, cancel() {}, getVoices() { return []; },
    } });
  });
  await page.route(/https:\/\/(?:[abc]\.)?tile\.openstreetmap\.org\//, async (route) => {
    state.tileRequests += 1;
    if (tiles === 'pending') { await tilesGate; await route.abort().catch(() => undefined); return; }
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf0eb"/><path d="M0 128H256M128 0V256" stroke="#d7dfd2" stroke-width="8"/></svg>' });
  });
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const body = request.postData() ? request.postDataJSON() as Record<string, unknown> : {};
    if (path === '/api/tts') return route.fulfill({ status: 503, json: { detail: 'Simulated browser speech fallback' } });
    if (path === '/api/speak') return route.fulfill({ status: 503, json: { detail: 'Simulated first-sentence fallback; no model calls' } });
    requests.push({ path, method: request.method(), body });
    if (path === '/api/interpret') {
      const commands: Record<string, { action: string; params: Record<string, unknown> }> = {
        'start at Talent Garden': { action: 'set_origin', params: { query: initial.origin.name } },
        'go to viale Isonzo': { action: 'set_destination', params: { query: initial.destination.name } },
        'go back to Talent Garden': { action: 'set_destination', params: { query: initial.origin.name } },
        yes: { action: 'confirm', params: { answer: 'yes', index: 0 } },
        "let's go": { action: 'navigate', params: { state: 'start' } },
        help: { action: 'help', params: {} },
      };
      const command = commands[String(body.utterance)];
      if (command) return route.fulfill({ json: { utterance: body.utterance, ...command, via: 'grammar' } });
    }
    if (path === '/api/places/search') {
      const point = body.query === initial.origin.name ? initial.origin : initial.destination;
      return route.fulfill({ json: { query: body.query, candidates: [{ ...point, kind: null, street: null,
        housenumber: null, city: 'Milano', distance_m: 0 }] } });
    }
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'map-test', overview } });
    if (path === `${sessionPath}/destination`) return route.fulfill({ json: { destination: body, straight_line_m: 350 } });
    if (path === `${sessionPath}/plan`) return state.failCreation && request.method() === 'POST'
      ? route.fulfill({ status: 503, json: { detail: 'Simulated failed plan creation; GET retains the preceding plan' } })
      : route.fulfill({ json: initial });
    if (path === `${sessionPath}/navigate/stop`) return route.fulfill({ json: { status: 'stopped' } });
    if (path === `${sessionPath}/navigate`) return route.fulfill({ json: {
      status: 'on_route', text: state.routeChanged ? nextInstruction : firstInstruction, route_id: 'A', off_route_m: 0,
      remaining_m: state.routeChanged ? 280 : 350, remaining_min: state.routeChanged ? 4 : 5,
      next: { instruction: state.routeChanged ? nextInstruction : firstInstruction, distance_m: state.routeChanged ? 35 : 20 },
      route_line: state.routeChanged ? changedLine : routeLine,
    } });
    unexpected.push(path); return route.fulfill({ status: 404, json: { detail: 'Unexpected live-map test request' } });
  });
  return { state, requests, unexpected, errors, releaseTiles };
}
async function send(page: Page, text: string) { await input(page).fill(text); await input(page).press('Enter'); }
async function open(page: Page) { await page.goto('/?debug=1', { waitUntil: 'domcontentloaded' }); await expect(talk(page)).toBeFocused(); }
async function origin(page: Page) {
  await send(page, 'start at Talent Garden'); await expect(latest(page)).toContainText(`I found ${initial.origin.name}`);
  await send(page, 'yes'); await expect(latest(page)).toContainText('Facing north from Talent Garden.');
}
async function plan(page: Page) {
  await origin(page); await send(page, 'go to viale Isonzo'); await expect(latest(page)).toContainText(`I found ${initial.destination.name}`);
  await send(page, 'yes'); await expect(map(page).locator('.live-map__destination')).toBeVisible();
  await expect(page.locator('.voice-state')).toHaveText('Ready');
}
async function startGuidance(page: Page) {
  await send(page, "let's go"); await expect.poll(() => page.evaluate(() => (window as TestWindow).__mapTest.watches)).toBe(1);
  await page.evaluate((fix) => (window as TestWindow).__mapTest.emit(fix), { lat: 45.44426, lon: 9.20788, heading: 30 });
  await expect(map(page).locator('.live-map__route')).toHaveCount(1);
}
function clean(engine: Awaited<ReturnType<typeof installEngine>>) { expect(engine.unexpected).toEqual([]); expect(engine.errors).toEqual([]); }

test('pending and failed map tiles never prevent Talk from introducing, listening or accepting typed commands', async ({ page }) => {
  const engine = await installEngine(page, 'pending'); await open(page); await origin(page);
  await expect.poll(() => engine.state.tileRequests).toBeGreaterThan(0);
  await talk(page).press('Enter'); await expect(latest(page)).toContainText("Hi, I'm Milo.");
  await talk(page).press('Enter'); await expect.poll(() => page.evaluate(() => (window as TestWindow).__mapTest.microphones)).toBe(1);
  await expect(page.getByRole('button', { name: /^Finish talking/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape'); engine.releaseTiles();
  await expect(map(page).locator('.live-map__unavailable')).toBeVisible();
  await send(page, 'help'); await expect(latest(page)).toContainText("Hi, I'm Milo."); await expect(input(page)).toBeFocused(); clean(engine);
});

test('confirmed endpoints appear before guidance without inventing a route or entering the keyboard and accessibility tree', async ({ page }) => {
  const engine = await installEngine(page); await open(page); await origin(page);
  await expect(map(page)).toHaveAttribute('aria-hidden', 'true'); await expect(map(page)).toHaveAttribute('inert', '');
  await expect(map(page).locator('.live-map__origin')).toHaveCount(1);
  await expect(map(page).locator('.live-map__destination, .live-map__position, .live-map__route')).toHaveCount(0);
  await send(page, 'go to viale Isonzo'); await expect(latest(page)).toContainText(`I found ${initial.destination.name}`);
  await send(page, 'yes'); await expect(map(page).locator('.live-map__destination')).toHaveCount(1);
  await expect(map(page).locator('.live-map__route')).toHaveCount(0);
  await expect(journeyMap(page).locator('.map-route-note')).toContainText('Start guidance to see the route.');
  expect(await map(page).locator('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])').count()).toBe(0);
  await expect(input(page)).toBeFocused();
  for (let step = 0; step < 10; step += 1) {
    await page.keyboard.press('Tab'); expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.live-map')))).toBe(false);
  }
  expect(engine.requests.some(({ path }) => path.endsWith('/navigate'))).toBe(false); clean(engine);
});

test('navigation geometry, current GPS and heading update independently and next distance and time remain available as text', async ({ page }) => {
  const engine = await installEngine(page); await open(page); await plan(page); await startGuidance(page);
  const route = map(page).locator('.live-map__route'), position = map(page).locator('.live-map__position');
  await expect(position).toBeVisible(); await expect(map(page).locator('.live-map__accuracy')).toHaveCount(1);
  await expect(map(page).locator('.live-map__heading')).toHaveAttribute('style', /rotate\(30deg\)/);
  await expect(journeyMap(page).locator('.map-next')).toContainText(firstInstruction);
  await expect(journeyMap(page).locator('.map-next')).toContainText('20 m');
  await expect(journeyMap(page).locator('.map-progress')).toContainText('350 m');
  await expect(journeyMap(page).locator('.map-progress')).toContainText('5 min');
  const oldPath = await route.getAttribute('d'), oldPosition = await position.getAttribute('style');
  engine.state.routeChanged = true;
  await page.evaluate((fix) => (window as TestWindow).__mapTest.emit(fix), { lat: 45.44466, lon: 9.20768, heading: 90 });
  await expect.poll(() => route.getAttribute('d')).not.toBe(oldPath);
  await expect.poll(() => position.getAttribute('style')).not.toBe(oldPosition);
  await expect(map(page).locator('.live-map__heading')).toHaveAttribute('style', /rotate\(90deg\)/);
  await expect(journeyMap(page).locator('.map-next')).toContainText(nextInstruction);
  await expect(journeyMap(page).locator('.map-next')).toContainText('35 m');
  await expect(journeyMap(page).locator('.map-progress')).toContainText('280 m');
  await expect(journeyMap(page).locator('.map-progress')).toContainText('4 min');
  expect(engine.requests.filter(({ path }) => path.endsWith('/navigate')).at(-1)?.body).toEqual({ lat: 45.44466, lon: 9.20768, accuracy_m: 6, heading_deg: 90 });
  await page.keyboard.press('Escape');
  await expect(journeyMap(page).locator('.map-position-note')).toContainText('Last known position.');
  await expect(position).toBeVisible(); clean(engine);
});

test('the map and text reflow at 320, 390 and 1280 pixels while Talk remains large and accessibility checks pass', async ({ page }, testInfo) => {
  const engine = await installEngine(page); await open(page); await plan(page); await startGuidance(page);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await expect.poll(() => map(page).evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await talk(page).boundingBox(); expect(box?.height).toBeGreaterThanOrEqual(152);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze(); expect(audit.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`live-map-${width}.png`), fullPage: true });
  }
  await page.keyboard.press('Escape'); clean(engine);
});

test('a new destination removes the preceding geometry and progress even when its replan fails and GET returns the old plan', async ({ page }) => {
  const engine = await installEngine(page); await open(page); await plan(page); await startGuidance(page);
  await expect(journeyMap(page).locator('.map-progress')).toContainText('350 m');
  engine.state.failCreation = true;
  await send(page, 'go back to Talent Garden'); await expect(latest(page)).toContainText(`I found ${initial.origin.name}`);
  await expect(map(page).locator('.live-map__route')).toHaveCount(0);
  await send(page, 'yes');
  await expect(journeyMap(page).locator('.map-endpoints')).toContainText(`Destination: ${initial.origin.name}`);
  await expect.poll(() => engine.requests.filter(({ path, method }) => path === `${sessionPath}/plan` && method === 'GET').length).toBe(1);
  await expect(latest(page)).toContainText(`The previous plan is for ${initial.destination.name}.`);
  await expect(map(page).locator('.live-map__route')).toHaveCount(0);
  await expect(journeyMap(page).locator('.map-progress, .map-next')).toHaveCount(0);
  await expect(journeyMap(page).locator('.map-route-note')).toContainText('Start guidance to see the route.');
  expect(engine.requests.filter(({ path, method }) => path === `${sessionPath}/plan` && method === 'POST').at(-1)?.body.destination).toEqual(initial.origin);
  await expect(input(page)).toBeFocused(); clean(engine);
});

test('a failed lazy map module displays its fallback without disabling Talk or the journey text', async ({ page }) => {
  const engine = await installEngine(page);
  await page.route('**/src/components/LiveMap.tsx*', (route) => route.abort('failed'));
  await open(page); await origin(page);
  await expect(journeyMap(page).locator('.map-fallback')).toContainText('Map tiles are unavailable.');
  await expect(journeyMap(page).locator('.map-endpoints')).toContainText(initial.origin.name);
  await talk(page).press('Enter'); await expect(latest(page)).toContainText("Hi, I'm Milo.");
  await talk(page).press('Enter'); await expect.poll(() => page.evaluate(() => (window as TestWindow).__mapTest.microphones)).toBe(1);
  await page.keyboard.press('Escape'); await send(page, 'help');
  await expect(latest(page)).toContainText("Hi, I'm Milo."); await expect(input(page)).toBeFocused();
  expect(engine.unexpected).toEqual([]);
  // The import failure is injected deliberately; no unrelated JS exception is allowed.
  expect(engine.errors.filter((error) => !/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error))).toEqual([]);
});
