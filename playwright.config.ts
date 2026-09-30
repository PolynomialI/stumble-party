import { defineConfig } from '@playwright/test';

/** Smoke test: boots the game server + Vite client and drives two browsers against them. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    viewport: { width: 640, height: 360 },
    // Software WebGL so the test runs on machines (and CI) without a GPU.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: [
    {
      command: 'node --import tsx server/src/index.ts',
      url: 'http://localhost:2567/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w client -- --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
