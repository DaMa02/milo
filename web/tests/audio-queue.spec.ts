import { expect, test, type Page } from '@playwright/test';

type TestWindow = Window & {
  __queue: { speech: { speak: (text: string, lang: string) => void; enqueue: (text: string, lang: string, options?: { interrupt?: boolean }) => void; stop: () => void } };
  __media: { plays: string[]; pauses: number; utterances: { text: string; onend: (() => void) | null }[]; player: { onended: (() => void) | null } };
};
async function harness(page: Page) {
  await page.addInitScript(() => {
    const state = { plays: [] as string[], pauses: 0, utterances: [] as unknown[], player: null as unknown };
    Object.assign(window, { __media: state }); let id = 0;
    URL.createObjectURL = () => `blob:queue-${++id}`; URL.revokeObjectURL = () => {};
    class Audio {
      src = ''; onended = null; onerror = null; playbackRate = 1;
      constructor() { state.player = this; }
      play() { state.plays.push(this.src); return Promise.resolve(); }
      pause() { state.pauses += 1; }
      removeAttribute() {} load() {}
    }
    class Utterance { text: string; onend = null; onerror = null; onstart = null; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, 'Audio', { value: Audio, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', { value: { speak(u: unknown) { state.utterances.push(u); }, cancel() {}, getVoices() { return []; } }, configurable: true });
  });
  await page.route('**/__queue__', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true;
    const imports=(await(await fetch('/src/main.tsx')).text()).split('"');
    const React=(await import(imports.find(s=>s.startsWith('/node_modules/.vite/deps/react.js')))).default;
    const {createRoot}=(await import(imports.find(s=>s.startsWith('/node_modules/.vite/deps/react-dom_client.js')))).default;
    const {useSpeech}=await import('/src/hooks/useSpeech.ts');
    function Harness(){const speech=useSpeech();const [ready,setReady]=React.useState(false);React.useEffect(()=>setReady(true),[]);window.__queue={speech};return React.createElement('p',{id:'speaking','data-ready':String(ready)},String(speech.speaking));}
    createRoot(document.getElementById('root')).render(React.createElement(Harness));
  </script>` }));
  await page.goto('/__queue__'); await expect(page.locator('#speaking')).toHaveAttribute('data-ready','true'); await expect(page.locator('#speaking')).toHaveText('false');
}

test('AAC download and playback share one latest-wins queue', async ({ page }) => {
  const requests: string[] = []; let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/tts', async (route) => {
    const text = route.request().postDataJSON().text; requests.push(text);
    if (text === 'First') await held;
    await route.fulfill({ contentType: 'audio/mp4', body: 'AAC' });
  });
  await harness(page);
  await page.evaluate(() => { const s=(window as TestWindow).__queue.speech; s.speak('First','en'); s.enqueue('Old pending','en'); s.enqueue('Latest pending','en'); });
  await expect.poll(() => requests).toEqual(['First']); await expect(page.locator('#speaking')).toHaveText('true');
  release(); await expect.poll(() => page.evaluate(() => (window as TestWindow).__media.plays.length)).toBe(1);
  expect(requests).toEqual(['First']);
  await page.evaluate(() => (window as TestWindow).__media.player.onended?.());
  await expect.poll(() => requests).toEqual(['First','Latest pending']);
  await expect.poll(() => page.evaluate(() => (window as TestWindow).__media.plays.length)).toBe(2);
  await page.evaluate(() => (window as TestWindow).__media.player.onended?.());
  await expect(page.locator('#speaking')).toHaveText('false');
});

test('an off-route interrupt starts immediately and removes the pending routine instruction', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/tts', (route) => { requests.push(route.request().postDataJSON().text); return route.fulfill({ contentType: 'audio/mp4', body: 'AAC' }); });
  await harness(page);
  await page.evaluate(() => (window as TestWindow).__queue.speech.speak('Current instruction','en'));
  await expect.poll(() => page.evaluate(() => (window as TestWindow).__media.plays.length)).toBe(1);
  const pauses = await page.evaluate(() => (window as TestWindow).__media.pauses);
  await page.evaluate(() => { const s=(window as TestWindow).__queue.speech; s.enqueue('Routine pending','en'); s.enqueue('Off route. Stop.','en',{interrupt:true}); });
  await expect.poll(() => requests).toEqual(['Current instruction','Off route. Stop.']);
  expect(await page.evaluate(() => (window as TestWindow).__media.pauses)).toBeGreaterThan(pauses);
  await expect.poll(() => page.evaluate(() => (window as TestWindow).__media.plays.length)).toBe(2);
  await page.evaluate(() => (window as TestWindow).__media.player.onended?.());
  await expect(page.locator('#speaking')).toHaveText('false');
  expect(requests).toEqual(['Current instruction','Off route. Stop.']);
});

test('Stop clears the queue and a late fetch cannot play it', async ({ page }) => {
  const requests: string[] = []; let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/tts', async (route) => { requests.push(route.request().postDataJSON().text); await held; await route.fulfill({ contentType: 'audio/mp4', body: 'late AAC' }).catch(() => {}); });
  await harness(page);
  await page.evaluate(() => { const s=(window as TestWindow).__queue.speech; s.speak('First','en'); s.enqueue('Pending','en'); });
  await expect.poll(() => requests).toEqual(['First']);
  await page.evaluate(() => (window as TestWindow).__queue.speech.stop());
  await expect(page.locator('#speaking')).toHaveText('false'); release(); await page.waitForTimeout(100);
  expect(requests).toEqual(['First']); expect(await page.evaluate(() => (window as TestWindow).__media.plays)).toEqual([]);
  expect(await page.evaluate(() => (window as TestWindow).__media.utterances)).toEqual([]);
});

test('browser fallback keeps the queue through sentence gaps and drains after its final sentence', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/tts', (route) => { requests.push(route.request().postDataJSON().text); return route.fulfill({ status: 503, json: { detail: 'Unavailable' } }); });
  await harness(page);
  await page.evaluate(() => (window as TestWindow).__queue.speech.speak('First. Second.','en'));
  await expect.poll(() => page.evaluate(() => (window as TestWindow).__media.utterances.map(u=>u.text))).toEqual(['First.']);
  await page.evaluate(() => { const w=window as TestWindow; w.__queue.speech.enqueue('Old pending','en'); w.__media.utterances[0].onend?.(); w.__queue.speech.enqueue('Latest pending','en'); });
  await expect(page.locator('#speaking')).toHaveText('true');
  expect(requests).toEqual(['First. Second.']);
  await expect.poll(() => page.evaluate(() => (window as TestWindow).__media.utterances.map(u=>u.text))).toEqual(['First.','Second.']);
  await page.evaluate(() => (window as TestWindow).__media.utterances[1].onend?.());
  await expect.poll(() => requests).toEqual(['First. Second.','Latest pending']);
  await expect.poll(() => page.evaluate(() => (window as TestWindow).__media.utterances.map(u=>u.text))).toEqual(['First.','Second.','Latest pending']);
  await page.evaluate(() => (window as TestWindow).__media.utterances[2].onend?.());
  await expect(page.locator('#speaking')).toHaveText('false');
});

test('an explicit new reading drops queued guidance', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/api/tts', (route) => { requests.push(route.request().postDataJSON().text); return route.fulfill({ contentType: 'audio/mp4', body: 'AAC' }); });
  await harness(page);
  await page.evaluate(() => (window as TestWindow).__queue.speech.speak('First','en'));
  await expect.poll(() => page.evaluate(() => (window as TestWindow).__media.plays.length)).toBe(1);
  await page.evaluate(() => { const s=(window as TestWindow).__queue.speech; s.enqueue('Old guidance','en'); s.speak('New answer','en'); });
  await expect.poll(() => page.evaluate(() => (window as TestWindow).__media.plays.length)).toBe(2);
  await page.evaluate(() => (window as TestWindow).__media.player.onended?.());
  expect(requests).toEqual(['First','New answer']);
});
