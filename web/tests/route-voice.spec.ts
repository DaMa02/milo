import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Plan } from '../src/api/plan-contracts';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import initial from '../../contracts/fixtures/plan.initial-comparison.json' with { type: 'json' };
import selected from '../../contracts/fixtures/plan.stop-candidates.json' with { type: 'json' };
import required from '../../contracts/fixtures/plan.no-compliant-route.json' with { type: 'json' };

const latest = (page: Page) => page.getByRole('region', { name: 'Latest answer', exact: true });
const input = (page: Page) => page.getByRole('textbox', { name: 'Type a question or command', exact: true });
const origin = initial.origin;
const destination = initial.destination;
const routeId = initial.routes[0].id;
const plansPath = '/api/session/route-voice/plan';
interface Request { method: string; path: string; body: Record<string, unknown> }
const interpretations: Record<string, { action: string; params: Record<string, unknown> }> = {
  'start at Talent Garden': { action: 'set_origin', params: { query: origin.name } },
  'go to viale Isonzo': { action: 'set_destination', params: { query: destination.name } },
  'change destination to Talent Garden': { action: 'set_destination', params: { query: origin.name } },
  yes: { action: 'confirm', params: { answer: 'yes', index: 0 } },
  'how do I get there': { action: 'route', params: {} },
  'choose route A': { action: 'route_select', params: { route_id: routeId } },
  'choose an unoffered route': { action: 'route_select', params: { route_id: 'not-offered' } },
  'require signals at every crossing': { action: 'route_avoid', params: { kind: 'unsignalled_crossings', strength: 'require' } },
};

async function mockEngine(page: Page) {
  const requests: Request[] = [];
  const unexpected: string[] = [];
  const errors: string[] = [];
  const state = { failNextCreation: false };
  let current = structuredClone(initial) as Plan;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postData() ? request.postDataJSON() as Record<string, unknown> : {};
    requests.push({ method: request.method(), path, body });
    if (path === '/api/interpret') {
      const command = interpretations[String(body.utterance)];
      if (command) return route.fulfill({ json: { utterance: body.utterance, ...command, via: 'grammar' } });
    }
    if (path === '/api/places/search') {
      if (body.query !== origin.name && body.query !== destination.name) {
        unexpected.push(`unexpected place query: ${String(body.query)}`);
        return route.fulfill({ status: 422, json: { detail: 'Unexpected test place query' } });
      }
      const point = body.query === origin.name ? origin : destination;
      return route.fulfill({ json: { query: body.query, candidates: [{ ...point,
        kind: null, street: null, housenumber: null, city: 'Milano', distance_m: 0,
      }] } });
    }
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'route-voice', overview, zone: { name: 'Milan', source: 'city' } } });
    if (path === '/api/session/route-voice/destination') return route.fulfill({ json: {
      destination: body, straight_line_m: body.name === origin.name ? 0 : 350,
    } });
    if (path === plansPath) {
      if (request.method() === 'POST' && state.failNextCreation) {
        state.failNextCreation = false;
        return route.fulfill({ status: 500, json: { detail: 'Simulated failed creation for the new destination' } });
      }
      if (request.method() === 'POST') current = structuredClone(initial);
      return route.fulfill({ json: current });
    }
    if (path === `${plansPath}/select`) {
      if (body.route_id !== routeId || body.if_version !== current.plan_version) {
        unexpected.push('selection with an unoffered ID or stale version');
        return route.fulfill({ status: 409, json: { detail: 'Unexpected test selection' } });
      }
      current = { ...structuredClone(initial), selected_route_id: routeId,
        plan_version: current.plan_version + 1, differences: selected.differences } as Plan;
      return route.fulfill({ json: current });
    }
    if (path === `${plansPath}/constraints`) {
      if (body.if_version !== current.plan_version) unexpected.push('constraint update with a stale version');
      // Facts come from the shared require fixture; only the protocol revision
      // advances because this story selected a route before changing its rule.
      current = { ...structuredClone(required), plan_version: current.plan_version + 1 } as Plan;
      return route.fulfill({ json: current });
    }
    unexpected.push(path);
    return route.fulfill({ status: 404, json: { detail: 'Unexpected test request' } });
  });
  return { requests, unexpected, errors, state };
}

