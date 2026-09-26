import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Plan } from '../src/api/plan-contracts';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import initialFixture from '../../contracts/fixtures/plan.initial-comparison.json' with { type: 'json' };
import candidatesFixture from '../../contracts/fixtures/plan.stop-candidates.json' with { type: 'json' };
import stop15Fixture from '../../contracts/fixtures/plan.two-foot-routes-and-transit.json' with { type: 'json' };
import stop5Fixture from '../../contracts/fixtures/plan.stop-5-min.json' with { type: 'json' };
import answerFixture from '../../contracts/fixtures/answer.no-tool.json' with { type: 'json' };

// Rename the walking route IDs A/B in these simulated responses to exercise
// selection of B by identity. Geometry, metrics and stop facts remain fixture data;
// these tests verify the wire conversation, not a new routing calculation.
function withWalkingIdsSwapped(fixture: unknown): Plan {
  const plan = structuredClone(fixture) as Plan;
  const swap = (id: string) => id === 'A' ? 'B' : id === 'B' ? 'A' : id;
  const label = (value: string) => value.replace(/\b([Rr]oute) ([AB])\b/g, (_all, prefix: string, id: string) => `${prefix} ${swap(id)}`);
  plan.routes.forEach((route) => { route.id = swap(route.id); route.summary = label(route.summary); });
  if (plan.selected_route_id) plan.selected_route_id = swap(plan.selected_route_id);
  plan.text = label(plan.text); plan.differences = plan.differences.map(label);
  return plan;
}
const initial = withWalkingIdsSwapped(initialFixture);
const candidates = withWalkingIdsSwapped(candidatesFixture);
const stop15 = withWalkingIdsSwapped(stop15Fixture);
const stop5 = withWalkingIdsSwapped(stop5Fixture);
const offeredStop = candidates.stop_candidates[0];
const sessionPath = '/api/session/stop-voice';
const planPath = `${sessionPath}/plan`;
const latest = (page: Page) => page.getByRole('region', { name: 'Latest answer', exact: true });
const input = (page: Page) => page.getByRole('textbox', { name: 'Type a question or command', exact: true });
const coldCache = 'The map cache is not ready. Retry the same starting place shortly.';
const chatText = 'This is a simulated conversational reply.';
const lateChatText = 'This cancelled web reply must never replace a newer answer.';
const infoQuestion = 'What are the opening hours of Lidl?';
const infoAnswer = { ...answerFixture, question: infoQuestion, tool: 'place_info', facts: [],
  text: 'No verified opening hours are available in this simulated response.', unknown: ['Opening hours have not been verified.'] };
interface Request { method: string; path: string; body: Record<string, unknown> }
const interpretations: Record<string, { action: string; params: Record<string, unknown> }> = {
  'start at Talent Garden': { action: 'set_origin', params: { query: initial.origin.name } },
  'go to viale Isonzo': { action: 'set_destination', params: { query: initial.destination.name } },
  'change destination to Talent Garden': { action: 'set_destination', params: { query: initial.origin.name } },
  yes: { action: 'confirm', params: { answer: 'yes', index: 0 } },
  'choose B': { action: 'route_select', params: { route_id: 'B' } },
  'a supermarket for 15 minutes': { action: 'route_stop', params: { kind: 'supermarket', duration_min: 15 } },
  'a supermarket for 5 minutes': { action: 'route_stop', params: { kind: 'supermarket', duration_min: 5 } },
  '5 minutes': { action: 'stop_duration', params: { minutes: 5 } },
  route: { action: 'route', params: {} },
  help: { action: 'help', params: {} },
  repeat: { action: 'repeat', params: {} },
  hello: { action: 'chat', params: { text: chatText, web: false } },
  'search online for opening hours': { action: 'chat', params: { text: lateChatText, web: true } },
  [infoQuestion]: { action: 'ask', params: { question: infoQuestion, tool: 'place_info', params: { place: { name: 'Lidl' } } } },
};

