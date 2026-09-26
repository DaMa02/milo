import { expect, test, type Page } from '@playwright/test';
type Fix = { lat: number; lon: number; accuracy_m?: number; heading_deg?: number };
type HarnessWindow = Window & { __heading: number | undefined; __gps: (lat: number, heading?: number | null) => void; __setSession: (session: string) => void; __cleared: number; __nav: { start: () => Promise<void>; stop: (options?: { clearRoute?: boolean }) => void; refreshHeading: () => void; getLatestResult: () => { text: string | null; status: string } | null; getLatestFix: () => Fix | null }; __messages: { text: string; interrupt?: boolean }[] };
const reply = (text: string | null = 'Walk ahead.', status = 'on_route') => ({ status, text, route_id: 'A', off_route_m: 0, remaining_m: 100, remaining_min: 2, next: null, route_line: null });
async function harness(page: Page, demo = false) {
  await page.addInitScript(() => {
    Object.assign(window, { __heading: 90, __cleared: 0, __messages: [] });
    Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{async request(){return {released:false,async release(){this.released=true;}};}}});
    Object.defineProperty(navigator,'geolocation',{configurable:true,value:{
      watchPosition(callback: PositionCallback) { Object.assign(window,{__gps:(lat:number,heading:number|null=null)=>callback({coords:{latitude:lat,longitude:9.20808,accuracy:8,heading}} as GeolocationPosition)}); return 1; },
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
    function Harness(){const [sessionId,setSession]=React.useState('heart');window.__setSession=setSession;const nav=useLiveGuidance({sessionId,demo:${demo},origin:{lat:45.44386,lon:9.20808},getHeading:()=>window.__heading,t:{...dictionaries.en,navigationBackground:'Keep the screen on: guidance pauses when the phone locks.'},onMessage:(text,options)=>window.__messages.push({text,...options}),onError:text=>window.__messages.push({text})});
      const [ready,setReady]=React.useState(false);React.useEffect(()=>setReady(true),[]);window.__nav=nav;
      return React.createElement(React.Fragment,null,React.createElement('p',{id:'state','data-ready':String(ready)},nav.status),React.createElement('output',{id:'position'},JSON.stringify(nav.position)),React.createElement('output',{id:'route'},JSON.stringify(nav.routeLine)));}
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

test('GPS and small compass changes render before navigation answers without extra requests',async({page})=>{
  const requests:Fix[]=[];let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/session/heart/navigate',async route=>{requests.push(route.request().postDataJSON());await gate;await route.fulfill({json:reply(null)});});
  await harness(page);
  await page.evaluate(()=>{const w=window as HarnessWindow;w.__gps(45.44386,60);});
  await expect.poll(()=>requests.length).toBe(1);
  await expect(page.locator('#position')).toHaveText(JSON.stringify({lat:45.44386,lon:9.20808,accuracy_m:8,heading_deg:90}));
  await page.evaluate(()=>{const w=window as HarnessWindow;w.__heading=100;w.__nav.refreshHeading();});
  await expect(page.locator('#position')).toHaveText(JSON.stringify({lat:45.44386,lon:9.20808,accuracy_m:8,heading_deg:100}));
  expect(requests).toHaveLength(1);
  await page.evaluate(()=>{const w=window as HarnessWindow;w.__gps(45.444,60);w.__heading=undefined;w.__nav.refreshHeading();});
  await expect(page.locator('#position')).toHaveText(JSON.stringify({lat:45.444,lon:9.20808,accuracy_m:8,heading_deg:60}));
  expect(await page.evaluate(()=>(window as HarnessWindow).__nav.getLatestFix())).toEqual({lat:45.444,lon:9.20808,accuracy_m:8,heading_deg:60});
  await page.evaluate(()=>(window as HarnessWindow).__nav.stop({clearRoute:true}));release();
  await expect(page.locator('#route')).toHaveText('null');
  expect(await page.evaluate(()=>(window as HarnessWindow).__nav.getLatestResult())).toBe(null);
  await page.waitForTimeout(1100);expect(requests).toHaveLength(1);
  await expect(page.locator('#position')).toContainText('45.444');
});

test('arrival and pause retain the map; plan changes and new sessions clear old route facts',async({page})=>{
  const line=[[45.44386,9.20808],[45.445,9.20808]];let calls=0;
  await page.route('**/api/session/heart/navigate',route=>{calls+=1;return route.fulfill({json:calls===2?reply('You have arrived.','arrived'):{...reply(null),route_line:line}});});
  await harness(page);await page.evaluate(()=>(window as HarnessWindow).__gps(45.44386));
  await expect(page.locator('#route')).toHaveText(JSON.stringify(line));
  await page.evaluate(()=>(window as HarnessWindow).__gps(45.445));await expect(page.locator('#state')).toHaveText('arrived');
  await expect(page.locator('#route')).toHaveText(JSON.stringify(line));
  expect(await page.evaluate(()=>(window as HarnessWindow).__nav.getLatestFix()?.lat)).toBe(45.445);
  await page.evaluate(()=>(window as HarnessWindow).__nav.stop());await expect(page.locator('#state')).toHaveText('idle');
  expect(await page.evaluate(()=>(window as HarnessWindow).__nav.getLatestResult()?.status)).toBe('arrived');
  await expect(page.locator('#route')).toHaveText(JSON.stringify(line));
  await page.evaluate(()=>(window as HarnessWindow).__nav.stop({clearRoute:true}));
  await expect(page.locator('#route')).toHaveText('null');
  expect(await page.evaluate(()=>(window as HarnessWindow).__nav.getLatestResult())).toBe(null);
  expect(await page.evaluate(()=>(window as HarnessWindow).__nav.getLatestFix()?.lat)).toBe(45.445);
  await page.evaluate(()=>(window as HarnessWindow).__nav.start());
  await expect(page.locator('#position')).toHaveText('null');
  await page.evaluate(()=>(window as HarnessWindow).__gps(45.444));await expect(page.locator('#route')).toHaveText(JSON.stringify(line));
  await page.evaluate(()=>(window as HarnessWindow).__setSession('another'));
  await expect(page.locator('#position')).toHaveText('null');await expect(page.locator('#route')).toHaveText('null');
  expect(await page.evaluate(()=>(window as HarnessWindow).__nav.getLatestResult())).toBe(null);
  expect(await page.evaluate(()=>(window as HarnessWindow).__nav.getLatestFix())).toBe(null);
});

test('small turns update the arrow without an urgent request and paused heading remains local',async({page})=>{
  let calls=0;
  await page.route('**/api/session/heart/navigate',route=>{calls+=1;return route.fulfill({json:reply(null)});});
  await harness(page);await page.evaluate(()=>(window as HarnessWindow).__gps(45.44386,60));
  await expect(page.locator('#state')).toHaveText('on_route');
  await page.evaluate(()=>{const w=window as HarnessWindow;w.__heading=100;w.__nav.refreshHeading();});
  await expect(page.locator('#position')).toContainText('"heading_deg":100');
  await page.waitForTimeout(200);expect(calls).toBe(1);
  await page.evaluate(()=>{const w=window as HarnessWindow;w.__nav.stop();w.__heading=undefined;w.__nav.refreshHeading();});
  await expect(page.locator('#position')).toContainText('"heading_deg":60');
  await page.evaluate(()=>{const w=window as HarnessWindow;w.__heading=220;w.__nav.refreshHeading();});
  await expect(page.locator('#position')).toContainText('"heading_deg":220');
  await page.waitForTimeout(200);expect(calls).toBe(1);
});

test('demo replay publishes each simulated fix while its navigation answer is pending',async({page})=>{
  const requests:Fix[]=[];let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/session/heart/navigate',async route=>{
    requests.push(route.request().postDataJSON());if(requests.length>1)await gate;
    await route.fulfill({json:{...reply(null),route_line:requests.length===1?[[45.44386,9.20808],[45.445,9.20808]]:null}});
  });
  await harness(page,true);await expect.poll(()=>requests.length).toBe(2);
  expect(requests[1].lat).not.toBe(requests[0].lat);
  await expect(page.locator('#position')).toHaveText(JSON.stringify(requests[1]));
  expect(await page.evaluate(()=>(window as HarnessWindow).__nav.getLatestFix())).toEqual(requests[1]);
  await page.evaluate(()=>(window as HarnessWindow).__nav.stop());release();
});
