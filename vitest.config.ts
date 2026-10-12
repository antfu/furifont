import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const source = (pkg: string): string => fileURLToPath(new URL(`./packages/${pkg}/src/index.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@furifont/core': source('core'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 120_000,
  },
})
