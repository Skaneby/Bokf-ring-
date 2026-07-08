import { defineConfig } from '@playwright/test';

// E2E-tester: kör `npm run test:e2e` (kräver att Chromium finns —
// i CI/molnmiljö via PLAYWRIGHT_BROWSERS_PATH eller executablePath nedan).
// Desktop-projektet kör @desktop+@both, mobilprojektet @mobile+@both.

const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    launchOptions: { executablePath: CHROMIUM },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop',
      grep: /@desktop|@both/,
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobil',
      grep: /@mobile|@both/,
      use: {
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
