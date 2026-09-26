import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import start from '../../contracts/fixtures/explore-step.start.json' with { type: 'json' };
import junction from '../../contracts/fixtures/explore-step.first-junction.json' with { type: 'json' };

async function keyboardActivate(page: Page, target: Locator) {
  // Reach controls through the real tab order, including native disclosure
  // widgets, rather than simulating a pointer click or setting focus directly.
  for (let count = 0; count < 100; count += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(target).toBeFocused();
  await page.keyboard.press('Enter');
}

async function observeLocalRun(page: Page) {
  const errors: string[] = [];
  const apiRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => {
    apiRequests.push(new URL(route.request().url()).pathname);
    return route.abort();
  });
  return { errors, apiRequests };
}

async function expandAllDetails(page: Page) {
  while (await page.locator('.result-panel details:not([open]) > summary').count()) {
    await page.locator('.result-panel details:not([open]) > summary').first().click();
  }
}

test('keyboard exploration preserves the recorded position, uncertainty and return path', async ({ page }) => {
  const observed = await observeLocalRun(page);
  await page.goto('/');
  await keyboardActivate(page, page.getByRole('button', { name: 'Open the area', exact: true }));
  await expect(page.getByRole('heading', { name: 'Overview', level: 2 })).toBeFocused();
  const narration = page.locator('.result-text');
  await expect(narration).toHaveText(overview.text);
  await expect(page.locator('.result-panel').getByText(overview.reference.text, { exact: false })).toBeVisible();
  for (const unknown of overview.unknown) await expect(page.getByText(unknown, { exact: true })).toBeVisible();
  await keyboardActivate(page, page.getByText('More detail', { exact: true }));
  for (const detail of overview.details) await expect(page.getByText(detail, { exact: true })).toBeVisible();

  await keyboardActivate(page, page.getByRole('button', { name: 'Explore from here', exact: true }));
  await expect(page.getByRole('heading', { name: 'Your virtual position', level: 2 })).toBeFocused();
  await expect(narration).toContainText('Start at Talent Garden, facing north.');
  await expect(narration).toContainText('3 mapped connections.');
  await expect(page.getByText(start.text, { exact: true })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Back to the previous junction', exact: true })).toBeDisabled();
  await keyboardActivate(page, page.getByRole('button', { name: 'Go forward', exact: true }));
  await expect(narration).toContainText('You walked 140 m');
  await expect(narration).toContainText('5 mapped connections.');
  await expect(narration).not.toContainText('5 ways, from left to right:');
  const junctionSummary = await narration.textContent();
  await expect(page.getByRole('button', { name: 'Go forward', exact: true })).toBeFocused();
  await keyboardActivate(page, page.getByText('Street connections', { exact: true }));
  await expect(page.getByText(junction.text, { exact: true })).toBeVisible();
  const branches = page.locator('.branch-list > li');
  await expect(branches).toHaveCount(5);
  for (const [index, branch] of junction.branches.entries()) {
    await expect(branches.nth(index)).toContainText(branch.name);
    await expect(branches.nth(index)).toContainText(branch.leads_to);
    await expect(branches.nth(index)).toContainText(`${branch.distance_m} m`);
  }
  await expect(branches.nth(0)).toContainText('No pedestrian crossing is included in the mapped data for this branch.');
  await expect(branches.nth(1).locator('dd')).toHaveText(['Mapped as absent', 'Mapped as absent', 'Mapped as absent']);
  await expect(branches.nth(2).locator('dd')).toHaveText(['Mapped as absent', 'Mapped as absent', 'Unknown']);

  await keyboardActivate(page, page.getByRole('button', { name: 'Where am I?', exact: true }));
  await expect(narration).toHaveText(junctionSummary!);
  await expect(page.locator('.sr-only[role="status"]')).toHaveText(junctionSummary!);
  await keyboardActivate(page, page.getByRole('button', { name: 'Turn left', exact: true }));
  await expect(page.locator('.error-message')).toContainText('This action is not available in the saved example. Your position has not changed.');
  await expect(narration).toHaveText(junctionSummary!);
  await expect(branches).toHaveCount(5);
  await keyboardActivate(page, page.getByRole('button', { name: 'Back to the previous junction', exact: true }));
  await expect(narration).toContainText('Start at Talent Garden, facing north.');
  await expect(narration).toContainText('3 mapped connections.');
  await expect(page.locator('.error-message')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Back to the previous junction', exact: true })).toBeDisabled();
  expect(observed).toEqual({ errors: [], apiRequests: [] });
});

test('switching views keeps the junction and English commands preserve the return path', async ({ page }) => {
  const observed = await observeLocalRun(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();
  await page.getByRole('button', { name: 'Explore from here', exact: true }).click();
  await page.getByRole('button', { name: 'Go forward', exact: true }).click();
  await expect(page.locator('.result-text')).toContainText('You walked 140 m');
  await expect(page.locator('.result-text')).toContainText('5 mapped connections.');
  const narration = page.locator('.result-text');
  const englishJunction = await narration.textContent();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(narration).toHaveText(overview.text);
  await page.getByRole('button', { name: 'Explore', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('combobox', { name: /Language|Lingua/ })).toHaveCount(0);
  await expect(narration).toHaveText(englishJunction!);
  await page.getByText('Street connections', { exact: true }).click();
  await expect(page.locator('.branch-list > li')).toHaveCount(5);
  await expect(page.locator('.branch-list > li').nth(2).locator('dd')).toHaveText([
    'Mapped as absent', 'Mapped as absent', 'Unknown',
  ]);

  const command = page.getByRole('textbox', { name: 'Exploration command', exact: true });
  await command.fill('where');
  await command.press('Enter');
  await expect(narration).toHaveText(englishJunction!);
  await expect(page.locator('.sr-only[role="status"]')).toHaveText(englishJunction!);
  await command.fill('back');
  await command.press('Enter');
  await expect(narration).toContainText('Start at Talent Garden');
  await expect(narration).toContainText('3 mapped connections.');
  await expect(page.getByRole('button', { name: 'Back to the previous junction', exact: true })).toBeDisabled();
  expect(observed).toEqual({ errors: [], apiRequests: [] });
});

test('branch actions are visible before opening details and preserve the position on unavailable choices', async ({ page }) => {
  const observed = await observeLocalRun(page);
  await page.goto('/');
  await keyboardActivate(page, page.getByRole('button', { name: 'Open the area', exact: true }));
  await keyboardActivate(page, page.getByRole('button', { name: 'Explore from here', exact: true }));
  const narration = page.locator('.result-text');
  const startSummary = await narration.textContent();
  await expect(page.locator('.branch-actions > li')).toHaveCount(start.branches.length);
  await expect(page.locator('.result-panel details[open]')).toHaveCount(0);
  const unsavedStartBranch = page.getByRole('button', { name: 'Follow At 8 o’clock: a footpath', exact: true });
  await expect(unsavedStartBranch).toBeVisible();
  await keyboardActivate(page, unsavedStartBranch);
  await expect(page.locator('.error-message')).toContainText('This action is not available in the saved example. Your position has not changed.');
  await expect(narration).toHaveText(startSummary!);
  await expect(page.locator('.branch-list > li')).toHaveCount(3);
  await expect(unsavedStartBranch).toBeFocused();

  await keyboardActivate(page, page.getByRole('button', {
    name: 'Follow At 11 o’clock: the pavement of via Arcivescovo Calabiana', exact: true,
  }));
  await expect(narration).toContainText('You walked 140 m');
  await expect(narration).toContainText('5 mapped connections.');
  await expect(page.getByRole('heading', { name: 'Your virtual position', level: 2 })).toBeFocused();
  await expect(page.locator('.error-message')).toHaveCount(0);
  await expect(page.locator('.branch-list > li')).toHaveCount(5);
  const junctionSummary = await narration.textContent();
  const unsavedJunctionBranch = page.getByRole('button', { name: 'Follow Left: a pavement', exact: true });
  await keyboardActivate(page, unsavedJunctionBranch);
  await expect(page.locator('.error-message')).toContainText('This action is not available in the saved example. Your position has not changed.');
  await expect(narration).toHaveText(junctionSummary!);
  await expect(page.locator('.branch-list > li')).toHaveCount(5);
  await expect(unsavedJunctionBranch).toBeFocused();
  expect(observed).toEqual({ errors: [], apiRequests: [] });
});

test('take uses displayed connection numbers and rejects invalid choices without sending a request', async ({ page }) => {
  const commands: Record<string, unknown>[] = [];
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'take-test', overview } });
    if (path === '/api/session/take-test/explore') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      commands.push(body);
      if (body.command === 'start') return route.fulfill({ json: start });
      if (body.command === 'take' && body.branch === 1) return route.fulfill({ json: junction });
    }
    return route.abort();
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Data source', exact: true }).selectOption({ label: 'Connected engine' });
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();
  await page.getByRole('button', { name: 'Explore from here', exact: true }).click();
  const command = page.getByRole('textbox', { name: 'Exploration command', exact: true });
  const originalPosition = await page.locator('.result-text').textContent();
  await expect(page.locator('.branch-actions > li')).toHaveCount(start.branches.length);
  expect(commands).toEqual([{ command: 'start' }]);

  for (const invalid of ['take 0', `take ${start.branches.length + 1}`, 'take -1', 'take 1.5']) {
    await command.fill(invalid);
    await command.press('Enter');
    await expect(command).toHaveAttribute('aria-invalid', 'true');
    await expect(command).toBeFocused();
    await expect(page.getByText('Use a listed command, or take followed by a connection number shown above.', { exact: true })).toBeVisible();
    await expect(page.locator('.result-text')).toHaveText(originalPosition!);
    await expect(page.locator('.error-message')).toHaveCount(0);
    expect(commands).toEqual([{ command: 'start' }]);
  }

  await command.fill('take 2');
  await command.press('Enter');
  await expect(page.locator('.result-text')).toContainText('You walked 140 m');
  await expect(command).toHaveAttribute('aria-invalid', 'false');
  expect(commands).toEqual([{ command: 'start' }, { command: 'take', branch: 1 }]);
  await expect(page.locator('.branch-actions > li')).toHaveCount(junction.branches.length);
});

test('expanded overview and exploration remain accessible and reflow at narrow widths', async ({ page }) => {
  const observed = await observeLocalRun(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();
  await expandAllDetails(page);
  await expect(page.getByRole('link', { name: 'way/141197445', exact: true }).first())
    .toHaveAttribute('href', 'https://www.openstreetmap.org/way/141197445');
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    if (width === 1280) await page.screenshot({ path: 'test-results/overview-1280.png', fullPage: true });
  }

  await page.getByRole('button', { name: 'Explore from here', exact: true }).click();
  await page.getByRole('button', { name: 'Go forward', exact: true }).click();
  await expandAllDetails(page);
  await expect(page.locator('.branch-list > li')).toHaveCount(5);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: `test-results/explore-${width}.png`, fullPage: true });
  }
  expect(observed).toEqual({ errors: [], apiRequests: [] });
});
