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
      '**/test/fixtures/**',
      '**/.nuxt/**',
      '**/.output/**',
      'packages/app/public/fonts/**',
      '**/*.css',
    ],
  },
  {
    // Browsers run these packages too. Node's APIs belong to the CLI, which passes in @furifont/compiler/node's.
    files: ['packages/{core,compiler,dictionary,helper-web}/src/**'],
    ignores: ['packages/compiler/src/node.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['node:*'], message: 'Keep core, compiler, dictionary and helper-web browser-safe: do the Node side in the CLI or @furifont/compiler/node.' }] }],
    },
  },
  {
    // The app is not a library: its composables' return types are inferred.
    files: ['packages/app/**'],
    rules: {
      'ts/explicit-function-return-type': 'off',
    },
  },
)
