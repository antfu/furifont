import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const source = (pkg: string, entry = 'index'): string => fileURLToPath(new URL(`./packages/${pkg}/src/${entry}.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@furifont/core': source('core'),
      // Before its package: an alias also matches the paths under it.
      '@furifont/compiler/node': source('compiler', 'node'),
      '@furifont/compiler': source('compiler'),
      '@furifont/dictionary': source('dictionary'),
      '@furifont/helper-web': source('helper-web'),
      'furifont': source('cli'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 120_000,
  },
})
