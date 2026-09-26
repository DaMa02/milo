import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import distance from '../../contracts/fixtures/answer.detour-ratio.json' with { type: 'json' };
import clarification from '../../contracts/fixtures/answer.no-tool.json' with { type: 'json' };

const panel = (page: Page) => page.getByRole('region', { name: 'Ask a question', exact: true });

async function setup(page: Page, answer: (route: Route) => Promise<void>) {
  const requests: Record<string, unknown>[] = [];
  await page.route(/^https?:\/\/[^/]+\/api\//, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'natural', overview } });
    if (path === '/api/session/natural/ask') {
      requests.push(route.request().postDataJSON() as Record<string, unknown>);
      return answer(route);
    }
    return route.abort();
  });
  await page.goto('/?saved=1');
  await page.getByRole('combobox', { name: 'Data source', exact: true }).selectOption('connected');
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', level: 2 })).toBeVisible();
  return requests;
}

test('a natural question sends only the question and leaves the draft and keyboard focus intact', async ({ page }) => {
  const requests = await setup(page, (route) => route.fulfill({ json: distance }));
  const ask = panel(page);
  const question = ask.getByRole('textbox', { name: 'Your question', exact: true });
  await expect(ask.getByRole('textbox', { name: 'Place name', exact: true })).toHaveCount(0);
  await expect(question).toHaveAttribute('maxlength', '500');
  await question.press('Enter');
  expect(requests).toEqual([]);
  await expect(question).toHaveAttribute('aria-invalid', 'true');
  await question.fill(distance.question);
  await question.press('Enter');
  await expect(ask.locator('.answer-text')).toContainText('350 m in a straight line');
  expect(requests).toEqual([{ question: distance.question }]);
  await expect(question).toHaveValue(distance.question);
  await expect(question).toBeFocused();
  await expect(page.locator('.result-text')).toHaveText(overview.text);
  for (const unknown of distance.unknown) await expect(ask.getByText(unknown, { exact: true })).toBeVisible();
});

test('an unavailable interpreter offers an explicit type choice without losing the question or automatically resending', async ({ page }) => {
  const requests = await setup(page, (route) => route.fulfill({ json: route.request().postDataJSON().tool ? distance : clarification }));
  const ask = panel(page);
  const question = ask.getByRole('textbox', { name: 'Your question', exact: true });
  await question.fill(clarification.question);
  await question.press('Enter');
  await expect(ask.locator('.answer-text')).toHaveText(clarification.text);
  expect(requests).toEqual([{ question: clarification.question }]);
  for (const unknown of clarification.unknown) await expect(ask.getByText(unknown, { exact: true })).toBeVisible();
  await expect(question).toBeFocused();
  const recover = ask.getByRole('button', { name: 'Choose a question type', exact: true });
  await recover.focus();
  await page.keyboard.press('Enter');
  const choices = ask.getByRole('combobox', { name: 'Question type', exact: true });
  await expect(choices).toBeFocused();
  await expect(choices).toHaveValue('walking_vs_straight_line');
  await expect(question).toHaveValue(clarification.question);
  expect(requests).toHaveLength(1);
  await ask.getByRole('textbox', { name: 'Place name', exact: true }).fill('viale Isonzo');
  await question.fill(distance.question);
  await question.press('Enter');
  await expect(ask.locator('.answer-text')).toContainText('350 m in a straight line');
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual({ question: distance.question, tool: 'walking_vs_straight_line', params: { to: { name: 'viale Isonzo' } } });
  await expect(recover).toHaveCount(0);
  await expect(page.locator('.error-message')).toHaveCount(0);
});

test('natural question controls and a retained draft remain accessible during a delayed answer', async ({ page }) => {
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  const requests = await setup(page, async (route) => { await delayed; await route.fulfill({ json: distance }); });
  const ask = panel(page);
  const question = ask.getByRole('textbox', { name: 'Your question', exact: true });
  await question.fill(distance.question);
  const pending = page.waitForRequest('**/api/session/natural/ask');
  await question.press('Enter');
  await pending;
  await question.fill('How far does the park extend?');
  await expect(question).toBeFocused();
  release();
  await expect(ask.locator('.answer-text')).toContainText('350 m in a straight line');
  await expect(question).toHaveValue('How far does the park extend?');
  await expect(question).toBeFocused();
  await expect(ask.getByText(distance.question, { exact: false })).toBeVisible();
  expect(requests).toEqual([{ question: distance.question }]);
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
  }
});
