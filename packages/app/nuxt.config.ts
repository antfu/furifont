import type { NuxtConfig } from 'nuxt/schema'
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

/** The demo site's address, which link previews need in full (`SITE` in the shared utils, which a config cannot import). */
const SITE = 'https://furifont.antfu.me'
const TITLE = 'Furifont: furigana built into the font'
const DESCRIPTION = 'A Japanese font that shows furigana by itself.'
const PREVIEW = `${SITE}/og.png`

export default defineNuxtConfig({
  ssr: false,
  css: ['~/assets/css/tokens.css'],
  modules: ['@unocss/nuxt', studioBridge],
  alias: {
    // Types only: the studio's wire contract lives with its implementation.
    'furifont': source('cli'),
    // Bundled from source: the demo's grid follows the default metrics.
    '@furifont/core': source('core'),
  },
  nitro: {
    // Always plain static files in .output/public: on Vercel, Nitro would otherwise write its own output format elsewhere.
    preset: 'static',
    // The prebuilt fonts are committed at the repository root on release.
    publicAssets: [{ dir: fileURLToPath(new URL('../../fonts', import.meta.url)), baseURL: 'fonts' }],
    // Only the okurigana pairs, which `dict:update` packs the way pages read them: the rest of the data is megabytes.
    serverAssets: [{ baseName: 'dictionary', dir: fileURLToPath(new URL('../dictionary/data', import.meta.url)), pattern: 'okurigana.json' }],
    prerender: { routes: ['/furifont.user.js', '/okurigana.json'] },
  },
  app: {
    head: {
      title: TITLE,
      htmlAttrs: { lang: 'en' },
      meta: [
        { name: 'description', content: DESCRIPTION },
        { property: 'og:type', content: 'website' },
        { property: 'og:url', content: SITE },
        { property: 'og:title', content: TITLE },
        { property: 'og:description', content: DESCRIPTION },
        { property: 'og:image', content: PREVIEW },
        { property: 'og:image:width', content: '2400' },
        { property: 'og:image:height', content: '1260' },
        { property: 'og:image:alt', content: TITLE },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: TITLE },
        { name: 'twitter:description', content: DESCRIPTION },
        { name: 'twitter:image', content: PREVIEW },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: 'favicon.svg' }],
    },
  },
  runtimeConfig: {
    public: { devCustomizeBase: DEV_STUDIO_BASE },
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
