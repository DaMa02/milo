import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { parseAnswer, parseExploreStep, parseOverview } from '../src/api/contracts';
import type { AskTool, ExploreCommand, ExploreStep } from '../src/api/contracts';

// Opt in with LOTL_LIVE_ENGINE=1 after starting the cached, deterministic engine
// on port 8000. Every operation below uses the real UI and Vite /api proxy.
// There are no intercepted requests or saved fixtures. Deterministic tests do
// not call a model; the final test needs a second explicit opt-in for one question.
test.skip(process.env.LOTL_LIVE_ENGINE !== '1', 'Requires the local cached engine (LOTL_LIVE_ENGINE=1).');
test.setTimeout(60_000);

const askPanel = (page: Page) => page.getByRole('region', { name: 'Ask a question', exact: true });

function observe(page: Page) {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      externalRequests.push(url.origin);
    }
  });
  return { errors, externalRequests };
}

async function resultAfter<T>(page: Page, path: string, action: () => Promise<unknown>, parse: (value: unknown) => T) {
  const pending = page.waitForResponse((response) =>
    new URL(response.url()).pathname === path && response.request().method() === 'POST');
  await action();
  const response = await pending;
  expect(response.status(), `POST ${path}: ${await response.text()}`).toBe(200);
  const value = parse(await response.json());
  await expect(page.locator('.error-message')).toHaveCount(0);
  return { value, request: response.request().postDataJSON() as Record<string, unknown> };
}

async function openConnectedArea(page: Page) {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Data source', exact: true }).selectOption({ label: 'Connected engine' });
  const { value, request } = await resultAfter(page, '/api/session',
    () => page.getByRole('button', { name: 'Open the area', exact: true }).click(),
    (body) => {
      const created = body as { session_id: string; overview: unknown };
      expect(typeof created.session_id).toBe('string');
      expect(created.session_id).not.toBe('');
      return { id: created.session_id, overview: parseOverview(created.overview) };
    });
  expect(request).toEqual({ lang: 'en' });
  await expect(page.getByRole('heading', { name: 'Overview', level: 2 })).toBeFocused();
  await expect(page.locator('.result-text')).toHaveText(value.overview.text);
  for (const unknown of value.overview.unknown) {
    await expect(page.locator('.result-panel').getByText(unknown, { exact: true })).toBeVisible();
  }
  return value;
}

async function explore(page: Page, id: string, command: ExploreCommand, action: () => Promise<unknown>, branch?: number) {
  const result = await resultAfter(page, `/api/session/${encodeURIComponent(id)}/explore`, action, parseExploreStep);
  expect(result.request).toEqual({ command, ...(branch === undefined ? {} : { branch }) });
  expect(result.value.command).toBe(command);
  await expect(page.locator('.result-text')).toContainText(`${result.value.branches.length} mapped connections.`);
  return result.value;
}

async function takeBranch(page: Page, id: string, from: ExploreStep) {
  // Choose from this server response, not the old saved example's branch list.
  const index = from.branches.findIndex((branch) => branch.distance_m > 0 && branch.leads_to.startsWith('a junction'));
  expect(index, 'At least one mapped outgoing branch is available').toBeGreaterThanOrEqual(0);
  const result = await explore(page, id, 'take',
    () => page.locator('.branch-actions > li').nth(index).getByRole('button').click(), index);
  expect(result.position).not.toEqual(from.position);
  expect(result.junction_stack_depth).toBe(from.junction_stack_depth + 1);
  await expect(page.getByRole('heading', { name: 'Your virtual position', level: 2 })).toBeFocused();
  return result;
}

