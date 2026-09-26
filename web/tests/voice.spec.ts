import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import './voice-input.cases';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import start from '../../contracts/fixtures/explore-step.start.json' with { type: 'json' };
import junction from '../../contracts/fixtures/explore-step.first-junction.json' with { type: 'json' };
import distance from '../../contracts/fixtures/answer.detour-ratio.json' with { type: 'json' };

const help = 'Say where you are starting, then where you want to go. Try where am I, tell me more, how do I get there, or start navigation.';
const noFit = 'I could not match that request. Try “where am I”, or open all controls.';
const latest = (page: Page) => page.getByRole('region', { name: 'Latest answer', exact: true });
const input = (page: Page) => page.getByRole('textbox', { name: 'Type a question or command', exact: true });
interface Request { path: string; body: Record<string, unknown> }
interface Command { action: string; params: Record<string, unknown> }
const commands: Record<string, Command> = {
  help: { action: 'help', params: {} },
  'a request the interpreter cannot match': { action: 'none', params: { reason: 'no_fit' } },
  explore: { action: 'explore', params: { command: 'start' } },
  'take 2': { action: 'explore', params: { command: 'take', branch: 1 } },
  'Is it close to here?': {
    action: 'ask',
    params: { question: distance.question, tool: 'walking_vs_straight_line', params: { to: { name: 'viale Isonzo' } } },
  },
};

async function installEngine(page: Page, delayed?: (route: Route) => Promise<void>) {
  const requests: Request[] = [];
  const unexpected: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const state = { cancellations: 0, readings: [] as string[] };
    Object.assign(window, { __voiceSpeech: state });
    class Utterance {
      text: string; lang = ''; rate = 1;
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      cancel() { state.cancellations += 1; },
      speak(utterance: Utterance) { state.readings.push(utterance.text); utterance.onstart?.(); },
      getVoices() { return []; },
    } });
  });
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/tts') return route.fulfill({ status: 503, json: { detail: 'Simulated TTS unavailable: exercise browser fallback' } });
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push({ path, body });
    if (path === '/api/interpret') {
      if (body.utterance === 'delayed movement' && delayed) return delayed(route);
      const command = commands[String(body.utterance)];
      if (command) return route.fulfill({ json: { utterance: body.utterance, ...command, via: 'grammar' } });
    }
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'voice-session', overview } });
    if (path === '/api/session/voice-session/explore') return route.fulfill({ json: body.command === 'take' ? junction : start });
    if (path === '/api/session/voice-session/ask') return route.fulfill({ json: distance });
    unexpected.push(path);
    return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
  });
  return { requests, unexpected, errors };
}

async function send(page: Page, text: string) {
  await input(page).fill(text);
  await input(page).press('Enter');
}

async function openConnectedArea(page: Page) {
  await page.getByText('Show all controls', { exact: true }).click();
  const source = page.getByRole('combobox', { name: 'Data source', exact: true });
  if (await source.count()) await source.selectOption('connected');
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();
  await expect(latest(page)).toContainText('Facing north from Talent Garden.');
  await page.getByText('Show all controls', { exact: true }).click();
}

test('the default screen has only Talk and reveals an Enter-based text fallback after two microphone failures', async ({ page }) => {
  const engine = await installEngine(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      getUserMedia: async () => { throw new DOMException('Test microphone permission denied', 'NotAllowedError'); },
    } });
    class Audio {
      state = 'running';
      resume() { return Promise.resolve(); }
      close() { this.state = 'closed'; return Promise.resolve(); }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: Audio });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: class {} });
  });
  await page.goto('/');
  const talk = page.getByRole('button', { name: /^Talk/ });
  await expect(talk).toBeFocused();
  await expect(page.getByRole('button')).toHaveCount(1);
  await expect(input(page)).toHaveCount(0);
  await expect(page.getByText('Show all controls', { exact: true })).toHaveCount(0);
  await talk.press('Enter');
  await expect(latest(page)).toContainText('Microphone permission was not granted.');
  await expect(input(page)).toHaveCount(0);
  await talk.press('Enter');
  await expect(input(page)).toBeVisible();
  await expect(page.getByRole('button')).toHaveCount(1);
  await send(page, 'help');
  await expect(latest(page)).toContainText(help);
  await expect(input(page)).toBeFocused();
  expect(engine.requests.map(({ path }) => path)).toEqual(['/api/interpret']);
  expect(engine.errors).toEqual([]);
});

