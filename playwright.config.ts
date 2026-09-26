import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './web/tests',
  use: { baseURL: 'http://127.0.0.1:5173' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    {
      name: 'webkit-iphone',
      testMatch: ['**/voice.spec.ts', '**/places.spec.ts', '**/route-voice.spec.ts'],
      use: { ...devices['iPhone 13'], browserName: 'webkit', viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: { command: 'npm run dev --workspace web -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
