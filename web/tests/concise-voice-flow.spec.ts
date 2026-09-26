import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import start from '../../contracts/fixtures/explore-step.start.json' with { type: 'json' };
import answer from '../../contracts/fixtures/answer.detour-ratio.json' with { type: 'json' };
import initial from '../../contracts/fixtures/plan.initial-comparison.json' with { type: 'json' };
import type { Plan } from '../src/api/plan-contracts';

const intro = "Hi, I'm Milo. Tell me where you want to go, for example: take me to Bocconi University. You can also ask: what's around me? Say help at any time.";
const compact = {
  overview: 'You are at Talent Garden. Say explore to inspect the streets.',
  explore: 'Three street connections are available. Say take two to follow one.',
  answer: 'The party is 350 metres away in a straight line. Say more for detail.',
  places: 'Confirm this place. Say yes to continue.',
  error: 'The request failed. Please try again.',
  plan: "Route A takes 14 minutes. Say let's go to start.",
  navigate: 'You are on your chosen route, with 350 metres remaining. Say repeat to hear the next instruction.',
};
const selectedText = (id: string) => `Route ${id} is selected. Say let's go to start.`;
const instruction = 'Keep left at the next junction.';
const sessionPath = '/api/session/concise';
const planPath = `${sessionPath}/plan`;
const latest = (page: Page) => page.getByRole('region', { name: 'Latest answer', exact: true });
const shown = (page: Page) => latest(page).locator('.latest-answer-text');
const talk = (page: Page) => page.getByRole('button', { name: /^Talk/ });
const input = (page: Page) => page.getByRole('textbox', { name: 'Type a question or command', exact: true });
interface Request { path: string; method: string; body: Record<string, unknown> }
interface BrowserState { events: string[]; plays: string[]; microphones: number; watches: number; emit: () => void }
type TestWindow = Window & { __concise: BrowserState; __player: { onended: (() => void) | null } };

