import type { Plan, PlanReport } from '@furifont/core'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkPython, compileFont, readFontInfo } from '@furifont/compiler'
import { createFontPlanner, resolveOptions, SELECTOR_FIRST_READING, SELECTOR_SUPPRESS } from '@furifont/core'
import { loadDictionary } from '@furifont/dictionary'
import { OKURIGANA } from '@furifont/dictionary/okurigana'
import * as hb from 'harfbuzzjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAnnotator } from '../src'

const BASE = fileURLToPath(new URL('../../compiler/test/fixtures/SourceHanSansJP-Subset.otf', import.meta.url))
const SELECTORS = /[\u{E01E0}-\u{E01EF}]/gu

const dictionary = await loadDictionary()
const planFont = createFontPlanner(dictionary)

/** What the selector written after `kanji` does: its reading, `bare` for VS225, undefined for none. */
function readingAfter(text: string, kanji: string, reference: PlanReport['ivs']): string | undefined {
  const chars = [...text]
  const cp = chars[chars.indexOf(kanji) + 1]?.codePointAt(0) ?? 0
  if (cp === SELECTOR_SUPPRESS)
    return 'bare'
  return reference.kanji[kanji]?.[cp - SELECTOR_FIRST_READING]
}

describe('createAnnotator', () => {
  const coverage = new Set(dictionary.entries.flatMap(e => [...e.form, ...e.furigana]).map(c => c.codePointAt(0)!))
  const { ivs } = planFont(resolveOptions(), coverage).report
  const annotate = createAnnotator(OKURIGANA, ivs)

  it.each([
    ['来る', '来', 'く'],
    ['来ない', '来', 'こ'],
    ['来ます', '来', 'き'],
    ['奉り', '奉', 'たてまつ'],
    ['行かない', '行', 'い'],
    ['行います', '行', 'おこな'],
    ['書いて', '書', 'か'],
    ['読み', '読', 'よ'],
  ])('reads %s as a pair', (text, kanji, reading) => {
    expect(readingAfter(annotate(text), kanji, ivs)).toBe(reading)
  })

  it('writes nothing where the font already shows the reading', () => {
    expect(ivs.lone['見']).toBe('み')
    expect(annotate('見る')).toBe('見る')
    expect(annotate('出来る')).toBe('出来る')
  })

  it('leaves a pair that reads two ways bare', () => {
    expect(ivs.lone['入']).toBe('い')
    expect(readingAfter(annotate('入る'), '入', ivs)).toBe('bare')
    expect(annotate('行って')).toBe('行って')
  })

  it('changes nothing but selectors, and can run again', () => {
    const text = '明日は来ますか。\n来なければ、行きます。'
    const annotated = annotate(text)
    expect(annotated.replace(SELECTORS, '')).toBe(text)
    expect(annotate(annotated)).toBe(annotated)
  })
})

describe.skipIf(!(await checkPython()).ok)('with a font', () => {
  let dir: string
  let plan: Plan
  let reference: PlanReport['ivs']
  let names: string[]
  let font: hb.Font

  beforeAll(async () => {
    const { codepoints } = await readFontInfo(BASE)
    const result = planFont(resolveOptions(), new Set(codepoints))
    plan = result.plan
    reference = result.report.ivs
    dir = await mkdtemp(join(tmpdir(), 'furifont-annotate-'))
    await compileFont({ plan, base: BASE, output: join(dir, 'font.otf'), glyphNames: join(dir, 'names.json') })
    names = JSON.parse(await readFile(join(dir, 'names.json'), 'utf8'))
    font = new hb.Font(new hb.Face(new hb.Blob(await readFile(join(dir, 'font.otf')))))
  })

  afterAll(() => rm(dir, { recursive: true, force: true }))

  /** The ruby glyphs `text` shapes to, as `base:ruby`. */
  function rubyOf(text: string): string[] {
    const buffer = new hb.Buffer()
    buffer.addText(text)
    buffer.guessSegmentProperties()
    hb.shape(font, buffer)
    return buffer.getGlyphInfos().flatMap(({ codepoint }) => {
      const glyph = plan.glyphs.find(g => g.name === names[codepoint])
      return glyph ? [`${String.fromCodePoint(...glyph.bases)}:${glyph.ruby.map(r => r.text).join('|')}`] : []
    })
  }

  it('draws the reading the pair decides', () => {
    const annotate = createAnnotator(OKURIGANA, reference)
    expect(rubyOf(annotate('来ない'))).toEqual(['来:こ'])
    expect(rubyOf(annotate('来ます'))).toEqual(['来:き'])
    expect(rubyOf(annotate('来る'))).toEqual(['来:く'])
    expect(rubyOf(annotate('出来る'))).toEqual(['出:で', '来:き'])
    expect(rubyOf('来ない')).toEqual([])
  })
})
