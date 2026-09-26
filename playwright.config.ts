import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'mobile',
      use: { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command: 'node --env-file-if-exists=.env apps/api/dist/main.js',
    env: {
      PORT: '4173',
      HOST: '127.0.0.1',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://family_menu:local-development-only@127.0.0.1:55432/family_menu_test',
    },
    url: 'http://127.0.0.1:4173/api/health/live',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
