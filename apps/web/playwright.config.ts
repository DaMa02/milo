import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 2,
  reporter: 'dot',
  use: {
    baseURL: 'http://127.0.0.1:5217',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5217 --strictPort',
    url: 'http://127.0.0.1:5217',
    reuseExistingServer: false,
  },
});
