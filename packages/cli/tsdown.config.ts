import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts', 'src/devframe.ts'],
  platform: 'node',
  dts: true,
  exports: true,
  publint: true,
})
