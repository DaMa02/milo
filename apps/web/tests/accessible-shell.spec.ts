import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';

const copy = {
  en: {
    request: 'Your request',
    send: 'Send request',
    language: 'Language',
    error: 'Enter a request before sending.',
    unavailable: 'Route planning is not connected in this preview.',
  },
  it: {
    request: 'La tua richiesta',
    send: 'Invia richiesta',
    language: 'Lingua',
    error: 'Scrivi una richiesta prima di inviarla.',
    unavailable: 'La pianificazione dei percorsi non è collegata in questa anteprima.',
  },
} as const;

async function expectOnePoliteRegion(page: Page) {
  const liveRegions = page.locator(
    '[aria-live]:not([aria-live="off"]), [role="status"], [role="alert"], [role="log"]',
  );
  await expect(liveRegions).toHaveCount(1);
  await expect(page.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
}

async function expectNoAxeViolations(page: Page, testInfo: TestInfo, state: string) {
  // Run the full rule set: no disabled rules or excluded parts of the shell.
  const result = await new AxeBuilder({ page }).analyze();
  await testInfo.attach(`axe-${state}`, {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
  expect(result.violations, `axe violations in ${state}`).toEqual([]);
}

async function expectVisibleKeyboardFocus(control: Locator) {
  await expect(control).toBeFocused();
  await expect(control).toBeInViewport();
  const outline = await control.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
  });
  expect(outline.width, 'keyboard focus must remain visible').toBeGreaterThanOrEqual(2);
  expect(outline.style).not.toBe('none');
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport + 1);
}

test('starts in English with clear landmarks and without taking focus', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: copy.en.request })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', /^en(?:-|$)/);
  await expect(page.getByRole('main')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  await expect(page).toHaveTitle(/Milo/);
  expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
  await expectOnePoliteRegion(page);
  await expect(page.getByRole('status')).toBeEmpty();
});

