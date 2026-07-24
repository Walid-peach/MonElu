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
