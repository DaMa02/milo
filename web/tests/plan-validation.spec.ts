import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import initial from '../../contracts/fixtures/plan.initial-comparison.json' with { type: 'json' };
import candidates from '../../contracts/fixtures/plan.stop-candidates.json' with { type: 'json' };
import stop5 from '../../contracts/fixtures/plan.stop-5-min.json' with { type: 'json' };

const panel = (page: Page) => page.getByRole('region', { name: 'Plan your trip', exact: true });
const numberError = 'Enter a valid number of minutes, zero or more.';
const stopError = 'Enter a whole number of minutes from 1 to 180.';

async function openPlan(page: Page, connected = false) {
  await page.goto('/?saved=1');
  if (connected) await page.getByRole('combobox', { name: 'Data source', exact: true }).selectOption('connected');
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();
  await page.getByRole('navigation', { name: 'Area views', exact: true }).getByRole('button', { name: 'Plan your trip', exact: true }).click();
}

test('required journey fields identify their errors and clear each association when corrected', async ({ page }) => {
  await openPlan(page);
  const origin = panel(page).getByRole('textbox', { name: 'Journey origin', exact: true });
  const destination = panel(page).getByRole('textbox', { name: 'Destination', exact: true });
  const departure = panel(page).getByLabel('Departure time in Milan', { exact: true });
  for (const field of [origin, destination, departure]) {
    await expect(field).toHaveAttribute('aria-required', 'true');
    await field.fill('');
    await expect(field).toHaveAttribute('aria-invalid', 'false');
  }
  await expect(origin).toHaveAttribute('maxlength', '120');
  await expect(destination).toHaveAttribute('maxlength', '120');
  const compare = panel(page).getByRole('button', { name: 'Compare routes', exact: true });
  await compare.click();
  await expect(compare).toBeFocused();
  for (const field of [origin, destination]) {
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAccessibleDescription('Enter both the journey origin and destination.');
    await expect(field).toHaveValue('');
  }
  await expect(departure).toHaveAttribute('aria-invalid', 'true');
  await expect(departure).toHaveAccessibleDescription(/Enter a valid, unambiguous departure date and time in Milan\./);
  await expect(panel(page).getByRole('article')).toHaveCount(0);

  await origin.fill(initial.origin.name);
  await expect(origin).toHaveAttribute('aria-invalid', 'false');
  await expect(origin).toHaveAccessibleDescription('');
  await expect(destination).toHaveAttribute('aria-invalid', 'true');
  await destination.fill(initial.destination.name);
  await departure.fill('2026-10-25T02:30');
  await expect(departure).toHaveAttribute('aria-invalid', 'true');
  await departure.fill('2026-09-26T18:00');
  await expect(departure).toHaveAttribute('aria-invalid', 'false');
  await expect(departure).not.toHaveAccessibleDescription(/Enter a valid, unambiguous/);
  await expect(departure).toBeFocused();
  await compare.click();
  await expect(panel(page).getByRole('article', { name: 'Route A', exact: true })).toBeVisible();
  await expect(compare).toBeFocused();
});

test('walking limits are conditionally required and retain fractional-minute support', async ({ page }) => {
  await openPlan(page);
  await panel(page).getByRole('button', { name: 'Compare routes', exact: true }).click();
  await panel(page).getByText('Journey preferences', { exact: true }).click();
  const strength = panel(page).getByRole('combobox', { name: 'Walking beyond a time limit', exact: true });
  const walk = panel(page).getByRole('spinbutton', { name: 'Maximum walking time (minutes)', exact: true });
  await expect(walk).toHaveAttribute('aria-required', 'false');
  await strength.selectOption('avoid_when_possible');
  await expect(walk).toHaveAttribute('aria-required', 'true');
  await walk.fill('');
  await expect(walk).toHaveAttribute('aria-invalid', 'false');
  const apply = panel(page).getByRole('button', { name: 'Apply constraints', exact: true });
  await apply.click();
  await expect(apply).toBeFocused();
  await expect(walk).toHaveAttribute('aria-invalid', 'true');
  await expect(walk).toHaveAccessibleDescription(numberError);
  await walk.fill('-1');
  await expect(walk).toHaveAttribute('aria-invalid', 'true');
  await strength.selectOption('off');
  await expect(walk).toHaveAttribute('aria-required', 'false');
  await expect(walk).toHaveAttribute('aria-invalid', 'false');
  await expect(walk).toHaveAccessibleDescription('');
  await strength.selectOption('avoid_when_possible');
  await walk.fill('0.5');
  await expect(walk).toHaveAttribute('aria-invalid', 'false');
  await expect(walk).toBeFocused();
  await apply.click();
  await expect(page.locator('.error-message')).toContainText('This change has no saved result.');
  await expect(walk).toHaveValue('0.5');
  await expect(walk).toHaveAccessibleDescription('');
});

