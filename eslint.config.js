// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    pnpm: true,
    antislop: true,
    ignores: [
      'packages/dictionary/data/**',
      '**/test/fixtures/**',
      '**/.nuxt/**',
      '**/.output/**',
    ],
  },
)
