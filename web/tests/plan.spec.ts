import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { Plan } from '../src/api/plan-contracts';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import start from '../../contracts/fixtures/explore-step.start.json' with { type: 'json' };
import junction from '../../contracts/fixtures/explore-step.first-junction.json' with { type: 'json' };
import initial from '../../contracts/fixtures/plan.initial-comparison.json' with { type: 'json' };
import candidates from '../../contracts/fixtures/plan.stop-candidates.json' with { type: 'json' };
import stop15 from '../../contracts/fixtures/plan.two-foot-routes-and-transit.json' with { type: 'json' };
import stop5 from '../../contracts/fixtures/plan.stop-5-min.json' with { type: 'json' };
import required from '../../contracts/fixtures/plan.no-compliant-route.json' with { type: 'json' };

const panel = (page: Page) => page.getByRole('region', { name: 'Plan your trip', exact: true });
const planNavigation = (page: Page) => page.getByRole('navigation', { name: 'Area views', exact: true })
  .getByRole('button', { name: 'Plan your trip', exact: true });
const routeA = (page: Page) => panel(page).getByRole('article', { name: 'Route A', exact: true });
const summary = (page: Page) => panel(page).getByRole('region', { name: 'Your chosen journey', exact: true });
const clone = (value: unknown): Plan => structuredClone(value) as Plan;
const apiPattern = /^https?:\/\/[^/]+\/api\//;
interface RecordedRequest { method: string; path: string; body: Record<string, unknown> | null }
interface PlanSpeechWindow extends Window { __planSpeech: { readings: string[]; cancellations: number } }

async function recordSpeech(page: Page) {
  await page.addInitScript(() => {
    (window as PlanSpeechWindow).__planSpeech = { readings: [], cancellations: 0 };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak(utterance: SpeechSynthesisUtterance) { (window as PlanSpeechWindow).__planSpeech.readings.push(utterance.text); },
        cancel() { (window as PlanSpeechWindow).__planSpeech.cancellations += 1; },
      },
    });
  });
}

async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let index = 0; index < 200; index += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
}

async function activate(page: Page, target: Locator) {
  await tabTo(page, target);
  await page.keyboard.press('Enter');
}

async function showSummary(page: Page, keyboard = false) {
  if (!(await summary(page).isVisible())) {
    const disclosure = panel(page).getByText('Show journey summary', { exact: true });
    if (keyboard) await activate(page, disclosure);
    else await disclosure.click();
  }
  await expect(summary(page)).toBeVisible();
}

/** Transport failures and delayed delivery below are simulated; route facts
 * always come from the shared fixtures, never from calculations in the test. */
async function installEngine(page: Page) {
  const requests: RecordedRequest[] = [];
  const errors: string[] = [];
  const state = {
    current: clone(initial),
    failure: null as null | { status: number; apply: boolean },
    failGet: false,
    holdStop: null as Promise<void> | null,
    reorder: false,
  };
  let position: typeof start | typeof junction = start;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(apiPattern, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postData() ? request.postDataJSON() as Record<string, unknown> : null;
    requests.push({ method: request.method(), path, body });
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'plan-session', overview } });
    if (path.endsWith('/explore')) {
      if (body?.command === 'forward') position = junction;
      else if (body?.command === 'start' || body?.command === 'back' || body?.command === 'home') position = start;
      return route.fulfill({ json: position });
    }
    if (request.method() === 'GET' && path.endsWith('/plan')) {
      return state.failGet ? route.fulfill({ status: 503, body: 'Simulated unavailable reconciliation' })
        : route.fulfill({ json: state.current });
    }
    if (path === '/api/session/plan-session/plan') {
      state.current = clone(initial);
      return route.fulfill({ json: state.current });
    }
    if (body?.if_version !== state.current.plan_version) {
      return route.fulfill({ status: 409, body: 'Simulated stale plan version' });
    }
    if (path.endsWith('/stop') && state.holdStop) {
      const pending = state.holdStop;
      state.holdStop = null;
      await pending;
    }
    const failure = state.failure;
    state.failure = null;
    if (failure && !failure.apply) return route.fulfill({ status: failure.status, body: 'Simulated unapplied change' });
    if (path.endsWith('/select')) {
      state.current = { ...clone(candidates), stop_candidates: [] };
    } else if (path.endsWith('/stop/candidates')) {
      state.current = clone(candidates);
    } else if (path.endsWith('/stop')) {
      state.current = clone(body?.duration_min === 5 ? stop5 : stop15);
    } else if (path.endsWith('/constraints')) {
      state.current = clone(required);
    } else return route.fulfill({ status: 422, body: 'No saved result for the simulated input' });
    if (state.reorder) {
      state.current.routes = [...state.current.routes].reverse();
      state.reorder = false;
    }
    return failure ? route.fulfill({ status: failure.status, body: 'Simulated lost mutation response' })
      : route.fulfill({ json: state.current });
  });
  return { state, requests, errors };
}

