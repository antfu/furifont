// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    vue: true,
    pnpm: true,
    antislop: true,
    ignores: [
      'packages/dictionary/data/**',
      'fonts/**',
      '**/test/fixtures/**',
      '**/.nuxt/**',
      '**/.output/**',
      'packages/app/public/fonts/**',
      '**/*.css',
    ],
  },
  {
    // The app is not a library: its composables' return types are inferred.
    files: ['packages/app/**'],
    rules: {
      'ts/explicit-function-return-type': 'off',
    },
  },
)
