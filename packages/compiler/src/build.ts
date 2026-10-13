import type { Plan } from '@furifont/core'
import type { Metric } from './metrics'
import type { FontNames } from './names'
import type { Outline } from './outline'
import type { Sfnt } from './sfnt'
import type { SubsetWasm } from './subset'
import * as hb from 'harfbuzzjs'
import { tagAt, view } from './binary'
import { Cff } from './cff'
import { addVariationSequences } from './cmap'
import { Glyf } from './glyf'
import { buildGsub } from './gsub'
import { appendMetrics } from './metrics'
import { fontNames, renameFont } from './names'
import { drawGlyph, emptyOutline } from './outline'
import { appendGlyphNames, postGlyphNames } from './post'
import { readSfnt, writeSfnt } from './sfnt'
import { subsetFont } from './subset'

const MAX_GLYPHS = 65535
/** Per-glyph tables a new glyph count would invalidate; all optional. */
const PER_GLYPH_TABLES = ['hdmx', 'LTSH']

export interface CompileProgress {
  step: 'load' | 'draw' | 'features' | 'save' | 'woff2'
  done: number | null
  total: number | null
}

export interface CompileOptions {
  plan: Plan
  /** The base font, OpenType or TrueType. */
  base: Uint8Array
  /** Loads hb-subset, which a preview's plan (one with `subset`) needs. */
  subsetWasm: SubsetWasm
  onProgress?: (progress: CompileProgress) => void
}

export interface BuiltFont {
  /** The OpenType font. */
  font: Uint8Array
  /** The glyph order, named as the plan names glyphs. */
  glyphNames: string[]
  style: string
}

const logicalName = (cp: number): string => cp > 0xFFFF ? `u${cp.toString(16).toUpperCase()}` : `uni${cp.toString(16).toUpperCase().padStart(4, '0')}`

/** Bottom and top of the ideographic em box: the BASE table's `ideo` baseline, else the typographic metrics. */
function emBox(tables: Map<string, Uint8Array>, upm: number): [number, number] {
  const base = tables.get('BASE')
  if (base) {
    const d = view(base)
    const axis = d.getUint16(4)
    const tagList = axis && d.getUint16(axis) && axis + d.getUint16(axis)
    const tags = tagList ? Array.from({ length: d.getUint16(tagList) }, (_, i) => tagAt(base, tagList + 2 + i * 4)) : []
    const index = tags.indexOf('ideo')
    const scriptList = axis + d.getUint16(axis + 2)
    const scripts = new Map(Array.from({ length: index < 0 ? 0 : d.getUint16(scriptList) }, (_, i) => [tagAt(base, scriptList + 2 + i * 6), scriptList + d.getUint16(scriptList + 6 + i * 6)]))
    const script = scripts.get('hani') ?? scripts.get('kana') ?? scripts.get('DFLT')
    const values = script && d.getUint16(script) && script + d.getUint16(script)
    if (values && index < d.getUint16(values + 2)) {
      const bottom = d.getInt16(values + d.getUint16(values + 4 + index * 2) + 2)
      return [bottom, bottom + upm]
    }
  }
  const os2 = view(tables.get('OS/2')!)
  const ascender = os2.getInt16(68)
  const descender = os2.getInt16(70)
  return ascender - descender === upm ? [descender, ascender] : [-0.12 * upm, 0.88 * upm]
}

/** The base font, opened once it is known to be one Furifont can build on. */
async function openBase({ plan, base, subsetWasm }: CompileOptions): Promise<{ sfnt: Sfnt, font: hb.Font, upm: number, baseCount: number }> {
  const data = plan.subset ? await subsetFont(base, [...plan.subset, ...plan.codepoints], subsetWasm) : base
  const sfnt = readSfnt(data)
  if (sfnt.tables.has('fvar') || sfnt.tables.has('CFF2'))
    throw new Error('variable fonts are not supported: use a static instance')
  if (!sfnt.tables.has('CFF ') && !sfnt.tables.has('glyf'))
    throw new Error('only CFF and TrueType base fonts are supported')
  const face = new hb.Face(new hb.Blob(data))
  const baseCount = view(sfnt.tables.get('maxp')!).getUint16(4)
  const added = plan.glyphs.length + plan.variants.length
  if (baseCount + added > MAX_GLYPHS)
    throw new Error(`${baseCount} base glyphs plus ${added} new ones exceed ${MAX_GLYPHS}: lower nfMax`)
  return { sfnt, font: new hb.Font(face), upm: face.upem, baseCount }
}

