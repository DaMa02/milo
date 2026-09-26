import { expect, test } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import { isRecord, parseOverview } from '../src/api/contracts';
import { parseCommand } from '../src/api/interpret';
import { parsePlace, parseSearch } from '../src/api/places';
import { findSelectedRoute, parsePlan } from '../src/api/plan-contracts';
import type { Plan } from '../src/api/plan-contracts';

declare const process: { env: { LOTL_LIVE_VOICE?: string } };

// Independent opt-in. All API responses are real; no routes, place results,
// timings or failures are mocked. This exercises the typed entrance to the
// same dispatcher as speech, without recording audio or calling /stt or /ask.
// Each phrase below was checked against server-py/lotl/grammar.py. Confirmations
// are sent only after real candidates arrive; route IDs come from the real plan.
test.skip(process.env.LOTL_LIVE_VOICE !== '1', 'Requires LOTL_LIVE_VOICE=1 and the live engine behind Vite /api.');
test.describe.configure({ retries: 0 });
test.setTimeout(180_000);

const latest = (page: Page) => page.getByRole('region', { name: 'Latest answer', exact: true });
const input = (page: Page) => page.getByRole('textbox', { name: 'Type a question or command', exact: true });

function responseFor(page: Page, path: string, timeout = 30_000) {
  return page.waitForResponse((response) => new URL(response.url()).pathname === path
    && response.request().method() === 'POST', { timeout });
}

async function json(response: Response) {
  expect(response.status(), `${response.request().method()} ${new URL(response.url()).pathname}: ${await response.text()}`).toBe(200);
  return response.json() as Promise<unknown>;
}

async function command(page: Page, utterance: string, action: string) {
  const pending = responseFor(page, '/api/interpret');
  await input(page).fill(utterance);
  await input(page).press('Enter');
  const response = await pending;
  const raw = await json(response);
  expect(isRecord(raw)).toBe(true);
  const value = raw as Record<string, unknown>;
  expect(value.via, `The command must stay in the local grammar: ${utterance}`).toBe('grammar');
  const parsed = parseCommand(value);
  expect(parsed.action).toBe(action);
  return { utterance, via: value.via, action: parsed.action,
    request: response.request().postDataJSON() as Record<string, unknown>, params: parsed.params };
}

async function inspectReadout(page: Page, plan: Plan) {
  const more = latest(page).getByRole('button', { name: 'More detail', exact: true });
  if (await more.count()) await more.click();
  const selected = findSelectedRoute(plan);
  const expected = plan.differences.length ? plan.differences.join(' ')
    : selected?.summary ?? plan.routes.map((route) => route.summary).join(' ');
  if (expected) await expect(latest(page)).toContainText(expected);
  for (const unknown of plan.unknown) await expect(latest(page)).toContainText(unknown);
}