async function mockEngine(page: Page) {
  const requests: Request[] = [], spoken: string[] = [], unexpected: string[] = [], errors: string[] = [];
  const state = { failSpeak: false, failAsk: false, delayKind: '', delaySelected: '', delayed: 0, settled: 0 };
  let current = structuredClone(initial) as Plan;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(({ origin }) => {
    const callbacks = new Map<number, PositionCallback>();
    const state: BrowserState = { events: [], plays: [], microphones: 0, watches: 0, emit() {
      for (const callback of callbacks.values()) callback({ coords: { latitude: origin.lat, longitude: origin.lon,
        accuracy: 5, heading: null, altitude: null, altitudeAccuracy: null, speed: null }, timestamp: Date.now() } as GeolocationPosition);
    } };
    Object.assign(window, { __concise: state });
    class Orientation extends Event { static async requestPermission() { return 'granted'; } }
    Object.defineProperty(window, 'DeviceOrientationEvent', { configurable: true, value: Orientation });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(callback: PositionCallback) { const id = ++state.watches; callbacks.set(id, callback); return id; },
      clearWatch(id: number) { callbacks.delete(id); },
      getCurrentPosition() { throw new Error('This test uses a confirmed named origin'); },
    } });
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      async getUserMedia() { state.microphones += 1; state.events.push('microphone');
        return { getTracks: () => [{ stop() { state.events.push('track stopped'); } }] }; },
    } });
    class Context {
      state = 'running'; async resume() {} async close() { this.state = 'closed'; }
      createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData(values: Float32Array) { values.fill(0.05); } }; }
      createMediaStreamSource() { return { connect() {} }; }
    }
    class Recorder {
      static isTypeSupported(mime: string) { return mime === 'audio/mp4'; }
      state = 'inactive'; mimeType = 'audio/mp4'; ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() { this.state = 'recording'; state.events.push('recording'); }
      stop() { this.state = 'inactive'; queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(['simulated audio'], { type: this.mimeType }) }); this.onstop?.();
      }); }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: Context });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder });
    let sequence = 0;
    URL.createObjectURL = () => `blob:concise-${++sequence}`;
    URL.revokeObjectURL = () => {};
    class Player {
      src = ''; playbackRate = 1; preload = ''; onended: (() => void) | null = null; onerror = null;
      constructor() { Object.assign(window, { __player: this }); }
      play() { Object.assign(window, { __player: this }); state.plays.push(this.src); state.events.push('play'); return Promise.resolve(); }
      pause() { state.events.push('pause'); }
      removeAttribute() { this.src = ''; } load() {}
    }
    class Utterance { text: string; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, 'Audio', { configurable: true, value: Player });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak(utterance: Utterance) { state.events.push(`fallback:${utterance.text}`); },
      cancel() { state.events.push('cancel'); }, getVoices() { return []; },
    } });
  }, { origin: initial.origin });
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const body = path === '/api/stt' ? {} : request.postData() ? request.postDataJSON() as Record<string, unknown> : {};
    if (path === '/api/tts') { spoken.push(String(body.text)); return route.fulfill({ contentType: 'audio/mp4', body: 'simulated AAC' }); }
    requests.push({ path, method: request.method(), body });
    if (path === '/api/speak') {
      if (state.failSpeak) return route.fulfill({ status: 503, json: { detail: 'Simulated unavailable wording service' } });
      const result = body.result as Record<string, unknown>;
      const selected = body.kind === 'plan' && typeof result.selected_route_id === 'string' ? result.selected_route_id : '';
      const text = selected ? selectedText(selected) : compact[body.kind as keyof typeof compact];
      if (body.kind === state.delayKind && (!state.delaySelected || selected === state.delaySelected)) {
        state.delayed += 1; await gate;
        await route.fulfill({ json: { text, via: 'simulated' } }).catch(() => undefined); state.settled += 1; return;
      }
      if (text) return route.fulfill({ json: { text, via: 'simulated' } });
    }
    if (path === '/api/interpret') {
      const commands: Record<string, { action: string; params: Record<string, unknown> }> = {
        'start at Talent Garden': { action: 'set_origin', params: { query: initial.origin.name } },
        'go to viale Isonzo': { action: 'set_destination', params: { query: initial.destination.name } },
        yes: { action: 'confirm', params: { answer: 'yes', index: 0 } },
        explore: { action: 'explore', params: { command: 'start' } },
        'Is it close to here?': { action: 'ask', params: { question: answer.question, tool: 'walking_vs_straight_line', params: { to: { name: initial.destination.name } } } },
        'choose A': { action: 'route_select', params: { route_id: 'A' } },
        'choose B': { action: 'route_select', params: { route_id: 'B' } },
        "let's go": { action: 'navigate', params: { state: 'start' } },
        'where am I': { action: 'explore', params: { command: 'where' } },
        help: { action: 'help', params: {} }, repeat: { action: 'repeat', params: {} },
        unknowns: { action: 'unknowns', params: {} }, more: { action: 'more', params: {} },
      };
      const command = commands[String(body.utterance)];
      if (command) return route.fulfill({ json: { utterance: body.utterance, ...command, via: 'grammar' } });
    }
    if (path === '/api/places/search') {
      const point = body.query === initial.origin.name ? initial.origin : initial.destination;
      return route.fulfill({ json: { query: body.query, candidates: [{ ...point, kind: null, street: null,
        housenumber: null, city: 'Milano', distance_m: 0 }] } });
    }
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'concise', overview } });
    if (path === `${sessionPath}/destination`) return route.fulfill({ json: { destination: body, straight_line_m: 350 } });
    if (path === `${sessionPath}/explore`) return route.fulfill({ json: start });
    if (path === `${sessionPath}/ask`) return state.failAsk
      ? route.fulfill({ status: 503, json: { detail: 'Simulated question failure' } }) : route.fulfill({ json: answer });
    if (path === planPath) return route.fulfill({ json: current });
    if (path === `${planPath}/select`) {
      if (!current.routes.some(({ id }) => id === body.route_id) || body.if_version !== current.plan_version) {
        unexpected.push('unoffered selection or stale version'); return route.fulfill({ status: 409, json: { detail: 'Unexpected test selection' } });
      }
      current = { ...current, plan_version: current.plan_version + 1, selected_route_id: String(body.route_id), differences: [`You chose route ${String(body.route_id)}.`] };
      return route.fulfill({ json: current });
    }
    if (path === `${sessionPath}/navigate/stop`) return route.fulfill({ json: { status: 'stopped' } });
    if (path === `${sessionPath}/navigate`) return route.fulfill({ json: {
      status: 'on_route', text: instruction, route_id: current.selected_route_id ?? 'A', off_route_m: 0, remaining_m: 350, remaining_min: 5,
      next: { instruction, distance_m: 20 }, route_line: [[initial.origin.lat, initial.origin.lon], [initial.destination.lat, initial.destination.lon]],
    } });
    unexpected.push(path); return route.fulfill({ status: 404, json: { detail: 'Unexpected concise-voice test request' } });
  });
  return { state, requests, spoken, unexpected, errors, release, current: () => current };
}
type Engine = Awaited<ReturnType<typeof mockEngine>>;
const wording = (engine: Engine, kind?: string) => engine.requests.filter(({ path, body }) => path === '/api/speak' && (!kind || body.kind === kind));
const browserState = (page: Page) => page.evaluate(() => {
  const { events, plays, microphones, watches } = (window as TestWindow).__concise; return { events, plays, microphones, watches };
});
async function send(page: Page, text: string) { await input(page).fill(text); await input(page).press('Enter'); }
async function open(page: Page, debug = true) { await page.goto(debug ? '/?debug=1' : '/'); await expect(talk(page)).toBeFocused(); }
async function origin(page: Page) {
  await send(page, 'start at Talent Garden'); await expect(shown(page)).toHaveText(compact.places);
  await send(page, 'yes'); await expect(shown(page)).toHaveText(compact.overview);
}
async function plan(page: Page) {
  await origin(page); await send(page, 'go to viale Isonzo'); await expect(shown(page)).toHaveText(compact.places);
  await send(page, 'yes'); await expect(shown(page)).toHaveText(compact.plan);
}
function clean(engine: Engine) { expect(engine.unexpected).toEqual([]); expect(engine.errors).toEqual([]); }