/**
 * Names every glyph as the plan does: base characters after their codepoint,
 * new glyphs after the plan, appended in its order.
 */
function nameGlyphs(plan: Plan, font: hb.Font, baseCount: number, taken: Set<string>): { names: string[], resolve: (name: string) => number } {
  const names = Array.from({ length: baseCount }, (_, g) => `glyph${g}`)
  const named = new Set<number>()
  for (const cp of plan.codepoints) {
    const glyph = font.nominalGlyph(cp)
    if (glyph === undefined)
      throw new Error(`the base font has no glyph for U+${cp.toString(16).toUpperCase().padStart(4, '0')}`)
    // A glyph two codepoints share, such as a Kangxi radical's, takes the first one's name.
    if (!named.has(glyph))
      names[glyph] = logicalName(cp)
    named.add(glyph)
  }
  const ids = new Map<string, number>()
  for (const { name } of [...plan.glyphs, ...plan.variants]) {
    if (taken.has(name))
      throw new Error(`the base font already has a glyph named ${name}`)
    ids.set(name, names.length)
    names.push(name)
  }
  const resolve = (name: string): number => {
    const cp = /^u(?:ni)?([0-9A-F]{4,6})$/.exec(name)?.[1]
    const glyph = ids.get(name) ?? (cp === undefined ? undefined : font.nominalGlyph(Number.parseInt(cp, 16)))
    if (glyph === undefined)
      throw new Error(`the feature file names an unknown glyph ${name}`)
    return glyph
  }
  return { names, resolve }
}

const extend = (d: DataView, at: number, value: number, pick: (a: number, b: number) => number): void => d.setInt16(at, pick(d.getInt16(at), value))

/** The glyphs a build appends, with the outline, metric and header tables they change. */
class NewGlyphs {
  private readonly cff?: Cff
  private readonly glyf?: Glyf
  private readonly horizontal: Metric[] = []
  private readonly vertical: Metric[] = []
  readonly head: Uint8Array
  /** Where vertical metrics measure from: VORG's default origin, else the ascender. */
  private readonly origin: number

  constructor(private readonly tables: Map<string, Uint8Array>, private readonly baseCount: number, private readonly upm: number) {
    this.head = tables.get('head')!.slice()
    if (tables.has('CFF '))
      this.cff = new Cff(tables.get('CFF ')!)
    else
      this.glyf = new Glyf(tables.get('glyf')!, tables.get('loca')!, view(this.head).getInt16(50) === 1, baseCount)
    this.origin = view(tables.get('VORG') ?? tables.get('hhea')!).getInt16(4)
  }

  /** Glyph names the font spells out, which new ones must not repeat. */
  takenNames(): Set<string> {
    if (this.cff && !this.cff.isCid)
      return this.cff.glyphNames()
    const post = this.tables.get('post')
    return post ? postGlyphNames(post) : new Set()
  }

  add(name: string, outline: Outline, like: number): void {
    if (this.cff)
      this.cff.addGlyph(name, outline, like)
    else
      this.glyf!.addGlyph(outline)
    const bounds = outline.bounds
    const [xMin, yMin, xMax, yMax] = bounds ?? [0, 0, 0, 0]
    this.horizontal.push({ advance: outline.advance, bearing: xMin, extent: bounds && [xMin, xMax] })
    this.vertical.push({ advance: outline.advance ? this.upm : 0, bearing: this.origin - yMax, extent: bounds && [yMin, yMax] })
    if (!bounds)
      return
    this.cff?.include(bounds)
    const h = view(this.head)
    extend(h, 36, xMin, Math.min)
    extend(h, 38, yMin, Math.min)
    extend(h, 40, xMax, Math.max)
    extend(h, 42, yMax, Math.max)
  }

