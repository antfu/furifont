import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/e2e/setup.ts',
  timeout: 90_000,
  reporter: process.env.CI ? 'github' : 'list',
  projects: [
    ...(['Desktop Chrome', 'Desktop Firefox', 'Desktop Safari'] as const).map(device => ({
      name: device.split(' ')[1]!.toLowerCase(),
      testMatch: /rendering\.spec\.ts/,
      use: devices[device],
    })),
    // The studio is one app, not a rendering matter: one browser is enough.
    { name: 'studio', testMatch: /studio\.spec\.ts/, use: devices['Desktop Chrome'] },
  ],
})
