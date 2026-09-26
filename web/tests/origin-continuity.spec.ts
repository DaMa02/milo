import { expect, test, type Page } from '@playwright/test';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };

async function harness(page: Page, accuracy = 17, denied = false, delayed = false) {
  const requests: string[] = [];
  await page.addInitScript(({ accuracy, denied, delayed }) => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(success: PositionCallback, fail: PositionErrorCallback) {
        const complete = () => denied ? fail({ code: 1 } as GeolocationPositionError) : success({ coords: { latitude: 45.44386, longitude: 9.20808, accuracy } } as GeolocationPosition);
        if (delayed) Object.assign(window, { __gpsComplete: complete }); else complete();
      },
    } });
  }, { accuracy, denied, delayed });
  await page.route(/^http:\/\/[^/]+\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname; requests.push(path);
    if (path === '/api/places/reverse') return route.fulfill({ json: { label: 'Via Calabiana 6', name: null, street: 'Via Calabiana', housenumber: '6', city: 'Milano', lat: 45.44386, lon: 9.20808 } });
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'origin-ready', overview } });
    return route.abort();
  });
  await page.route(/\/src\/App\.tsx(?:\?|$)/, async (route) => {
    const original = await (await route.fetch()).text();
    const react = original.match(/from\s+["']([^"']*\/react\.js[^"']*)["']/)?.[1];
    if (!react) throw new Error('React import missing');
    return route.fulfill({ contentType: 'application/javascript', body: `
      import React from '${react}'; import {usePlaces} from '/src/hooks/usePlaces.ts'; import {dictionaries} from '/src/i18n/index.ts';
      export function App(){ const [session,setSession]=React.useState(null); const [messages,setMessages]=React.useState([]);
        const places=usePlaces({session,t:dictionaries.en,onSessionReady:setSession,onDestinationChanged:()=>{},onMessage:m=>setMessages(old=>[...old,m])});
        return React.createElement('main',{},
          React.createElement('button',{onClick:()=>places.setOriginHere({autoConfirm:true})},'Automatic origin'),
          React.createElement('button',{onClick:()=>places.setOriginHere()},'Explicit GPS'),
          React.createElement('button',{onClick:places.cancel},'Cancel'),
          React.createElement('p',{id:'phase'},places.phase), React.createElement('p',{id:'pending'},places.pending||'none'),
          React.createElement('p',{id:'session'},session?.id||'none'), React.createElement('p',{id:'messages'},messages.join(' | ')));
      }` });
  });
  await page.goto('/'); return requests;
}

test('precise automatic GPS announces the origin and creates one session without a confirmation turn', async ({ page }) => {
  const requests = await harness(page, 100);
  await page.getByRole('button', { name: 'Automatic origin' }).click();
  await expect(page.locator('#session')).toHaveText('origin-ready');
  await expect(page.locator('#messages')).toContainText('Using your location, Via Calabiana 6.');
  await expect(page.locator('#messages')).not.toContainText('Start here?');
  expect(requests.filter(path => path === '/api/session')).toHaveLength(1);
});

test('imprecise automatic GPS and explicit GPS still request confirmation', async ({ page }) => {
  const requests = await harness(page, 101);
  await page.getByRole('button', { name: 'Automatic origin' }).click();
  await expect(page.locator('#phase')).toHaveText('confirming');
  await expect(page.locator('#messages')).toContainText('Start here?');
  expect(requests).not.toContain('/api/session');
  await harness(page, 17);
  await page.getByRole('button', { name: 'Explicit GPS' }).click();
  await expect(page.locator('#phase')).toHaveText('confirming');
  await expect(page.locator('#session')).toHaveText('none');
});

test('denied automatic GPS keeps origin pending and asks for a starting point', async ({ page }) => {
  const requests = await harness(page, 17, true);
  await page.getByRole('button', { name: 'Automatic origin' }).click();
  await expect(page.locator('#messages')).toContainText('Tell me where you are starting from.');
  await expect(page.locator('#pending')).toHaveText('origin');
  await expect(page.locator('#phase')).toHaveText('idle');
  expect(requests).toEqual([]);
});

test('cancelled GPS cannot announce or create an origin when its callback arrives late', async ({ page }) => {
  const requests = await harness(page, 17, false, true);
  await page.getByRole('button', { name: 'Automatic origin' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => (window as unknown as { __gpsComplete: () => void }).__gpsComplete());
  await expect(page.locator('#phase')).toHaveText('idle');
  await expect(page.locator('#session')).toHaveText('none');
  expect(requests).toEqual([]);
  await expect(page.locator('#messages')).not.toContainText('Using your location');
});
