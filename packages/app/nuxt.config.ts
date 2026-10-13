import type { NuxtConfig } from 'nuxt/schema'
import { fileURLToPath } from 'node:url'
import { addVitePlugin } from '@nuxt/kit'

/**
 * In `nuxt dev`, serve the studio's RPC from the CLI's own definition (built:
 * run `pnpm build` first), so the studio page works with hot reload. Built, the
 * app is static: the CLI serves it with the same RPC, the demo site without any.
 */
const DEV_STUDIO_BASE = '/__furifont/'

function source(pkg: string, entry = 'index'): string {
  return fileURLToPath(new URL(`../${pkg}/src/${entry}.ts`, import.meta.url))
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
    // Bundled from source: the playground writes selectors in the browser.
    '@furifont/annotate': source('annotate'),
    '@furifont/core': source('core'),
    '@furifont/dictionary/okurigana': source('dictionary', 'okurigana'),
  },
  nitro: {
    // Always plain static files in .output/public: on Vercel, Nitro would otherwise write its own output format elsewhere.
    preset: 'static',
    // The prebuilt fonts are committed at the repository root on release.
    publicAssets: [{ dir: fileURLToPath(new URL('../../fonts', import.meta.url)), baseURL: 'fonts' }],
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
