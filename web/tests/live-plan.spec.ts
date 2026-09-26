import { expect, test } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
import { parseExploreStep, parseOverview } from '../src/api/contracts';
import { findSelectedRoute, parsePlan } from '../src/api/plan-contracts';
import type { Plan, Route as JourneyRoute } from '../src/api/plan-contracts';

// The test runner is Node; keep this optional flag typed without adding a
// dependency on Node's ambient declarations to the browser project.
declare const process: { env: { LOTL_LIVE_PLAN?: string } };

// Independent opt-in: neither LOTL_LIVE_ENGINE nor LOTL_LIVE_LLM enables this
// suite. Start a real Plan engine behind Vite /api before LOTL_LIVE_PLAN=1.
// All successful responses, alternatives, candidates, legs and times are real.
// Only the second test injects a 503, before one duration POST reaches the
// engine; its reconciliation GET and subsequent retry still use the real API.
// No fixture imports, /ask requests, or LLM calls belong to this suite.
test.skip(process.env.LOTL_LIVE_PLAN !== '1', 'Requires the real Plan engine and LOTL_LIVE_PLAN=1.');
test.describe.configure({ retries: 0 });
test.setTimeout(120_000);

const panel = (page: Page) => page.getByRole('region', { name: 'Plan your trip', exact: true });
const navigation = (page: Page) => page.getByRole('navigation', { name: 'Area views', exact: true });
const card = (page: Page, id: string) => panel(page).getByRole('article', { name: `Route ${id}`, exact: true });
const journeySummary = (page: Page) => panel(page).getByRole('region', { name: 'Your chosen journey', exact: true });
interface RequestRecord { method: string; path: string; body: Record<string, unknown> | null }

function observe(page: Page) {
  const errors: string[] = [];
  const requests: RequestRecord[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/')) requests.push({ method: request.method(), path,
      body: request.postData() ? request.postDataJSON() as Record<string, unknown> : null });
  });
  return { errors, requests };
}

function waitForResponse(page: Page, path: string, method = 'POST') {
  return page.waitForResponse((response) => new URL(response.url()).pathname === path
    && response.request().method() === method);
}

async function parseResponse<T>(response: Response, parse: (value: unknown) => T) {
  expect(response.status(), `${response.request().method()} ${new URL(response.url()).pathname}: ${await response.text()}`).toBe(200);
  return parse(await response.json());
}

async function resultAfter<T>(page: Page, path: string, action: () => Promise<unknown>, parse: (value: unknown) => T, method = 'POST') {
  const pending = waitForResponse(page, path, method);
  await action();
  const response = await pending;
  return { value: await parseResponse(response, parse),
    body: response.request().postData() ? response.request().postDataJSON() as Record<string, unknown> : null };
}

async function inspectRoute(page: Page, route: JourneyRoute) {
  const article = card(page, route.id);
  await expect(article.locator(':scope > p').first()).toHaveText(route.summary);
  const values = article.locator(':scope > dl > dd');
  await expect(values.nth(0)).toHaveText(`${route.duration_min} minutes`);
  await expect(values.nth(1)).toHaveText(`${route.walk_min} minutes`);
  await expect(values.nth(2)).toHaveText(String(route.transfers));
  await expect(values.nth(3).locator('time')).toHaveAttribute('datetime', route.leave_at);
  await expect(values.nth(4).locator('time')).toHaveAttribute('datetime', route.arrive_at);
  const details = article.locator(':scope > details');
  if (!(await details.evaluate((element) => element.hasAttribute('open')))) await details.locator(':scope > summary').click();
  const legs = details.locator(':scope > ol > li');
  await expect(legs).toHaveCount(route.legs.length);
  for (const [index, leg] of route.legs.entries()) {
    const rendered = legs.nth(index);
    await expect(rendered).toContainText(`${leg.from.name} → ${leg.to.name}; ${leg.duration_min} minutes`);
    if (leg.distance_m !== null) await expect(rendered).toContainText(`${leg.distance_m} m`);
    if (leg.line) await expect(rendered).toContainText(leg.line);
    const times = [leg.departure, leg.arrival].filter((value): value is string => value !== null);
    await expect(rendered.locator('time')).toHaveCount(times.length);
    for (const [timeIndex, time] of times.entries()) {
      await expect(rendered.locator('time').nth(timeIndex)).toHaveAttribute('datetime', time);
    }
  }
  await details.locator(':scope > summary').click();
}

