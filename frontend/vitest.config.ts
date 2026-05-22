import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
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
