import type { NuxtConfig } from 'nuxt/schema'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { addVitePlugin } from '@nuxt/kit'
import { version } from '../../package.json'

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

/** `FURIFONT_TARGET=devframe` builds the app `furifont dev` serves, into the CLI: the site without its docs. */
const DEVFRAME = process.env.FURIFONT_TARGET === 'devframe'

export default defineNuxtConfig({
  ssr: false,
  css: ['~/assets/css/tokens.css'],
  modules: [...DEVFRAME ? [] : ['@comark/nuxt'], '@unocss/nuxt', studioBridge],
  hooks: {
    'pages:extend': (pages) => {
      if (DEVFRAME)
        pages.splice(0, pages.length, ...pages.filter(page => !page.path.startsWith('/docs')))
    },
  },
  alias: {
    // Types only: the studio's wire contract lives with its implementation.
    'furifont': source('cli'),
    // Bundled from source: the demo's grid follows the default metrics.
    '@furifont/core': source('core'),
  },
  nitro: {
    // The studio is plain static files in the CLI's client; the site is a server, for the report endpoint (Vercel's preset on Vercel).
    preset: DEVFRAME ? 'static' : undefined,
    // The devframe's own output directory, so it never clobbers the site's.
    output: DEVFRAME
      ? { dir: '.output-devframe', publicDir: fileURLToPath(new URL('../cli/dist/client', import.meta.url)) }
      // Vercel reads the Build Output from the repository root, not from this package.
      : process.env.VERCEL ? { dir: fileURLToPath(new URL('../../.vercel/output', import.meta.url)) } : undefined,
    // The prebuilt fonts of this version's release, as `scripts/fetch-fonts.ts` downloads them; the studio serves the ones you build.
    publicAssets: DEVFRAME ? [] : [{ dir: fileURLToPath(new URL(`../../.cache/fonts/v${version}`, import.meta.url)), baseURL: 'fonts' }],
    // Only the okurigana pairs, which `dict:update` packs the way pages read them: the rest of the data is megabytes.
    serverAssets: [
      { baseName: 'dictionary', dir: fileURLToPath(new URL('../dictionary/data', import.meta.url)), pattern: 'okurigana.json' },
      // The engine the userscript inlines, as @furifont/helper-web builds it.
      { baseName: 'helper-web', dir: fileURLToPath(new URL('../helper-web/dist', import.meta.url)), pattern: 'index.iife.js' },
    ],
    prerender: { routes: ['/furifont.user.js', '/okurigana.json', '/version.json'] },
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
      // Declared in `app/flags.d.ts`.
      __TARGET_WEBSITE__: !DEVFRAME,
      __TARGET_DEVFRAME__: DEVFRAME,
    },
  },
  devtools: { enabled: false },
  compatibilityDate: '2026-10-01',
})
