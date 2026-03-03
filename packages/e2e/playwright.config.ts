import { defineConfig } from '@playwright/test';

// Use dedicated ports for E2E to avoid conflicts with running dev servers
const BACKEND_PORT = 3051;
const FRONTEND_PORT = 5174;

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'html',

  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  webServer: [
    {
      command: `PORT=${BACKEND_PORT} pnpm --filter @garage-engine/backend dev`,
      url: `http://localhost:${BACKEND_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      cwd: '../..',
    },
    {
      command: `pnpm --filter @garage-engine/frontend dev`,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      cwd: '../..',
      env: {
        VITE_API_PORT: String(BACKEND_PORT),
        VITE_PORT: String(FRONTEND_PORT),
      },
    },
  ],
});
