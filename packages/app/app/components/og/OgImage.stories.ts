import type { Meta, StoryObj } from '@storybook-vue/nuxt'
import OgImage from './OgImage.vue'

const meta: Meta<typeof OgImage> = {
  title: 'Og/OgImage',
  component: OgImage,
  parameters: { layout: 'fullscreen' },
}
export default meta

type Story = StoryObj<typeof OgImage>

/**
 * Screenshot `#og-image` from `?viewMode=story&id=og-ogimage--default`
 * to export the PNG.
 */
export const Default: Story = {}
