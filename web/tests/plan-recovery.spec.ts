import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import initial from '../../contracts/fixtures/plan.initial-comparison.json' with { type: 'json' };

// Exact response details from lotl/plan.py::_current and app.py::get. The
// current backend has no machine error code; these tests do not invent one.
const noPlan = 'There is no plan yet: tell me where you want to go.';
const noSession = 'No such session: start a new one.';
const planPath = '/api/session/recovery-session/plan';
const panel = (page: Page) => page.getByRole('region', { name: 'Plan your trip', exact: true });
const compare = (page: Page) => panel(page).getByRole('button', { name: 'Compare routes', exact: true });
const refresh = (page: Page) => panel(page).getByRole('button', { name: 'Refresh current plan', exact: true });
interface RecordedRequest { method: string; body: Record<string, unknown> | null }

async function engine(page: Page, failure: 'no-plan' | 'unavailable' | 'session') {
  const requests: RecordedRequest[] = [];
  const errors: string[] = [];
  const state = { failCreate: true, readFailure: failure as typeof failure | null };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'recovery-session', overview } });
    if (path !== planPath) return route.fulfill({ status: 404, json: { detail: 'Not Found' } });
    requests.push({ method: request.method(), body: request.postData() ? request.postDataJSON() as Record<string, unknown> : null });
    if (request.method() === 'GET') {
      if (state.readFailure === 'no-plan') return route.fulfill({ status: 404, json: { detail: noPlan } });
      if (state.readFailure === 'session') return route.fulfill({ status: 404, json: { detail: noSession } });
      if (state.readFailure === 'unavailable') return route.fulfill({ status: 503, body: 'Injected unavailable GET' });
      return route.fulfill({ json: initial });
    }
    if (state.failCreate) {
      state.failCreate = false;
      return route.fulfill({ status: 503, body: 'Injected unavailable POST; no plan was created' });
    }
    state.readFailure = null;
    return route.fulfill({ json: initial });
  });
  return { state, requests, errors };
}

async function openDraft(page: Page) {
  await page.goto('/?saved=1');
  await page.getByRole('combobox', { name: 'Data source', exact: true }).selectOption({ label: 'Connected engine' });
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();
  await page.getByRole('navigation', { name: 'Area views', exact: true })
    .getByRole('button', { name: 'Plan your trip', exact: true }).click();
  // This is the documented demo destination alias, with a non-default draft
  // spelling so a form reset cannot masquerade as preserving the user's input.
  await panel(page).getByRole('textbox', { name: 'Destination', exact: true }).fill('the party');
}

async function expectDraft(page: Page) {
  await expect(panel(page).getByRole('textbox', { name: 'Journey origin', exact: true })).toHaveValue('Talent Garden');
  await expect(panel(page).getByRole('textbox', { name: 'Destination', exact: true })).toHaveValue('the party');
  await expect(panel(page).getByLabel('Departure time in Milan', { exact: true })).toHaveValue('2026-09-26T18:00');
}

async function afterGet(page: Page, action: () => Promise<unknown>) {
  const pending = page.waitForResponse((response) => response.request().method() === 'GET'
    && new URL(response.url()).pathname === planPath);
  await action();
  return pending;
}

async function expectRetrySuccess(page: Page) {
  await expect(compare(page)).toBeEnabled();
  await expectDraft(page);
  await compare(page).click();
  await expect(panel(page).locator('.plan-text')).toHaveText(initial.text);
  await expect(panel(page).getByRole('article')).toHaveCount(initial.routes.length);
  await expectDraft(page);
}