async function openPlan(page: Page, connected = false) {
  await page.goto('/');
  if (connected) await page.getByRole('combobox', { name: 'Data source', exact: true }).selectOption({ label: 'Connected engine' });
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();
  await planNavigation(page).click();
  await panel(page).getByRole('button', { name: 'Compare routes', exact: true }).click();
  await expect(routeA(page)).toContainText('14 minutes');
}

async function chooseAndFind(page: Page) {
  await panel(page).getByRole('button', { name: 'Choose route A', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Find supermarkets', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Add Lidl', exact: true })).toBeVisible();
}

async function addSavedStop(page: Page) {
  await chooseAndFind(page);
  await panel(page).getByRole('button', { name: 'Add Lidl', exact: true }).click();
  await expect(routeA(page)).toContainText('30 minutes');
}

test('the saved party journey works by keyboard from exploration to a chosen five-minute stop', async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(apiPattern, (route) => { requests.push(route.request().url()); return route.abort(); });
  await page.goto('/');
  await activate(page, page.getByRole('button', { name: 'Open the area', exact: true }));
  await activate(page, page.getByRole('button', { name: 'Explore from here', exact: true }));
  await activate(page, page.getByRole('button', { name: 'Go forward', exact: true }));
  await expect(page.locator('.result-text')).toContainText('You walked 140 m');
  await activate(page, page.getByRole('button', { name: 'Back to the previous junction', exact: true }));
  await expect(page.locator('.result-text')).toContainText('Start at Talent Garden');
  await activate(page, planNavigation(page));
  await expect(panel(page).getByRole('textbox', { name: 'Journey origin', exact: true })).toHaveValue('Talent Garden');
  await activate(page, panel(page).getByRole('button', { name: 'Compare routes', exact: true }));
  await expect(routeA(page)).toContainText('14 minutes');
  await activate(page, panel(page).getByRole('button', { name: 'Choose route A', exact: true }));
  await showSummary(page, true);
  await expect(summary(page)).toContainText('Route A');
  await activate(page, panel(page).getByText('Route B details', { exact: true }));
  await expect(summary(page)).toContainText('Route A');
  await expect(summary(page)).not.toContainText('Route B');
  await activate(page, panel(page).getByRole('button', { name: 'Find supermarkets', exact: true }));
  await expect(panel(page).getByRole('button', { name: 'Add NaturaSì', exact: true })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Add Conad', exact: true })).toBeVisible();
  await activate(page, panel(page).getByRole('button', { name: 'Add Lidl', exact: true }));
  await expect(routeA(page)).toContainText('30 minutes');
  const duration = panel(page).getByRole('spinbutton', { name: 'Stop duration (minutes)', exact: true });
  await tabTo(page, duration);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('5');
  await activate(page, panel(page).getByRole('button', { name: 'Update stop duration', exact: true }));
  await expect(routeA(page)).toContainText('20 minutes');
  await showSummary(page, true);
  await expect(summary(page)).toContainText('Route A');
  await expect(summary(page)).toContainText('Lidl');
  await expect(summary(page)).toContainText('Talent Garden');
  await expect(summary(page)).toContainText('viale Isonzo');
  await expect(summary(page)).toContainText(/5\s+min/);
  await expect(summary(page)).toContainText(/20\s+min/);
  await expect(summary(page)).toContainText(/open|opening/i);
  for (const difference of stop5.differences) await expect(panel(page).getByText(difference, { exact: true })).toBeVisible();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: `test-results/plan-${width}.png`, fullPage: true });
  }
  expect(requests).toEqual([]);
  expect(errors).toEqual([]);
});

