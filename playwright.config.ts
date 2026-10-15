import { defineConfig, devices } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The sandbox and the office PC may carry a Chromium that predates the pinned @playwright/test.
// If the pinned revision is missing, fall back to whatever chromium-* build exists under PLAYWRIGHT_BROWSERS_PATH.
function fallbackChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dirs = readdirSync(root).filter((d) => d.startsWith('chromium-'));
  for (const d of dirs.sort().reverse()) {
    for (const candidate of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-win/chrome.exe']) {
      const p = join(root, d, candidate);
      if (existsSync(p)) return p;
    }
  }
  return undefined;
}

const executablePath = process.env.PW_CHROMIUM_PATH ?? fallbackChromium();

export default defineConfig({
  testDir: 'apps/board/e2e',
  timeout: 60_000,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'wall-4k',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    },
    {
      name: 'laptop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
    },
    {
      name: 'laptop-1440',
      testMatch: /today\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
    {
      name: 'phone-390',
      testMatch: /today\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run preview -w apps/board -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