test('the conversational entry supports help, an unmatched request and immediate local stop', async ({ page }) => {
  const engine = await installEngine(page);
  await page.goto('/?debug=1');
  await expect(page.getByRole('button', { name: /^Talk/ })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Open the area', exact: true })).toBeHidden();
  await send(page, 'help');
  await expect(latest(page)).toContainText(help);
  await expect(input(page)).toBeFocused();
  expect(engine.requests[0]).toEqual({ path: '/api/interpret', body: {
    utterance: 'help', lang: 'en',
    context: { view: 'overview', pending: 'origin', candidates: [], has_destination: false, routes: [] },
  } });
  await send(page, 'a request the interpreter cannot match');
  await expect(latest(page)).toContainText(noFit);
  const before = await page.evaluate(() => (window as Window & { __voiceSpeech: { cancellations: number } }).__voiceSpeech.cancellations);
  const requestCount = engine.requests.length;
  await send(page, 'stop');
  expect(engine.requests).toHaveLength(requestCount);
  expect(await page.evaluate(() => (window as Window & { __voiceSpeech: { cancellations: number } }).__voiceSpeech.cancellations)).toBeGreaterThan(before);
  await expect(input(page)).toBeFocused();
  expect(engine.unexpected).toEqual([]);
  expect(engine.errors).toEqual([]);
});

test('one input explores a numbered connection and asks without changing the established reference', async ({ page }) => {
  const engine = await installEngine(page);
  await page.goto('/?debug=1');
  await openConnectedArea(page);
  await send(page, 'explore');
  await expect(latest(page)).toContainText('Start at Talent Garden, facing north.');
  await send(page, 'take 2');
  await expect(latest(page)).toContainText('You walked 140 m');
  await send(page, distance.question);
  await expect(latest(page)).toContainText('350 m in a straight line');
  for (const unknown of distance.unknown) await expect(latest(page)).toContainText(unknown);
  await expect(input(page)).toBeFocused();
  expect(engine.requests.filter(({ path }) => path.endsWith('/explore')).map(({ body }) => body)).toEqual([
    { command: 'start' }, { command: 'take', branch: 1 },
  ]);
  expect(engine.requests.find(({ path }) => path.endsWith('/ask'))?.body).toEqual(commands[distance.question].params);
  const interpretations = engine.requests.filter(({ path }) => path === '/api/interpret');
  expect(interpretations.at(-1)?.body).toMatchObject({ session_id: 'voice-session', context: { view: 'explore', pending: null, has_destination: false } });
  await page.getByText('Show all controls', { exact: true }).click();
  await expect(page.locator('.result-text')).toContainText('You walked 140 m');
  expect(engine.unexpected).toEqual([]);
  expect(engine.errors).toEqual([]);
});

test('Escape cancels a pending interpretation so its late movement cannot act or replace a newer answer', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const engine = await installEngine(page, async (route) => {
    await gate;
    await route.fulfill({ json: { utterance: 'delayed movement', action: 'explore', params: { command: 'forward' }, via: 'grammar' } }).catch(() => undefined);
  });
  await page.goto('/?debug=1');
  await openConnectedArea(page);
  const pending = page.waitForRequest('**/api/interpret');
  await send(page, 'delayed movement');
  await pending;
  await input(page).fill('help');
  await page.keyboard.press('Escape');
  await expect(input(page)).toHaveValue('help');
  release();
  await input(page).press('Enter');
  await expect(latest(page)).toContainText(help);
  await expect(input(page)).toBeFocused();
  expect(engine.requests.filter(({ path }) => path.endsWith('/explore') || path.endsWith('/ask'))).toEqual([]);
  expect(engine.unexpected).toEqual([]);
  expect(engine.errors).toEqual([]);
});

test('the compact conversational controls are keyboard reachable and accessible at narrow widths', async ({ page }, testInfo) => {
  const engine = await installEngine(page);
  await page.goto('/?debug=1');
  await expect(page.getByRole('button', { name: /^Talk/ })).toBeFocused();
  for (let count = 0; count < 8 && !await input(page).evaluate((element) => element === document.activeElement); count += 1) {
    await page.keyboard.press('Tab');
  }
  await expect(input(page)).toBeFocused();
  await page.keyboard.type('help');
  await page.keyboard.press('Enter');
  await expect(latest(page)).toContainText(help);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`voice-${width}.png`), fullPage: true });
  }
  expect(engine.errors).toEqual([]);
});