test('the HTTP boundary preserves the exact detail and only the current no-plan 404 matches', async ({ page }) => {
  const cases = [
    { status: 404, body: JSON.stringify({ detail: noPlan }), detail: noPlan, absent: true },
    { status: 404, body: JSON.stringify({ detail: noSession }), detail: noSession, absent: false },
    { status: 404, body: JSON.stringify({ detail: 'Not Found' }), detail: 'Not Found', absent: false },
    { status: 410, body: JSON.stringify({ detail: noPlan }), detail: noPlan, absent: false },
    { status: 404, body: JSON.stringify({ detail: { message: noPlan } }), detail: null, absent: false },
    { status: 404, body: '<html>unavailable</html>', detail: null, absent: false },
  ];
  await page.route('**/api/session/boundary-*/plan', (route) => {
    const index = Number(/boundary-(\d+)\/plan$/.exec(new URL(route.request().url()).pathname)?.[1]);
    const item = cases[index];
    return route.fulfill({ status: item.status, contentType: 'application/json', body: item.body });
  });
  await page.goto('/?saved=1');
  const results = await page.evaluate(async (count) => {
    const planPath = '/src/api/plan-client.ts';
    const plan = await import(planPath) as typeof import('../src/api/plan-client');
    const errors = [];
    for (let index = 0; index < count; index += 1) {
      try {
        // Use the actual connected client so transport and discriminator share
        // one dependency instance even when Vite adds an HMR URL timestamp.
        const session = { id: `boundary-${index}` } as Parameters<typeof plan.createPlanClient>[0];
        await plan.createPlanClient(session, false).get();
        throw new Error('The HTTP error unexpectedly succeeded');
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'ApiError') throw error;
        const failure = error as import('../src/api/http').ApiError;
        errors.push({ kind: failure.kind, status: failure.status, detail: failure.detail ?? null, absent: plan.isNoPlanError(error) });
      }
    }
    return errors;
  }, cases.length);
  expect(results).toEqual(cases.map(({ status, detail, absent }) => ({ kind: 'expired', status, detail, absent })));
});

test('a failed first creation followed by no-plan GET preserves drafts and enables an effective retry', async ({ page }) => {
  const observed = await engine(page, 'no-plan');
  await openDraft(page);
  expect((await afterGet(page, () => compare(page).click())).status()).toBe(404);
  await expect(panel(page).getByRole('article')).toHaveCount(0);
  await expectRetrySuccess(page);
  const attempts = observed.requests.filter(({ method }) => method === 'POST');
  expect(attempts).toHaveLength(2);
  expect(attempts[1].body).toEqual(attempts[0].body);
  expect(attempts[1].body?.destination).toEqual({ name: 'the party' });
  expect(observed.requests.map(({ method }) => method)).toEqual(['POST', 'GET', 'POST']);
  expect(observed.errors).toEqual([]);
});

test('a later refresh reporting no plan clears uncertainty and stale confirmed routes without clearing drafts', async ({ page }) => {
  const observed = await engine(page, 'unavailable');
  await openDraft(page);
  expect((await afterGet(page, () => compare(page).click())).status()).toBe(503);
  await expect(compare(page)).toBeDisabled();
  observed.state.readFailure = 'no-plan';
  expect((await afterGet(page, () => refresh(page).click())).status()).toBe(404);
  await expectRetrySuccess(page);
  // A later authoritative no-plan response must also invalidate old displayed
  // routes, rather than treating them as a plan that can still be mutated.
  observed.state.readFailure = 'no-plan';
  expect((await afterGet(page, () => refresh(page).click())).status()).toBe(404);
  await expect(panel(page).getByRole('article')).toHaveCount(0);
  await expectRetrySuccess(page);
  const attempts = observed.requests.filter(({ method }) => method === 'POST');
  expect(attempts).toHaveLength(3);
  expect(attempts.map(({ body }) => body)).toEqual([attempts[0].body, attempts[0].body, attempts[0].body]);
  expect(observed.errors).toEqual([]);
});

test('a missing-session 404 never unlocks creation as though only the plan were absent', async ({ page }) => {
  const observed = await engine(page, 'session');
  await openDraft(page);
  expect((await afterGet(page, () => compare(page).click())).status()).toBe(404);
  await expect(compare(page)).toBeDisabled();
  await expectDraft(page);
  expect((await afterGet(page, () => refresh(page).click())).status()).toBe(404);
  await expect(compare(page)).toBeDisabled();
  await expectDraft(page);
  expect(observed.requests.filter(({ method }) => method === 'POST')).toHaveLength(1);
  await expect(panel(page).getByRole('article')).toHaveCount(0);
  expect(observed.errors).toEqual([]);
});