for (const locale of ['en', 'it'] as const) {
  test(`${locale}: initial, invalid and unavailable states pass axe and keep the draft`, async ({ page }, testInfo) => {
    await page.goto('/');
    if (locale === 'it') {
      await page.getByRole('combobox', { name: copy.en.language }).selectOption('it');
    }
    const words = copy[locale];
    const request = page.getByRole('textbox', { name: words.request });
    const send = page.getByRole('button', { name: words.send });
    await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${locale}(?:-|$)`));
    await expectOnePoliteRegion(page);
    await expectNoAxeViolations(page, testInfo, `${locale}-initial`);

    await request.focus();
    await page.keyboard.press('Tab');
    await expect(send).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(request).toBeFocused();
    await expect(request).toHaveAttribute('aria-invalid', 'true');
    await expect(request).toHaveAccessibleDescription(new RegExp(words.error.replace('.', '\\.')));
    await expectOnePoliteRegion(page);
    await expectNoAxeViolations(page, testInfo, `${locale}-invalid`);

    const draft = locale === 'en'
      ? 'I want to go to the Duomo, stopping at a pharmacy on the way, no public transport.'
      : 'Voglio andare al Duomo fermandomi in una farmacia lungo la strada, senza mezzi.';
    await request.fill(draft);
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText(words.unavailable);
    await expect(request).toHaveValue(draft);
    await expect(request).not.toHaveAttribute('aria-invalid', 'true');
    await expect(send).toBeFocused();
    await expectOnePoliteRegion(page);
    await expectNoAxeViolations(page, testInfo, `${locale}-unavailable`);
  });
}

test('changing language preserves the draft and leaves focus on the language control', async ({ page }) => {
  await page.goto('/');
  const draft = 'Porta Romana → Duomo\nSenza scale.';
  await page.getByRole('textbox', { name: copy.en.request }).fill(draft);
  const language = page.getByRole('combobox', { name: copy.en.language });
  await language.focus();
  await language.selectOption('it');
  await expect(page.getByRole('combobox', { name: copy.it.language })).toBeFocused();
  await expect(page.getByRole('textbox', { name: copy.it.request })).toHaveValue(draft);
  await expect(page.getByRole('button', { name: copy.it.send })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await page.getByRole('combobox', { name: copy.it.language }).selectOption('en');
  await expect(page.getByRole('combobox', { name: copy.en.language })).toBeFocused();
  await expect(page.getByRole('textbox', { name: copy.en.request })).toHaveValue(draft);
  await expect(page.getByRole('status')).toBeEmpty();
});

test('keyboard navigation starts at a working skip link and reaches the remaining controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: copy.en.request })).toBeVisible();
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to main content' });
  await expectVisibleKeyboardFocus(skip);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await page.keyboard.press('Tab');
  await expectVisibleKeyboardFocus(page.getByRole('textbox', { name: copy.en.request }));
  await page.keyboard.press('Tab');
  await expectVisibleKeyboardFocus(page.getByRole('button', { name: copy.en.send }));
  await page.keyboard.press('Tab');
  const help = page.locator('summary').filter({ hasText: 'Keyboard help' });
  await expectVisibleKeyboardFocus(help);
  await page.keyboard.press('Enter');
  await expect(page.locator('details')).toHaveAttribute('open', '');
  await expect(page.locator('details')).toContainText(/Ctrl/);
  await expect(page.locator('details')).toContainText(/Enter/);
  await page.keyboard.press('Space');
  await expect(page.locator('details')).not.toHaveAttribute('open', '');
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: copy.en.send })).toBeFocused();
});

test('sequential keyboard navigation reaches the language control without a focus trap', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: copy.en.request })).toBeVisible();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expectVisibleKeyboardFocus(page.getByRole('combobox', { name: copy.en.language }));
  await page.keyboard.press('Tab');
  await expect(page.getByRole('textbox', { name: copy.en.request })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('combobox', { name: copy.en.language })).toBeFocused();
});

for (const modifier of ['Control', 'Meta']) {
  test(`${modifier}+Enter sends only from the request field and preserves typing focus`, async ({ page }) => {
    await page.goto('/');
    const request = page.getByRole('textbox', { name: copy.en.request });
    await request.fill('Explore the area near the station.');
    await request.press('Enter');
    await expect(request).toHaveValue('Explore the area near the station.\n');
    await expect(page.getByRole('status')).toBeEmpty();
    await page.getByRole('combobox', { name: copy.en.language }).focus();
    await page.keyboard.press(`${modifier}+Enter`);
    await expect(page.getByRole('status')).toBeEmpty();
    await request.focus();
    await page.keyboard.press(`${modifier}+Enter`);
    await expect(page.getByRole('status')).toContainText(copy.en.unavailable);
    await expect(request).toBeFocused();
    await expect(request).toHaveValue('Explore the area near the station.\n');
  });
}

test('IME composition never submits an unfinished request', async ({ page }) => {
  await page.goto('/');
  const request = page.getByRole('textbox', { name: copy.en.request });
  await request.fill('駅');
  await request.dispatchEvent('compositionstart');
  for (const key of [{ ctrlKey: true }, { metaKey: true }]) {
    await request.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, ...key });
    await expect(page.getByRole('status')).toBeEmpty();
  }
  // Some engines report IME confirmation as keyCode 229 without isComposing.
  await request.dispatchEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, keyCode: 229 });
  await expect(page.getByRole('status')).toBeEmpty();
  await request.dispatchEvent('compositionend');
  await request.press('Control+Enter');
  await expect(page.getByRole('status')).toContainText(copy.en.unavailable);
  await expect(request).toHaveValue('駅');
});

test('a repeated submission updates the existing live region without moving focus', async ({ page }) => {
  await page.goto('/');
  const request = page.getByRole('textbox', { name: copy.en.request });
  await request.fill('Describe the station area.');
  await request.press('Control+Enter');
  await expect(page.getByRole('status')).toContainText(copy.en.unavailable);
  await page.getByRole('status').evaluate((region) => {
    region.setAttribute('data-observed-updates', '0');
    new MutationObserver(() => {
      region.setAttribute('data-observed-updates', String(Number(region.getAttribute('data-observed-updates')) + 1));
    }).observe(region, { childList: true, characterData: true, subtree: true });
  });
  await request.press('Control+Enter');
  await expect(page.getByRole('status')).not.toHaveAttribute('data-observed-updates', '0');
  await expectOnePoliteRegion(page);
  await expect(request).toBeFocused();
});

test('an offline submission keeps the request available for editing', async ({ page, context }) => {
  await page.goto('/');
  const request = page.getByRole('textbox', { name: copy.en.request });
  await request.fill('A route from Porta Romana to the Duomo, without stairs.');
  await context.setOffline(true);
  await request.press('Control+Enter');
  await expect(page.getByRole('status')).toContainText(copy.en.unavailable);
  await expect(request).toHaveValue('A route from Porta Romana to the Duomo, without stairs.');
  await expect(request).toBeFocused();
  await request.press('End');
  await request.press('!');
  await expect(request).toHaveValue('A route from Porta Romana to the Duomo, without stairs.!');
});

for (const locale of ['en', 'it'] as const) {
  test(`${locale}: controls and messages reflow at 320px and with 200% text`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/');
    if (locale === 'it') {
      await page.getByRole('combobox', { name: copy.en.language }).selectOption('it');
    }
    const request = page.getByRole('textbox', { name: copy[locale].request });
    await request.fill('A long request '.repeat(30));
    await request.press('Control+Enter');
    await page.locator('summary').click();
    await expectNoHorizontalOverflow(page);

    // Text resizing checks reflow; this does not claim a native browser-zoom test.
    await page.evaluate(() => {
      const root = document.documentElement;
      root.style.fontSize = `${parseFloat(getComputedStyle(root).fontSize) * 2}px`;
    });
    await expectNoHorizontalOverflow(page);
    await request.focus();
    await expect(request).toBeInViewport();
    await page.keyboard.press('Tab');
    await expectVisibleKeyboardFocus(page.getByRole('button', { name: copy[locale].send }));
    await expect(page.getByRole('status')).toContainText(copy[locale].unavailable);
  });
}

test('forced colors preserve visible keyboard focus', async ({ page }) => {
  await page.emulateMedia({ forcedColors: 'active' });
  await page.goto('/');
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  await expect(page.getByRole('textbox', { name: copy.en.request })).toBeVisible();
  await page.keyboard.press('Tab');
  await expectVisibleKeyboardFocus(page.getByRole('link', { name: 'Skip to main content' }));
  await page.keyboard.press('Tab');
  await expectVisibleKeyboardFocus(page.getByRole('combobox', { name: copy.en.language }));
  await page.keyboard.press('Tab');
  await expectVisibleKeyboardFocus(page.getByRole('textbox', { name: copy.en.request }));
  await page.keyboard.press('Tab');
  await expectVisibleKeyboardFocus(page.getByRole('button', { name: copy.en.send }));
});

test('the preview makes no external requests, stores no draft and starts no voice or location APIs', async ({ page, baseURL }) => {
  const externalRequests: string[] = [];
  const dataRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (['fetch', 'xhr', 'eventsource'].includes(request.resourceType())) {
      dataRequests.push(request.url());
    }
  });
  await page.route('**/*', async (route) => {
    if (new URL(route.request().url()).origin !== new URL(baseURL!).origin) {
      externalRequests.push(route.request().url());
      await route.abort();
      return;
    }
    await route.continue();
  });
  await page.addInitScript(() => {
    const calls: string[] = [];
    Object.defineProperty(window, '__forbiddenCalls', { value: calls });
    function forbid(target: object | undefined, name: string) {
      if (!target || !(name in target)) return;
      Object.defineProperty(target, name, {
        configurable: true,
        value() {
          calls.push(name);
          throw new Error(`Unexpected preview API: ${name}`);
        },
      });
    }
    forbid(window.speechSynthesis, 'speak');
    forbid(window, 'SpeechRecognition');
    forbid(window, 'webkitSpeechRecognition');
    forbid(navigator.mediaDevices, 'getUserMedia');
    forbid(navigator.geolocation, 'getCurrentPosition');
    forbid(navigator.geolocation, 'watchPosition');
    forbid(Storage.prototype, 'getItem');
    forbid(Storage.prototype, 'setItem');
    forbid(indexedDB, 'open');
    forbid(navigator, 'sendBeacon');
  });
  await page.goto('/');
  await page.getByRole('textbox', { name: copy.en.request }).fill('My home is at a private address.');
  await page.getByRole('combobox', { name: copy.en.language }).selectOption('it');
  await page.getByRole('textbox', { name: copy.it.request }).press('Control+Enter');
  await expect(page.getByRole('status')).toContainText(copy.it.unavailable);
  await expect(page.locator('audio, video')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, '__forbiddenCalls'))).toEqual([]);
  expect(externalRequests).toEqual([]);
  expect(dataRequests).toEqual([]);
  expect(errors).toEqual([]);
  await page.reload();
  await expect(page.getByRole('textbox', { name: copy.en.request })).toHaveValue('');
});
