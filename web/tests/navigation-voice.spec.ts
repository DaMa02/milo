import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import initial from '../../contracts/fixtures/plan.initial-comparison.json' with { type: 'json' };

const latest = (page: Page) => page.getByRole('region', { name: 'Latest answer', exact: true });
const input = (page: Page) => page.getByRole('textbox', { name: 'Type a question or command', exact: true });
const sessionPath = '/api/session/navigation-voice';
const instruction = 'Keep left at the next junction.';
const delayedInstruction = 'This instruction arrived after guidance stopped.';
interface Request { method: string; path: string; body: Record<string, unknown> }
interface BrowserState {
  events: { kind: 'speak' | 'cancel'; text?: string }[];
  watches: number;
  cleared: number[];
  emit: () => void;
}
type TestWindow = Window & { __navigationVoice: BrowserState };

async function mockEngine(page: Page, delayNavigation = false, delayPlan = false) {
  const requests: Request[] = [], unexpected: string[] = [], errors: string[] = [];
  let releaseNavigation: (() => void) | undefined;
  let navigationSettled = false;
  const gate = new Promise<void>((resolve) => { releaseNavigation = resolve; });
  let releasePlan!: () => void;
  const planGate = new Promise<void>((resolve) => { releasePlan = resolve; });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(({ origin }) => {
    const callbacks = new Map<number, PositionCallback>();
    const state: BrowserState = {
      events: [], watches: 0, cleared: [],
      emit() {
        for (const callback of callbacks.values()) callback({
          coords: { latitude: origin.lat, longitude: origin.lon, accuracy: 5, heading: null,
            altitude: null, altitudeAccuracy: null, speed: null }, timestamp: Date.now(),
        } as GeolocationPosition);
      },
    };
    Object.assign(window, { __navigationVoice: state });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(callback: PositionCallback) {
        const id = ++state.watches; callbacks.set(id, callback); return id;
      },
      clearWatch(id: number) { state.cleared.push(id); callbacks.delete(id); },
      getCurrentPosition() { throw new Error('The explicit origin does not need a one-shot GPS request'); },
    } });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
    class Utterance {
      text: string; lang = ''; rate = 1; volume = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() { state.events.push({ kind: 'cancel' }); },
      speak(utterance: Utterance) {
        state.events.push({ kind: 'speak', text: utterance.text }); utterance.onstart?.();
        // Stay speaking until cancelled, so navigation must interrupt this reading.
      },
      getVoices() { return []; },
    } });
  }, { origin: initial.origin });
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === '/api/tts') return route.fulfill({ status: 503, json: { detail: 'Simulated TTS unavailable: exercise browser fallback' } });
    const body = request.postData() ? request.postDataJSON() as Record<string, unknown> : {};
    requests.push({ method: request.method(), path, body });
    if (path === '/api/interpret') {
      const commands: Record<string, { action: string; params: Record<string, unknown> }> = {
        'start at Talent Garden': { action: 'set_origin', params: { query: initial.origin.name } },
        'go to viale Isonzo': { action: 'set_destination', params: { query: initial.destination.name } },
        yes: { action: 'confirm', params: { answer: 'yes', index: 0 } },
        'how do I get there': { action: 'route', params: {} },
        'start guidance': { action: 'navigate', params: { state: 'start' } },
        "let's go": { action: 'explore', params: { command: 'forward' } },
        'finish guidance': { action: 'navigate', params: { state: 'stop' } },
      };
      const command = commands[String(body.utterance)];
      if (command) return route.fulfill({ json: { utterance: body.utterance, ...command, via: 'grammar' } });
    }
    if (path === '/api/places/search') {
      const point = body.query === initial.origin.name ? initial.origin
        : body.query === initial.destination.name ? initial.destination : null;
      if (point) return route.fulfill({ json: { query: body.query, candidates: [{ ...point,
        kind: null, street: null, housenumber: null, city: 'Milano', distance_m: 0,
      }] } });
    }
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'navigation-voice', overview } });
    if (path === `${sessionPath}/destination`) return route.fulfill({ json: { destination: initial.destination, straight_line_m: 350 } });
    if (path === `${sessionPath}/plan`) {
      if (delayPlan) await planGate;
      return route.fulfill({ json: initial });
    }
    if (path === `${sessionPath}/navigate/stop`) return route.fulfill({ json: { status: 'stopped' } });
    if (path === `${sessionPath}/navigate`) {
      if (delayNavigation) await gate;
      try {
        await route.fulfill({ json: {
          status: 'on_route', text: delayNavigation ? delayedInstruction : instruction, route_id: initial.routes[0].id,
          off_route_m: 0, remaining_m: 350, remaining_min: 5,
          next: { instruction, distance_m: 20 },
          route_line: [[initial.origin.lat, initial.origin.lon], [initial.destination.lat, initial.destination.lon]],
        } });
      } catch {
        // Escape aborts fetch; the delayed mock can then no longer fulfill it.
      } finally { navigationSettled = true; }
      return;
    }
    unexpected.push(path);
    return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
  });
  return { requests, unexpected, errors, release: () => releaseNavigation?.(), releasePlan, settled: () => navigationSettled };
}

