import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface RecordedUtterance {
  text: string;
  language: string;
  start: (() => void) | null;
  end: (() => void) | null;
  error: ((event: { error: string }) => void) | null;
}

interface SpeechTestWindow extends Window {
  __speechTest: {
    calls: RecordedUtterance[];
    cancellations: number;
  };
}

async function installSpeechMock(page: Page, supported = true) {
  // Test the browser integration deterministically without playing audio or
  // depending on an installed operating-system voice.
  await page.addInitScript((available) => {
    const state: SpeechTestWindow['__speechTest'] = { calls: [], cancellations: 0 };
    (window as SpeechTestWindow).__speechTest = state;
    class Utterance {
      text: string;
      lang = '';
      onstart: RecordedUtterance['start'] = null;
      onend: RecordedUtterance['end'] = null;
      onerror: RecordedUtterance['error'] = null;

      constructor(text: string) { this.text = text; }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: available ? Utterance : undefined,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel() { state.cancellations += 1; },
        speak(utterance: Utterance) {
          state.calls.push({
            text: utterance.text,
            language: utterance.lang,
            start: utterance.onstart,
            end: utterance.onend,
            error: utterance.onerror,
          });
        },
      },
    });
  }, supported);
}

test('speech is explicit, repeats the same language, and ignores cancelled events', async ({ page }) => {
  await installSpeechMock(page);
  await page.goto('/?saved=1');
  const listen = page.getByRole('button', { name: 'Listen to this result', exact: true });
  const repeat = page.getByRole('button', { name: 'Repeat last reading', exact: true });
  const stop = page.getByRole('button', { name: 'Stop reading', exact: true }).first();
  await expect(listen).toBeEnabled();
  await expect(repeat).toBeDisabled();
  await expect(stop).toBeDisabled();
  expect(await page.evaluate(() => (window as SpeechTestWindow).__speechTest.calls.length)).toBe(0);

  await listen.click();
  await expect(stop).toBeEnabled();
  await repeat.click();
  const readings = await page.evaluate(() => (window as SpeechTestWindow).__speechTest.calls.map(
    ({ text, language }) => ({ text, language }),
  ));
  expect(readings).toHaveLength(2);
  expect(readings[0].text.length).toBeGreaterThan(0);
  expect(readings[0].language).toMatch(/^en(?:-|$)/);
  expect(readings[1]).toEqual(readings[0]);

  // An old completion or failure must not interrupt the newer reading.
  await page.evaluate(() => {
    const stale = (window as SpeechTestWindow).__speechTest.calls[0];
    stale.end?.();
    stale.error?.({ error: 'interrupted' });
  });
  await expect(stop).toBeEnabled();
  const beforeStop = await page.evaluate(() => (window as SpeechTestWindow).__speechTest.cancellations);
  await stop.click();
  await expect(stop).toBeDisabled();
  await expect(stop).toBeFocused();
  expect(await page.evaluate(() => (window as SpeechTestWindow).__speechTest.cancellations)).toBeGreaterThan(beforeStop);

  // A queued onstart arriving after Stop must not restart the UI state.
  await page.evaluate(() => (window as SpeechTestWindow).__speechTest.calls[1].start?.());
  await expect(stop).toBeDisabled();
});

test('unsupported speech keeps the visible result usable', async ({ page }) => {
  await installSpeechMock(page, false);
  await page.goto('/?saved=1');
  await expect(page.getByText('This browser does not support app speech. All results remain available as text.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Listen to this result', exact: true })).toHaveCount(0);
  await expect(page.getByRole('main')).toBeVisible();
});

test('speech errors are announced and an explicit retry can succeed', async ({ page }) => {
  await installSpeechMock(page);
  await page.goto('/?saved=1');
  const listen = page.getByRole('button', { name: 'Listen to this result', exact: true });
  const stop = page.getByRole('button', { name: 'Stop reading', exact: true }).first();
  await listen.click();
  await page.evaluate(() => (window as SpeechTestWindow).__speechTest.calls[0].error?.({ error: 'synthesis-failed' }));
  const message = page.getByRole('status').filter({ hasText: 'Reading aloud failed. You can try again or read the text.' });
  await expect(message).toBeVisible();
  await expect(stop).toBeDisabled();
  await listen.click();
  await expect(message).toHaveCount(0);
  await expect(stop).toBeEnabled();
  await page.evaluate(() => (window as SpeechTestWindow).__speechTest.calls[1].end?.());
  await expect.poll(() => page.evaluate(() => (window as SpeechTestWindow).__speechTest.calls.length)).toBe(3);
  await expect(stop).toBeEnabled();
  expect(await page.evaluate(() => (window as SpeechTestWindow).__speechTest.calls[2].text))
    .toBe('Explore how streets connect, compare ways to get there and prepare a trip around your needs.');
  await page.evaluate(() => (window as SpeechTestWindow).__speechTest.calls[2].end?.());
  await expect(stop).toBeDisabled();
});

test('opening the area stops the previous reading and new readings stay in English', async ({ page }) => {
  await installSpeechMock(page);
  await page.goto('/?saved=1');
  await page.getByRole('button', { name: 'Listen to this result', exact: true }).click();
  const beforeChange = await page.evaluate(() => (window as SpeechTestWindow).__speechTest.cancellations);
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Stop reading', exact: true }).first()).toBeDisabled();
  const state = await page.evaluate(() => ({
    cancellations: (window as SpeechTestWindow).__speechTest.cancellations,
    readings: (window as SpeechTestWindow).__speechTest.calls.length,
  }));
  expect(state.cancellations).toBeGreaterThan(beforeChange);
  expect(state.readings).toBe(1);
  await page.getByRole('button', { name: 'Listen to this result', exact: true }).click();
  await page.getByRole('button', { name: 'Repeat last reading', exact: true }).click();
  const readings = await page.evaluate(() => (window as SpeechTestWindow).__speechTest.calls.map(
    ({ text, language }) => ({ text, language }),
  ));
  expect(readings).toHaveLength(3);
  expect(readings.every((reading) => reading.language === 'en-GB')).toBe(true);
  expect(readings[1].text).toContain('Facing north from Talent Garden.');
  expect(readings[2]).toEqual(readings[1]);
});

test('detail readings can be stopped by the immediately following keyboard control', async ({ page }) => {
  await installSpeechMock(page);
  await page.goto('/?saved=1');
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();

  for (const summary of ['More detail', 'Street connections']) {
    if (summary === 'Street connections') {
      await page.getByRole('button', { name: 'Explore from here', exact: true }).click();
    }
    await page.getByText(summary, { exact: true }).click();
    const details = page.locator('details').filter({
      has: page.getByRole('button', { name: 'Listen to the details', exact: true }),
    }).first();
    await details.getByRole('button', { name: 'Listen to the details', exact: true }).focus();
    await page.keyboard.press('Enter');
    const stop = details.getByRole('button', { name: 'Stop reading', exact: true });
    await expect(stop).toBeEnabled();
    await page.keyboard.press('Tab');
    await expect(stop).toBeFocused();
    const cancellations = await page.evaluate(() => (window as SpeechTestWindow).__speechTest.cancellations);
    await page.keyboard.press('Enter');
    await expect(stop).toBeDisabled();
    await expect(stop).toBeFocused();
    expect(await page.evaluate(() => (window as SpeechTestWindow).__speechTest.cancellations)).toBeGreaterThan(cancellations);
  }
});
