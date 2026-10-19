import type { DictionaryEntry, DictionarySources, Plan, PlanOptionsInput } from '@furifont/core'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { brotliDecompressSync } from 'node:zlib'
import { createFontPlanner, formatNotation, fuseDictionary, resolveOptions, WORD_SOURCES } from '@furifont/core'
import * as hb from 'harfbuzzjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileFont, createRubyReader, readFontInfo, toWoff2 } from '../src'
import { brotli, subsetWasm } from '../src/node'

const fixture = (name: string): Promise<Buffer> => readFile(new URL(`./fixtures/${name}`, import.meta.url))
const VS = (n: number): string => String.fromCodePoint(0xE01E0 + n)
const VERSION = '0.1.2'
const DATE = new Date('2026-10-15T00:00:00Z')

/** An untagged run read `first` on every kanji but the last, which reads `last`. */
function run(form: string, last: string, first = 'あ'): DictionaryEntry {
  const size = [...form].length
  return { form, furigana: Array.from({ length: size }, (_, i) => `${i}:${i === size - 1 ? last : first}`).join(';'), nf: 0, priority: '', order: 0 }
}

const sources: DictionarySources = {
  versions: { fixture: '1' },
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
    // Untagged runs that make 語 a suffix, and 気 one that starts more runs than it ends.
    ...['人', '今', '大', '学', '日', '本', '桜', '気', '人人', '大大'].map(p => run(`${p}語`, 'ご')),
    ...['今', '大', '学', '日', '本', '桜', '語', '人人', '大大'].map(p => run(`${p}気`, 'き')),
    ...['人', '今', '大', '学', '日', '本', '桜', '人人', '大大', '日本', '本日'].map(p => run(`気${p}`, 'あ', 'き')),
  ],
  places: [],
  manual: {},
  defaults: [],
  bare: [],
}
const planFont = createFontPlanner(fuseDictionary(sources))

interface Built {
  plan: Plan
  /** The readings of each kanji, in the order selectors and `salt` count them. */
  readings: Record<string, string[]>
  names: string[]
  otf: Uint8Array
  font: hb.Font
}

async function build(file: string, previewText?: string, options?: PlanOptionsInput): Promise<Built> {
  const base = await fixture(file)
  const { plan, report } = planFont(resolveOptions({ sources: WORD_SOURCES.filter(s => s !== 'jmdict'), ...options }), new Set(readFontInfo(base).codepoints), previewText)
  const { font, glyphNames } = await compileFont({ plan, base, subsetWasm, version: VERSION, date: DATE })
  return { plan, readings: report.ivs.kanji, names: glyphNames, otf: font, font: new hb.Font(new hb.Face(new hb.Blob(font))) }
}

/**
 * Shapes `text` and describes each glyph as `bases:ruby`, or the bare character.
 * Selectors are left out: HarfBuzz hides them as zero-width glyphs once shaping is done.
 */
