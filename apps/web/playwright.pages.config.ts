import { defineConfig, devices } from '@playwright/test';

// The same smoke checks can verify the published URL without starting a local server.
const publishedURL = process.env.MILO_PAGES_URL;
const localURL = 'http://127.0.0.1:5219/milo/';

export default defineConfig({
  testDir: './deployment-tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: 'dot',
  use: {
    baseURL: publishedURL ?? localURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: publishedURL ? undefined : {
    command: 'npm run preview -- --host 127.0.0.1 --port 5219 --strictPort --base /milo/',
    url: localURL,
    reuseExistingServer: false,
  },
});