async function mockEngine(page: Page) {
  let current: Plan = structuredClone(initial);
  let releaseChat!: () => void;
  const chatGate = new Promise<void>((resolve) => { releaseChat = resolve; });
  const state = { empty: false, failDuration: false, failGet: false, failOrigin: false, delayChat: false, chatSettled: false };
  const requests: Request[] = [], readings: string[] = [], unexpected: string[] = [], errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    class Utterance { text: string; lang = ''; rate = 1; onstart = null; onend = null; onerror = null; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak() {}, cancel() {}, getVoices() { return []; },
    } });
  });
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const body = request.postData() ? request.postDataJSON() as Record<string, unknown> : {};
    if (path === '/api/tts') {
      readings.push(String(body.text));
      return route.fulfill({ status: 503, json: { detail: 'Simulated TTS unavailable: exercise browser fallback' } });
    }
    requests.push({ method: request.method(), path, body });
    if (path === '/api/interpret') {
      const command = interpretations[String(body.utterance)];
      if (command) {
        if (state.delayChat && body.utterance === 'search online for opening hours') await chatGate;
        await route.fulfill({ json: { utterance: body.utterance, ...command, via: 'jev' } }).catch(() => undefined);
        if (body.utterance === 'search online for opening hours') state.chatSettled = true;
        return;
      }
    }
    if (path === '/api/places/search') {
      const place = body.query === initial.origin.name ? initial.origin : body.query === initial.destination.name ? initial.destination : null;
      if (place) return route.fulfill({ json: { query: body.query, candidates: [{ ...place, kind: null,
        street: null, housenumber: null, city: 'Milano', distance_m: 0 }] } });
    }
    if (path === '/api/session') return state.failOrigin
      ? route.fulfill({ status: 503, json: { detail: coldCache } })
      : route.fulfill({ json: { session_id: 'stop-voice', overview } });
    if (path === `${sessionPath}/destination`) return route.fulfill({ json: { destination: body, straight_line_m: 350 } });
    if (path === `${sessionPath}/ask`) return route.fulfill({ json: infoAnswer });
    if (path === planPath) {
      if (request.method() === 'GET' && state.failGet) return route.fulfill({ status: 503, json: { detail: 'Simulated reconciliation failure' } });
      if (request.method() === 'POST') current = { ...structuredClone(initial), destination: body.destination as Plan['destination'] };
      return route.fulfill({ json: current });
    }
    if (path.startsWith(`${planPath}/`)) {
      if (body.if_version !== current.plan_version) {
        unexpected.push(`stale version at ${path}`);
        return route.fulfill({ status: 409, json: { detail: 'Unexpected test version' } });
      }
      if (path.endsWith('/select') && body.route_id === 'B') {
        current = { ...current, selected_route_id: 'B', plan_version: current.plan_version + 1, differences: ['You chose route B.'] };
      } else if (path.endsWith('/stop/candidates') && body.kind === 'supermarket') {
        current = { ...current, stop_candidates: state.empty ? [] : structuredClone(candidates.stop_candidates),
          text: state.empty ? 'No supermarkets were offered in this simulated response.' : candidates.text,
          unknown: candidates.unknown };
      } else if (path.endsWith('/stop') && body.osm_id === offeredStop.osm_id && [5, 15].includes(Number(body.duration_min))) {
        if (state.failDuration && body.duration_min === 5) return route.fulfill({ status: 503, json: { detail: 'Simulated lost duration response' } });
        current = { ...structuredClone(body.duration_min === 5 ? stop5 : stop15), plan_version: current.plan_version + 1 };
      } else {
        unexpected.push(path); return route.fulfill({ status: 422, json: { detail: 'Unexpected test mutation' } });
      }
      return route.fulfill({ json: current });
    }
    unexpected.push(path); return route.fulfill({ status: 404, json: { detail: 'Unexpected stop-flow test request' } });
  });
  return { state, requests, readings, unexpected, errors, releaseChat, current: () => current };
}
async function send(page: Page, utterance: string) {
  await input(page).fill(utterance); await input(page).press('Enter');
}
async function openOrigin(page: Page) {
  await page.goto('/?debug=1'); await expect(page.getByRole('button', { name: /^Talk/ })).toBeFocused();
  await send(page, 'start at Talent Garden'); await expect(latest(page)).toContainText(`I found ${initial.origin.name}`);
  await send(page, 'yes'); await expect(latest(page)).toContainText('Facing north from Talent Garden.');
}
async function openChosenPlan(page: Page) {
  await openOrigin(page);
  await send(page, 'go to viale Isonzo'); await expect(latest(page)).toContainText(`I found ${initial.destination.name}`);
  await send(page, 'yes'); await expect(latest(page)).toContainText("Say 'let's go' to start, or 'other routes'.");
  await send(page, 'choose B'); await expect(latest(page)).toContainText('You chose route B.');
}
async function findStop(page: Page, minutes = 15) {
  await send(page, `a supermarket for ${minutes} minutes`);
  await expect(latest(page)).toContainText('Supermarkets near route B:');
  const more = latest(page).getByRole('button', { name: 'More detail', exact: true });
  if (await more.isVisible()) await more.click();
  await expect(latest(page)).toContainText(`Would you like to stop at ${offeredStop.place}?`);
}
async function saveStop(page: Page) {
  await findStop(page); await send(page, 'yes');
  await expect(latest(page)).toContainText(`Confirmed stop: ${offeredStop.place}, 15 minutes.`);
}
const contextFor = (engine: Awaited<ReturnType<typeof mockEngine>>, utterance: string) => engine.requests
  .filter(({ path, body }) => path === '/api/interpret' && body.utterance === utterance).at(-1)?.body.context as Record<string, unknown>;