async function send(page: Page, text: string) {
  await input(page).fill(text);
  await input(page).press('Enter');
}

async function confirmOrigin(page: Page) {
  await page.goto('/?debug=1');
  await expect(page.getByRole('button', { name: /^Talk/ })).toBeFocused();
  await send(page, 'start at Talent Garden');
  await expect(latest(page)).toContainText(`I found ${origin.name}`);
  await send(page, 'yes');
  await expect(latest(page)).toContainText('Facing north from Talent Garden.');
}

async function confirmDestination(page: Page) {
  await send(page, 'go to viale Isonzo');
  await expect(latest(page)).toContainText(`I found ${destination.name}`);
  await send(page, 'yes');
  await expect(latest(page)).toContainText(`Your destination is ${destination.name}.`);
}

async function compare(page: Page) {
  await send(page, 'how do I get there');
  await expect(latest(page)).toContainText('Route A, on foot, 14 minutes');
}

test('spoken-action dispatch plans confirmed places, selects an offered ID and updates the current constraint version', async ({ page }) => {
  const engine = await mockEngine(page);
  await confirmOrigin(page);
  await confirmDestination(page);
  await compare(page);
  await send(page, 'choose route A');
  await expect(latest(page)).toContainText(selected.differences[0]);
  await send(page, 'require signals at every crossing');
  await expect(latest(page)).toContainText(required.differences[0]);
  for (const unknown of required.unknown) await expect(latest(page)).toContainText(unknown);
  await expect(input(page)).toBeFocused();
  expect(engine.requests.find(({ path }) => path === '/api/session')?.body).toEqual({ lang: 'en', origin });
  expect(engine.requests.filter(({ path }) => path.endsWith('/destination')).map(({ body }) => body)).toEqual([destination]);
  expect(engine.requests.filter(({ path, method }) => path === plansPath && method === 'POST')).toHaveLength(1);
  expect(engine.requests.find(({ path }) => path.endsWith('/select'))?.body).toEqual({ route_id: routeId, if_version: 1 });
  expect(engine.requests.find(({ path }) => path.endsWith('/constraints'))?.body).toMatchObject({ constraints: required.constraints, if_version: 2 });
  const selectContext = engine.requests.find(({ path, body }) => path === '/api/interpret' && body.utterance === 'choose route A')?.body.context;
  expect(selectContext).toMatchObject({ view: 'plan', has_destination: true, pending: null,
    routes: initial.routes.map(({ id }) => ({ id, label: expect.any(String) })),
  });
  expect(engine.requests.filter(({ path }) => path.endsWith('/destination') || path === '/api/session')).toHaveLength(2);
  expect(engine.unexpected).toEqual([]);
  expect(engine.errors).toEqual([]);
});

test('a route request without a confirmed destination prompts for it and cannot create a default journey', async ({ page }) => {
  const engine = await mockEngine(page);
  await confirmOrigin(page);
  await send(page, 'how do I get there');
  await expect(latest(page)).toContainText('Where do you want to go? Say a place or address.');
  expect(engine.requests.some(({ path }) => path === plansPath)).toBe(false);
  await confirmDestination(page);
  await compare(page);
  expect(engine.requests.filter(({ path, method }) => path === plansPath && method === 'POST')).toHaveLength(1);
  const creation = engine.requests.find(({ path, method }) => path === plansPath && method === 'POST')!.body;
  expect(creation.destination).toEqual(destination);
  expect(creation.origin).toEqual(origin);
  expect(creation.constraints).toEqual([]);
  expect(creation.detour_tolerance).toEqual({ min: 5, pct: 25 });
  expect(Number.isFinite(Date.parse(String(creation.depart_at)))).toBe(true);
  await expect(input(page)).toBeFocused();
  expect(engine.unexpected).toEqual([]);
  expect(engine.errors).toEqual([]);
});

