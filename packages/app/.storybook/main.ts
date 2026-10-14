import type { StorybookConfig } from '@storybook-vue/nuxt'

const config: StorybookConfig = {
  stories: ['../app/components/**/*.stories.ts'],
  framework: '@storybook-vue/nuxt',
  // The prebuilt fonts are committed at the repository root, as the site serves them.
  staticDirs: ['../public', { from: '../../../fonts', to: '/fonts' }],
}

export default config