  /** Writes the outlines, metrics, glyph count and names into the font's tables. */
  write(names: FontNames, glyphNames: string[]): void {
    const { tables } = this
    const maxp = tables.get('maxp')!.slice()
    view(maxp).setUint16(4, this.baseCount + this.horizontal.length)
    if (this.cff) {
      this.cff.rename(names)
      tables.set('CFF ', this.cff.compile())
    }
    else {
      const { glyf, loca } = this.glyf!.compile()
      tables.set('glyf', glyf)
      tables.set('loca', loca)
      view(this.head).setInt16(50, 1)
      // maxp 1.0, TrueType's, counts points and contours too.
      if (view(maxp).getUint32(0) === 0x00010000) {
        view(maxp).setUint16(6, Math.max(view(maxp).getUint16(6), this.glyf!.maxPoints))
        view(maxp).setUint16(8, Math.max(view(maxp).getUint16(8), this.glyf!.maxContours))
      }
    }
    tables.set('maxp', maxp)
    // LONGDATETIME: seconds since 1904.
    view(this.head).setBigUint64(28, BigInt(Math.floor(Date.now() / 1000) + 2082844800))
    tables.set('head', this.head)
    const hmtx = appendMetrics(tables.get('hmtx')!, tables.get('hhea')!, this.baseCount, this.horizontal)
    tables.set('hmtx', hmtx.table)
    tables.set('hhea', hmtx.header)
    if (tables.has('vmtx')) {
      const vmtx = appendMetrics(tables.get('vmtx')!, tables.get('vhea')!, this.baseCount, this.vertical)
      tables.set('vmtx', vmtx.table)
      tables.set('vhea', vmtx.header)
    }
    const post = tables.get('post')
    if (post)
      tables.set('post', appendGlyphNames(post, glyphNames.slice(this.baseCount)))
    for (const tag of PER_GLYPH_TABLES)
      tables.delete(tag)
  }
}

/** Raises the ascender to cover the ruby, so lines and clipping make room for it. */
function raiseAscender(tables: Map<string, Uint8Array>, top: number): void {
  const hhea = tables.get('hhea')!.slice()
  extend(view(hhea), 4, top, Math.max)
  tables.set('hhea', hhea)
  const os2 = tables.get('OS/2')!.slice()
  view(os2).setUint16(74, Math.max(view(os2).getUint16(74), top))
  tables.set('OS/2', os2)
}

/** Draws the plan's glyphs into the base font, compiles its rules, and checks the result with HarfBuzz. */
export async function buildFont(options: CompileOptions): Promise<BuiltFont> {
  const { plan, onProgress } = options
  // Yielding between steps lets a server send the progress, or a page show it, while a big font builds.
  const progress = async (step: CompileProgress['step'], done: number | null = null, total: number | null = null): Promise<void> => {
    onProgress?.({ step, done, total })
    await new Promise(resolve => setTimeout(resolve))
  }
  await progress('load')
  const { sfnt, font, upm, baseCount } = await openBase(options)
  const { tables } = sfnt
  const glyphs = new NewGlyphs(tables, baseCount, upm)
  const { names, resolve } = nameGlyphs(plan, font, baseCount, glyphs.takenNames())

  const em = emBox(tables, upm)
  const glyphOf = (cp: number): number | undefined => font.nominalGlyph(cp)
  const ctx = { font, unitsPerEm: upm, metrics: plan.metrics, em, glyphOf }
  for (const [i, spec] of plan.glyphs.entries()) {
    if (i % 500 === 0)
      await progress('draw', i, plan.glyphs.length)
    glyphs.add(spec.name, drawGlyph(spec, ctx), glyphOf(spec.bases[0]!)!)
  }
  await progress('draw', plan.glyphs.length, plan.glyphs.length)
  // Empty glyphs for base + selector sequences: the rules always replace them.
  for (const v of plan.variants) {
    const base = glyphOf(v.base)!
    glyphs.add(v.name, emptyOutline(font.glyphHAdvance(base)), base)
  }
  tables.set('cmap', addVariationSequences(tables.get('cmap')!, plan.variants.map(v => ({ ...v, glyph: resolve(v.name) }))))

  await progress('features')
  tables.set('GSUB', buildGsub(plan.fea, tables.get('GSUB'), resolve))

  const fontName = fontNames(tables.get('name')!, plan.names.family)
  tables.set('name', renameFont(tables.get('name')!, fontName, plan.names.description))
  glyphs.write(fontName, names)
  raiseAscender(tables, Math.ceil(em[1] + (plan.metrics.rubyGap + plan.metrics.rubyScale) * upm))

  await progress('save')
  const built = writeSfnt(sfnt)
  checkShaping(built, plan.smoke, resolve)
  return { font: built, glyphNames: names, style: fontName.style }
}

function checkShaping(font: Uint8Array, smoke: Plan['smoke'], resolve: (name: string) => number): void {
  const shaper = new hb.Font(new hb.Face(new hb.Blob(font)))
  const buffer = new hb.Buffer()
  for (const { text, glyphs } of smoke) {
    buffer.reset()
    buffer.addText(text)
    buffer.guessSegmentProperties()
    hb.shape(shaper, buffer)
    const got = buffer.getGlyphInfos().map(g => g.codepoint)
    if (got.join() !== glyphs.map(resolve).join())
      throw new Error(`${text} shaped to glyphs ${got.join(' ')}, expected ${glyphs.join(' ')}`)
  }
}