test('requiring signals offers no violating route and never silently relaxes the requirement', async ({ page }) => {
  await openPlan(page);
  await panel(page).getByText('Journey preferences', { exact: true }).click();
  const constraint = panel(page).getByRole('combobox', { name: 'Crossings without traffic signals', exact: true });
  await constraint.selectOption({ label: 'Require' });
  await panel(page).getByRole('button', { name: 'Apply constraints', exact: true }).click();
  await expect(panel(page).getByRole('article')).toHaveCount(0);
  await expect(panel(page).getByRole('button', { name: /^Choose route / })).toHaveCount(0);
  await expect(constraint).toHaveValue('require');
  await expect(panel(page)).toContainText(required.text);
  await expect(panel(page).getByRole('button', { name: 'Apply constraints', exact: true })).toBeEnabled();
});

test('rejected changes and uncertain cache failures keep the last confirmed plan until a GET confirms recovery', async ({ page }) => {
  await recordSpeech(page);
  const engine = await installEngine(page);
  await openPlan(page, true);
  await page.getByRole('checkbox', { name: 'Read new results aloud', exact: true }).check();
  await addSavedStop(page);
  const duration = panel(page).getByRole('spinbutton', { name: 'Stop duration (minutes)', exact: true });
  await duration.fill('5');
  engine.state.failure = { status: 422, apply: false };
  await panel(page).getByRole('button', { name: 'Update stop duration', exact: true }).click();
  await expect(page.locator('.error-message')).toBeVisible();
  await expect(routeA(page)).toContainText('30 minutes');
  expect(engine.requests.filter(({ method, path }) => method === 'GET' && path.endsWith('/plan'))).toHaveLength(0);

  engine.state.failure = { status: 503, apply: false };
  await panel(page).getByLabel('Departure time in Milan', { exact: true }).fill('2026-09-26T18:05');
  await panel(page).getByRole('button', { name: 'Update departure', exact: true }).click();
  await expect.poll(() => engine.requests.filter(({ method, path }) => method === 'GET' && path.endsWith('/plan')).length).toBe(1);
  await expect(routeA(page)).toContainText('30 minutes');
  await expect(panel(page).getByRole('button', { name: 'Update stop duration', exact: true })).toBeEnabled();
  const confirmedReading = await page.evaluate(() => (window as PlanSpeechWindow).__planSpeech.readings.at(-1));
  expect(confirmedReading).toContain('Confirmed journey comparison');
  expect(confirmedReading).toContain('Confirmed stop: Lidl, 15 minutes.');
  for (const difference of stop15.differences) expect(confirmedReading).not.toContain(difference);
  for (const unknown of stop15.unknown) expect(confirmedReading).toContain(unknown);

  engine.state.failure = { status: 503, apply: false };
  engine.state.failGet = true;
  await panel(page).getByRole('button', { name: 'Update stop duration', exact: true }).click();
  await expect(panel(page)).toContainText('The change could not be confirmed.');
  await expect(routeA(page)).toContainText('30 minutes');
  await expect(panel(page).getByRole('button', { name: 'Update stop duration', exact: true })).toBeDisabled();
  engine.state.failGet = false;
  engine.state.current = clone(stop5);
  engine.state.current.routes.reverse();
  await panel(page).getByRole('button', { name: 'Refresh current plan', exact: true }).click();
  await expect(routeA(page)).toContainText('20 minutes');
  await showSummary(page);
  await expect(summary(page)).toContainText('Route A');
  await expect(summary(page)).not.toContainText('Route C');
  await expect(panel(page).getByRole('button', { name: 'Update stop duration', exact: true })).toBeEnabled();
  const failedMutations = engine.requests.filter(({ path }) => path.endsWith('/stop') || path.endsWith('/depart'));
  expect(failedMutations.map(({ body }) => body?.if_version)).toEqual([2, 3, 3, 3]);
  expect(engine.errors).toEqual([]);
});

