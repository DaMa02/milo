import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './web/tests',
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium' },
  webServer: { command: 'npm run dev --workspace web -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
});
