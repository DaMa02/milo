import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import overview from '../../contracts/fixtures/overview.porta-romana.json' with { type: 'json' };
import start from '../../contracts/fixtures/explore-step.start.json' with { type: 'json' };
import junction from '../../contracts/fixtures/explore-step.first-junction.json' with { type: 'json' };
import distance from '../../contracts/fixtures/answer.detour-ratio.json' with { type: 'json' };
import barrier from '../../contracts/fixtures/answer.barrier-between.json' with { type: 'json' };
import street from '../../contracts/fixtures/answer.street-through.json' with { type: 'json' };
import clarification from '../../contracts/fixtures/answer.no-tool.json' with { type: 'json' };

const apiPattern = /^https?:\/\/[^/]+\/api\//;
const askPanel = (page: Page) => page.getByRole('region', { name: 'Ask a question', exact: true });

interface RecordedRequest { method: string; path: string; body: Record<string, unknown> }
interface AskSpeechWindow extends Window { __askReadings: string[] }

async function installEngine(page: Page, answer: (route: Route) => Promise<void> = (route) => route.fulfill({ json: distance })) {
  const requests: RecordedRequest[] = [];
  const errors: string[] = [];
  let position: typeof start | typeof junction = start;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(apiPattern, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON() as Record<string, unknown>;
    requests.push({ method: request.method(), path, body });
    if (path === '/api/session') return route.fulfill({ json: { session_id: 'test-session', overview } });
    if (path === '/api/session/test-session/explore') {
      if (body.command === 'forward') position = junction;
      else if (body.command === 'start' || body.command === 'home' || body.command === 'back') position = start;
      return route.fulfill({ json: position });
    }
    if (path === '/api/session/test-session/ask') return answer(route);
    return route.abort();
  });
  return { requests, errors };
}

async function openConnectedArea(page: Page) {
  await page.goto('/?saved=1');
  await page.getByRole('combobox', { name: 'Data source', exact: true }).selectOption({ label: 'Connected engine' });
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Overview', level: 2 })).toBeVisible();
  await askPanel(page).getByRole('combobox', { name: 'Question type', exact: true }).selectOption('walking_vs_straight_line');
}