test('an unoffered route ID cannot mutate the plan and an offered selection still works afterwards', async ({ page }) => {
  const engine = await mockEngine(page);
  await confirmOrigin(page);
  await confirmDestination(page);
  await compare(page);
  await send(page, 'choose an unoffered route');
  await expect(latest(page)).toContainText(/offered|choose|match/i);
  expect(engine.requests.some(({ path }) => path.endsWith('/select'))).toBe(false);
  await send(page, 'choose route A');
  await expect(latest(page)).toContainText(selected.differences[0]);
  expect(engine.requests.filter(({ path }) => path.endsWith('/select')).map(({ body }) => body))
    .toEqual([{ route_id: routeId, if_version: 1 }]);
  expect(engine.requests.filter(({ path, method }) => path === plansPath && method === 'POST')).toHaveLength(1);
  expect(engine.unexpected).toEqual([]);
  expect(engine.errors).toEqual([]);
});

test('asking for the route again after selection reads the confirmed choice without recreating the plan', async ({ page }) => {
  const engine = await mockEngine(page);
  await confirmOrigin(page);
  await confirmDestination(page);
  await compare(page);
  await send(page, 'choose route A');
  await expect(latest(page)).toContainText(selected.differences[0]);
  const previousRequests = engine.requests.filter(({ path }) => path.startsWith(plansPath));
  expect(previousRequests.map(({ path }) => path)).toEqual([plansPath, `${plansPath}/select`]);
  await send(page, 'how do I get there');
  await expect(latest(page)).toContainText(initial.routes.find(({ id }) => id === routeId)!.summary);
  await expect(latest(page)).toContainText('Confirmed journey comparison');
  await expect(latest(page)).not.toContainText(selected.differences[0]);
  expect(engine.requests.filter(({ path }) => path.startsWith(plansPath))).toEqual(previousRequests);
  await expect(input(page)).toBeFocused();
  await page.getByText('Show all controls', { exact: true }).click();
  await expect(page.getByRole('article', { name: `Route ${routeId}`, exact: true }).getByText('Chosen route', { exact: true })).toBeVisible();
  expect(engine.unexpected).toEqual([]);
  expect(engine.errors).toEqual([]);
});

test('a failed replan for a changed destination labels the recovered old plan and rejects its stale choices', async ({ page }) => {
  const engine = await mockEngine(page);
  await confirmOrigin(page);
  await confirmDestination(page);
  await compare(page);
  engine.state.failNextCreation = true;
  await send(page, 'change destination to Talent Garden');
  await expect(latest(page)).toContainText(`I found ${origin.name}`);
  await send(page, 'yes');
  await expect(latest(page)).toContainText(`The previous plan is for ${destination.name}.`);
  await expect(latest(page)).toContainText('The new destination has no confirmed plan yet.');
  const creations = engine.requests.filter(({ path, method }) => path === plansPath && method === 'POST');
  expect(creations).toHaveLength(2);
  expect(creations[1].body.destination).toEqual(origin);
  expect(creations[1].body.constraints).toEqual(initial.constraints);
  expect(engine.requests.filter(({ path, method }) => path === plansPath && method === 'GET')).toHaveLength(1);
  for (const command of ['choose route A', 'require signals at every crossing']) {
    const interpreted = page.waitForResponse('**/api/interpret');
    await send(page, command);
    await interpreted;
    await expect(page.locator('.voice-state')).toHaveText('Ready');
    await expect(latest(page)).toContainText(`The previous plan is for ${destination.name}.`);
    expect(engine.requests.filter(({ path, body }) => path === '/api/interpret' && body.utterance === command).at(-1)?.body.context)
      .toMatchObject({ has_destination: true, routes: [] });
  }
  expect(engine.requests.filter(({ path }) => path.endsWith('/select') || path.endsWith('/constraints'))).toEqual([]);
  await expect(input(page)).toBeFocused();
  expect(engine.unexpected).toEqual([]);
  expect(engine.errors).toEqual([]);
});