function read({ plan, names, font }: Built, text: string, features: hb.Feature[] = []): string[] {
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

/** `text` in inline notation with the ruby HarfBuzz shapes over it. */
function shapedNotation({ plan, names, font }: Built, text: string): string {
  const buffer = new hb.Buffer()
  buffer.addText(text)
  buffer.guessSegmentProperties()
  hb.shape(font, buffer)
  let at = 0
  const spans = buffer.getGlyphInfos().flatMap(({ codepoint }) => {
    const glyph = plan.glyphs.find(g => g.name === names[codepoint])
    const start = at
    at += glyph?.bases.length ?? 1
    return glyph?.ruby.map(r => ({ start: start + r.start, end: start + r.end, ruby: r.text })) ?? []
  })
  return formatNotation(text, spans)
}

/** The decompressed table data of a WOFF2, past its table directory. */
function woff2Stream(woff2: Buffer): Buffer {
  let at = 48
  for (let i = 0; i < woff2.readUInt16BE(12); i++) {
    const arbitraryTag = (woff2[at++]! & 0x3F) === 63
    at += arbitraryTag ? 4 : 0
    let more = true
    while (more)
      more = (woff2[at++]! & 0x80) !== 0
  }
  return brotliDecompressSync(woff2.subarray(at, at + woff2.readUInt32BE(20)))
}

describe.each([
  ['CID-keyed CFF', 'SourceHanSansJP-Subset.otf', 'Regular'],
  ['name-keyed CFF without GSUB', 'FixtureJP-NameKeyed.otf', 'Regular'],
  ['TrueType without GSUB', 'FixtureJP-TrueType.ttf', 'Regular'],
  // A variable font's names describe its default instance.
  ['variable TrueType', 'SourceHanSansJP-VF-Subset.ttf', 'ExtraLight'],
])('compileFont on %s', (_, file, style) => {
  let built: Built

  beforeAll(async () => {
    built = await build(file)
  })

  it('annotates words, longest match first', () => {
    expect(read(built, '日本')).toEqual(['日:に', '本:ほん'])
    expect(read(built, '日本語')).toEqual(['日:に', '本:ほん', '語:ご'])
    expect(read(built, '今日')).toEqual(['今日:きょう'])
  })

  it('protects a longer word from a shorter match', () => {
    expect(read(built, '大人')).toEqual(['大人:おとな'])
    expect(read(built, '大人気')).toEqual(['大:だい', '人:にん', '気:き'])
  })

  it('annotates a lone kanji only when it is alone in its run', () => {
    expect(read(built, '桜')).toEqual(['桜:さくら'])
    expect(read(built, '桜桜')).toEqual(['桜', '桜'])
  })

  it('reads a kanji no word claims after another kanji as a suffix, at the end of a run or before another kanji', () => {
    expect(read(built, '大学語')).toEqual(['大:だい', '学:がく', '語:ご'])
    expect(read(built, '大学語桜')).toEqual(['大:だい', '学:がく', '語:ご', '桜'])
    expect(read(built, '語')).toEqual(['語'])
    expect(read(built, '大学気')).toEqual(['大:だい', '学:がく', '気:き'])
    expect(read(built, '大学気桜')).toEqual(['大:だい', '学:がく', '気', '桜'])
  })

  it('lets variation selectors pick a reading or suppress ruby', () => {
    expect(read(built, `今${VS(2)}日`)).toEqual(['今:こん', '日:にち'])
    expect(read(built, `今${VS(1)}日`)).toEqual(['今日:きょう'])
    expect(read(built, `日${VS(0)}本`)).toEqual(['日', '本'])
  })

  it('lets salt pick a reading of a kanji alone, as markup can where the text cannot', () => {
    const { readings } = built
    for (const [kanji, list] of Object.entries(readings).filter(([, l]) => l.length > 1)) {
      list.forEach((reading, i) => expect(read(built, kanji, [new hb.Feature('salt', i + 1)])).toEqual([`${kanji}:${reading}`]))
    }
    expect(read(built, '日', [new hb.Feature('salt', 0)])).toEqual(['日'])
    expect(read(built, '桜', [new hb.Feature('salt', 1)])).toEqual(['桜:さくら'])
  })

  it('lets salt n on a run act as selector n after its first kanji', () => {
    // Words too: 今日 is きょう, or こん and にち with the second reading. 日日 shows the gate: only the first kanji of a run takes salt.
    for (const text of ['今日', '日本', '日本語', '大学', '桜', '日日', '日本日']) {
      for (const n of [1, 2, 3]) {
        const [first, ...rest] = [...text]
        expect(read(built, text, [new hb.Feature('salt', n)]), `${text} salt ${n}`).toEqual(read(built, `${first}${VS(n)}${rest.join('')}`))
      }
    }
    expect(read(built, '今日', [new hb.Feature('salt', 2)])).toEqual(['今:こん', '日:にち'])
    expect(read(built, '日日', [new hb.Feature('salt', 2)])).toEqual(['日:にち', '日'])
  })

  it('shapes every run of up to four of its kanji as the ruby reader predicts', () => {
    const kanji = [...new Set(sources.entries.flatMap(e => [...e.form]))]
    let texts = ['']
    const all: string[] = []
    for (let n = 1; n <= 4; n++)
      all.push(...texts = texts.flatMap(t => kanji.map(k => t + k)))
    const reader = createRubyReader(built.plan)
    expect(all.map(t => formatNotation(t, reader(t)))).toEqual(all.map(t => shapedNotation(built, t)))
  })

  it('turns ruby off with ss01', () => {
    const off = [new hb.Feature('ss01')]
    expect(read(built, '日本', off)).toEqual(['日', '本'])
    expect(read(built, '今日', off)).toEqual(['今', '日'])
    expect(read(built, '桜', off)).toEqual(['桜'])
  })

  it('draws the ruby above the em box and raises the ascender to fit it', () => {
    const { plan, names, font } = built
    const ruby = names.indexOf(plan.glyphs.find(g => g.ruby[0]?.text === 'さくら')!.name)
    const sakura = font.glyphExtents(ruby)!
    expect(sakura.yBearing).toBeGreaterThan(880)
    // Centered over its kanji: a long reading may overhang it, up to maxRubyWidth.
    expect(sakura.xBearing + sakura.width / 2).toBeCloseTo(font.glyphHAdvance(ruby) / 2, -1)
    expect(sakura.width).toBeLessThanOrEqual(plan.metrics.maxRubyWidth * font.glyphHAdvance(ruby) + 1)
    expect(font.glyphHAdvance(ruby)).toBe(font.glyphHAdvance(font.nominalGlyph('桜'.codePointAt(0)!)!))
    expect(font.hExtents().ascender).toBeGreaterThanOrEqual(sakura.yBearing)
  })

  it('names the font after the plan', () => {
    const info = readFontInfo(built.otf)
    expect(info).toMatchObject({ family: 'Furifont Sans', style, glyphCount: built.names.length })
    expect(info.codepoints).toContain('桜'.codePointAt(0))
  })

  it('wraps the same tables as WOFF2', async () => {
    const otf = Buffer.from(built.otf)
    const woff2 = Buffer.from(await toWoff2(built.otf, brotli))
    const tables = Array.from({ length: otf.readUInt16BE(4) }, (_, i) => {
      const offset = otf.readUInt32BE(12 + i * 16 + 8)
      return otf.subarray(offset, offset + otf.readUInt32BE(12 + i * 16 + 12))
    })
    expect(woff2.subarray(0, 4).toString()).toBe('wOF2')
    expect(woff2Stream(woff2).equals(Buffer.concat(tables))).toBe(true)
  })

  it('carries its version and date, so the same build gives the same bytes', async () => {
    const face = new hb.Face(new hb.Blob(built.otf))
    const head = Buffer.from(face.referenceTable('head')!)
    expect(head.readInt32BE(4) / 0x10000).toBeCloseTo(0.102, 3)
    expect(new Date((Number(head.readBigUInt64BE(28)) - 2082844800) * 1000)).toEqual(DATE)
    expect(face.getName(5, 'en')).toBe('Version 0.102')
    expect(face.getName(3, 'en')).toMatch(/^0\.102;/)
    expect(Buffer.from((await build(file)).otf).equals(Buffer.from(built.otf))).toBe(true)
  })

  it('draws 。 and VS1 as an empty glyph whose width tells pages its version', () => {
    const buffer = new hb.Buffer()
    buffer.addText('。\uFE00')
    buffer.guessSegmentProperties()
    hb.shape(built.font, buffer)
    const [glyph] = buffer.getGlyphInfos()
    expect(buffer.getGlyphPositions().map(p => p.xAdvance)).toEqual([2102])
    expect(built.font.glyphToPath(glyph!.codepoint)).toBe('')
  })

  it('leaves the base font it was given as it was, even as a Buffer', async () => {
    const base = await fixture(file)
    const original = Buffer.from(base)
    await compileFont({ plan: built.plan, base, subsetWasm, version: VERSION, date: DATE })
    expect(base.equals(original)).toBe(true)
  })
})

describe.each(['SourceHanSansJP-Subset.otf', 'SourceHanSansJP-VF-Subset.ttf'])('romaji over kana on %s', (file) => {
  let built: Built

  beforeAll(async () => {
    built = await build(file, undefined, { furiganaScript: 'hepburn' })
  })

  it('annotates kana a syllable at a time, っ by the consonant it doubles', () => {
    expect(read(built, 'きょう')).toEqual(['きょ:kyo', 'う:u'])
    expect(read(built, 'がっこう')).toEqual(['が:ga', 'っ:k', 'こ:ko', 'う:u'])
    expect(read(built, 'コンヒ')).toEqual(['コ:ko', 'ン:n', 'ヒ:hi'])
  })

  it('turns romaji off with ss01, with the option, and with kanji ruby in kana', async () => {
    expect(read(built, 'きょう', [new hb.Feature('ss01')])).toEqual(['き', 'ょ', 'う'])
    // Kana no rule names keep the base font's glyph names: `read` shows those.
    const annotated = async (options: PlanOptionsInput) => read(await build(file, undefined, options), 'きょう').filter(g => g.includes(':'))
    expect(await annotated({ furiganaScript: 'hepburn', kanaRomaji: false })).toEqual([])
    expect(await annotated({ furiganaScript: 'hiragana' })).toEqual([])
  })

  it('leaves the kanji\'s rules alone', () => {
    expect(read(built, '今日')).toEqual(['今日:kyō'])
  })
})

describe('a live preview', () => {
  const preview = (text: string): Promise<Built> => build('SourceHanSansJP-Subset.otf', text)

  it('subsets the base font to what the text needs', async () => {
    const built = await preview('今日は桜')
    expect(read(built, '今日')).toEqual(['今日:きょう'])
    expect(read(built, '桜')).toEqual(['桜:さくら'])
    expect(built.names.length).toBeLessThan(100)
  })

  it('compiles a text that has only lone kanji', async () => {
    expect(read(await preview('桜'), '桜')).toEqual(['桜:さくら'])
  })
})

describe('a variable base font', () => {
  const FILE = 'SourceHanSansJP-VF-Subset.ttf'
  const EM_TOP = 880

  /** The ruby's ink, the points above the em box, at a weight: `[xMin, xMax]`. */
  function rubyInk({ otf }: Built, glyph: number, weight: number): [number, number] {
    const font = new hb.Font(new hb.Face(new hb.Blob(otf)))
    font.setVariations([new hb.Variation('wght', weight)])
    const xs = font.glyphToJson(glyph).flatMap(({ values }) => values.filter((_, i) => i % 2 === 0 && values[i + 1]! > EM_TOP))
    return [Math.min(...xs), Math.max(...xs)]
  }

  const glyphOf = ({ plan, names }: Built, ruby: string): number => names.indexOf(plan.glyphs.find(g => g.ruby[0]?.text === ruby)!.name)

  it('draws the ruby at every weight', async () => {
    const built = await build(FILE)
    const sakura = glyphOf(built, 'さくら')
    const [light, heavy] = [250, 900].map((weight) => {
      const font = new hb.Font(new hb.Face(new hb.Blob(built.otf)))
      font.setVariations([new hb.Variation('wght', weight)])
      return font.glyphToPath(sakura)
    })
    expect(light).not.toBe(heavy)
  })

  it('keeps romaji centred over its kanji as the letters widen with the weight', async () => {
    const built = await build(FILE, undefined, { furiganaScript: 'hepburn' })
    const sakura = glyphOf(built, 'sakura')
    const centre = (weight: number): number => rubyInk(built, sakura, weight).reduce((a, b) => a + b) / 2
    expect(Math.abs(centre(900) - centre(250))).toBeLessThan(4)
    const width = (weight: number): number => rubyInk(built, sakura, weight).reduce((a, b) => b - a)
    expect(width(900)).toBeGreaterThan(width(250))
  })

  it('names its instances after the new family', async () => {
    const { otf } = await build(FILE)
    const face = new hb.Face(new hb.Blob(otf))
    const names = face.listNames().map(({ nameId, language }) => face.getName(nameId, language))
    expect(names).toContain('FurifontSans-Bold')
    expect(names.filter(n => /SourceHan/.test(n))).toEqual([])
  })
})
