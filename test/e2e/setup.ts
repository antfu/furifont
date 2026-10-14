import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { compileFont, readFontInfo, toWoff2 } from '@furifont/compiler'
import { brotli, subsetWasm } from '@furifont/compiler/node'
import { createFontPlanner, resolveOptions } from '@furifont/core'
import { loadDictionary } from '@furifont/dictionary'
import { build } from 'vite'

const cache = (file: string): string => fileURLToPath(new URL(`./.cache/${file}`, import.meta.url))
const source = (pkg: string, entry = 'index'): string => fileURLToPath(new URL(`../../packages/${pkg}/src/${entry}.ts`, import.meta.url))

export const FIXTURE_FONT = fileURLToPath(new URL('../../packages/compiler/test/fixtures/SourceHanSansJP-Subset.otf', import.meta.url))
/** The WOFF2, as the site serves its fonts. */
export const TEST_FONT = cache('Furifont-Test.woff2')
export const TEST_OTF = cache('Furifont-Test.otf')
/** The font's `.ivs.json`, which says what each `salt` value picks. */
export const TEST_READINGS = cache('Furifont-Test.ivs.json')
/** `woff2.ts` built for browsers as `woff2.js`, with its assets: it puts `toWoff2`, with the browser's Brotli, on `window`. */
export const WOFF2_PAGE = cache('woff2')

/** A small Furifont: the full dictionary over a subset of Source Han Sans JP. */
export default async function setup(): Promise<void> {
  const base = await readFile(FIXTURE_FONT)
  const { plan, report } = createFontPlanner(await loadDictionary())(resolveOptions(), new Set(readFontInfo(base).codepoints))
  const { font } = await compileFont({ plan, base, subsetWasm })
  await mkdir(cache(''), { recursive: true })
  await writeFile(TEST_OTF, font)
  await writeFile(TEST_FONT, await toWoff2(font, brotli))
  await writeFile(TEST_READINGS, JSON.stringify(report.ivs))
  await build({
    configFile: false,
    root: fileURLToPath(new URL('.', import.meta.url)),
    logLevel: 'error',
    resolve: {
      alias: {
        '@furifont/core': source('core'),
        // Before its package: an alias also matches the paths under it.
        '@furifont/compiler/browser': source('compiler', 'browser'),
        '@furifont/compiler': source('compiler'),
      },
    },
    build: {
      outDir: WOFF2_PAGE,
      emptyOutDir: true,
      rolldownOptions: { input: fileURLToPath(new URL('./woff2.ts', import.meta.url)), output: { entryFileNames: 'woff2.js' } },
    },
  })
}
