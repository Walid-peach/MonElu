import '@testing-library/jest-dom'

// Mock Next.js navigation hooks — components that use useRouter/useSearchParams
// require the App Router context which is not available in jsdom.
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => '/',
}))
