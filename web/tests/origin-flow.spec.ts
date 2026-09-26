import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import start from '../../contracts/fixtures/explore-step.start.json' with { type: 'json' };
import initial from '../../contracts/fixtures/plan.initial-comparison.json' with { type: 'json' };

const origin = { name: 'Talent Garden', lat: overview.reference.lat, lon: overview.reference.lon };
const destination = { name: 'viale Isonzo', lat: 45.44658, lon: 9.20584 };
const overviewLead = 'Facing north from Talent Garden.';
const latest = (page: Page) => page.getByRole('region', { name: 'Latest answer', exact: true });
const input = (page: Page) => page.getByRole('textbox', { name: 'Type a question or command', exact: true });
const sessionPath = '/api/session/origin-flow';
const commands: Record<string, { action: string; params: Record<string, unknown> }> = {
  'use my location': { action: 'set_origin_here', params: {} },
  overview: { action: 'overview', params: {} },
  explore: { action: 'explore', params: { command: 'start' } },
  'where am I': { action: 'explore', params: { command: 'where' } },
  'go to viale Isonzo': { action: 'set_destination', params: { query: destination.name } },
  'start at Talent Garden': { action: 'set_origin', params: { query: origin.name } },
  yes: { action: 'confirm', params: { answer: 'yes', index: 0 } },
};

interface Request { path: string; body: Record<string, unknown> }
type GpsWindow = Window & { __originGpsCalls: number };

async function mockEngine(page: Page, accuracy = 20, denied = false) {
  const requests: Request[] = [];
  const readings: string[] = [];
  const unexpected: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(({ point, metres, reject }) => {
    (window as GpsWindow).__originGpsCalls = 0;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success: PositionCallback, failure?: PositionErrorCallback) {
        (window as GpsWindow).__originGpsCalls += 1;
        queueMicrotask(() => {
          if (reject) failure?.({ code: 1, message: 'Simulated permission denial', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
          else success({ coords: { latitude: point.lat, longitude: point.lon, accuracy: metres,
            altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() } as GeolocationPosition);
        });
      },
      clearWatch() {},
    } });
    class Utterance {
      text: string; lang = ''; rate = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() {}, speak(utterance: Utterance) { utterance.onstart?.(); }, getVoices() { return []; },
    } });
  }, { point: origin, metres: accuracy, reject: denied });
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postData() ? route.request().postDataJSON() as Record<string, unknown> : {};
    if (path === '/api/tts') {
      readings.push(String(body.text));
      return route.fulfill({ status: 503, json: { detail: 'Simulated TTS unavailable: exercise browser fallback' } });
    }
    requests.push({ path, body });
    if (path === '/api/interpret' && commands[String(body.utterance)]) {
      return route.fulfill({ json: { utterance: body.utterance, ...commands[String(body.utterance)], via: 'grammar' } });
    }
    if (path === '/api/places/reverse') return route.fulfill({ json: {
      ...origin, label: origin.name, street: 'Via Arcivescovo Calabiana', housenumber: '6', city: 'Milano',
    } });
    if (path === '/api/places/search') {
      const point = body.query === origin.name ? origin : body.query === destination.name ? destination : null;
      if (point) return route.fulfill({ json: { query: body.query, candidates: [{ ...point,
        kind: null, street: null, housenumber: null, city: 'Milano', distance_m: 0,
      }] } });
    }
    if (path === '/api/session') return route.fulfill({ json: {
      session_id: 'origin-flow', overview, zone: { name: 'Milan', source: 'city' },
    } });
    if (path === `${sessionPath}/explore`) return route.fulfill({ json: { ...start, command: body.command } });
    if (path === `${sessionPath}/destination`) return route.fulfill({ json: { destination: body, straight_line_m: 350 } });
    if (path === `${sessionPath}/plan`) return route.fulfill({ json: initial });
    unexpected.push(path);
    return route.fulfill({ status: 404, json: { detail: 'Unexpected origin-flow test request' } });
  });
  return { requests, readings, unexpected, errors };
}

async function send(page: Page, utterance: string) {
  await input(page).fill(utterance);
  await input(page).press('Enter');
}

async function openApp(page: Page) {
  await page.goto('/?debug=1');
  await expect(page.getByRole('button', { name: /^Talk/ })).toBeFocused();
}

async function assertSession(page: Page, engine: Awaited<ReturnType<typeof mockEngine>>) {
  await expect.poll(() => engine.requests.filter(({ path }) => path === '/api/session').length).toBe(1);
  expect(engine.requests.find(({ path }) => path === '/api/session')?.body).toEqual({ lang: 'en', origin });
  await expect(input(page)).toBeFocused();
  expect(engine.unexpected).toEqual([]);
  expect(engine.errors).toEqual([]);
}