function assertClean(engine: Awaited<ReturnType<typeof mockEngine>>) { expect(engine.unexpected).toEqual([]); expect(engine.errors).toEqual([]); }

test('party conversation selects B, confirms an offered supermarket, changes fifteen minutes to five and consumes the one-turn hint', async ({ page }) => {
  const engine = await mockEngine(page); await openChosenPlan(page); await saveStop(page);
  expect(contextFor(engine, 'yes')).toMatchObject({ pending: 'stop', stop_candidates: candidates.stop_candidates.map(({ place }) => place), last_action: 'route_stop' });
  await send(page, '5 minutes'); await expect(latest(page)).toContainText(`Confirmed stop: ${offeredStop.place}, 5 minutes.`);
  expect(contextFor(engine, '5 minutes')).toMatchObject({ pending: null, stop_candidates: [], last_action: 'route_stop' });
  expect(engine.current().selected_route_id).toBe('B');
  const mutations = engine.requests.filter(({ path }) => path.startsWith(`${planPath}/`));
  expect(mutations.map(({ path, body }) => [path.slice(planPath.length), body])).toEqual([
    ['/select', { route_id: 'B', if_version: 1 }], ['/stop/candidates', { kind: 'supermarket', if_version: 2 }],
    ['/stop', { osm_id: offeredStop.osm_id, duration_min: 15, if_version: 2 }],
    ['/stop', { osm_id: offeredStop.osm_id, duration_min: 5, if_version: 3 }],
  ]);
  await send(page, 'help'); await expect(latest(page)).toContainText('Say where you are starting');
  expect(contextFor(engine, 'help').last_action).toBe('route_stop');
  await send(page, 'hello'); await expect(latest(page)).toContainText(chatText);
  expect(contextFor(engine, 'hello')).not.toHaveProperty('last_action');
  await expect(input(page)).toBeFocused(); assertClean(engine);
});

test('a lost duration response retains the confirmed stop until refresh and permits an explicit retry without replaying a write', async ({ page }) => {
  const engine = await mockEngine(page); await openChosenPlan(page); await saveStop(page);
  engine.state.failDuration = true; engine.state.failGet = true;
  await send(page, '5 minutes'); await expect(latest(page)).toContainText('The change could not be confirmed.');
  expect(engine.current().stop?.duration_min).toBe(15);
  await send(page, 'repeat'); await expect.poll(() => engine.readings.at(-1)).toContain('The change could not be confirmed.');
  expect(engine.requests.filter(({ path }) => path === `${planPath}/stop`)).toHaveLength(2);
  engine.state.failGet = false;
  await send(page, 'route');
  await expect(latest(page)).toContainText(`Confirmed stop: ${offeredStop.place}, 15 minutes.`);
  engine.state.failDuration = false;
  await findStop(page, 5);
  expect(contextFor(engine, 'a supermarket for 5 minutes')).not.toHaveProperty('last_action');
  await send(page, 'yes'); await expect(latest(page)).toContainText(`Confirmed stop: ${offeredStop.place}, 5 minutes.`);
  expect(engine.requests.filter(({ path }) => path === `${planPath}/stop`).map(({ body }) => body.if_version)).toEqual([2, 3, 3]);
  expect(engine.requests.filter(({ path, method }) => path === planPath && method === 'GET')).toHaveLength(2);
  assertClean(engine);
});

