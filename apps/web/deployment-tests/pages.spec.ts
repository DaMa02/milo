import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('built app loads assets below a project path and keeps input through errors and language changes', async ({ page }) => {
  const failures: string[] = [];
  page.on('pageerror', error => failures.push(error.message));
  page.on('requestfailed', request => failures.push(request.url()));
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });

  const response = await page.goto('./');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const assets = await page.evaluate(() => ({
    logoLoaded: Array.from(document.images).every(image => image.complete && image.naturalWidth > 0),
    stylesLoaded: document.styleSheets.length > 0,
    scripts: Array.from(document.scripts).filter(script => script.src).map(script => script.src),
  }));
  expect(assets.logoLoaded).toBe(true);
  expect(assets.stylesLoaded).toBe(true);
  expect(assets.scripts.length).toBeGreaterThan(0);
  for (const script of assets.scripts) expect(script.startsWith(new URL('.', page.url()).href)).toBe(true);

  await page.getByRole('button', { name: 'Send request' }).click();
  const request = page.getByRole('textbox', { name: 'Your request' });
  await expect(request).toBeFocused();
  await expect(request).toHaveAttribute('aria-invalid', 'true');
  await request.fill('Duomo, with a pharmacy stop.');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByRole('status')).toContainText('Route planning is not connected');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.getByRole('combobox', { name: 'Language' }).selectOption('it');
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page.getByRole('textbox', { name: 'La tua richiesta' })).toHaveValue('Duomo, with a pharmacy stop.');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Your request' })).toBeVisible();
  expect(failures).toEqual([]);
});
