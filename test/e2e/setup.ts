import type { PlanOptionsInput, PlanReport } from '@furifont/core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { compileFont, readFontInfo, toWoff2 } from '@furifont/compiler'
import { brotli, subsetWasm } from '@furifont/compiler/node'
import { createFontPlanner, resolveOptions } from '@furifont/core'
import { loadDictionary } from '@furifont/dictionary'
import { build } from 'vite'

const cache = (file: string): string => fileURLToPath(new URL(`./.cache/${file}`, import.meta.url))
const source = (pkg: string, entry = 'index'): string => fileURLToPath(new URL(`../../packages/${pkg}/src/${entry}.ts`, import.meta.url))

const fixture = (file: string): string => fileURLToPath(new URL(`../../packages/compiler/test/fixtures/${file}`, import.meta.url))
export const FIXTURE_FONT = fixture('SourceHanSansJP-Subset.otf')
/** The WOFF2, as the site serves its fonts. */
export const TEST_FONT = cache('Furifont-Test.woff2')
/** The same on a variable font of every weight. */
export const TEST_VARIABLE_FONT = cache('Furifont-TestVF.woff2')
export const TEST_OTF = cache('Furifont-Test.otf')
/** The same in romaji, which puts romaji over kana too. */
export const TEST_ROMAJI_FONT = cache('Furifont-TestRomaji.woff2')
/** The font's `.ivs.json`, which says what each `salt` value picks. */
export const TEST_READINGS = cache('Furifont-Test.ivs.json')
/** `woff2.ts` built for browsers as `woff2.js`, with its assets: it puts `toWoff2`, with the browser's Brotli, on `window`. */
export const WOFF2_PAGE = cache('woff2')

/** Small Furifonts: the full dictionary over subsets of Source Han Sans JP, static and variable. */
export default async function setup(): Promise<void> {
  const planFont = createFontPlanner(await loadDictionary())
  const compile = async (path: string, options?: PlanOptionsInput): Promise<{ font: Uint8Array, ivs: PlanReport['ivs'] }> => {
    const base = await readFile(path)
    const { plan, report } = planFont(resolveOptions(options), new Set(readFontInfo(base).codepoints))
    return { font: (await compileFont({ plan, base, subsetWasm, version: '0.0.0', date: new Date(0) })).font, ivs: report.ivs }
  }
  const [{ font, ivs }, variable, romaji] = await Promise.all([compile(FIXTURE_FONT), compile(fixture('SourceHanSansJP-VF-Subset.ttf')), compile(FIXTURE_FONT, { furiganaScript: 'hepburn' })])
  await mkdir(cache(''), { recursive: true })
  await writeFile(TEST_OTF, font)
  await writeFile(TEST_FONT, await toWoff2(font, brotli))
  await writeFile(TEST_VARIABLE_FONT, await toWoff2(variable.font, brotli))
  await writeFile(TEST_ROMAJI_FONT, await toWoff2(romaji.font, brotli))
  await writeFile(TEST_READINGS, JSON.stringify(ivs))
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
