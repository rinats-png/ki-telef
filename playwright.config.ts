import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', workers: 1, fullyParallel: false, timeout: 60000,
  use: { baseURL: 'http://localhost:3100', headless: true, launchOptions: { ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox'] }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node --import tsx scripts/e2e-server.ts', url: 'http://localhost:3100/login', reuseExistingServer: false, timeout: 120000 },
});