async function inspectPlan(page: Page, plan: Plan) {
  await expect(panel(page).locator('.plan-text')).toHaveText(plan.text);
  await expect(panel(page).getByRole('article')).toHaveCount(plan.routes.length);
  for (const route of plan.routes) await inspectRoute(page, route);
  for (const unknown of plan.unknown) await expect(panel(page).getByText(unknown, { exact: true }).first()).toBeVisible();
  await expect(page.locator('.error-message')).toHaveCount(0);
}

async function inspectSummary(page: Page, plan: Plan) {
  const selected = findSelectedRoute(plan);
  expect(selected, 'The selected route ID resolves to an actual returned route').not.toBeNull();
  if (!(await journeySummary(page).isVisible())) {
    await panel(page).getByText('Show journey summary', { exact: true }).click();
  }
  const text = journeySummary(page).locator('.journey-summary-text');
  await expect(text).toContainText(`Journey origin: ${plan.origin.name}. Destination: ${plan.destination.name}.`);
  await expect(text).toContainText(selected!.summary);
  await expect(text).toContainText(`Total journey time: ${selected!.duration_min} minutes.`);
  await expect(text).toContainText(`Total walking time: ${selected!.walk_min} minutes.`);
  if (plan.stop) await expect(text).toContainText(`Confirmed stop: ${plan.stop.place}, ${plan.stop.duration_min} minutes.`);
  for (const unknown of [...selected!.warnings, ...plan.unknown]) await expect(text).toContainText(unknown);
  await expect(card(page, selected!.id).getByText('Chosen route', { exact: true })).toBeVisible();
  return text.innerText();
}

async function prepareJourney(page: Page, withExploration: boolean) {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Data source', exact: true }).selectOption({ label: 'Connected engine' });
  const created = await resultAfter(page, '/api/session',
    () => page.getByRole('button', { name: 'Open the area', exact: true }).click(), (raw) => {
      const body = raw as { session_id: string; overview: unknown };
      expect(typeof body.session_id).toBe('string');
      return { id: body.session_id, overview: parseOverview(body.overview) };
    });
  const { id, overview } = created.value;
  const base = `/api/session/${encodeURIComponent(id)}`;
  await expect(page.getByRole('heading', { name: 'Overview', level: 2 })).toBeFocused();
  await expect(page.locator('.result-text')).toHaveText(overview.text);
  let explorationText: string | null = null;
  if (withExploration) {
    const started = await resultAfter(page, `${base}/explore`,
      () => page.getByRole('button', { name: 'Explore from here', exact: true }).click(), parseExploreStep);
    const branch = started.value.branches.findIndex((item) => item.distance_m > 0 && item.leads_to.startsWith('a junction'));
    expect(branch).toBeGreaterThanOrEqual(0);
    const moved = await resultAfter(page, `${base}/explore`,
      () => page.locator('.branch-actions > li').nth(branch).getByRole('button').click(), parseExploreStep);
    expect(moved.value.position).not.toEqual(started.value.position);
    const returned = await resultAfter(page, `${base}/explore`,
      () => page.getByRole('button', { name: 'Back to the previous junction', exact: true }).click(), parseExploreStep);
    expect(returned.value.position).toEqual(started.value.position);
    expect(returned.value.heading_deg).toBe(started.value.heading_deg);
    await expect(page.getByRole('button', { name: 'Back to the previous junction', exact: true })).toBeDisabled();
    explorationText = await page.locator('.result-text').innerText();
  }
  await navigation(page).getByRole('button', { name: 'Plan your trip', exact: true }).click();
  await expect(panel(page).getByRole('textbox', { name: 'Journey origin', exact: true })).toHaveValue('Talent Garden');
  await expect(panel(page).getByRole('textbox', { name: 'Destination', exact: true })).toHaveValue('viale Isonzo');
  await panel(page).getByLabel('Departure time in Milan', { exact: true }).fill('2026-09-26T18:00');
  const compared = await resultAfter(page, `${base}/plan`,
    () => panel(page).getByRole('button', { name: 'Compare routes', exact: true }).click(), parsePlan);
  expect(compared.body?.origin).toMatchObject({ lat: overview.reference.lat, lon: overview.reference.lon });
  expect(Date.parse(String(compared.body?.depart_at))).toBe(Date.parse('2026-09-26T16:00:00Z'));
  expect(compared.value.origin.lat).toBe(overview.reference.lat);
  expect(compared.value.origin.lon).toBe(overview.reference.lon);
  expect(compared.value.selected_route_id).toBeNull();
  await inspectPlan(page, compared.value);
  const chosen = compared.value.routes.find((route) => route.mode === 'foot' && route.id === 'A')
    ?? compared.value.routes.find((route) => route.mode === 'foot');
  expect(chosen, 'The party journey has a walking alternative returned by the engine').toBeDefined();
  const selected = await resultAfter(page, `${base}/plan/select`,
    () => panel(page).getByRole('button', { name: `Choose route ${chosen!.id}`, exact: true }).click(), parsePlan);
  expect(selected.body).toEqual({ route_id: chosen!.id, if_version: compared.value.plan_version });
  expect(selected.value.selected_route_id).toBe(chosen!.id);
  expect(selected.value.plan_version).toBeGreaterThan(compared.value.plan_version);
  await inspectSummary(page, selected.value);
  return { base, plan: selected.value, explorationText };
}

