import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

async function audioHarness(page: Page, denied = false) {
  page.on('pageerror', (error) => { throw error; });
  await page.route('**/api/tts', (route) => route.fulfill({ status: 503, json: { detail: 'Simulated TTS unavailable: exercise browser fallback' } }));
  await page.addInitScript((deny) => {
    const state = { level: 0.05, trace: [] as string[], speech: [] as SpeechSynthesisUtterance[], cancellations: 0 };
    Object.assign(window, { __audio: state });
    const track = { stop() { state.trace.push('track stopped'); } };
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
      async getUserMedia() {
        state.trace.push('microphone');
        if (deny) throw new DOMException('Denied', 'NotAllowedError');
        return { getTracks: () => [track] };
      },
    } });
    class Audio {
      state = 'running';
      constructor() { state.trace.push('context'); }
      async resume() { state.trace.push('resume'); }
      async close() { this.state = 'closed'; state.trace.push('context closed'); }
      createAnalyser() { return { fftSize: 1024, getFloatTimeDomainData(values: Float32Array) { values.fill(state.level); } }; }
      createMediaStreamSource() { return { connect() {} }; }
    }
    class Recorder {
      static isTypeSupported(mime: string) { return mime === 'audio/mp4'; }
      state = 'inactive';
      mimeType: string;
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(_stream: unknown, options?: { mimeType: string }) { this.mimeType = options?.mimeType ?? ''; }
      start() { this.state = 'recording'; state.trace.push('recording'); }
      stop() {
        this.state = 'inactive';
        queueMicrotask(() => { this.ondataavailable?.({ data: new Blob(['audio'], { type: this.mimeType }) }); this.onstop?.(); });
      }
    }
    class Utterance { text: string; lang = ''; rate = 1; volume = 1; voice = null; onend = null; onerror = null; onstart = null; constructor(text: string) { this.text = text; } }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: Audio });
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: Recorder });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak(utterance: SpeechSynthesisUtterance) { state.speech.push(utterance); },
      cancel() { state.cancellations += 1; },
      getVoices() { return [{ name: 'Albert', lang: 'en-GB' }, { name: 'Daniel', lang: 'en-GB' }]; },
    } });
  }, denied);
  await page.route('**/__voice_audio__', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="en"><body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;
    const imports = (await (await fetch('/src/main.tsx')).text()).split('"');
    const React = (await import(imports.find(value => value.startsWith('/node_modules/.vite/deps/react.js')))).default;
    const {createRoot} = (await import(imports.find(value => value.startsWith('/node_modules/.vite/deps/react-dom_client.js')))).default;
    const {useVoiceInput} = await import('/src/hooks/useVoiceInput.ts');
    const {useSpeech} = await import('/src/hooks/useSpeech.ts');
    const {TalkButton} = await import('/src/components/TalkButton.tsx');
    function Harness() {
      const [result, setResult] = React.useState(''); const [error, setError] = React.useState('');
      const speech = useSpeech(); const input = useVoiceInput({onTranscript:setResult, onError:setError});
      window.__voice = {input, speech};
      return React.createElement('main', {},
        React.createElement(TalkButton, {state:input.state, onStart:input.start, onStop:input.stop, onCancel:input.cancel,
          labels:{idle:'Talk',listening:'Finish',transcribing:'Working'}}),
        React.createElement('button', {onClick:input.cancel}, 'Cancel'),
        React.createElement('button', {onClick:()=>speech.speak('Walk 140 m. Then stop.', 'en')}, 'Read'),
        React.createElement('button', {onClick:speech.stop}, 'Stop speech'),
        React.createElement('p', {id:'state'}, input.state), React.createElement('p', {id:'result'}, result),
        React.createElement('p', {id:'error'}, error), React.createElement('p', {id:'speaking'}, String(speech.speaking)));
    }
    createRoot(document.getElementById('root')).render(React.createElement(Harness));
  </script></body></html>` }));
  await page.goto('/__voice_audio__');
  await expect(page.getByRole('button', { name: 'Talk', exact: true })).toBeVisible();
}

type AudioWindow = Window & {
  __audio: { level: number; trace: string[]; speech: SpeechSynthesisUtterance[]; cancellations: number };
  __voice: { input: { cancel: () => void }; speech: { setRate: (rate: number) => void } };
};

test('microphone uses supported mp4 and releases tracks before sending the transcript request', async ({ page }) => {
  let contentType = '';
  let traces: string[] = [];
  await page.route('**/api/stt', async (route) => {
    contentType = route.request().headers()['content-type'];
    traces = await page.evaluate(() => (window as AudioWindow).__audio.trace);
    await route.fulfill({ json: { text: 'Where am I?' } });
  });
  await audioHarness(page);
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await expect(page.locator('#state')).toHaveText('listening');
  await page.waitForTimeout(120);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.locator('#result')).toHaveText('Where am I?');
  await expect(page.locator('#state')).toHaveText('idle');
  expect(contentType).toBe('audio/mp4');
  expect(traces.slice(0, 3)).toEqual(['context', 'resume', 'microphone']);
  expect(traces).toContain('track stopped');
});

test('silence ends capture only after speech and a hard limit discards an empty recording', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/stt', (route) => { requests += 1; return route.fulfill({ json: { text: 'Go forward' } }); });
  await audioHarness(page);
  await page.clock.install();
  await page.evaluate(() => { (window as AudioWindow).__audio.level = 0; });
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await page.clock.runFor(1200);
  await expect(page.locator('#state')).toHaveText('listening');
  await page.evaluate(() => { (window as AudioWindow).__audio.level = 0.05; });
  await page.clock.runFor(100);
  await page.evaluate(() => { (window as AudioWindow).__audio.level = 0; });
  await page.clock.runFor(1100);
  await expect(page.locator('#result')).toHaveText('Go forward');
  expect(requests).toBe(1);
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await page.clock.runFor(15050);
  await expect(page.locator('#state')).toHaveText('idle');
  await expect(page.locator('#error')).toHaveText('noSpeech');
  expect(requests).toBe(1);
});

test('permission denial and cancelled transcription preserve a usable idle control', async ({ page }) => {
  await audioHarness(page, true);
  await page.getByRole('button', { name: 'Talk', exact: true }).click();
  await expect(page.locator('#error')).toHaveText('permission');
  await expect(page.locator('#state')).toHaveText('idle');
  expect(await page.evaluate(() => (window as AudioWindow).__audio.trace)).toContain('context closed');
});

test('hold-to-talk ends on release and cancellation suppresses a late transcription', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/stt', async (route) => { await pending; await route.fulfill({ json: { text: 'Late answer' } }).catch(() => undefined); });
  await audioHarness(page);
  await page.clock.install();
  const talk = page.getByRole('button', { name: 'Talk', exact: true });
  const box = await talk.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.clock.runFor(400);
  await expect(page.locator('#state')).toHaveText('listening');
  // Allow an audio sample after the hold threshold, before releasing the pointer.
  await page.clock.runFor(100);
  await page.mouse.up();
  await expect(page.locator('#state')).toHaveText('transcribing');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('#state')).toHaveText('idle');
  release();
  await expect(page.locator('#result')).toHaveText('');
  await expect(page.locator('#error')).toHaveText('');
});

test('keyboard toggles capture and handles no-speech and unavailable transcription without a transcript', async ({ page }) => {
  let status = 422;
  await page.route('**/api/stt', (route) => route.fulfill({ status, json: { detail: 'Unavailable transcription' } }));
  await audioHarness(page);
  for (const [code, error] of [[422, 'noSpeech'], [503, 'unavailable']] as const) {
    status = code;
    const talk = page.getByRole('button', { name: 'Talk', exact: true });
    await talk.focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#state')).toHaveText('listening');
    await page.waitForTimeout(120);
    await page.keyboard.press('Enter');
    await expect(page.locator('#state')).toHaveText('idle');
    await expect(page.locator('#error')).toHaveText(error);
    await expect(page.locator('#result')).toHaveText('');
    await expect(talk).toBeFocused();
  }
});

test('speech selects Daniel, expands metres, spaces sentences and cancels the next chunk immediately', async ({ page }) => {
  await audioHarness(page);
  await page.clock.install({ time: new Date('2026-09-26T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-09-26T13:00:00Z'));
  await page.evaluate(() => (window as AudioWindow).__voice.speech.setRate(1.2));
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as AudioWindow).__audio.speech.length)).toBe(1);
  const first = await page.evaluate(() => {
    const item = (window as AudioWindow).__audio.speech[0];
    return { text: item.text, voice: item.voice?.name, rate: item.rate };
  });
  expect(first).toEqual({ text: 'Walk 140 metres.', voice: 'Daniel', rate: 1.2 });
  await page.evaluate(() => (window as AudioWindow).__audio.speech[0].onend?.({} as SpeechSynthesisEvent));
  await page.clock.runFor(150);
  expect(await page.evaluate(() => (window as AudioWindow).__audio.speech.length)).toBe(1);
  await page.getByRole('button', { name: 'Stop speech', exact: true }).click();
  await expect(page.locator('#speaking')).toHaveText('false');
  await page.clock.runFor(500);
  expect(await page.evaluate(() => (window as AudioWindow).__audio.speech.length)).toBe(1);
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as AudioWindow).__audio.speech.length)).toBe(2);
  await page.evaluate(() => (window as AudioWindow).__audio.speech[1].onend?.({} as SpeechSynthesisEvent));
  await page.clock.runFor(300);
  expect(await page.evaluate(() => (window as AudioWindow).__audio.speech.at(-1)?.text)).toBe('Then stop.');
});
