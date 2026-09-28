import { defineConfig, devices } from '@playwright/test';

const stubKey = 'sb_publishable_e2e_stub';

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
  webServer: [
    {
      // Test-only Supabase Auth stand-in; see tests/e2e/provider-stub.mjs.
      command: 'node tests/e2e/provider-stub.mjs',
      env: { STUB_PORT: '4174', STUB_PUBLISHABLE_KEY: stubKey },
      url: 'http://127.0.0.1:4174/health',
      reuseExistingServer: false,
      timeout: 10000,
    },
    {
      command: 'node --env-file-if-exists=.env apps/api/dist/main.js',
      env: {
        PORT: '4173',
        HOST: '127.0.0.1',
        APP_ORIGIN: 'http://127.0.0.1:4173',
        SUPABASE_URL: 'http://127.0.0.1:4174',
        SUPABASE_PUBLISHABLE_KEY: stubKey,
        // Deterministic local AI provider (apps/api/src/ai-providers.ts); no network calls.
        AI_PROVIDER: 'mock',
        AI_MONTHLY_BUDGET_USD: '1000000',
        DATABASE_URL:
          process.env.TEST_DATABASE_URL ??
          'postgresql://family_menu:local-development-only@127.0.0.1:55432/family_menu_test',
      },
      url: 'http://127.0.0.1:4173/api/health/live',
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
