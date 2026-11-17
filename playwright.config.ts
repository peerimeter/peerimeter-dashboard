import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    launchOptions: process.env.PEERIMETER_DEMO ? { slowMo: 180 } : {},
    ...devices['Desktop Chrome'],
    viewport: process.env.PEERIMETER_DEMO ? { width: 1280, height: 720 } : devices['Desktop Chrome'].viewport,
    video: process.env.PEERIMETER_DEMO ? { mode: 'on', size: { width: 1280, height: 720 } } : 'off',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
})
