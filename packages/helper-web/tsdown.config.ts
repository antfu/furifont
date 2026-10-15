import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: ['src/index.ts'],
    dts: true,
    exports: { customExports: { './iife': './dist/index.iife.js' } },
    publint: true,
  },
  {
    // One script with core's constants inside it, for the bookmarklet and the userscript to inline: it puts the API on `Furifont`.
    entry: ['src/index.ts'],
    format: 'iife',
    globalName: 'Furifont',
    minify: true,
    platform: 'browser',
    deps: { alwaysBundle: ['@furifont/core'] },
  },
])
