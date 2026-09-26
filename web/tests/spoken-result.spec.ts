import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface Harness {
  run: (request: Record<string, unknown>) => void;
  cancel: () => void;
  unmount: () => void;
  resolve: (index: number, body: unknown, status?: number) => void;
  reject: (index: number) => void;
  ignoreAbort: boolean;
  calls: { url: string; method: string; body: unknown; aborted: boolean }[];
  texts: string[];
  failures: string[];
  waiting: number;
  completed: (string | null)[];
}
type TestWindow = Window & { __spoken: Harness };
const request = { utterance: 'Take me to Bocconi.', lang: 'en', kind: 'plan', session_id: 'test-session',
  result: { text: 'Walk 1.5 km to Bocconi. A longer second sentence.', unknown: ['Opening hours are unknown.'] } };
const planFallback = "Walk 1.5 km to Bocconi. Say 'let's go' to start, or 'other routes'.";

async function harness(page: Page) {
  // Every HTTP response is simulated in the browser; no model/API traffic.
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
  await page.route(/\/src\/App\.tsx(?:\?.*)?$/, async (route) => {
    const original = await (await route.fetch()).text();
    const react = original.match(/from\s+["']([^"']*\/react\.js[^"']*)["']/)?.[1];
    if (!react) throw new Error('Vite React import is missing');
    await route.fulfill({ contentType: 'application/javascript', body: `
      import React from '${react}';
      import {useSpokenResult} from '/src/hooks/useSpokenResult.ts';
      const pending=[];
      const state={calls:[],texts:[],failures:[],completed:[],waiting:0,ignoreAbort:false};
      const nativeFetch=window.fetch.bind(window);
      window.fetch=(url,options)=>{
        if(String(url)!=='/api/speak')return nativeFetch(url,options);
        const call={url:String(url),method:options.method,body:JSON.parse(options.body),aborted:false};
        state.calls.push(call);
        return new Promise((resolve,reject)=>{
          pending.push({resolve,reject});
          const onAbort=()=>{call.aborted=true;if(!state.ignoreAbort)reject(options.signal.reason);};
          if(options.signal.aborted)onAbort();else options.signal.addEventListener('abort',onAbort,{once:true});
        });
      };
      state.resolve=(index,body,status=200)=>pending[index].resolve(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}}));
      state.reject=index=>pending[index].reject(new TypeError('Network unavailable'));
      window.__spoken=state;
      function Probe(){
        const [ready,setReady]=React.useState(false);
        const hook=useSpokenResult({onText:text=>state.texts.push(text),onWaiting:()=>state.waiting++,onFailure:error=>state.failures.push(error.kind??error.message)});
        React.useEffect(()=>setReady(true),[]);
        state.run=request=>{void hook.prepare(request).then(value=>state.completed.push(value));};
        state.cancel=hook.cancel;
        return React.createElement('pre',{'data-testid':'state','data-ready':String(ready)},JSON.stringify({pending:hook.pending,lastText:hook.lastText}));
      }
      export function App(){
        const [visible,setVisible]=React.useState(true);
        state.unmount=()=>setVisible(false);
        return visible?React.createElement(Probe):React.createElement('p',null,'Unmounted');
      }
    ` });
  });
  await page.goto('/');
  await expect(page.getByTestId('state')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByTestId('state')).toContainText('"pending":false');
}
async function run(page: Page, value: Record<string, unknown> = request) {
  await page.evaluate((input) => (window as TestWindow).__spoken.run(input), value);
}
async function resolve(page: Page, index: number, body: unknown, status = 200) {
  await page.evaluate(({ index, body, status }) => (window as TestWindow).__spoken.resolve(index, body, status), { index, body, status });
}
async function snapshot(page: Page) {
  return page.evaluate(() => {
    const { calls, texts, failures, waiting, completed } = (window as TestWindow).__spoken;
    return { calls, texts, failures, waiting, completed };
  });
}

test('sends only declared fields and emits only the successful short response', async ({ page }) => {
  await harness(page);
  await run(page, { ...request, fallbackText: 'Client fallback. Extra.', extra: 'must not be sent' });
  expect((await snapshot(page)).calls).toEqual([{ url: '/api/speak', method: 'POST', body: request, aborted: false }]);
  await expect(page.getByTestId('state')).toContainText('"pending":true');
  await resolve(page, 0, { text: 'Walk to Bocconi. Say let’s go to start.', via: 'future-provider' });
  await expect.poll(async () => (await snapshot(page)).completed).toEqual(['Walk to Bocconi. Say let’s go to start.']);
  expect((await snapshot(page)).texts).toEqual(['Walk to Bocconi. Say let’s go to start.']);
  expect((await snapshot(page)).waiting).toBe(1);
  await expect(page.getByTestId('state')).toContainText('"pending":false');
});

test('a superseded response cannot speak or clear the newer pending request even if transport ignores abort', async ({ page }) => {
  await harness(page);
  await page.evaluate(() => { (window as TestWindow).__spoken.ignoreAbort = true; });
  await run(page);
  await run(page, { ...request, utterance: 'A newer question.' });
  expect((await snapshot(page)).calls[0].aborted).toBe(true);
  await resolve(page, 0, { text: 'Old speech.', via: 'claude' });
  await expect.poll(async () => (await snapshot(page)).completed).toEqual([null]);
  await expect(page.getByTestId('state')).toContainText('"pending":true');
  expect((await snapshot(page)).texts).toEqual([]);
  await resolve(page, 1, { text: 'New speech.', via: 'claude' });
  await expect.poll(async () => (await snapshot(page)).completed).toEqual([null, 'New speech.']);
  expect((await snapshot(page)).texts).toEqual(['New speech.']);
});

test('cancel suppresses both a late success and a late failure without fallback speech', async ({ page }) => {
  await harness(page);
  await page.evaluate(() => { (window as TestWindow).__spoken.ignoreAbort = true; });
  await run(page); await page.evaluate(() => (window as TestWindow).__spoken.cancel());
  await resolve(page, 0, { text: 'Cancelled speech.', via: 'claude' });
  await run(page); await page.evaluate(() => (window as TestWindow).__spoken.cancel());
  await page.evaluate(() => (window as TestWindow).__spoken.reject(1));
  await expect.poll(async () => (await snapshot(page)).completed).toEqual([null, null]);
  const result = await snapshot(page);
  expect(result.calls.every((call) => call.aborted)).toBe(true);
  expect(result.texts).toEqual([]); expect(result.failures).toEqual([]);
  await expect(page.getByTestId('state')).toHaveText('{"pending":false,"lastText":null}');
});

test('network failure gives the first engine sentence and plan hint without appending unknowns', async ({ page }) => {
  await harness(page); await run(page);
  await page.evaluate(() => (window as TestWindow).__spoken.reject(0));
  await expect.poll(async () => (await snapshot(page)).texts).toEqual([planFallback]);
  expect((await snapshot(page)).failures).toEqual(['network']);
  await expect(page.getByTestId('state')).toContainText(JSON.stringify(planFallback));
});

test('invalid responses use a client-only fallback when engine text is absent and never invent text', async ({ page }) => {
  await harness(page);
  await run(page, { utterance: 'Yes', lang: 'it', kind: 'places', result: { candidates: [] }, fallbackText: 'Parti da qui. Un’altra frase.' });
  expect((await snapshot(page)).calls[0].body).toEqual({ utterance: 'Yes', lang: 'it', kind: 'places', result: { candidates: [] } });
  await resolve(page, 0, { text: ' ', via: 'fallback' });
  await expect.poll(async () => (await snapshot(page)).texts).toEqual(['Parti da qui.']);
  await run(page, { utterance: 'Yes', lang: 'en', kind: 'error', result: {} });
  await resolve(page, 1, { text: 'Missing via is invalid.' });
  await expect.poll(async () => (await snapshot(page)).completed).toEqual(['Parti da qui.', null]);
  expect((await snapshot(page)).texts).toEqual(['Parti da qui.']);
  expect((await snapshot(page)).failures).toEqual(['invalid', 'invalid']);
});

test('the four-second client timeout ends waiting and emits a single fallback', async ({ page }) => {
  await harness(page); await run(page);
  await expect.poll(async () => (await snapshot(page)).texts, { timeout: 6_000 }).toEqual([planFallback]);
  expect((await snapshot(page)).calls[0].aborted).toBe(true);
  expect((await snapshot(page)).failures).toHaveLength(1);
  await expect(page.getByTestId('state')).toContainText('"pending":false');
  await resolve(page, 0, { text: 'Too late.', via: 'claude' });
  expect((await snapshot(page)).texts).toEqual([planFallback]);
});

test('a missing speak endpoint preserves per-kind next steps without duplicating an existing hint', async ({ page }) => {
  await harness(page);
  const cases = [
    { kind: 'plan', text: request.result.text, expected: planFallback },
    { kind: 'overview', text: 'The railway is ahead. More detail.', expected: "The railway is ahead. Say 'take me to…' or 'what's around me'." },
    { kind: 'answer', text: 'The park is nearby. More detail.', expected: "The park is nearby. Say 'how do I get there' to plan the route." },
    { kind: 'plan', text: "Say 'let’s go' to start, or 'other routes'. Extra.", expected: "Say 'let’s go' to start, or 'other routes'." },
  ];
  for (const [index, item] of cases.entries()) {
    await run(page, { ...request, kind: item.kind, result: { text: item.text, unknown: ['Do not read this automatically.'] } });
    await resolve(page, index, { detail: 'Not Found' }, 404);
    await expect.poll(async () => (await snapshot(page)).texts.at(-1)).toBe(item.expected);
  }
  expect((await snapshot(page)).failures).toEqual(Array(cases.length).fill('expired'));
});

test('place recovery asks for confirmation only for offered candidates before destination confirmation', async ({ page }) => {
  await harness(page);
  const cases = [
    { kind: 'places', result: { text: 'Bocconi University. A second sentence.', candidates: [{ name: 'Bocconi University' }] }, expected: 'Bocconi University. Is that right?' },
    { kind: 'places', result: { text: 'Is that right?', candidates: [{ name: 'Bocconi University' }] }, expected: 'Is that right?' },
    { kind: 'places', result: { text: 'No places found. Try another name.', candidates: [] }, expected: 'No places found.' },
    { kind: 'places', result: { text: 'Destination saved. Planning your route.', destination: { name: 'Bocconi University' }, candidates: [{ name: 'Bocconi University' }] }, expected: 'Destination saved.' },
    { kind: 'error', result: { text: 'The request failed. Try again.', candidates: [{ name: 'Bocconi University' }] }, expected: 'The request failed.' },
  ];
  for (const [index, item] of cases.entries()) {
    await run(page, { ...request, kind: item.kind, result: item.result });
    await resolve(page, index, { detail: 'Not Found' }, 404);
    await expect.poll(async () => (await snapshot(page)).texts.at(-1)).toBe(item.expected);
  }
});

test('unmount aborts the request and ignores a late result', async ({ page }) => {
  await harness(page);
  await page.evaluate(() => { (window as TestWindow).__spoken.ignoreAbort = true; });
  await run(page); await page.evaluate(() => (window as TestWindow).__spoken.unmount());
  await expect(page.getByText('Unmounted', { exact: true })).toBeVisible();
  expect((await snapshot(page)).calls[0].aborted).toBe(true);
  await resolve(page, 0, { text: 'No longer mounted.', via: 'claude' });
  await expect.poll(async () => (await snapshot(page)).completed).toEqual([null]);
  expect((await snapshot(page)).texts).toEqual([]);
});
