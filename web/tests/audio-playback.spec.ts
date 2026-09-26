import { expect, test, type Page } from '@playwright/test';

async function harness(page: Page) {
  await page.addInitScript(() => {
    const log = { plays: [] as string[], pauses: 0, revoked: [] as string[], spoken: [] as string[], sequence: [] as string[], instances: 0 };
    Object.assign(window, { __playback: log });
    let id = 0;
    URL.createObjectURL = () => `blob:test-${++id}`;
    URL.revokeObjectURL = (url) => { log.revoked.push(url); };
    class Player {
      src = ''; playbackRate = 1; preload = ''; onended: (() => void) | null = null; onerror = null;
      constructor() { log.instances += 1; Object.assign(window, { __player: this }); }
      play() { log.plays.push(this.src); log.sequence.push('play'); return Promise.resolve(); }
      pause() { log.pauses += 1; }
      removeAttribute() { this.src = ''; }
      load() {}
    }
    class Utterance { text: string; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, 'Audio', { value: Player, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
    Object.defineProperty(window, 'speechSynthesis', { value: { speak(u: {text: string}) { log.spoken.push(u.text); }, cancel() {}, getVoices() { return []; } }, configurable: true });
  });
  await page.route('**/__playback__', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;
    const imports = (await (await fetch('/src/main.tsx')).text()).split('"');
    const React = (await import(imports.find(value => value.startsWith('/node_modules/.vite/deps/react.js')))).default;
    const {createRoot} = (await import(imports.find(value => value.startsWith('/node_modules/.vite/deps/react-dom_client.js')))).default;
    const {useSpeech} = await import('/src/hooks/useSpeech.ts');
    const {TalkButton} = await import('/src/components/TalkButton.tsx');
    function Harness() {
      const speech = useSpeech(); const [state,setState] = React.useState('idle'); window.__speech = speech;
      return React.createElement('main', {},
        React.createElement(TalkButton, {state,onBeforeStart:speech.stop,onGesture:speech.prime,
          onStart:()=>{window.__playback.sequence.push('start');setState('listening');},
          onStop:()=>{window.__playback.sequence.push('stop');setState('idle');},
          labels:{idle:'Talk',listening:'Finish',transcribing:'Wait'}}),
        React.createElement('button',{onClick:()=>speech.speak('Walk 140 m. Then stop.','en')},'Read'),
        React.createElement('button',{onClick:()=>speech.speak('Turn left.','en')},'Other'),
        React.createElement('button',{onClick:speech.stop},'Stop'),
        React.createElement('button',{onClick:speech.repeat},'Repeat'),
        React.createElement('p',{id:'speaking'},String(speech.speaking)));
    }
    const root=createRoot(document.getElementById('root')); window.__unmount=()=>root.unmount(); root.render(React.createElement(Harness));
  </script>` }));
  await page.goto('/__playback__');
  await expect(page.getByRole('button', { name: 'Talk', exact: true })).toBeVisible();
}
type StateWindow = Window & { __playback: { plays: string[]; pauses: number; revoked: string[]; spoken: string[]; sequence: string[]; instances: number }; __player: { playbackRate: number; onended: () => void }; __speech: { setRate: (rate: number) => void }; __unmount: () => void };

test('backend whole-text AAC uses one player; repeat reuses the blob; replacement and unmount revoke URLs', async ({ page }) => {
  const bodies: unknown[] = [];
  await page.route('**/api/tts', (route) => { bodies.push(route.request().postDataJSON()); return route.fulfill({ contentType: 'audio/mp4', body: 'mock AAC' }); });
  await harness(page);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as StateWindow).__playback.plays)).toEqual(['blob:test-1']);
  expect(bodies).toEqual([{ text: 'Walk 140 m. Then stop.', lang: 'en' }]);
  await page.evaluate(() => (window as StateWindow).__speech.setRate(1.5));
  expect(await page.evaluate(() => (window as StateWindow).__player.playbackRate)).toBe(1.5);
  await page.getByRole('button', { name: 'Repeat', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as StateWindow).__playback.plays.length)).toBe(2);
  expect(bodies).toHaveLength(1);
  await page.getByRole('button', { name: 'Other', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as StateWindow).__playback.revoked)).toEqual(['blob:test-1']);
  await page.evaluate(() => (window as StateWindow).__unmount());
  expect(await page.evaluate(() => (window as StateWindow).__playback.revoked)).toEqual(['blob:test-1', 'blob:test-2']);
  expect(await page.evaluate(() => (window as StateWindow).__playback.instances)).toBe(1);
});

test('Stop pauses immediately and a superseded download cannot play or fall back', async ({ page }) => {
  let resolve!: () => void; const gate = new Promise<void>((done) => { resolve = done; });
  await page.route('**/api/tts', async (route) => { await gate; await route.fulfill({ contentType: 'audio/mp4', body: 'late audio' }).catch(() => {}); });
  await harness(page);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect(page.locator('#speaking')).toHaveText('true');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#speaking')).toHaveText('false');
  expect(await page.evaluate(() => (window as StateWindow).__playback.pauses)).toBeGreaterThan(0);
  resolve(); await page.waitForTimeout(100);
  expect(await page.evaluate(() => (window as StateWindow).__playback.plays)).toEqual([]);
  expect(await page.evaluate(() => (window as StateWindow).__playback.spoken)).toEqual([]);
});

test('503 falls back to browser speech', async ({ page }) => {
  await page.route('**/api/tts', (route) => route.fulfill({ status: 503, json: { detail: 'Unavailable' } }));
  await harness(page); await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as StateWindow).__playback.spoken)).toEqual(['Walk 140 metres.']);
});

test('tap unlocks before recording; hold stops recording before unlocking', async ({ page }) => {
  await harness(page);
  const talk = page.getByRole('button', { name: 'Talk', exact: true });
  const box = (await talk.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  expect(await page.evaluate(() => (window as StateWindow).__playback.sequence)).toEqual([]);
  await page.mouse.up();
  expect(await page.evaluate(() => (window as StateWindow).__playback.sequence)).toEqual(['play', 'start']);
  await page.reload(); await expect(talk).toBeVisible();
  const heldBox = (await talk.boundingBox())!;
  await page.mouse.move(heldBox.x + heldBox.width / 2, heldBox.y + heldBox.height / 2); await page.mouse.down();
  await page.waitForTimeout(450);
  expect(await page.evaluate(() => (window as StateWindow).__playback.sequence)).toEqual(['start']);
  await page.mouse.up();
  expect(await page.evaluate(() => (window as StateWindow).__playback.sequence)).toEqual(['start', 'stop', 'play']);
});
