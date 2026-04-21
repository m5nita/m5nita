import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    root: __dirname,
    include: ['scenarios/**/*.test.ts'],
    globals: true,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
      },
    },
    globalSetup: ['./setup/global-setup.ts'],
    setupFiles: ['./setup/per-worker-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    reporters: ['default'],
  },
})