test('saved questions use the shared answers in either view and unsupported questions are not invented', async ({ page }) => {
  const apiRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    (window as AskSpeechWindow).__askReadings = [];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak(utterance: SpeechSynthesisUtterance) { (window as AskSpeechWindow).__askReadings.push(utterance.text); },
        cancel() {},
      },
    });
  });
  await page.route(apiPattern, (route) => { apiRequests.push(route.request().url()); return route.abort(); });
  await page.goto('/?saved=1');
  await expect(page.getByRole('combobox', { name: 'Data source', exact: true }))
    .toHaveValue('saved');
  await page.getByRole('button', { name: 'Open the area', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Read new results aloud', exact: true }).check();
  const panel = askPanel(page);
  const examples = [
    { label: 'Distance to the party', data: distance, phrase: '350 m in a straight line' },
    { label: 'Railway between us', data: barrier, phrase: 'southern belt railway' },
    { label: 'Does the street continue?', data: street, phrase: 'via Arcivescovo Calabiana does not go through' },
  ];
  for (const [index, example] of examples.entries()) {
    if (index === 2) await page.getByRole('button', { name: 'Explore from here', exact: true }).click();
    await panel.getByRole('button', { name: example.label, exact: true }).click();
    await expect(panel.locator('.answer-text')).toContainText(example.phrase);
    await expect(panel.getByText(example.data.question, { exact: false })).toBeVisible();
    for (const unknown of example.data.unknown) await expect(panel.getByText(unknown, { exact: true })).toBeVisible();
    const spoken = await page.evaluate(() => (window as AskSpeechWindow).__askReadings.at(-1));
    expect(spoken).toContain(example.phrase);
    for (const unknown of example.data.unknown) expect(spoken).toContain(unknown);
  }
  await page.getByRole('button', { name: 'Stop reading', exact: true }).first().click();
  await page.getByRole('checkbox', { name: 'Read new results aloud', exact: true }).uncheck();
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(audit.violations).toEqual([]);
    await page.screenshot({ path: `test-results/ask-${width}.png`, fullPage: true });
  }
  const previousAnswer = await panel.locator('.answer-text').textContent();
  const previousPosition = await page.locator('.result-text').textContent();
  const question = panel.getByRole('textbox', { name: 'Your question', exact: true });
  await panel.getByRole('textbox', { name: 'Place name', exact: true }).fill('viale Isonzo');
  await question.fill('Does this street have a bakery that opens at midnight?');
  await panel.getByRole('button', { name: 'Ask about this place', exact: true }).click();
  await expect(page.locator('.error-message')).toBeVisible();
  await expect(question).toHaveValue('Does this street have a bakery that opens at midnight?');
  await expect(panel.locator('.answer-text')).toHaveText(previousAnswer!);
  await expect(page.locator('.result-text')).toHaveText(previousPosition!);
  const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(audit.violations).toEqual([]);
  expect(apiRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('connected questions use the documented API and the trip origin after virtual exploration', async ({ page }) => {
  const observed = await installEngine(page);
  await openConnectedArea(page);
  expect(observed.requests[0]).toEqual({ method: 'POST', path: '/api/session', body: { lang: 'en' } });
  await page.getByRole('button', { name: 'Explore from here', exact: true }).click();
  await page.getByRole('button', { name: 'Go forward', exact: true }).click();
  await expect(page.locator('.result-text')).toContainText('You walked 140 m');
  const position = await page.locator('.result-text').textContent();
  const panel = askPanel(page);
  await expect(panel.getByRole('combobox', { name: 'Question type', exact: true }).locator('option'))
    .toHaveCount(6);
  await panel.getByRole('textbox', { name: 'Place name', exact: true }).fill('viale Isonzo');
  await panel.getByRole('textbox', { name: 'Your question', exact: true }).fill('How far is viale Isonzo from Talent Garden?');
  await panel.getByRole('button', { name: 'Ask about this place', exact: true }).click();
  await expect(panel.locator('.answer-text')).toContainText('350 m in a straight line');
  const requests = observed.requests.filter(({ path }) => path.endsWith('/ask'));
  expect(requests).toHaveLength(1);
  expect(requests[0]).toEqual({
    method: 'POST', path: '/api/session/test-session/ask',
    body: {
      question: 'How far is viale Isonzo from Talent Garden?',
      tool: 'walking_vs_straight_line',
      // Omitting from deliberately keeps the confirmed session origin, as
      // documented in contracts/README.md; it never uses the explored node.
      params: { to: { name: 'viale Isonzo' } },
    },
  });
  expect(observed.requests.filter(({ path }) => path.endsWith('/explore')).map(({ body }) => body))
    .toEqual([{ command: 'start' }, { command: 'forward' }]);
  await expect(page.locator('.result-text')).toHaveText(position!);
  expect(observed.errors).toEqual([]);
});

test('an engine error preserves the question, current answer and virtual position for a retry', async ({ page }) => {
  let unavailable = false;
  const observed = await installEngine(page, (route) => unavailable
    ? route.fulfill({ status: 503, body: 'Unavailable for this request' })
    : route.fulfill({ json: distance }));
  await openConnectedArea(page);
  await page.getByRole('button', { name: 'Explore from here', exact: true }).click();
  await page.getByRole('button', { name: 'Go forward', exact: true }).click();
  await expect(page.locator('.result-text')).toContainText('You walked 140 m');
  const position = await page.locator('.result-text').textContent();
  const panel = askPanel(page);
  const question = panel.getByRole('textbox', { name: 'Your question', exact: true });
  await panel.getByRole('textbox', { name: 'Place name', exact: true }).fill('viale Isonzo');
  await question.fill(distance.question);
  await panel.getByRole('button', { name: 'Ask about this place', exact: true }).click();
  await expect(panel.locator('.answer-text')).toContainText('350 m in a straight line');
  const previousAnswer = await panel.locator('.answer-text').textContent();
  unavailable = true;
  await question.fill('Can I reach viale Isonzo from Talent Garden on foot?');
  await panel.getByRole('button', { name: 'Ask about this place', exact: true }).click();
  await expect(page.locator('.error-message')).toHaveText('The engine could not be reached. Check that it is running and try again.');
  await expect(question).toHaveValue('Can I reach viale Isonzo from Talent Garden on foot?');
  await expect(panel.locator('.answer-text')).toHaveText(previousAnswer!);
  await expect(page.locator('.result-text')).toHaveText(position!);
  unavailable = false;
  await panel.getByRole('button', { name: 'Ask about this place', exact: true }).click();
  await expect(page.locator('.error-message')).toHaveCount(0);
  await expect(panel.locator('.answer-text')).toContainText('350 m in a straight line');
  expect(observed.requests.filter(({ path }) => path.endsWith('/ask'))).toHaveLength(3);
  expect(observed.errors).toEqual([]);
});

test('a delayed answer leaves keyboard focus where the user moved it', async ({ page }) => {
  let releaseAnswer!: () => void;
  const pending = new Promise<void>((resolve) => { releaseAnswer = resolve; });
  const observed = await installEngine(page, async (route) => {
    await pending;
    await route.fulfill({ json: distance });
  });
  await openConnectedArea(page);
  const panel = askPanel(page);
  const question = panel.getByRole('textbox', { name: 'Your question', exact: true });
  await panel.getByRole('textbox', { name: 'Place name', exact: true }).fill('viale Isonzo');
  await question.fill(distance.question);
  const requestStarted = page.waitForRequest('**/api/session/test-session/ask');
  await panel.getByRole('button', { name: 'Ask about this place', exact: true }).click();
  await requestStarted;
  await question.fill('How far does the park extend?');
  await expect(question).toBeFocused();
  releaseAnswer();
  await expect(panel.locator('.answer-text')).toContainText('350 m in a straight line');
  await expect(question).toBeFocused();
  await expect(question).toHaveValue('How far does the park extend?');
  await expect(panel.getByText(distance.question, { exact: false })).toBeVisible();
  expect(observed.errors).toEqual([]);
});

test('an unrecognised question returns the engine clarification without an invalid-data error', async ({ page }) => {
  const observed = await installEngine(page, (route) => route.fulfill({ json: clarification }));
  await openConnectedArea(page);
  const panel = askPanel(page);
  await panel.getByRole('textbox', { name: 'Place name', exact: true }).fill('viale Isonzo');
  await panel.getByRole('textbox', { name: 'Your question', exact: true }).fill(clarification.question);
  await panel.getByRole('button', { name: 'Ask about this place', exact: true }).click();
  await expect(panel.locator('.answer-text')).toHaveText(clarification.text);
  await expect(page.locator('.error-message')).toHaveCount(0);
  await expect(panel.getByRole('combobox', { name: 'Question type', exact: true }).locator('option')).toHaveCount(6);
  await expect(panel.getByRole('button', { name: 'Ask about this place', exact: true })).toBeEnabled();
  expect(observed.errors).toEqual([]);
});