test('the real engine creates a session and preserves the virtual reference through take, where, back and home', async ({ page }) => {
  const observed = observe(page);
  const { id, overview } = await openConnectedArea(page);
  const start = await explore(page, id, 'start',
    () => page.getByRole('button', { name: 'Explore from here', exact: true }).click());
  await expect(page.getByRole('heading', { name: 'Your virtual position', level: 2 })).toBeFocused();
  expect(start.heading_deg).toBe(overview.reference.heading_deg);
  expect(start.junction_stack_depth).toBe(0);
  const startOffset = start.facts.find((fact) => fact.type === 'start_offset');
  expect(startOffset).toBeDefined();
  await expect(page.locator('.result-text')).toContainText(`${startOffset!.value} m along it.`);
  const moved = await takeBranch(page, id, start);
  const where = page.getByRole('button', { name: 'Where am I?', exact: true });
  const located = await explore(page, id, 'where', () => where.click());
  expect(located.position).toEqual(moved.position);
  expect(located.heading_deg).toBe(moved.heading_deg);
  expect(located.junction_stack_depth).toBe(moved.junction_stack_depth);
  await expect(where).toBeFocused();
  const back = await explore(page, id, 'back',
    () => page.getByRole('button', { name: 'Back to the previous junction', exact: true }).click());
  expect(back.position).toEqual(start.position);
  expect(back.heading_deg).toBe(start.heading_deg);
  expect(back.junction_stack_depth).toBe(0);
  await takeBranch(page, id, back);
  const home = await explore(page, id, 'home',
    () => page.getByRole('button', { name: 'Back to the start', exact: true }).click());
  expect(home.position).toEqual(start.position);
  expect(home.heading_deg).toBe(start.heading_deg);
  expect(home.junction_stack_depth).toBe(0);
  expect(home.came_from).toBeNull();
  await expect(page.getByRole('button', { name: 'Back to the previous junction', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.locator('.result-text')).toHaveText(overview.text);
  await expect(page.locator('.result-panel').getByText(overview.reference.text, { exact: false })).toBeVisible();
  expect(observed).toEqual({ errors: [], externalRequests: [] });
});

test('the five real computations accept UI parameters and clarification never changes the explored position', async ({ page }) => {
  const observed = observe(page);
  const { id, overview } = await openConnectedArea(page);
  const start = await explore(page, id, 'start',
    () => page.getByRole('button', { name: 'Explore from here', exact: true }).click());
  const moved = await takeBranch(page, id, start);
  const positionText = await page.locator('.result-text').innerText();
  const panel = askPanel(page);
  const question = panel.getByRole('textbox', { name: 'Your question', exact: true });
  const cases: { tool: AskTool; place: string; question: string; fact: string }[] = [
    { tool: 'walking_vs_straight_line', place: 'viale Isonzo', question: 'How far is the party from Talent Garden?', fact: 'walking_distance' },
    { tool: 'barrier_between', place: 'viale Isonzo', question: 'What lies between Talent Garden and the party?', fact: 'barrier' },
    { tool: 'independent_connections', place: 'viale Isonzo', question: 'How many independent ways are there?', fact: 'independent_ways' },
    { tool: 'street_continuity', place: 'Via Arcivescovo Calabiana', question: 'Does the street go through?', fact: 'street_continuity' },
    { tool: 'extent', place: 'Villaggio Olimpico 2026 - Parco Porta Romana', question: 'How far does the construction site extend?', fact: 'longest_side_time' },
  ];
  async function ask(tool: AskTool, place: string, text: string) {
    await panel.getByRole('combobox', { name: 'Question type', exact: true }).selectOption(tool);
    await panel.getByRole('textbox', { name: tool === 'street_continuity' ? 'Street name' : 'Place name', exact: true }).fill(place);
    await question.fill(text);
    const result = await resultAfter(page, `/api/session/${encodeURIComponent(id)}/ask`, () => question.press('Enter'), parseAnswer);
    expect(result.value.tool).toBe(tool);
    expect(result.value.question).toBe(text);
    await expect(panel.locator('.answer-panel')).toContainText(text);
    const displayed = await panel.locator('.answer-text').innerText();
    expect(displayed.length).toBeGreaterThan(0);
    expect(result.value.text).toContain(displayed);
    for (const unknown of result.value.unknown) await expect(panel.getByText(unknown, { exact: true })).toBeVisible();
    await expect(question).toBeFocused();
    await expect(question).toHaveValue(text);
    await expect(page.locator('.result-text')).toHaveText(positionText);
    return result;
  }
  for (const item of cases) {
    const { value, request } = await ask(item.tool, item.place, item.question);
    // Continue to the clarification checks while still failing the test if any
    // advertised computation did not run for its valid, documented input.
    expect.soft(value.facts.some((fact) => fact.type === item.fact), `${item.tool}: ${value.text}`).toBe(true);
    if (item.tool === 'walking_vs_straight_line') {
      expect(request.params).toEqual({ to: { name: item.place } });
      expect(value.facts.find((fact) => fact.type === 'walking_distance')?.inputs.origin)
        .toEqual([overview.reference.lat, overview.reference.lon]);
    }
  }
  const ambiguous = await ask('walking_vs_straight_line', 'calabiana', 'How far is Calabiana?');
  expect(ambiguous.value.text).toMatch(/^Which one do you mean:/);
  expect(ambiguous.value.unknown).toContain('The name fits more than one place on the map.');
  const missing = await ask('walking_vs_straight_line', 'Piazza San Marco', 'How far is Piazza San Marco?');
  expect(missing.value.text).toMatch(/^I cannot find/);
  expect(missing.value.unknown.length).toBeGreaterThan(0);
  const located = await explore(page, id, 'where',
    () => page.getByRole('button', { name: 'Where am I?', exact: true }).click());
  expect(located.position).toEqual(moved.position);
  expect(located.heading_deg).toBe(moved.heading_deg);
  expect(located.junction_stack_depth).toBe(moved.junction_stack_depth);
  expect(observed).toEqual({ errors: [], externalRequests: [] });
});

test('a single natural question uses the live interpreter and keeps the confirmed journey origin', async ({ page }) => {
  test.skip(process.env.LOTL_LIVE_LLM !== '1', 'May call the model: also requires LOTL_LIVE_LLM=1.');
  const observed = observe(page);
  const requests: Record<string, unknown>[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/ask')) {
      requests.push(request.postDataJSON() as Record<string, unknown>);
    }
  });
  const { id, overview } = await openConnectedArea(page);
  const start = await explore(page, id, 'start',
    () => page.getByRole('button', { name: 'Explore from here', exact: true }).click());
  const moved = await takeBranch(page, id, start);
  const positionText = await page.locator('.result-text').innerText();
  const panel = askPanel(page);
  await expect(panel.getByRole('combobox', { name: 'Question type', exact: true })).toHaveValue('automatic');
  await expect(panel.getByRole('textbox', { name: 'Place name', exact: true })).toHaveCount(0);
  const question = panel.getByRole('textbox', { name: 'Your question', exact: true });
  const text = 'Is the party close to here?';
  await question.fill(text);
  // Submit exactly once. This opt-in test does not retry or send a second
  // question if the interpreter is unavailable or chooses the wrong tool.
  const { value, request } = await resultAfter(page, `/api/session/${encodeURIComponent(id)}/ask`,
    () => question.press('Enter'), parseAnswer);
  expect(request).toEqual({ question: text });
  expect(requests).toEqual([{ question: text }]);
  expect(value.tool).toBe('walking_vs_straight_line');
  expect(value.question).toBe(text);
  const walking = value.facts.find((fact) => fact.type === 'walking_distance');
  const straight = value.facts.find((fact) => fact.type === 'straight_line_distance');
  expect(walking?.inputs.origin).toEqual([overview.reference.lat, overview.reference.lon]);
  expect(typeof walking?.value).toBe('number');
  expect(typeof straight?.value).toBe('number');
  expect(walking!.value as number).toBeGreaterThanOrEqual(straight!.value as number);
  await expect(panel.locator('.answer-panel')).toContainText(text);
  expect(value.text).toContain(await panel.locator('.answer-text').innerText());
  for (const unknown of value.unknown) await expect(panel.getByText(unknown, { exact: true })).toBeVisible();
  await expect(question).toBeFocused();
  await expect(question).toHaveValue(text);
  await expect(page.locator('.result-text')).toHaveText(positionText);
  const located = await explore(page, id, 'where',
    () => page.getByRole('button', { name: 'Where am I?', exact: true }).click());
  expect(located.position).toEqual(moved.position);
  expect(located.heading_deg).toBe(moved.heading_deg);
  expect(observed).toEqual({ errors: [], externalRequests: [] });
});
