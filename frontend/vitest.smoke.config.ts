import { defineConfig } from 'vitest/config'

// Separate config for smoke tests that hit the REAL EA API.
// Do NOT import vite config — no jsdom, no MSW setup, no fake-indexeddb.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/smoke/**/*.smoke.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