test('real grammar commands confirm Talent Garden and Bocconi, choose an offered route and avoid main roads', async ({ page }, testInfo) => {
  const errors: string[] = [];
  const paths: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/')) paths.push(path);
  });
  await page.goto('/?debug=1');
  await expect(page.getByRole('button', { name: /^Talk/ })).toBeFocused();
  const commands = [];

  const originSearch = responseFor(page, '/api/places/search');
  commands.push(await command(page, 'start at Talent Garden', 'set_origin'));
  const origins = parseSearch(await json(await originSearch));
  expect(origins.length).toBeGreaterThan(0);
  expect(origins[0].name).toMatch(/Talent Garden/i);
  await expect(latest(page)).toContainText(origins[0].name);
  const origin = parsePlace(origins[0]);

  const createdSession = responseFor(page, '/api/session', 120_000);
  const confirmOrigin = await command(page, 'yes', 'confirm');
  commands.push(confirmOrigin);
  expect(confirmOrigin.request.context).toMatchObject({ pending: 'origin', candidates: origins.map(({ name }) => name) });
  const sessionResponse = await createdSession;
  expect(sessionResponse.request().postDataJSON()).toEqual({ lang: 'en', origin });
  const session = await json(sessionResponse);
  expect(isRecord(session)).toBe(true);
  const sessionValue = session as Record<string, unknown>;
  expect(typeof sessionValue.session_id).toBe('string');
  const sessionId = String(sessionValue.session_id);
  expect(sessionId.length).toBeGreaterThan(0);
  const overview = parseOverview(sessionValue.overview);
  await expect(latest(page)).toContainText(overview.reference.place);

  const destinationSearch = responseFor(page, '/api/places/search');
  commands.push(await command(page, 'go to Bocconi', 'set_destination'));
  const destinations = parseSearch(await json(await destinationSearch));
  expect(destinations.length).toBeGreaterThan(0);
  expect(destinations[0].name).toMatch(/Bocconi/i);
  await expect(latest(page)).toContainText(destinations[0].name);
  const destination = parsePlace(destinations[0]);
  const sessionPath = `/api/session/${encodeURIComponent(sessionId)}`;
  const savedDestination = responseFor(page, `${sessionPath}/destination`);
  const confirmDestination = await command(page, 'yes', 'confirm');
  commands.push(confirmDestination);
  expect(confirmDestination.request.context).toMatchObject({ pending: 'destination', candidates: destinations.map(({ name }) => name) });
  const destinationResponse = await savedDestination;
  expect(destinationResponse.request().postDataJSON()).toEqual(destination);
  const destinationRaw = await json(destinationResponse);
  expect(isRecord(destinationRaw)).toBe(true);
  expect(parsePlace((destinationRaw as Record<string, unknown>).destination)).toEqual(destination);
  await expect(latest(page)).toContainText(`Your destination is ${destination.name}.`);

  const comparison = responseFor(page, `${sessionPath}/plan`);
  commands.push(await command(page, 'route', 'route'));
  const comparisonResponse = await comparison;
  const initial = parsePlan(await json(comparisonResponse));
  expect(comparisonResponse.request().postDataJSON()).toMatchObject({ origin, destination });
  expect(initial.origin).toEqual(origin);
  expect(initial.destination).toEqual(destination);
  await inspectReadout(page, initial);
  const offered = initial.routes.find((route) => route.id === 'A' && route.mode === 'foot')
    ?? initial.routes.find((route) => route.id === 'B' && route.mode === 'foot');
  expect(offered, 'The real comparison must offer A or B before sending its grammar selection').toBeDefined();

  const selection = responseFor(page, `${sessionPath}/plan/select`);
  const selectCommand = await command(page, `choose route ${offered!.id}`, 'route_select');
  commands.push(selectCommand);
  expect(selectCommand.params).toEqual({ route_id: offered!.id });
  expect(selectCommand.request.context).toMatchObject({ view: 'plan', has_destination: true,
    routes: initial.routes.map(({ id }) => ({ id, label: expect.any(String) })),
  });
  const selectionResponse = await selection;
  expect(selectionResponse.request().postDataJSON()).toEqual({ route_id: offered!.id, if_version: initial.plan_version });
  const selectedPlan = parsePlan(await json(selectionResponse));
  expect(selectedPlan.selected_route_id).toBe(offered!.id);
  expect(selectedPlan.plan_version).toBeGreaterThan(initial.plan_version);
  await inspectReadout(page, selectedPlan);

  const constraints = responseFor(page, `${sessionPath}/plan/constraints`);
  commands.push(await command(page, 'avoid main roads', 'route_avoid'));
  const constraintsResponse = await constraints;
  expect(constraintsResponse.request().postDataJSON()).toEqual({
    constraints: [...selectedPlan.constraints.filter(({ kind }) => kind !== 'main_roads'),
      { kind: 'main_roads', strength: 'avoid_when_possible' }],
    detour_tolerance: selectedPlan.detour_tolerance, if_version: selectedPlan.plan_version,
  });
  const avoided = parsePlan(await json(constraintsResponse));
  expect(avoided.constraints).toContainEqual({ kind: 'main_roads', strength: 'avoid_when_possible' });
  expect(avoided.plan_version).toBeGreaterThan(selectedPlan.plan_version);
  expect(avoided.origin).toEqual(initial.origin);
  expect(avoided.destination).toEqual(initial.destination);
  if (avoided.selected_route_id !== null) expect(findSelectedRoute(avoided)).not.toBeNull();
  await expect(input(page)).toBeFocused();
  await inspectReadout(page, avoided);
  await expect(page.locator('.error-message')).toHaveCount(0);
  expect(paths.some((path) => path.endsWith('/ask') || path.endsWith('/stt'))).toBe(false);
  expect(commands).toHaveLength(7);
  expect(errors).toEqual([]);
  await testInfo.attach('real-grammar-plan-receipts', {
    contentType: 'application/json',
    body: JSON.stringify({ commands, origin, destination, initial, selected: selectedPlan, avoided }, null, 2),
  });
});