test('a pending stop keeps a newer draft and keyboard focus while stopping speech leaves the mutation active', async ({ page }) => {
  await recordSpeech(page);
  const engine = await installEngine(page);
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Data source', exact: true }).selectOption({ label: 'Connected engine' });
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();
  await page.getByRole('button', { name: 'Explore from here', exact: true }).click();
  await page.getByRole('button', { name: 'Go forward', exact: true }).click();
  await expect(page.locator('.result-text')).toContainText('You walked 140 m');
  await planNavigation(page).click();
  await panel(page).getByRole('button', { name: 'Compare routes', exact: true }).click();
  await expect(routeA(page)).toContainText('14 minutes');
  const create = engine.requests.find(({ path }) => path === '/api/session/plan-session/plan');
  expect(create?.body?.origin).toEqual(initial.origin);
  expect(Date.parse(String(create?.body?.depart_at))).toBe(Date.parse(initial.depart_at));
  await chooseAndFind(page);
  await page.getByRole('checkbox', { name: 'Read new results aloud', exact: true }).check();
  let release!: () => void;
  engine.state.holdStop = new Promise<void>((resolve) => { release = resolve; });
  const started = page.waitForRequest('**/api/session/plan-session/plan/stop');
  await panel(page).getByRole('button', { name: 'Add Lidl', exact: true }).click();
  await started;
  const duration = panel(page).getByRole('spinbutton', { name: 'Stop duration (minutes)', exact: true });
  await duration.fill('5');
  const readingsBeforeStop = await page.evaluate(() => (window as PlanSpeechWindow).__planSpeech.readings);
  const previousCancellations = await page.evaluate(() => (window as PlanSpeechWindow).__planSpeech.cancellations);
  await page.getByRole('button', { name: 'Stop reading', exact: true }).first().click();
  expect(await page.evaluate(() => (window as PlanSpeechWindow).__planSpeech.cancellations)).toBeGreaterThan(previousCancellations);
  expect(engine.requests.filter(({ path }) => path.endsWith('/stop'))).toHaveLength(1);
  await duration.focus();
  release();
  await expect(routeA(page)).toContainText('30 minutes');
  await expect(duration).toHaveValue('5');
  await expect(duration).toBeFocused();
  expect(await page.evaluate(() => (window as PlanSpeechWindow).__planSpeech.readings)).toEqual(readingsBeforeStop);
  engine.state.reorder = true;
  await panel(page).getByRole('button', { name: 'Update stop duration', exact: true }).click();
  await expect(routeA(page)).toContainText('20 minutes');
  await showSummary(page);
  await expect(summary(page)).toContainText('Route A');
  expect(engine.requests.filter(({ path }) => path.endsWith('/stop')).map(({ body }) => body)).toEqual([
    { osm_id: 'node/10571089360', duration_min: 15, if_version: 2 },
    { osm_id: 'node/10571089360', duration_min: 5, if_version: 3 },
  ]);
  expect(engine.requests.filter(({ path }) => path.endsWith('/select')).map(({ body }) => body)).toEqual([{ route_id: 'A', if_version: 1 }]);
  expect(engine.requests.filter(({ path }) => path.endsWith('/stop/candidates')).map(({ body }) => body)).toEqual([{ kind: 'supermarket', if_version: 2 }]);
  expect(engine.errors).toEqual([]);
});

test('a server error after applying a change is reconciled by GET without sending the mutation twice', async ({ page }) => {
  const engine = await installEngine(page);
  await openPlan(page, true);
  await addSavedStop(page);
  engine.state.failure = { status: 500, apply: true };
  await panel(page).getByRole('spinbutton', { name: 'Stop duration (minutes)', exact: true }).fill('5');
  await panel(page).getByRole('button', { name: 'Update stop duration', exact: true }).click();
  await expect(routeA(page)).toContainText('20 minutes');
  await showSummary(page);
  await expect(summary(page)).toContainText('Route A');
  await expect(summary(page)).toContainText(/5\s+min/);
  expect(engine.requests.filter(({ method, path }) => method === 'GET' && path.endsWith('/plan'))).toHaveLength(1);
  expect(engine.requests.filter(({ path }) => path.endsWith('/stop')).map(({ body }) => body?.if_version)).toEqual([2, 3]);
  expect(engine.errors).toEqual([]);
});