test('an empty candidate answer leaves a concrete exit and a later search can offer stops again', async ({ page }) => {
  const engine = await mockEngine(page); await openChosenPlan(page); engine.state.empty = true;
  await send(page, 'a supermarket for 15 minutes');
  await expect(latest(page)).toContainText('No supermarkets were offered in this simulated response.');
  await latest(page).getByRole('button', { name: 'More detail', exact: true }).click();
  await expect(latest(page)).toContainText('You can keep this journey or ask for another kind of place.');
  await send(page, '5 minutes'); await expect(latest(page)).toContainText('Choose one of the offered stops first.');
  expect(contextFor(engine, '5 minutes')).toMatchObject({ pending: null, stop_candidates: [] });
  expect(engine.requests.filter(({ path }) => path === `${planPath}/stop`)).toEqual([]);
  engine.state.empty = false; await findStop(page);
  expect(engine.current().selected_route_id).toBe('B'); assertClean(engine);
});

test('changing destination clears offered stops so a later yes cannot save a stale candidate', async ({ page }) => {
  const engine = await mockEngine(page); await openChosenPlan(page); await findStop(page);
  await send(page, 'change destination to Talent Garden'); await expect(latest(page)).toContainText(`I found ${initial.origin.name}`);
  await send(page, 'yes'); await expect(latest(page)).toContainText("Say 'let's go' to start, or 'other routes'.");
  await send(page, 'yes'); await expect(page.locator('.voice-state')).toHaveText('Ready');
  expect(contextFor(engine, 'yes')).toMatchObject({ pending: null, stop_candidates: [], has_destination: true });
  expect(contextFor(engine, 'yes')).not.toHaveProperty('last_action');
  expect(engine.requests.filter(({ path }) => path === `${planPath}/stop`)).toEqual([]);
  expect(engine.current().destination).toEqual(initial.origin); assertClean(engine);
});

test('a delayed web chat announces the search and Escape prevents its late reply from replacing a newer answer', async ({ page }) => {
  const engine = await mockEngine(page); await openOrigin(page); engine.state.delayChat = true;
  await send(page, 'search online for opening hours'); await expect(latest(page)).toContainText('Searching the web.');
  await page.keyboard.press('Escape'); await send(page, 'hello'); await expect(latest(page)).toContainText(chatText);
  engine.releaseChat(); await expect.poll(() => engine.state.chatSettled).toBe(true);
  await expect(latest(page)).toContainText(chatText); await expect(latest(page)).not.toContainText(lateChatText);
  expect(engine.readings.some((text) => text.includes(lateChatText))).toBe(false);
  assertClean(engine);
});

test('Jev chat is presented and can be repeated without an ask or plan request', async ({ page }) => {
  const engine = await mockEngine(page); await openOrigin(page);
  const before = engine.requests.length;
  await send(page, 'hello'); await expect(latest(page)).toContainText(chatText);
  await send(page, 'repeat'); await expect.poll(() => engine.readings.at(-1)).toBe(chatText);
  expect(engine.requests.slice(before).map(({ path }) => path)).toEqual(['/api/interpret', '/api/interpret']);
  assertClean(engine);
});

test('place information uses the ask contract and retains unknown opening hours', async ({ page }) => {
  const engine = await mockEngine(page); await openOrigin(page);
  await send(page, infoQuestion); await expect(latest(page)).toContainText(infoAnswer.text);
  await expect(latest(page)).toContainText(infoAnswer.unknown[0]);
  expect(engine.requests.find(({ path }) => path === `${sessionPath}/ask`)?.body).toEqual(interpretations[infoQuestion].params);
  await expect(input(page)).toBeFocused(); assertClean(engine);
});

test('a cold-cache origin response preserves its actionable detail and the candidate can be retried', async ({ page }) => {
  const engine = await mockEngine(page); engine.state.failOrigin = true;
  await page.goto('/?debug=1'); await expect(page.getByRole('button', { name: /^Talk/ })).toBeFocused();
  await send(page, 'start at Talent Garden'); await expect(latest(page)).toContainText(`I found ${initial.origin.name}`);
  await send(page, 'yes'); await expect(latest(page)).toContainText(coldCache);
  engine.state.failOrigin = false;
  await send(page, 'yes'); await expect(latest(page)).toContainText('Facing north from Talent Garden.');
  expect(engine.requests.filter(({ path }) => path === '/api/session').map(({ body }) => body)).toEqual([
    { lang: 'en', origin: initial.origin }, { lang: 'en', origin: initial.origin },
  ]);
  expect(engine.requests.filter(({ path }) => path === '/api/places/search')).toHaveLength(1);
  assertClean(engine);
});
