import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const source = (pkg: string, entry = 'index'): string => fileURLToPath(new URL(`./packages/${pkg}/src/${entry}.ts`, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@furifont/annotate': source('annotate'),
      '@furifont/core': source('core'),
      '@furifont/compiler': source('compiler'),
      '@furifont/dictionary/okurigana': source('dictionary', 'okurigana'),
      '@furifont/dictionary': source('dictionary'),
      'furifont': source('cli'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    testTimeout: 120_000,
  },
})
