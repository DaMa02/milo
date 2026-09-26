import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('keyboard entry, English interface and narrow reflow', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { name: 'Understand a place before you go', level: 1 })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /Language|Lingua/ })).toHaveCount(0);
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Listen to this result', exact: true })).toBeFocused();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: `test-results/shell-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});
