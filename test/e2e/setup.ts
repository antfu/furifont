import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { compileFont, readFontInfo, toWoff2 } from '@furifont/compiler'
import { brotli, subsetWasm } from '@furifont/compiler/node'
import { createFontPlanner, resolveOptions } from '@furifont/core'
import { loadDictionary } from '@furifont/dictionary'

export const FIXTURE_FONT = fileURLToPath(new URL('../../packages/compiler/test/fixtures/SourceHanSansJP-Subset.otf', import.meta.url))
/** The WOFF2, as the site serves its fonts. */
export const TEST_FONT = fileURLToPath(new URL('./.cache/Furifont-Test.woff2', import.meta.url))

/** A small Furifont: the full dictionary over a subset of Source Han Sans JP. */
export default async function setup(): Promise<void> {
  const base = await readFile(FIXTURE_FONT)
  const { plan } = createFontPlanner(await loadDictionary())(resolveOptions(), new Set(readFontInfo(base).codepoints))
  const { font } = await compileFont({ plan, base, subsetWasm })
  await mkdir(fileURLToPath(new URL('./.cache', import.meta.url)), { recursive: true })
  await writeFile(TEST_FONT, await toWoff2(font, brotli))
}
