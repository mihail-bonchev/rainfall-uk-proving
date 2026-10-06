import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      // Default 5s is too tight for fake-IndexedDB-heavy tests on a loaded machine.
      testTimeout: 15_000,
      // Placeholders so the suite never depends on (or hits) a real Supabase;
      // CI has no .env, and supabaseClient throws on an empty URL at import.
      env: {
        VITE_SUPABASE_URL: 'http://localhost:54321',
        VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      },
      exclude: ['**/node_modules/**', '**/e2e/**', '**/smoke/**', '**/*.smoke.test.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'node_modules/',
          'src/test/**',
          'src/smoke/**',
          '**/*.smoke.test.ts',
          'src/main.tsx',
          'src/types/**',
          '**/*.d.ts',
          'e2e/**',
          '**/*.config.{js,ts}',
          '**/dist/**',
        ],
        thresholds: {
          statements: 80,
          branches: 80,
          functions: 80,
          lines: 80,
        },
      },
    },
  }),
)
