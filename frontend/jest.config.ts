import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    // Next aliases `server-only` inside its own compiler; Jest needs the same
    // no-op so the server modules that import it can be unit-tested.
    '^server-only$': '<rootDir>/node_modules/next/dist/compiled/server-only/empty.js',
  },
  testMatch: ['**/__tests__/**/*.test.{ts,tsx}'],
}

export default createJestConfig(config)
