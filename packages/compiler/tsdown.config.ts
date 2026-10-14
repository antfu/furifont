import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/browser.ts', 'src/node.ts'],
  dts: true,
  exports: true,
  publint: true,
})
