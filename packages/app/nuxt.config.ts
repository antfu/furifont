import type { NuxtConfig } from 'nuxt/schema'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { addVitePlugin } from '@nuxt/kit'

/**
 * In `nuxt dev`, serve the studio's RPC from the CLI's own definition (built:
 * run `pnpm build` first), so the studio page works with hot reload. Built, the
 * app is static: the CLI serves it with the same RPC, the demo site without any.
 */
const DEV_STUDIO_BASE = '/__furifont/'

function source(pkg: string): string {
  return fileURLToPath(new URL(`../${pkg}/src/index.ts`, import.meta.url))
}

const studioBridge: NonNullable<NuxtConfig['modules']>[number] = async (_, nuxt) => {
  if (!nuxt.options.dev)
    return
  const [{ devframeViteBridge }, { default: devframe }] = await Promise.all([
    import('@devframes/vite/single'),
    import('furifont/devframe'),
  ])
  // Its own mount: the bridge answers every request under its base.
  addVitePlugin(devframeViteBridge(devframe, { base: DEV_STUDIO_BASE, auth: false }))
}

export default defineNuxtConfig({
  ssr: false,
  css: ['~/assets/css/tokens.css'],
  modules: ['@unocss/nuxt', studioBridge],
  alias: {
    // Types only: the studio's wire contract lives with its implementation.
    'furifont': source('cli'),
    // Bundled from source: the playground writes verb selectors in the browser.
    '@furifont/annotate': source('annotate'),
    '@furifont/core': source('core'),
  },
  nitro: {
    // kuromoji's dictionary, fetched once when the playground first annotates.
    publicAssets: [{ dir: join(dirname(createRequire(import.meta.url).resolve('@patdx/kuromoji')), '../dict'), baseURL: 'kuromoji' }],
  },
  router: {
    options: { hashMode: true },
  },
  app: {
    head: {
      title: 'Furifont: furigana built into the font',
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: 'A Japanese font that shows furigana by itself, without changing the text.' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: 'favicon.svg' }],
    },
  },
  runtimeConfig: {
    public: { devStudioBase: DEV_STUDIO_BASE },
  },
  vite: {
    // vue-i18n's bundler build: Composition API only, no legacy mode.
    define: {
      __VUE_I18N_FULL_INSTALL__: true,
      __VUE_I18N_LEGACY_API__: false,
      __INTLIFY_PROD_DEVTOOLS__: false,
    },
  },
  devtools: { enabled: false },
  compatibilityDate: '2026-10-01',
})