async function addSupermarket(page: Page, base: string, previous: Plan) {
  const found = await resultAfter(page, `${base}/plan/stop/candidates`,
    () => panel(page).getByRole('button', { name: 'Find supermarkets', exact: true }).click(), parsePlan);
  expect(found.body).toEqual({ kind: 'supermarket', if_version: previous.plan_version });
  expect(found.value.selected_route_id).toBe(previous.selected_route_id);
  expect(found.value.plan_version).toBe(previous.plan_version);
  expect(found.value.stop_candidates.length, 'The engine found a supermarket along the selected route').toBeGreaterThan(0);
  await expect(panel(page).locator('.stop-candidates > li')).toHaveCount(found.value.stop_candidates.length);
  const candidate = found.value.stop_candidates[0];
  await panel(page).getByRole('spinbutton', { name: 'Stop duration (minutes)', exact: true }).fill('15');
  const added = await resultAfter(page, `${base}/plan/stop`,
    () => panel(page).locator('.stop-candidates > li').first().getByRole('button').click(), parsePlan);
  expect(added.body).toEqual({ osm_id: candidate.osm_id, duration_min: 15, if_version: found.value.plan_version });
  expect(added.value.stop?.osm_id).toBe(candidate.osm_id);
  expect(added.value.stop?.duration_min).toBe(15);
  expect(added.value.selected_route_id).toBe(previous.selected_route_id);
  expect(added.value.plan_version).toBeGreaterThan(found.value.plan_version);
  await inspectPlan(page, added.value);
  await inspectSummary(page, added.value);
  return added.value;
}

