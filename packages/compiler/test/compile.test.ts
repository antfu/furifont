import type { Dictionary, Plan } from '@furifont/core'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createFontPlanner, resolveOptions } from '@furifont/core'
import * as hb from 'harfbuzzjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { checkPython, compileFont, readFontInfo } from '../src'

const BASE = fileURLToPath(new URL('./fixtures/SourceHanSansJP-Subset.otf', import.meta.url))
const VS = (n: number): string => String.fromCodePoint(0xE01E0 + n)

const dictionary: Dictionary = {
  sources: { fixture: '1' },
  onyomi: {},
  entries: [
    { form: '日本', furigana: '0:に;1:ほん', nf: 1, priority: 'news1 nf01', order: 0 },
    { form: '日本語', furigana: '0:に;1:ほん;2:ご', nf: 2, priority: 'news1 nf02', order: 0 },
    { form: '今日', furigana: '0-1:きょう', nf: 2, priority: 'ichi1', order: 0 },
    { form: '今日', furigana: '0:こん;1:にち', nf: 2, priority: 'news1 nf02', order: 1 },
    { form: '大学', furigana: '0:だい;1:がく', nf: 1, priority: 'news1 nf01', order: 0 },
    { form: '人気', furigana: '0:にん;1:き', nf: 1, priority: 'news1 nf01', order: 0 },
    { form: '大人', furigana: '0-1:おとな', nf: 3, priority: 'news1 nf03', order: 0 },
    { form: '大人気', furigana: '0:だい;1:にん;2:き', nf: 0, priority: '', order: 0 },
    { form: '桜', furigana: '0:さくら', nf: 5, priority: 'news1 nf05', order: 0 },
  ],
}

const python = await checkPython()

describe.skipIf(!python.ok)('compileFont', () => {
  let dir: string
  let plan: Plan
  let names: string[]
  let font: hb.Font

  beforeAll(async () => {
    const info = await readFontInfo(BASE)
    plan = createFontPlanner(dictionary)(resolveOptions(), new Set(info.codepoints)).plan
    dir = await mkdtemp(join(tmpdir(), 'furifont-test-'))
    await compileFont({ plan, base: BASE, output: join(dir, 'out.otf'), woff2: join(dir, 'out.woff2'), glyphNames: join(dir, 'names.json') })
    names = JSON.parse(await readFile(join(dir, 'names.json'), 'utf8'))
    font = new hb.Font(new hb.Face(new hb.Blob(await readFile(join(dir, 'out.otf')))))
  })

  afterAll(() => rm(dir, { recursive: true, force: true }))

  /**
   * Shapes `text` and describes each glyph as `bases:ruby`, or the bare character.
   * Selectors are left out: HarfBuzz hides them as zero-width glyphs once shaping is done.
   */
  function read(text: string, features: hb.Feature[] = []): string[] {
    const buffer = new hb.Buffer()
    buffer.addText(text)
    buffer.guessSegmentProperties()
    hb.shape(font, buffer, features)
    const positions = buffer.getGlyphPositions()
    const visible = buffer.getGlyphInfos().filter((_, i) => positions[i]!.xAdvance > 0)
    return visible.map(({ codepoint }) => {
      const name = names[codepoint]!
      const glyph = plan.glyphs.find(g => g.name === name)
      if (glyph)
        return `${String.fromCodePoint(...glyph.bases)}:${glyph.ruby.map(r => r.text).join('|')}`
      const cp = /^u(?:ni)?([0-9A-F]+)$/.exec(name)?.[1]
      return cp ? String.fromCodePoint(Number.parseInt(cp, 16)) : name
    })
  }

  it('annotates words, longest match first', () => {
    expect(read('日本')).toEqual(['日:に', '本:ほん'])
    expect(read('日本語')).toEqual(['日:に', '本:ほん', '語:ご'])
    expect(read('今日')).toEqual(['今日:きょう'])
  })

  it('protects a longer word from a shorter match', () => {
    expect(read('大人')).toEqual(['大人:おとな'])
    expect(read('大人気')).toEqual(['大:だい', '人:にん', '気:き'])
  })

  it('annotates a lone kanji only when it is alone in its run', () => {
    expect(read('桜')).toEqual(['桜:さくら'])
    expect(read('桜桜')).toEqual(['桜', '桜'])
  })

  it('lets variation selectors pick a reading or suppress ruby', () => {
    expect(read(`今${VS(2)}日`)).toEqual(['今:こん', '日:にち'])
    expect(read(`今${VS(1)}日`)).toEqual(['今日:きょう'])
    expect(read(`日${VS(0)}本`)).toEqual(['日', '本'])
  })

  it('turns ruby off with ss01', () => {
    const off = [new hb.Feature('ss01')]
    expect(read('日本', off)).toEqual(['日', '本'])
    expect(read('今日', off)).toEqual(['今', '日'])
    expect(read('桜', off)).toEqual(['桜'])
  })

  it('raises the ascender to fit the ruby', () => {
    const ruby = names.indexOf(plan.glyphs.find(g => g.ruby[0]?.text === 'さくら')!.name)
    const top = font.glyphExtents(ruby)!.yBearing
    expect(top).toBeGreaterThan(880)
    expect(font.hExtents().ascender).toBeGreaterThanOrEqual(top)
  })

  it('reads the base font\'s coverage', async () => {
    const info = await readFontInfo(join(dir, 'out.otf'))
    expect(info.family).toBe('Furifont Sans JP')
    expect(info.codepoints).toContain('桜'.codePointAt(0))
  })
})

describe.skipIf(!python.ok)('without the font libraries', () => {
  it('says which Python lacks them and how to install them', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'furifont-venv-'))
    try {
      execFileSync('python3', ['-m', 'venv', '--without-pip', dir])
      const error = await readFontInfo(BASE, { python: join(dir, 'bin', 'python') }).catch((e: Error) => e)
      expect(String(error)).toMatch(/^Error: brotli is not installed for \S+python\. Run: \S+python -m pip install fonttools uharfbuzz brotli, or install them into a \.venv in your project, which Furifont uses\.$/)
    }
    finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
