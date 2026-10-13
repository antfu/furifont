import type { Dictionary, Plan } from '@furifont/core'
import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliDecompressSync } from 'node:zlib'
import { createFontPlanner, resolveOptions } from '@furifont/core'
import * as hb from 'harfbuzzjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { compileFont, readFontInfo } from '../src'

const fixture = (name: string): string => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
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
const planFont = createFontPlanner(dictionary)

interface Built {
  plan: Plan
  names: string[]
  font: hb.Font
  dir: string
}

async function build(base: string, previewText?: string): Promise<Built> {
  const info = await readFontInfo(base)
  const plan = planFont(resolveOptions(), new Set(info.codepoints), previewText).plan
  const dir = await mkdtemp(join(tmpdir(), 'furifont-test-'))
  await compileFont({ plan, base, output: join(dir, 'out.otf'), woff2: join(dir, 'out.woff2'), glyphNames: join(dir, 'names.json') })
  const names = JSON.parse(await readFile(join(dir, 'names.json'), 'utf8'))
  const font = new hb.Font(new hb.Face(new hb.Blob(await readFile(join(dir, 'out.otf')))))
  return { plan, names, font, dir }
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
  ['CID-keyed CFF', 'SourceHanSansJP-Subset.otf'],
  ['name-keyed CFF without GSUB', 'FixtureJP-NameKeyed.otf'],
  ['TrueType without GSUB', 'FixtureJP-TrueType.ttf'],
])('compileFont on %s', (_, file) => {
  let built: Built

  beforeAll(async () => {
    built = await build(fixture(file))
  })

  afterAll(() => rm(built.dir, { recursive: true, force: true }))

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

  it('lets variation selectors pick a reading or suppress ruby', () => {
    expect(read(built, `今${VS(2)}日`)).toEqual(['今:こん', '日:にち'])
    expect(read(built, `今${VS(1)}日`)).toEqual(['今日:きょう'])
    expect(read(built, `日${VS(0)}本`)).toEqual(['日', '本'])
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
    const kanji = font.glyphExtents(font.nominalGlyph('桜'.codePointAt(0)!)!)!
    expect(sakura.yBearing).toBeGreaterThan(880)
    expect(sakura.xBearing).toBeGreaterThanOrEqual(kanji.xBearing)
    expect(font.glyphHAdvance(ruby)).toBe(font.glyphHAdvance(font.nominalGlyph('桜'.codePointAt(0)!)!))
    expect(font.hExtents().ascender).toBeGreaterThanOrEqual(sakura.yBearing)
  })

  it('names the font after the plan', async () => {
    const info = await readFontInfo(join(built.dir, 'out.otf'))
    expect(info).toMatchObject({ family: 'Furifont Sans', style: 'Regular', glyphCount: built.names.length })
    expect(info.codepoints).toContain('桜'.codePointAt(0))
  })

  it('wraps the same tables as WOFF2', async () => {
    const otf = await readFile(join(built.dir, 'out.otf'))
    const woff2 = await readFile(join(built.dir, 'out.woff2'))
    const tables = Array.from({ length: otf.readUInt16BE(4) }, (_, i) => {
      const offset = otf.readUInt32BE(12 + i * 16 + 8)
      return otf.subarray(offset, offset + otf.readUInt32BE(12 + i * 16 + 12))
    })
    expect(woff2.subarray(0, 4).toString()).toBe('wOF2')
    expect(woff2Stream(woff2).equals(Buffer.concat(tables))).toBe(true)
  })
})

describe('a live preview', () => {
  const dirs: string[] = []
  async function preview(text: string): Promise<Built> {
    const built = await build(fixture('SourceHanSansJP-Subset.otf'), text)
    dirs.push(built.dir)
    return built
  }

  afterAll(() => Promise.all(dirs.map(dir => rm(dir, { recursive: true, force: true }))))

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
