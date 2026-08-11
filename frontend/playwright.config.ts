import { defineConfig } from '@playwright/test'

// Smoke tier (MON-241): catches the defect class jsdom cannot see — a
// display:flex nav that survives past its `hidden md:flex` breakpoint, or a
// viewport-width overflow — by rendering real pages in a real browser at the
// two viewports and both themes that shipped every regression in the
// 2026-07-17 diagnostic (MON-141/142/143/144).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Each test does 1-2 full navigations against the live production API
  // (frontend/src/lib/api.ts has no client-side retry); the default 30s
  // budget is tight for that over CI's network, especially with parallel
  // workers sharing the same endpoint.
  timeout: process.env.CI ? 60_000 : 30_000,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: 'mobile-light', use: { viewport: { width: 390, height: 844 }, colorScheme: 'light' } },
    { name: 'mobile-dark', use: { viewport: { width: 390, height: 844 }, colorScheme: 'dark' } },
    { name: 'desktop-light', use: { viewport: { width: 1280, height: 800 }, colorScheme: 'light' } },
    { name: 'desktop-dark', use: { viewport: { width: 1280, height: 800 }, colorScheme: 'dark' } },
  ],
})