async function assertOverview(page: Page) {
  await expect(latest(page)).toContainText(overviewLead);
  for (const unknown of overview.unknown) await expect(latest(page)).toContainText(unknown);
}

for (const next of ['overview', 'explore', 'where am I', 'go to viale Isonzo'] as const) {
  test(`a pending GPS origin is implicitly confirmed by ${next} and its action runs once`, async ({ page }) => {
    const engine = await mockEngine(page);
    await openApp(page);
    await send(page, 'use my location');
    await expect(latest(page)).toContainText('within about 20 metres. Start here?');
    expect(engine.requests.some(({ path }) => path === '/api/session')).toBe(false);
    await send(page, next);
    if (next === 'overview') {
      await assertOverview(page);
    } else if (next === 'go to viale Isonzo') {
      await expect(latest(page)).toContainText(`I found ${destination.name}`);
      expect(engine.requests.some(({ path }) => path.endsWith('/destination'))).toBe(false);
      expect(engine.readings.some((text) => text.includes(overviewLead))).toBe(false);
      await send(page, 'yes');
      await expect(latest(page)).toContainText(initial.routes[0].summary);
      await expect(latest(page)).toContainText("Say 'let's go' to start, or 'other routes'.");
      expect(engine.requests.filter(({ path }) => path.endsWith('/destination')).map(({ body }) => body)).toEqual([destination]);
      const plans = engine.requests.filter(({ path }) => path === `${sessionPath}/plan`);
      expect(plans).toHaveLength(1);
      expect(plans[0].body).toMatchObject({ origin, destination });
    } else {
      await expect(latest(page)).toContainText('Start at Talent Garden, facing north.');
      expect(engine.requests.filter(({ path }) => path.endsWith('/explore')).map(({ body }) => body))
        .toEqual([{ command: next === 'explore' ? 'start' : 'where' }]);
      expect(engine.readings.some((text) => text.includes(overviewLead))).toBe(false);
    }
    await assertSession(page, engine);
    expect(await page.evaluate(() => (window as GpsWindow).__originGpsCalls)).toBe(1);
    expect(engine.requests.filter(({ path }) => path === '/api/places/reverse')).toHaveLength(1);
    const continuation = engine.requests.find(({ path, body }) => path === '/api/interpret' && body.utterance === next);
    expect(continuation?.body.context).toMatchObject({ pending: 'origin', candidates: [origin.name], has_destination: false });
    await expect(latest(page)).not.toContainText('Tell me where you are starting from.');
  });
}

test('overview without an origin obtains accurate GPS once and continues directly to the overview', async ({ page }) => {
  const engine = await mockEngine(page);
  await openApp(page);
  await send(page, 'overview');
  await assertOverview(page);
  await assertSession(page, engine);
  expect(await page.evaluate(() => (window as GpsWindow).__originGpsCalls)).toBe(1);
  expect(engine.requests.filter(({ path }) => path === '/api/interpret')).toHaveLength(1);
  expect(engine.requests.filter(({ path }) => path.endsWith('/explore'))).toEqual([]);
  await expect(latest(page)).not.toContainText('Start here?');
});

test('an imprecise automatic location retains the requested exploration until yes confirms it', async ({ page }) => {
  const engine = await mockEngine(page, 200);
  await openApp(page);
  await send(page, 'where am I');
  await expect(latest(page)).toContainText('within about 200 metres. Start here?');
  expect(engine.requests.filter(({ path }) => path === '/api/session' || path.endsWith('/explore'))).toEqual([]);
  await send(page, 'yes');
  await expect(latest(page)).toContainText('Start at Talent Garden, facing north.');
  await assertSession(page, engine);
  expect(engine.requests.filter(({ path }) => path.endsWith('/explore')).map(({ body }) => body)).toEqual([{ command: 'where' }]);
  expect(engine.readings.some((text) => text.includes(overviewLead))).toBe(false);
  expect(await page.evaluate(() => (window as GpsWindow).__originGpsCalls)).toBe(1);
});

test('denied automatic GPS asks for a starting place and an explicit search can recover', async ({ page }) => {
  const engine = await mockEngine(page, 20, true);
  await openApp(page);
  await send(page, 'overview');
  await expect(latest(page)).toContainText('Tell me where you are starting from.');
  expect(engine.requests.filter(({ path }) => path === '/api/session' || path === '/api/places/reverse')).toEqual([]);
  await send(page, 'start at Talent Garden');
  await expect(latest(page)).toContainText(`I found ${origin.name}`);
  await send(page, 'yes');
  await assertOverview(page);
  await assertSession(page, engine);
  expect(engine.requests.filter(({ path }) => path === '/api/places/search').map(({ body }) => body.query)).toEqual([origin.name]);
  expect(await page.evaluate(() => (window as GpsWindow).__originGpsCalls)).toBe(1);
});