async function send(page: Page, text: string) {
  await input(page).fill(text); await input(page).press('Enter');
}
async function openOrigin(page: Page) {
  await page.goto('/?debug=1');
  await expect(page.getByRole('button', { name: /^Talk/ })).toBeFocused();
  await send(page, 'start at Talent Garden');
  await expect(latest(page)).toContainText(`I found ${initial.origin.name}`);
  await send(page, 'yes');
  await expect(latest(page)).toContainText('Facing north from Talent Garden.');
}
async function chooseDestination(page: Page) {
  await send(page, 'go to viale Isonzo');
  await expect(latest(page)).toContainText(`I found ${initial.destination.name}`);
  await send(page, 'yes');
}
async function openRoute(page: Page) {
  await openOrigin(page);
  await chooseDestination(page);
  await expect(latest(page)).toContainText('Route A, on foot, 14 minutes');
}
const browserState = (page: Page) => page.evaluate(() => {
  const { events, watches, cleared } = (window as TestWindow).__navigationVoice;
  return { events, watches, cleared };
});

test('lets go starts GPS despite an older forward interpretation, interrupts speech and stops through the command dispatcher', async ({ page }) => {
  const engine = await mockEngine(page);
  await openRoute(page);
  await latest(page).getByRole('button', { name: 'Listen', exact: true }).click();
  await expect.poll(async () => (await browserState(page)).events.some((event) => event.kind === 'speak')).toBe(true);
  await send(page, "let's go");
  await expect.poll(async () => (await browserState(page)).watches).toBe(1);
  const beforeFix = (await browserState(page)).events.length;
  await page.evaluate(() => (window as TestWindow).__navigationVoice.emit());
  await expect(latest(page)).toContainText(instruction);
  await expect.poll(async () => (await browserState(page)).events.filter((event) => event.kind === 'speak').at(-1)?.text).toBe(instruction);
  const newEvents = (await browserState(page)).events.slice(beforeFix);
  const spoken = newEvents.findIndex((event) => event.kind === 'speak' && event.text === instruction);
  expect(spoken).toBeGreaterThan(0);
  expect(newEvents.slice(0, spoken).some((event) => event.kind === 'cancel')).toBe(true);
  const fix = engine.requests.find(({ path }) => path === `${sessionPath}/navigate`);
  expect(fix?.method).toBe('POST');
  expect(fix?.body).toEqual({ lat: initial.origin.lat, lon: initial.origin.lon, accuracy_m: 5 });
  await send(page, 'finish guidance');
  await expect.poll(() => engine.requests.filter(({ path }) => path === `${sessionPath}/navigate/stop`).length).toBe(1);
  expect((await browserState(page)).cleared).toEqual([1]);
  expect(engine.requests.filter(({ path }) => path.endsWith('/explore'))).toEqual([]);
  expect(engine.requests.filter(({ path }) => path === `${sessionPath}/plan`)).toHaveLength(1);
  expect(engine.unexpected).toEqual([]); expect(engine.errors).toEqual([]);
});

