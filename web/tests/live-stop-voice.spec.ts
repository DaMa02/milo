import { expect, test } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import { isRecord, parseOverview } from '../src/api/contracts';
import { parseCommand } from '../src/api/interpret';
import { parsePlace, parseSearch } from '../src/api/places';
import { parsePlan, type Plan } from '../src/api/plan-contracts';

declare const process: { env: { LOTL_LIVE_STOP_VOICE?: string } };
test.skip(process.env.LOTL_LIVE_STOP_VOICE !== '1', 'Requires the live engine and LOTL_LIVE_STOP_VOICE=1.');
test.describe.configure({ retries: 0 });
test.setTimeout(180_000);

// Real API data only. The sole injected response is a 503 before a duration
// update reaches the server. Recovery GET and the subsequent retry remain real.
// These utterances were checked against lotl/grammar.py; context guards below
// stop an unsafe interpretation request before it could fall back to a model.
const latest = (page: Page) => page.getByRole('region', { name: 'Latest answer', exact: true });
const input = (page: Page) => page.getByRole('textbox', { name: 'Type a question or command', exact: true });
interface Receipt { method: string; path: string; status: number; injected: boolean }
interface Duplicate { path: string; value: string; count: number }
function findDuplicateEvidence(value: unknown, path = '$'): Duplicate[] {
  if (Array.isArray(value)) return value.flatMap((item, index) => findDuplicateEvidence(item, `${path}[${index}]`));
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const duplicates: Duplicate[] = [];
    if (Array.isArray(child) && (key === 'evidence' || key === 'stop_candidates')) {
      const identifiers = child.map((item) => key === 'evidence' ? item : isRecord(item) ? item.osm_id : undefined);
      const counts = new Map<string, number>();
      for (const identifier of identifiers) if (typeof identifier === 'string') counts.set(identifier, (counts.get(identifier) ?? 0) + 1);
      for (const [identifier, count] of counts) if (count > 1) duplicates.push({ path: `${path}.${key}`, value: identifier, count });
    }
    return [...duplicates, ...findDuplicateEvidence(child, `${path}.${key}`)];
  });
}
function responseFor(page: Page, path: string, method = 'POST', timeout = 30_000) {
  return page.waitForResponse((response) => new URL(response.url()).pathname === path
    && response.request().method() === method, { timeout });
}
async function read(response: Response) {
  expect(response.status(), `${response.request().method()} ${new URL(response.url()).pathname}: ${await response.text()}`).toBe(200);
  return response.json() as Promise<unknown>;
}
async function command(page: Page, utterance: string, action: string) {
  const pending = responseFor(page, '/api/interpret');
  await input(page).fill(utterance); await input(page).press('Enter');
  const response = await pending, raw = await read(response);
  expect(isRecord(raw)).toBe(true);
  expect((raw as Record<string, unknown>).via).toBe('grammar');
  const parsed = parseCommand(raw);
  expect(parsed.action).toBe(action);
  return { utterance, action: parsed.action, via: (raw as Record<string, unknown>).via,
    params: parsed.params, request: response.request().postDataJSON() as Record<string, unknown> };
}
async function inspectReading(page: Page, plan: Plan) {
  expect(plan.unknown.length, 'The live plan must supply its limitations for the reading check').toBeGreaterThan(0);
  const more = latest(page).getByRole('button', { name: 'More detail', exact: true });
  if (await more.count()) await more.click();
  if (plan.stop) await expect(latest(page)).toContainText(`Confirmed stop: ${plan.stop.place}, ${plan.stop.duration_min} minutes.`);
  for (const unknown of plan.unknown) await expect(latest(page)).toContainText(unknown);
}

