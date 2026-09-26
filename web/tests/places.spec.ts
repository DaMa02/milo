import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };

test.use({ viewport: { width: 390, height: 844 } });

const first = { name: 'Talent Garden', kind: null, street: 'Via Calabiana', housenumber: '6', city: 'Milano', lat: 45.44386, lon: 9.20808, distance_m: 20 };
const second = { ...first, name: 'Second place', lat: 45.445 };
const destination = { name: 'Viale Isonzo', lat: 45.44658, lon: 9.20584 };

async function harness(page: Page) {
  // Mount the owned C2 components without depending on App's parallel wiring.
  await page.route('**/src/App.tsx', async (route) => {
    const original = await (await route.fetch()).text();
    const react = original.match(/from\s+["']([^"']*\/react\.js[^"']*)["']/)?.[1];
    if (!react) throw new Error('Vite React module not found');
    return route.fulfill({ contentType: 'application/javascript', body: `
    import React from '${react}';
    import {StartFlow} from '/src/components/StartFlow.tsx';
    import {usePlaces} from '/src/hooks/usePlaces.ts';
    import {dictionaries} from '/src/i18n/index.ts';
    export function App(){
      const [session,setSession]=React.useState(null);
      const [destination,setDestination]=React.useState(null);
      const places=usePlaces({session,t:dictionaries.en,onSessionReady:setSession,onDestinationChanged:setDestination,onMessage:()=>{}});
      window.__places=places;
      return React.createElement(React.Fragment,null,
        React.createElement(StartFlow,{places,t:dictionaries.en}),
        React.createElement('p',{'data-testid':'session'},session?.origin?.name||'No session'),
        React.createElement('p',{'data-testid':'destination'},destination?.name||'No destination'));
    }` });
  });
  await page.goto('/');
}
async function mocks(page: Page) {
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  const state = { failSession: false, empty: false };
  await page.route(/^http:\/\/[^/]+\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() as Record<string, unknown>;
    requests.push({ path, body });
    if (path === '/api/places/search') return route.fulfill({ json: { query: body.query, candidates: state.empty ? [] : [first, second] } });
    if (path === '/api/places/reverse') return route.fulfill({ json: { label: 'Via Calabiana 6', name: null, street: 'Via Calabiana', housenumber: '6', city: 'Milano', lat: first.lat, lon: first.lon } });
    if (path === '/api/session') return state.failSession ? route.fulfill({ status: 503, json: { detail: 'Unavailable' } })
      : route.fulfill({ json: { session_id: 'places', overview, zone: { name: 'Milan', source: 'city' } } });
    if (path === '/api/session/places/destination') return route.fulfill({ json: { destination: body, straight_line_m: 350 } });
    return route.abort();
  });
  return { requests, state };
}
async function search(page: Page, text = 'Talent Garden') {
  await page.getByRole('textbox', { name: 'Place or address', exact: true }).fill(text);
  await page.getByRole('button', { name: 'Find place', exact: true }).click();
  await expect(page.getByRole('radio').first()).toBeVisible();
}

test('keyboard selection creates the confirmed origin and destination uses the same session', async ({ page }) => {
  const observed = await mocks(page); await harness(page); await search(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: test.info().outputPath('places-mobile.png'), fullPage: true });
  await page.getByRole('radio').first().focus(); await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.getByTestId('session')).toHaveText(second.name);
  expect(observed.requests.find((r) => r.path === '/api/session')?.body).toEqual({ lang: 'en', origin: { name: second.name, lat: second.lat, lon: second.lon } });
  await page.getByRole('combobox', { name: 'Use this place as' }).selectOption('destination');
  await search(page, destination.name);
  await page.getByRole('button', { name: 'Confirm this place', exact: true }).click();
  await expect(page.getByTestId('destination')).toHaveText(first.name);
  expect(observed.requests.filter((r) => r.path === '/api/session')).toHaveLength(1);
  expect(observed.requests.filter((r) => r.path.endsWith('/destination'))).toHaveLength(1);
});

test('GPS requires confirmation and denied permission offers a text alternative', async ({ page, context }) => {
  const observed = await mocks(page);
  await context.grantPermissions(['geolocation']); await context.setGeolocation({ latitude: first.lat, longitude: first.lon, accuracy: 17 });
  await harness(page); await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('within about 17 metres. Start here?');
  expect(observed.requests.some((r) => r.path === '/api/session')).toBe(false);
  await page.getByRole('button', { name: 'Confirm this place', exact: true }).click();
  await expect(page.getByTestId('session')).toHaveText('Via Calabiana 6');
  await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (_success, error) => error?.({ code: 1, message: 'Denied', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }); });
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Location permission was denied');
  await expect(page.getByTestId('session')).toHaveText('Via Calabiana 6');
});

test('zero-based confirmation, rejection, empty results and a failed new origin preserve the old session', async ({ page }) => {
  const observed = await mocks(page); await harness(page); await search(page);
  await page.evaluate(() => (window as unknown as { __places: { confirm: (answer: string, index: number) => Promise<void> } }).__places.confirm('yes', 0));
  await expect(page.getByTestId('session')).toHaveText(first.name);
  observed.state.failSession = true; await search(page, 'replacement');
  await page.getByRole('button', { name: 'No, try the next place', exact: true }).click();
  await expect(page.getByRole('radio').nth(1)).toBeChecked();
  await page.getByRole('button', { name: 'Confirm this place', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Your current area is unchanged');
  await expect(page.getByTestId('session')).toHaveText(first.name);
  observed.state.empty = true;
  await page.getByRole('button', { name: 'Find place', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('I could not find that place');
  await expect(page.getByRole('radio')).toHaveCount(0);
});

test('a superseded search cannot replace the newest candidate list', async ({ page }) => {
  await mocks(page); let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/places/search', async (route) => {
    const query = route.request().postDataJSON().query;
    if (query === 'old') await held;
    await route.fulfill({ json: { query, candidates: [query === 'old' ? first : second] } }).catch(() => {});
  });
  await harness(page);
  await page.getByRole('textbox', { name: 'Place or address' }).fill('old');
  await page.getByRole('button', { name: 'Find place', exact: true }).click();
  await search(page, 'new'); release();
  await expect(page.getByRole('radio')).toHaveCount(1);
  await expect(page.getByRole('radio')).toHaveAccessibleName(/Second place/);
});