test('Escape stops GPS and the server while a navigation response is pending, and the late instruction is never shown or read', async ({ page }) => {
  const engine = await mockEngine(page, true);
  await openRoute(page);
  await latest(page).getByRole('button', { name: 'Listen', exact: true }).click();
  await send(page, 'start guidance');
  await expect.poll(async () => (await browserState(page)).watches).toBe(1);
  await page.evaluate(() => (window as TestWindow).__navigationVoice.emit());
  await expect.poll(() => engine.requests.filter(({ path }) => path === `${sessionPath}/navigate`).length).toBe(1);
  const cancellations = (await browserState(page)).events.filter((event) => event.kind === 'cancel').length;
  await page.keyboard.press('Escape');
  await expect.poll(() => engine.requests.filter(({ path }) => path === `${sessionPath}/navigate/stop`).length).toBe(1);
  expect((await browserState(page)).cleared).toEqual([1]);
  await expect.poll(async () => (await browserState(page)).events.filter((event) => event.kind === 'cancel').length).toBeGreaterThan(cancellations);
  engine.release();
  await expect.poll(engine.settled).toBe(true);
  await expect(latest(page)).not.toContainText(delayedInstruction);
  expect((await browserState(page)).events.some((event) => event.kind === 'speak' && event.text === delayedInstruction)).toBe(false);
  expect(engine.unexpected).toEqual([]); expect(engine.errors).toEqual([]);
});

for (const cancelStart of [false, true]) {
  test(`navigation requested before a plan ${cancelStart ? 'can be cancelled with Escape while creation finishes' : 'creates it and starts guidance once after confirmation'}`, async ({ page }) => {
    const engine = await mockEngine(page, false, true);
    await openOrigin(page);
    await send(page, 'start guidance');
    await expect(latest(page)).toContainText('Where do you want to go? Say a place or address.');
    expect(engine.requests.filter(({ path }) => path === `${sessionPath}/plan`)).toEqual([]);
    await chooseDestination(page);
    await expect.poll(() => engine.requests.filter(({ path }) => path === `${sessionPath}/plan`).length).toBe(1);
    expect((await browserState(page)).watches).toBe(0);
    if (cancelStart) await page.keyboard.press('Escape');
    engine.releasePlan();
    if (cancelStart) {
      await expect(latest(page)).toContainText(initial.routes[0].summary);
      await expect(page.locator('.voice-state')).toHaveText('Ready');
      expect((await browserState(page)).watches).toBe(0);
      expect(engine.requests.filter(({ path }) => path.includes('/navigate'))).toEqual([]);
    } else {
      await expect.poll(async () => (await browserState(page)).watches).toBe(1);
      await page.evaluate(() => (window as TestWindow).__navigationVoice.emit());
      try {
        await expect.poll(() => engine.requests.filter(({ path }) => path === `${sessionPath}/navigate`).length).toBe(1);
        await expect(latest(page)).toContainText(instruction);
      } catch (cause) {
        const diagnostic = JSON.stringify({ browser: await browserState(page), requests: engine.requests });
        await test.info().attach('navigation-state', { contentType: 'application/json', body: diagnostic });
        throw new Error(`${cause instanceof Error ? cause.message : String(cause)}\nNavigation state: ${diagnostic}`);
      }
      expect(engine.requests.filter(({ path }) => path === `${sessionPath}/navigate`)).toHaveLength(1);
      await send(page, 'finish guidance');
      await expect.poll(() => engine.requests.filter(({ path }) => path === `${sessionPath}/navigate/stop`).length).toBe(1);
    }
    expect(engine.requests.filter(({ path }) => path === `${sessionPath}/plan`)).toHaveLength(1);
    expect(engine.requests.filter(({ path }) => path.endsWith('/explore'))).toEqual([]);
    expect(engine.unexpected).toEqual([]); expect(engine.errors).toEqual([]);
  });
}