test('first Talk introduces Milo without recording; the next tap interrupts it and listens, and help repeats that exact introduction', async ({ page }) => {
  const engine = await mockEngine(page); await open(page);
  await talk(page).press('Enter'); await expect(shown(page)).toHaveText(intro);
  await expect.poll(() => engine.spoken.at(-1)).toBe(intro);
  expect((await browserState(page)).microphones).toBe(0); expect(wording(engine)).toHaveLength(0);
  const before = (await browserState(page)).events.length;
  await talk(page).press('Enter'); await expect.poll(async () => (await browserState(page)).microphones).toBe(1);
  const events = (await browserState(page)).events.slice(before);
  expect(events.indexOf('pause')).toBeGreaterThanOrEqual(0); expect(events.indexOf('pause')).toBeLessThan(events.indexOf('microphone'));
  await page.keyboard.press('Escape'); await send(page, 'help'); await expect(shown(page)).toHaveText(intro);
  expect(wording(engine)).toHaveLength(0); expect(engine.requests.some(({ path }) => path === '/api/stt')).toBe(false); clean(engine);
});

test('a first held Talk gesture also introduces only on release without opening the microphone', async ({ page }) => {
  const engine = await mockEngine(page); await open(page, false);
  await page.clock.install(); await page.clock.pauseAt(new Date());
  const box = (await talk(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.clock.runFor(800);
  expect((await browserState(page)).microphones).toBe(0); expect(engine.spoken).toEqual([]);
  await page.mouse.up(); await expect(shown(page)).toHaveText(intro); await expect.poll(() => engine.spoken.at(-1)).toBe(intro);
  expect((await browserState(page)).microphones).toBe(0); expect(wording(engine)).toHaveLength(0); clean(engine);
});

test('overview, exploration and answers use the concise server text while More and explicit unknowns retain their complete facts', async ({ page }) => {
  const engine = await mockEngine(page); await open(page);
  // Enable the normal spoken conversation so absence of unsolicited unknowns
  // is checked against automatic TTS as well as the visible short answer.
  await talk(page).press('Enter'); await expect.poll(() => engine.spoken.at(-1)).toBe(intro);
  await origin(page);
  expect(wording(engine, 'overview').at(-1)?.body).toMatchObject({ lang: 'en', session_id: 'concise', kind: 'overview', result: overview });
  await send(page, 'explore'); await expect(shown(page)).toHaveText(compact.explore);
  expect(wording(engine, 'explore').at(-1)?.body).toMatchObject({ utterance: 'explore', result: start });
  await latest(page).getByRole('button', { name: 'More detail', exact: true }).click(); await expect(shown(page)).toContainText(start.text);
  await send(page, answer.question); await expect(shown(page)).toHaveText(compact.answer);
  expect(wording(engine, 'answer').at(-1)?.body).toMatchObject({ utterance: answer.question, result: answer });
  for (const unknown of answer.unknown) await expect(shown(page)).not.toContainText(unknown);
  await send(page, 'repeat'); await expect.poll(() => engine.spoken.at(-1)).toBe(compact.answer);
  expect(engine.spoken.some((text) => answer.unknown.some((unknown) => text.includes(unknown)))).toBe(false);
  await latest(page).getByRole('button', { name: 'More detail', exact: true }).click(); await expect(shown(page)).toContainText(answer.text);
  for (const unknown of answer.unknown) await expect(latest(page)).toContainText(unknown);
  const before = wording(engine).length;
  await send(page, 'unknowns'); for (const unknown of answer.unknown) await expect(shown(page)).toContainText(unknown);
  expect(wording(engine)).toHaveLength(before);
  await send(page, 'repeat'); await expect.poll(() => engine.spoken.at(-1)).toBe(answer.unknown.join(' ')); clean(engine);
});

test('place confirmation and a chosen route preserve full results and identity while navigation bypasses wording', async ({ page }) => {
  const engine = await mockEngine(page); await open(page); await plan(page);
  expect(wording(engine, 'places').length).toBeGreaterThanOrEqual(2);
  expect(wording(engine, 'plan').at(-1)?.body.result).toMatchObject({ plan_version: 1, selected_route_id: null, routes: initial.routes });
  await latest(page).getByRole('button', { name: 'More detail', exact: true }).click(); await expect(shown(page)).toContainText(initial.text);
  await send(page, 'choose B'); await expect(shown(page)).toHaveText(selectedText('B'));
  expect(engine.current().selected_route_id).toBe('B');
  await latest(page).getByRole('button', { name: 'More detail', exact: true }).click();
  for (const unknown of initial.unknown) await expect(latest(page)).toContainText(unknown);
  await send(page, 'repeat'); await expect.poll(() => engine.spoken.at(-1)).toBe(selectedText('B'));
  const before = wording(engine).length;
  await send(page, "let's go"); await expect.poll(async () => (await browserState(page)).watches).toBe(1);
  await page.evaluate(() => (window as TestWindow).__concise.emit()); await expect(shown(page)).toHaveText(instruction);
  // The first navigation instruction interrupts this non-navigation reading;
  // no audio completion is emitted by the simulated player.
  await expect.poll(() => engine.spoken.at(-1)).toBe(instruction);
  expect(wording(engine)).toHaveLength(before); expect(engine.current().selected_route_id).toBe('B'); clean(engine);
});

test('errors use concise wording and an unavailable wording endpoint falls back to one engine sentence', async ({ page }) => {
  const engine = await mockEngine(page); await open(page); await origin(page); engine.state.failAsk = true;
  await send(page, answer.question); await expect(shown(page)).toHaveText(compact.error);
  expect(wording(engine, 'error').length).toBeGreaterThan(0);
  engine.state.failSpeak = true; engine.state.failAsk = false;
  await send(page, answer.question); await expect(shown(page)).toHaveText(answer.text.split(/(?<=[.!?])\s+/)[0]);
  await latest(page).getByRole('button', { name: 'More detail', exact: true }).click(); await expect(shown(page)).toContainText(answer.text);
  for (const unknown of answer.unknown) await expect(latest(page)).toContainText(unknown); clean(engine);
});

test('Talk stops an active concise reading before acquiring the microphone', async ({ page }) => {
  const engine = await mockEngine(page); await open(page);
  await talk(page).press('Enter'); await expect.poll(() => engine.spoken.at(-1)).toBe(intro);
  await expect.poll(async () => (await browserState(page)).plays.some((src) => src.startsWith('blob:'))).toBe(true);
  await page.keyboard.press('Escape');
  await origin(page); await send(page, 'repeat'); await expect.poll(() => engine.spoken.at(-1)).toBe(compact.overview);
  await expect.poll(async () => (await browserState(page)).plays.filter((src) => src.startsWith('blob:')).length).toBeGreaterThan(1);
  const before = (await browserState(page)).events.length;
  await talk(page).press('Enter'); await expect.poll(async () => (await browserState(page)).microphones).toBe(1);
  const events = (await browserState(page)).events.slice(before);
  expect(events.indexOf('pause')).toBeGreaterThanOrEqual(0); expect(events.indexOf('pause')).toBeLessThan(events.indexOf('microphone'));
  await expect(page.getByRole('button', { name: /^Finish talking/ })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape'); clean(engine);
});

test('a late wording response cannot restore an older route choice, answer or audio', async ({ page }) => {
  const engine = await mockEngine(page); await open(page); await plan(page);
  engine.state.delayKind = 'plan'; engine.state.delaySelected = 'A';
  await send(page, 'choose A'); await expect.poll(() => engine.state.delayed).toBe(1);
  await send(page, 'choose B'); await expect(shown(page)).toHaveText(selectedText('B'));
  await send(page, 'repeat'); await expect.poll(() => engine.spoken.at(-1)).toBe(selectedText('B'));
  const audioCount = engine.spoken.length;
  engine.release(); await expect.poll(() => engine.state.settled).toBe(1);
  await expect(shown(page)).toHaveText(selectedText('B')); expect(engine.current().selected_route_id).toBe('B');
  expect(engine.spoken).toHaveLength(audioCount); expect(engine.spoken).not.toContain(selectedText('A'));
  expect(engine.requests.filter(({ path }) => path === `${planPath}/select`).map(({ body }) => body)).toEqual([
    { route_id: 'A', if_version: 1 }, { route_id: 'B', if_version: 2 },
  ]); clean(engine);
});

test('Escape cancels pending concise wording and a late answer cannot replace or read over help', async ({ page }) => {
  const engine = await mockEngine(page); await open(page); await origin(page); engine.state.delayKind = 'answer';
  await send(page, answer.question); await expect.poll(() => engine.state.delayed).toBe(1);
  await page.keyboard.press('Escape'); await send(page, 'help'); await expect(shown(page)).toHaveText(intro);
  const audioCount = engine.spoken.length;
  engine.release(); await expect.poll(() => engine.state.settled).toBe(1);
  await expect(shown(page)).toHaveText(intro); expect(engine.spoken).toHaveLength(audioCount);
  expect(engine.spoken).not.toContain(compact.answer); clean(engine);
});

test('where am I during guidance uses the latest physical navigation result and repeat still reads the instruction', async ({ page }) => {
  const engine = await mockEngine(page); await open(page); await plan(page);
  await send(page, "let's go"); await expect.poll(async () => (await browserState(page)).watches).toBe(1);
  await page.evaluate(() => (window as TestWindow).__concise.emit()); await expect(shown(page)).toHaveText(instruction);
  await expect.poll(() => engine.spoken.at(-1)).toBe(instruction);
  await send(page, 'where am I'); await expect(shown(page)).toHaveText(compact.navigate);
  expect(wording(engine, 'navigate').at(-1)?.body).toEqual({ utterance: 'where am I', lang: 'en', session_id: 'concise', kind: 'navigate', result: {
    status: 'on_route', text: instruction, route_id: 'A', off_route_m: 0, remaining_m: 350, remaining_min: 5,
    next: { instruction, distance_m: 20 }, route_line: [[initial.origin.lat, initial.origin.lon], [initial.destination.lat, initial.destination.lon]],
  } });
  expect(engine.requests.filter(({ path }) => path.endsWith('/explore'))).toEqual([]);
  const plays = (await browserState(page)).plays.length;
  await send(page, 'repeat'); await expect.poll(async () => (await browserState(page)).plays.length).toBeGreaterThan(plays);
  expect(engine.spoken.at(-1)).toBe(instruction); expect(engine.spoken).not.toContain(compact.navigate); clean(engine);
});
