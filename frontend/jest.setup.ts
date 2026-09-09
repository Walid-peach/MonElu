import '@testing-library/jest-dom'

// Mock Next.js navigation hooks — components that use useRouter/useSearchParams
// require the App Router context which is not available in jsdom.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => '/',
}))

// Mock Vercel Analytics — the real package ships ESM-only and Jest's
// transformIgnorePatterns excludes node_modules, so importing it directly
// fails to parse.
jest.mock('@vercel/analytics/react', () => ({
  track: jest.fn(),
  Analytics: () => null,
}))

// jsdom does not implement matchMedia, and ThemeProvider calls it to fall back
// on the OS preference when nothing is stored (MON-168). Default to "light" so
// any suite rendering a themed component works without its own stub; suites
// that assert on the dark preference still override this in their beforeEach.
// Guarded because the node-environment suites (the pure filesystem/metadata
// checks) run this same setup file with no `window` at all.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((media: string) => ({
      matches: false,
      media,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    })),
  })
}
