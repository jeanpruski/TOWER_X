import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 45000,
  use: { baseURL: 'http://localhost:5181', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: existsSync(localChrome) ? { executablePath: localChrome } : {} },
  webServer: { command: 'node --import tsx scripts/e2e-server.ts', url: 'http://localhost:5181', reuseExistingServer: false, timeout: 60000 },
});
