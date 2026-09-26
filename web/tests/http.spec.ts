import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

type HttpModule = typeof import('../src/api/http');

interface HttpTestWindow extends Window {
  __httpAbortController?: AbortController;
}

async function failureFor(page: Page, path: string, rejectValue = false) {
  return page.evaluate(async ({ path, rejectValue }) => {
    const modulePath = '/src/api/http.ts';
    const { requestJson, ApiError } = await import(modulePath) as HttpModule;
    let parserCalls = 0;
    try {
      await requestJson(path, (value) => {
        parserCalls += 1;
        if (rejectValue) throw new Error('Response does not match the contract');
        return value;
      });
      return { resolved: true, parserCalls };
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      return { kind: error.kind, status: error.status ?? null, name: error.name, parserCalls };
    }
  }, { path, rejectValue });
}

test.beforeEach(async ({ page }) => {
  // Keep the real Vite origin and transport module, without mounting the UI or
  // allowing unrelated startup requests to reach a backend.
  await page.route('**/__http_boundary_test__', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html lang="en"><title>HTTP boundary test</title></html>',
  }));
  await page.goto('/__http_boundary_test__');
});

test('POST sends JSON to the same-origin API and returns the parsed value', async ({ page }) => {
  let requestDetails: unknown;
  await page.route('**/api/http-post', async (route) => {
    const request = route.request();
    requestDetails = {
      pathname: new URL(request.url()).pathname,
      method: request.method(),
      accept: request.headers().accept,
      contentType: request.headers()['content-type'],
      body: request.postDataJSON(),
    };
    await route.fulfill({ json: { label: '  Porta Romana  ' } });
  });

  const result = await page.evaluate(async () => {
    const modulePath = '/src/api/http.ts';
    const { requestJson } = await import(modulePath) as HttpModule;
    return requestJson('/http-post', (value) => {
      if (!value || typeof value !== 'object' || !('label' in value) || typeof value.label !== 'string') {
        throw new Error('Missing label');
      }
      return value.label.trim();
    }, { body: { zone: 'porta-romana', lang: 'it' } });
  });

  expect(requestDetails).toEqual({
    pathname: '/api/http-post',
    method: 'POST',
    accept: 'application/json',
    contentType: 'application/json',
    body: { zone: 'porta-romana', lang: 'it' },
  });
  expect(result).toBe('Porta Romana');
});

test('a request without a body uses GET without a JSON content-type', async ({ page }) => {
  let requestDetails: unknown;
  await page.route('**/api/http-get', async (route) => {
    const request = route.request();
    requestDetails = {
      method: request.method(),
      body: request.postData(),
      accept: request.headers().accept,
      contentType: request.headers()['content-type'] ?? null,
    };
    await route.fulfill({ json: { available: true } });
  });

  const result = await page.evaluate(async () => {
    const modulePath = '/src/api/http.ts';
    const { requestJson } = await import(modulePath) as HttpModule;
    return requestJson('/http-get', (value) => value);
  });

  expect(requestDetails).toEqual({ method: 'GET', body: null, accept: 'application/json', contentType: null });
  expect(result).toEqual({ available: true });
});

test('malformed JSON is invalid and never reaches the contract parser', async ({ page }) => {
  await page.route('**/api/http-malformed', (route) => route.fulfill({
    contentType: 'application/json',
    body: '{"overview":',
  }));
  expect(await failureFor(page, '/http-malformed')).toEqual({
    kind: 'invalid', status: null, name: 'ApiError', parserCalls: 0,
  });
});

test('valid JSON rejected by the contract parser is invalid', async ({ page }) => {
  await page.route('**/api/http-contract', (route) => route.fulfill({ json: { unexpected: true } }));
  expect(await failureFor(page, '/http-contract', true)).toEqual({
    kind: 'invalid', status: null, name: 'ApiError', parserCalls: 1,
  });
});

for (const [status, kind] of [[503, 'unavailable'], [404, 'expired'], [410, 'expired'], [500, 'network']] as const) {
  test(`HTTP ${status} is ${kind} and preserves its status without parsing`, async ({ page }) => {
    await page.route(`**/api/http-${status}`, (route) => route.fulfill({
      status,
      contentType: 'text/plain',
      body: 'Service response, not a contract payload',
    }));
    expect(await failureFor(page, `/http-${status}`)).toEqual({
      kind, status, name: 'ApiError', parserCalls: 0,
    });
  });
}

test('a failed network connection is network without an HTTP status', async ({ page }) => {
  await page.route('**/api/http-network', (route) => route.abort('connectionrefused'));
  expect(await failureFor(page, '/http-network')).toEqual({
    kind: 'network', status: null, name: 'ApiError', parserCalls: 0,
  });
});

test('aborting an in-flight fetch is aborted rather than a network failure', async ({ page }) => {
  // Hold the intercepted request until the browser's AbortController cancels it.
  await page.route('**/api/http-abort', () => {});
  const requestStarted = page.waitForRequest('**/api/http-abort');
  const outcome = page.evaluate(async () => {
    const modulePath = '/src/api/http.ts';
    const { requestJson, ApiError } = await import(modulePath) as HttpModule;
    const controller = new AbortController();
    (window as HttpTestWindow).__httpAbortController = controller;
    let parserCalls = 0;
    try {
      await requestJson('/http-abort', (value) => { parserCalls += 1; return value; }, { signal: controller.signal });
      return { resolved: true, parserCalls };
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      return { kind: error.kind, status: error.status ?? null, name: error.name, parserCalls };
    }
  });
  await requestStarted;
  await page.evaluate(() => (window as HttpTestWindow).__httpAbortController?.abort());
  expect(await outcome).toEqual({ kind: 'aborted', status: null, name: 'ApiError', parserCalls: 0 });
});