test('departure changes associate validation with the time field while keeping the confirmed plan', async ({ page }) => {
  await openPlan(page);
  await panel(page).getByRole('button', { name: 'Compare routes', exact: true }).click();
  const departure = panel(page).getByLabel('Departure time in Milan', { exact: true });
  await departure.fill('');
  const update = panel(page).getByRole('button', { name: 'Update departure', exact: true });
  await update.click();
  await expect(update).toBeFocused();
  await expect(departure).toHaveAttribute('aria-invalid', 'true');
  await expect(departure).toHaveAccessibleDescription(/Enter a valid, unambiguous departure date and time in Milan\./);
  await expect(panel(page).getByRole('article', { name: 'Route A', exact: true })).toContainText('14 minutes');
  await departure.fill('2026-09-26T18:00');
  await expect(departure).toHaveAttribute('aria-invalid', 'false');
  await expect(departure).toBeFocused();
});

test('invalid stop durations never reach the API and a valid five-minute stop preserves a newer draft', async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'validation', overview } });
    if (path === '/api/session/validation/plan') return route.fulfill({ json: initial });
    if (path.endsWith('/plan/select')) return route.fulfill({ json: { ...candidates, stop_candidates: [] } });
    if (path.endsWith('/plan/stop/candidates')) return route.fulfill({ json: candidates });
    if (path.endsWith('/plan/stop')) {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      await pending;
      return route.fulfill({ json: stop5 });
    }
    return route.abort();
  });
  await openPlan(page, true);
  await panel(page).getByRole('button', { name: 'Compare routes', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Choose route A', exact: true }).click();
  await panel(page).getByRole('button', { name: 'Find supermarkets', exact: true }).click();
  const duration = panel(page).getByRole('spinbutton', { name: 'Stop duration (minutes)', exact: true });
  const add = panel(page).getByRole('button', { name: 'Add Lidl', exact: true });
  await expect(duration).toHaveAttribute('aria-required', 'true');
  await expect(duration).toHaveAttribute('min', '1');
  await expect(duration).toHaveAttribute('max', '180');
  await expect(duration).toHaveAttribute('step', '1');
  for (const invalid of ['0', '1.5', '181', '']) {
    await duration.fill(invalid);
    await add.click();
    await expect(duration).toHaveAttribute('aria-invalid', 'true');
    await expect(duration).toHaveAccessibleDescription(stopError);
    await expect(duration).toHaveValue(invalid);
    await expect(add).toBeFocused();
    expect(requests).toEqual([]);
  }
  await duration.fill('5');
  await expect(duration).toHaveAttribute('aria-invalid', 'false');
  await expect(duration).toHaveAccessibleDescription('');
  await add.click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests).toEqual([{ osm_id: 'node/10571089360', duration_min: 5, if_version: 2 }]);
  await duration.fill('10');
  release();
  await expect(panel(page).getByRole('article', { name: 'Route A', exact: true })).toContainText('20 minutes');
  await expect(duration).toHaveValue('10');
  await expect(duration).toBeFocused();
  expect(requests).toHaveLength(1);
});