test('live grammar adds an offered supermarket, retains 15 minutes after a rejected update and retries to 5 minutes', async ({ page }, testInfo) => {
  const receipts: Receipt[] = [], errors: string[] = [], blocked: string[] = [], commands = [];
  const consoleWarnings: { text: string; location: { url: string; lineNumber: number; columnNumber: number } }[] = [];
  const responseDuplicates: { method: string; path: string; duplicates: Duplicate[] }[] = [], inspections: Promise<void>[] = [];
  let injected = 0, sessionPath = '';
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') consoleWarnings.push({ text: message.text(), location: message.location() });
  });
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith('/api/')) receipts.push({ path, method: response.request().method(), status: response.status(),
      injected: path.endsWith('/plan/stop') && response.status() === 503 });
    if (path.startsWith('/api/') && response.status() === 200) inspections.push(response.json().then((body: unknown) => {
      const duplicates = findDuplicateEvidence(body);
      if (duplicates.length) responseDuplicates.push({ path, method: response.request().method(), duplicates });
    }));
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition() { throw new Error('This live test uses a named origin, never GPS'); },
      watchPosition() { throw new Error('This test does not start navigation'); },
    } });
  });
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const body = request.postData() ? request.postDataJSON() as Record<string, unknown> : {};
    let allowed = path === '/api/session' || path === '/api/places/search'
      || /^\/api\/session\/[^/]+\/(destination|plan(?:\/select|\/stop(?:\/candidates)?)?)$/.test(path);
    if (path === '/api/interpret') {
      const utterance = String(body.utterance), context = body.context as Record<string, unknown>;
      allowed = ['start at Talent Garden', 'go to Bocconi', 'stop at a supermarket for 15 minutes', 'stop at a supermarket for 5 minutes'].includes(utterance);
      if (utterance === 'yes') allowed = ['origin', 'destination', 'stop'].includes(String(context.pending));
      const ordinal = ['the first one', 'the second one', 'the third one'].indexOf(utterance);
      if (ordinal >= 0) allowed = context.pending === 'stop' && Array.isArray(context.stop_candidates) && Boolean(context.stop_candidates[ordinal]);
      if (/^choose route [AB]$/.test(utterance)) allowed = Array.isArray(context.routes)
        && context.routes.some((value) => isRecord(value) && value.id === utterance.at(-1));
      if (utterance === 'for 5 minutes') allowed = context.last_action === 'route_stop' || context.pending === 'stop';
    }
    if (!allowed) { blocked.push(`${request.method()} ${path}`); await route.abort('blockedbyclient'); return; }
    if (sessionPath && path === `${sessionPath}/plan/stop` && body.duration_min === 5 && injected === 0) {
      injected += 1;
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Injected before server delivery' }); return;
    }
    await route.continue();
  });
  try {
    await page.goto('/?debug=1');
    const originSearch = responseFor(page, '/api/places/search');
    commands.push(await command(page, 'start at Talent Garden', 'set_origin'));
    const origins = parseSearch(await read(await originSearch));
    expect(origins.length).toBeGreaterThan(0); expect(origins[0].name).toMatch(/Talent Garden/i);
    const origin = parsePlace(origins[0]);
    await expect(latest(page)).toContainText(origins[0].name);
    const sessionResponse = responseFor(page, '/api/session', 'POST', 120_000);
    commands.push(await command(page, 'yes', 'confirm'));
    const sessionRaw = await read(await sessionResponse);
    expect(isRecord(sessionRaw)).toBe(true);
    const session = sessionRaw as Record<string, unknown>;
    const overview = parseOverview(session.overview);
    sessionPath = `/api/session/${encodeURIComponent(String(session.session_id))}`;
    await expect(latest(page)).toContainText(overview.reference.place);

    const destinationSearch = responseFor(page, '/api/places/search');
    commands.push(await command(page, 'go to Bocconi', 'set_destination'));
    const destinations = parseSearch(await read(await destinationSearch));
    expect(destinations.length).toBeGreaterThan(0); expect(destinations[0].name).toMatch(/Bocconi/i);
    const destination = parsePlace(destinations[0]);
    await expect(latest(page)).toContainText(destinations[0].name);
    const destinationSaved = responseFor(page, `${sessionPath}/destination`);
    const planned = responseFor(page, `${sessionPath}/plan`);
    commands.push(await command(page, 'yes', 'confirm'));
    await read(await destinationSaved);
    const initial = parsePlan(await read(await planned));
    expect(initial.origin).toEqual(origin); expect(initial.destination).toEqual(destination);
    const offered = initial.routes.find((route) => route.id === 'A' && route.mode === 'foot')
      ?? initial.routes.find((route) => route.id === 'B' && route.mode === 'foot');
    expect(offered, 'The real route comparison must offer A or B').toBeDefined();
    await expect(latest(page)).toContainText((initial.routes.find((route) => route.id === 'A') ?? initial.routes[0]).summary);
    const selected = responseFor(page, `${sessionPath}/plan/select`);
    commands.push(await command(page, `choose route ${offered!.id}`, 'route_select'));
    const selectedPlan = parsePlan(await read(await selected));
    expect(selectedPlan.selected_route_id).toBe(offered!.id);
    await inspectReading(page, selectedPlan);

    const search = responseFor(page, `${sessionPath}/plan/stop/candidates`);
    commands.push(await command(page, 'stop at a supermarket for 15 minutes', 'route_stop'));
    const candidateResponse = await search;
    expect(candidateResponse.request().postDataJSON()).toEqual({ kind: 'supermarket', if_version: selectedPlan.plan_version });
    const candidates = parsePlan(await read(candidateResponse));
    expect(candidates.stop_candidates.length, 'The live mapped route must offer a supermarket').toBeGreaterThan(0);
    await expect(latest(page)).toContainText(candidates.stop_candidates[0].place);
    const added = responseFor(page, `${sessionPath}/plan/stop`);
    const confirmation = await command(page, 'yes', 'confirm'); commands.push(confirmation);
    expect(confirmation.request.context).toMatchObject({ pending: 'stop', stop_candidates: candidates.stop_candidates.map((candidate) => candidate.place) });
    const addResponse = await added;
    expect(addResponse.request().postDataJSON()).toEqual({ osm_id: candidates.stop_candidates[0].osm_id, duration_min: 15, if_version: candidates.plan_version });
    const previous = parsePlan(await read(addResponse));
    expect(previous.stop?.duration_min).toBe(15);
    await inspectReading(page, previous);

    const failed = responseFor(page, `${sessionPath}/plan/stop`);
    const recovery = responseFor(page, `${sessionPath}/plan`, 'GET');
    const durationCommand = await command(page, 'for 5 minutes', 'stop_duration'); commands.push(durationCommand);
    expect(durationCommand.request.context).toMatchObject({ last_action: 'route_stop' });
    expect(durationCommand.params).toEqual({ minutes: 5 });
    expect((await failed).status()).toBe(503);
    const recovered = parsePlan(await read(await recovery));
    expect(recovered.stop).toEqual(previous.stop);
    expect(recovered.plan_version).toBe(previous.plan_version);
    expect(recovered.routes).toEqual(previous.routes);
    await inspectReading(page, recovered);

    // The one-turn duration hint has been consumed. A complete stop request is
    // grammar-recognised without it; select the same real offered OSM ID again.
    const searchedAgain = responseFor(page, `${sessionPath}/plan/stop/candidates`);
    const retryCommand = await command(page, 'stop at a supermarket for 5 minutes', 'route_stop');
    commands.push(retryCommand);
    expect((retryCommand.request.context as Record<string, unknown>).last_action).toBeUndefined();
    const retriedCandidates = parsePlan(await read(await searchedAgain));
    const retryIndex = retriedCandidates.stop_candidates.findIndex((candidate) => candidate.osm_id === previous.stop!.osm_id);
    expect(retryIndex, 'The confirmed supermarket must still be offered for the duration retry').toBeGreaterThanOrEqual(0);
    await expect(latest(page)).toContainText(retriedCandidates.stop_candidates[0].place);
    const retried = responseFor(page, `${sessionPath}/plan/stop`);
    commands.push(await command(page, ['the first one', 'the second one', 'the third one'][retryIndex], 'confirm'));
    const retryResponse = await retried;
    expect(retryResponse.request().postDataJSON()).toEqual({ osm_id: previous.stop!.osm_id, duration_min: 5, if_version: previous.plan_version });
    const final = parsePlan(await read(retryResponse));
    expect(final.stop?.duration_min).toBe(5);
    expect(final.stop?.osm_id).toBe(previous.stop?.osm_id);
    expect(final.plan_version).toBeGreaterThan(previous.plan_version);
    await inspectReading(page, final);
    expect(injected).toBe(1); expect(commands).toHaveLength(10);
    expect(receipts.filter((receipt) => receipt.path.endsWith('/plan/stop'))).toHaveLength(3);
    expect(blocked).toEqual([]); expect(errors).toEqual([]);
    await testInfo.attach('confirmed-live-stop-plans', { contentType: 'application/json',
      body: JSON.stringify({ previous, recovered, final }, null, 2) });
  } finally {
    await Promise.all(inspections);
    await testInfo.attach('live-stop-call-receipts', { contentType: 'application/json',
      body: JSON.stringify({ commands, receipts, injected, blocked, errors, consoleWarnings, responseDuplicates }, null, 2) });
  }
});