test('the real party plan keeps the chosen route through a supermarket stop, duration change and view navigation', async ({ page }) => {
  const observed = observe(page);
  const prepared = await prepareJourney(page, true);
  const beforeDetails = observed.requests.filter(({ path }) => path.endsWith('/plan/select')).length;
  const other = prepared.plan.routes.find((route) => route.id !== prepared.plan.selected_route_id)
    ?? findSelectedRoute(prepared.plan)!;
  await inspectRoute(page, other);
  await inspectSummary(page, prepared.plan);
  expect(observed.requests.filter(({ path }) => path.endsWith('/plan/select'))).toHaveLength(beforeDetails);
  const refreshed = await resultAfter(page, `${prepared.base}/plan`,
    () => panel(page).getByRole('button', { name: 'Refresh current plan', exact: true }).click(), parsePlan, 'GET');
  expect(refreshed.value.selected_route_id).toBe(prepared.plan.selected_route_id);
  expect(refreshed.value.plan_version).toBe(prepared.plan.plan_version);
  const withStop = await addSupermarket(page, prepared.base, refreshed.value);
  await panel(page).getByRole('spinbutton', { name: 'Stop duration (minutes)', exact: true }).fill('5');
  const updated = await resultAfter(page, `${prepared.base}/plan/stop`,
    () => panel(page).getByRole('button', { name: 'Update stop duration', exact: true }).click(), parsePlan);
  expect(updated.body).toEqual({ osm_id: withStop.stop!.osm_id, duration_min: 5, if_version: withStop.plan_version });
  expect(updated.value.stop?.duration_min).toBe(5);
  expect(updated.value.selected_route_id).toBe(withStop.selected_route_id);
  expect(updated.value.plan_version).toBeGreaterThan(withStop.plan_version);
  await inspectPlan(page, updated.value);
  const summary = await inspectSummary(page, updated.value);
  const callsBeforeNavigation = observed.requests.length;
  await navigation(page).getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(page.locator('.result-text')).toHaveText(prepared.explorationText!);
  await navigation(page).getByRole('button', { name: 'Plan your trip', exact: true }).click();
  await expect(journeySummary(page).locator('.journey-summary-text')).toHaveText(summary);
  await expect(panel(page).getByRole('spinbutton', { name: 'Stop duration (minutes)', exact: true })).toHaveValue('5');
  expect(observed.requests).toHaveLength(callsBeforeNavigation);
  expect(observed.requests.filter(({ path }) => path.endsWith('/ask'))).toEqual([]);
  expect(observed.errors).toEqual([]);
});

test('an injected 503 before one duration POST reaches the engine recovers through a real GET and real retry', async ({ page }) => {
  const observed = observe(page);
  const prepared = await prepareJourney(page, false);
  const previous = await addSupermarket(page, prepared.base, prepared.plan);
  const confirmedSummary = await inspectSummary(page, previous);
  const duration = panel(page).getByRole('spinbutton', { name: 'Stop duration (minutes)', exact: true });
  await duration.fill('5');
  const mutationPath = `${prepared.base}/plan/stop`;
  let injected = 0;
  await page.route((url) => url.pathname === mutationPath, async (route) => {
    if (route.request().method() === 'POST' && route.request().postDataJSON().duration_min === 5 && injected === 0) {
      injected += 1;
      // Deliberately do not fetch/continue this one request: the real engine
      // has not received or applied it. Every GET and retry stays unmodified.
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'Injected unavailable response before server delivery' });
    } else await route.continue();
  });
  const recovery = waitForResponse(page, `${prepared.base}/plan`, 'GET');
  const failure = waitForResponse(page, mutationPath);
  await panel(page).getByRole('button', { name: 'Update stop duration', exact: true }).click();
  expect((await failure).status()).toBe(503);
  const recovered = await parseResponse(await recovery, parsePlan);
  expect(injected).toBe(1);
  expect(recovered.plan_version).toBe(previous.plan_version);
  expect(recovered.selected_route_id).toBe(previous.selected_route_id);
  expect(recovered.stop).toEqual(previous.stop);
  expect(recovered.routes).toEqual(previous.routes);
  await expect(panel(page).getByRole('button', { name: 'Update stop duration', exact: true })).toBeEnabled();
  await expect(journeySummary(page).locator('.journey-summary-text')).toHaveText(confirmedSummary);
  await expect(duration).toHaveValue('5');
  const retry = await resultAfter(page, mutationPath,
    () => panel(page).getByRole('button', { name: 'Update stop duration', exact: true }).click(), parsePlan);
  expect(retry.body).toEqual({ osm_id: previous.stop!.osm_id, duration_min: 5, if_version: previous.plan_version });
  expect(retry.value.stop?.duration_min).toBe(5);
  expect(retry.value.selected_route_id).toBe(previous.selected_route_id);
  expect(retry.value.plan_version).toBeGreaterThan(previous.plan_version);
  await inspectPlan(page, retry.value);
  await inspectSummary(page, retry.value);
  expect(injected).toBe(1);
  expect(observed.requests.filter(({ path }) => path === mutationPath)).toHaveLength(3);
  expect(observed.requests.filter(({ path }) => path.endsWith('/ask'))).toEqual([]);
  expect(observed.errors).toEqual([]);
});
