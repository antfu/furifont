import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { compileFont, readFontInfo } from '@furifont/compiler'
import { createFontPlanner, resolveOptions } from '@furifont/core'
import { loadDictionary } from '@furifont/dictionary'

export const FIXTURE_FONT = fileURLToPath(new URL('../../packages/compiler/test/fixtures/SourceHanSansJP-Subset.otf', import.meta.url))
/** The WOFF2, as the site serves its fonts. */
export const TEST_FONT = fileURLToPath(new URL('./.cache/Furifont-Test.woff2', import.meta.url))

/** A small Furifont: the full dictionary over a subset of Source Han Sans JP. */
export default async function setup(): Promise<void> {
  const { codepoints } = await readFontInfo(FIXTURE_FONT)
  const { plan } = createFontPlanner(await loadDictionary())(resolveOptions(), new Set(codepoints))
  await mkdir(fileURLToPath(new URL('./.cache', import.meta.url)), { recursive: true })
  await compileFont({ plan, base: FIXTURE_FONT, output: TEST_FONT.replace(/woff2$/, 'otf'), woff2: TEST_FONT })
}
