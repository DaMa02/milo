import { expect, test, type Page } from '@playwright/test';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import step from '../../contracts/fixtures/explore-step.start.json' with { type: 'json' };

async function harness(page: Page, denied = false) {
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  await page.addInitScript((denied) => {
    Object.assign(window, { __permissionCalls: 0 });
    class Orientation extends Event {
      static requestPermission() { Object.assign(window, { __permissionCalls: (window as unknown as { __permissionCalls: number }).__permissionCalls + 1 }); return Promise.resolve(denied ? 'denied' : 'granted'); }
    }
    Object.defineProperty(window, 'DeviceOrientationEvent', { value: Orientation, configurable: true });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      watchPosition(callback: PositionCallback) { callback({ coords: { latitude: 45.44386, longitude: 9.20808, accuracy: 7, heading: 270 } } as GeolocationPosition); return 7; },
      clearWatch() {},
    } });
  }, denied);
  await page.route(/^http:\/\/[^/]+\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = route.request().postDataJSON() as Record<string, unknown>; requests.push({ path, body });
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'compass', overview } });
    if (path === '/api/session/compass/explore') return route.fulfill({ json: step });
    if (path === '/api/session/compass/navigate') return route.fulfill({ json: { status: 'on_route', text: null, route_id: 'A', off_route_m: 0, remaining_m: 100, remaining_min: 2, next: null, route_line: null } });
    if (path.endsWith('/navigate/stop')) return route.fulfill({ json: { status: 'stopped' } });
    return route.abort();
  });
  await page.route(/\/src\/App\.tsx(?:\?|$)/, async (route) => {
    const original = await (await route.fetch()).text();
    const react = original.match(/from\s+["']([^"']*\/react\.js[^"']*)["']/)?.[1];
    if (!react) throw new Error('React module missing');
    return route.fulfill({ contentType: 'application/javascript', body: `
      import React from '${react}'; import {useCompass} from '/src/hooks/useCompass.ts';
      import {TalkButton} from '/src/components/TalkButton.tsx'; import {createConnectedSession} from '/src/api/session.ts';
      import {useLiveGuidance} from '/src/hooks/useLiveGuidance.ts';
      export function App(){ const [session,setSession]=React.useState(null); const [denials,setDenials]=React.useState(0);
        const compass=useCompass({onDenied:()=>setDenials(n=>n+1)}); window.__compass=compass;
        const nav=useLiveGuidance({sessionId:session?.id??null,getHeading:compass.getHeading,onMessage:()=>{},onError:()=>{}});
        return React.createElement('main',{},
          React.createElement(TalkButton,{state:'idle',onStart:()=>{},onStop:()=>{},onGesture:compass.requestPermission,labels:{idle:'Talk',listening:'Finish',transcribing:'Wait'}}),
          React.createElement('button',{onClick:async()=>setSession(await createConnectedSession(undefined,{getHeading:compass.getHeading}))},'Create session'),
          React.createElement('button',{onClick:()=>session.explore('start')},'Explore'),
          React.createElement('button',{onClick:nav.start},'Guide'), React.createElement('button',{onClick:nav.stop},'Stop guidance'),
          React.createElement('p',{id:'session'},session?.id||'none'), React.createElement('p',{id:'denied'},String(denials)));
      }` });
  });
  await page.goto('/'); await expect(page.getByRole('button', { name: 'Talk', exact: true })).toBeVisible();
  return requests;
}
async function reading(page: Page, heading: number, accuracy = 10) {
  await page.evaluate(({ heading, accuracy }) => { const e = new Event('deviceorientation'); Object.assign(e, { webkitCompassHeading: heading, webkitCompassAccuracy: accuracy }); window.dispatchEvent(e); }, { heading, accuracy });
}
async function heading(page: Page) { return page.evaluate(() => (window as unknown as { __compass: { getHeading: () => number | undefined } }).__compass.getHeading()); }

test('first Talk gesture requests iOS compass and sends east on session, explore and navigate', async ({ page }) => {
  const requests = await harness(page);
  expect(await page.evaluate(() => (window as unknown as { __permissionCalls: number }).__permissionCalls)).toBe(0);
  await page.getByRole('button', { name: 'Talk', exact: true }).click(); await reading(page, 90);
  await page.getByRole('button', { name: 'Create session' }).click(); await expect(page.locator('#session')).toHaveText('compass');
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await page.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect.poll(() => requests.filter(r => /session$|explore$|navigate$/.test(r.path)).length).toBe(3);
  for (const request of requests.filter(r => /session$|explore$|navigate$/.test(r.path))) expect(request.body.heading_deg, request.path).toBe(90);
  await page.getByRole('button', { name: 'Stop guidance' }).click();
  expect(await page.evaluate(() => (window as unknown as { __permissionCalls: number }).__permissionCalls)).toBe(1);
});

test('permission denial is reported once and navigation retains GPS heading', async ({ page }) => {
  const requests = await harness(page, true);
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await expect(page.locator('#denied')).toHaveText('1'); await reading(page, 90);
  await page.getByRole('button', { name: 'Create session' }).click(); await expect(page.locator('#session')).toHaveText('compass');
  expect(requests.find(r => r.path === '/api/session')?.body.heading_deg).toBeUndefined();
  await page.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect.poll(() => requests.find(r => r.path.endsWith('/navigate'))?.body.heading_deg).toBe(270);
  await page.getByRole('button', { name: 'Stop guidance' }).click();
});

test('circular smoothing crosses north; stale and inaccurate readings are unknown', async ({ page }) => {
  await harness(page); await page.clock.install();
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await reading(page, 359); await reading(page, 1); expect(await heading(page)).toBe(0);
  await page.clock.runFor(3001); expect(await heading(page)).toBeUndefined();
  await reading(page, 90); expect(await heading(page)).toBe(90);
  await reading(page, 180, 46); expect(await heading(page)).toBeUndefined();
  await reading(page, 180, -1); expect(await heading(page)).toBeUndefined();
});

test('absolute alpha is a fallback and a relative event cannot overwrite it', async ({ page }) => {
  await harness(page); await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await page.evaluate(() => { const e = new Event('deviceorientation'); Object.assign(e, { alpha: 270, absolute: true }); window.dispatchEvent(e); });
  expect(await heading(page)).toBe(90);
  await page.evaluate(() => { const e = new Event('deviceorientation'); Object.assign(e, { alpha: 270, absolute: false }); window.dispatchEvent(e); });
  expect(await heading(page)).toBe(90);
});
