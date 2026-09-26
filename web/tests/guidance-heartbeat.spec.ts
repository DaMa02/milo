import { expect, test, type Page } from '@playwright/test';
type HarnessWindow = Window & { __heading: number; __gps: (lat: number) => void; __cleared: number; __nav: { start: () => Promise<void>; stop: () => void; refreshHeading: () => void; getLatestResult: () => { text: string | null; status: string } }; __messages: { text: string; interrupt?: boolean }[] };
const reply = (text: string | null = 'Walk ahead.', status = 'on_route') => ({ status, text, route_id: 'A', off_route_m: 0, remaining_m: 100, remaining_min: 2, next: null, route_line: null });
async function harness(page: Page) {
  await page.addInitScript(() => {
    Object.assign(window, { __heading: 90, __cleared: 0, __messages: [] });
    Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{async request(){return {released:false,async release(){this.released=true;}};}}});
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
      watchPosition(callback: PositionCallback) { Object.assign(window,{__gps:(lat:number)=>callback({coords:{latitude:lat,longitude:9.20808,accuracy:8,heading:null}} as GeolocationPosition)}); return 1; },
      clearWatch() { (window as unknown as HarnessWindow).__cleared += 1; },
    }});
  });
  await page.route('**/api/session/heart/navigate/stop',route=>route.fulfill({json:{status:'stopped'}}));
  await page.route('**/__heartbeat__',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;
    const imports=(await(await fetch('/src/main.tsx')).text()).split('"');
    const React=(await import(imports.find(s=>s.startsWith('/node_modules/.vite/deps/react.js')))).default;
    const {createRoot}=(await import(imports.find(s=>s.startsWith('/node_modules/.vite/deps/react-dom_client.js')))).default;
    const {useLiveGuidance}=await import('/src/hooks/useLiveGuidance.ts');const {dictionaries}=await import('/src/i18n/index.ts');
    function Harness(){const nav=useLiveGuidance({sessionId:'heart',getHeading:()=>window.__heading,t:{...dictionaries.en,navigationBackground:'Keep the screen on: guidance pauses when the phone locks.'},onMessage:(text,options)=>window.__messages.push({text,...options}),onError:text=>window.__messages.push({text})});
      const [ready,setReady]=React.useState(false);React.useEffect(()=>setReady(true),[]);window.__nav=nav;
      return React.createElement('p',{id:'state','data-ready':String(ready)},nav.status);}
    createRoot(document.getElementById('root')).render(React.createElement(Harness));</script>`}));
  await page.goto('/__heartbeat__'); await expect(page.locator('#state')).toHaveAttribute('data-ready','true');
  await page.evaluate(()=> (window as HarnessWindow).__nav.start());
}

test('stationary guidance sends the latest GPS, compass and accuracy about once per second',async({page})=>{
  const requests:{time:number;body:Record<string,unknown>}[]=[];
  await page.route('**/api/session/heart/navigate',route=>{requests.push({time:Date.now(),body:route.request().postDataJSON()});return route.fulfill({json:reply(requests.length<3?'Walk ahead.':null)});});
  await harness(page);await page.evaluate(()=>(window as HarnessWindow).__gps(45.44386));
  await expect.poll(()=>requests.length).toBeGreaterThanOrEqual(3);
  await expect.poll(()=>page.evaluate(()=>(window as HarnessWindow).__nav.getLatestResult()?.text)).toBe(null);
  await page.evaluate(()=>(window as HarnessWindow).__nav.stop());
  for(const request of requests.slice(0,3))expect(request.body).toMatchObject({lat:45.44386,accuracy_m:8,heading_deg:90});
  for(let i=1;i<3;i++)expect(requests[i].time-requests[i-1].time).toBeGreaterThanOrEqual(850);
  expect((await page.evaluate(()=>(window as HarnessWindow).__messages)).filter(m=>m.text==='Walk ahead.')).toHaveLength(2);
});

test('new GPS and large heading changes coalesce behind one request and run immediately after it',async({page})=>{
  const requests:Record<string,unknown>[]=[];let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/session/heart/navigate',async route=>{requests.push(route.request().postDataJSON());if(requests.length===1)await gate;await route.fulfill({json:reply()});});
  await harness(page);await page.evaluate(()=>(window as HarnessWindow).__gps(45.44386));await expect.poll(()=>requests.length).toBe(1);
  await page.evaluate(()=>{const w=window as HarnessWindow;w.__gps(45.444);w.__gps(45.445);w.__heading=130;w.__nav.refreshHeading();});
  expect(requests).toHaveLength(1);release();await expect.poll(()=>requests.length).toBe(2);
  expect(requests[1]).toMatchObject({lat:45.445,heading_deg:130});
  await expect.poll(()=>page.evaluate(()=>(window as HarnessWindow).__messages.length)).toBe(2);
  await page.evaluate(()=>{const w=window as HarnessWindow;w.__heading=180;w.__nav.refreshHeading();});
  await expect.poll(()=>requests.length,{timeout:800}).toBe(3);
  expect(requests[2]).toMatchObject({lat:45.445,heading_deg:180});await page.evaluate(()=>(window as HarnessWindow).__nav.stop());
  await page.waitForTimeout(1100);expect(requests).toHaveLength(3);
});

test('hidden warns once; now and off-route cues interrupt; arrival is delivered before watching stops',async({page})=>{
  let calls=0;
  await page.route('**/api/session/heart/navigate',route=>{calls+=1;return route.fulfill({json:calls===1?reply('Turn left now.'):calls===2?reply('You are off the route.','off_route'):reply('You have arrived.','arrived')});});
  await harness(page);await page.evaluate(()=>(window as HarnessWindow).__gps(45.44386));await expect.poll(()=>calls).toBe(1);
  await expect.poll(()=>page.evaluate(()=>(window as HarnessWindow).__messages.length)).toBe(1);
  await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));document.dispatchEvent(new Event('visibilitychange'));});
  await page.evaluate(()=>(window as HarnessWindow).__gps(45.444));await expect.poll(()=>calls).toBe(2);
  await expect.poll(()=>page.evaluate(()=>(window as HarnessWindow).__messages.length)).toBe(3);
  await page.evaluate(()=>(window as HarnessWindow).__gps(45.445));await expect(page.locator('#state')).toHaveText('arrived');
  const messages=await page.evaluate(()=>(window as HarnessWindow).__messages);
  expect(messages.map(m=>m.text)).toEqual(['Turn left now.','Keep the screen on: guidance pauses when the phone locks.','You are off the route.','You have arrived.']);
  expect(messages.slice(0,3).every(m=>m.interrupt)).toBe(true);
  expect(await page.evaluate(()=>(window as HarnessWindow).__cleared)).toBe(1);
  await page.waitForTimeout(1100);expect(calls).toBe(3);
});
