import type { Plan, PlanGlyph } from '@furifont/core'
import type * as hb from 'harfbuzzjs'

/** A path segment ending at an absolute, rounded point: `C` and `Q` list their control points first. */
interface Segment {
  type: 'M' | 'L' | 'Q' | 'C'
  points: number[]
}

/** An affine map, as TrueType and PostScript write one: `x' = a x + c y + dx`, `y' = b x + d y + dy`. */
type Transform = [a: number, b: number, c: number, d: number, dx: number, dy: number]

/** A base glyph drawn into a new one, as a TrueType composite refers to it. */
interface Component {
  glyph: number
  transform: Transform
}

export interface Outline {
  segments: Segment[]
  /** Horizontal advance. */
  advance: number
  /** In vertical text: the advance down the column, and the height its top sits at (the vertical origin). */
  vertical?: { advance: number, origin: number }
  components: Component[]
  /** At each master of a variable base font, how far each component moves: `[dx, dy]`. */
  deltas: [number, number][][]
  /** Control box of the points, `[xMin, yMin, xMax, yMax]`; none for an empty glyph. */
  bounds?: [number, number, number, number]
}

/** Draws base glyphs, transformed, into one outline; the closing line HarfBuzz adds is implicit in both CFF and glyf. */
class Pen {
  segments: Segment[] = []
  private start = 0

  draw(font: hb.Font, glyph: number, [a, b, c, d, dx, dy]: Transform): void {
    for (const { type, values } of font.glyphToJson(glyph)) {
      if (type === 'Z') {
        this.close()
        continue
      }
      if (type !== 'M' && type !== 'L' && type !== 'Q' && type !== 'C')
        throw new Error(`unexpected path command ${type}`)
      if (type === 'M')
        this.start = this.segments.length
      const points: number[] = []
      for (let i = 0; i < values.length; i += 2) {
        const [x, y] = [values[i]!, values[i + 1]!]
        points.push(Math.round(a * x + c * y + dx), Math.round(b * x + d * y + dy))
      }
      this.segments.push({ type, points })
    }
  }

  private close(): void {
    const first = this.segments[this.start]!.points
    const last = this.segments.at(-1)!
    if (last.type === 'L' && last.points[0] === first[0] && last.points[1] === first[1])
      this.segments.pop()
  }

  bounds(): Outline['bounds'] {
    const points = this.segments.flatMap(s => s.points)
    if (!points.length)
      return undefined
    const xs = points.filter((_, i) => i % 2 === 0)
    const ys = points.filter((_, i) => i % 2 === 1)
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  }
}

export interface DrawContext {
  font: hb.Font
  /** The base font at each master of its variations other than the default; none for a static font. */
  masters: hb.Font[]
  unitsPerEm: number
  metrics: Plan['metrics']
  /** Bottom and top of the ideographic em box, which ruby sits on. */
  em: [number, number]
  glyphOf: (codepoint: number) => number | undefined
  /** For a vertical font: the em box across the column, left and right, and how glyphs stand in it. */
  vertical?: {
    column: [number, number]
    /** A character's glyph in vertical text: its vertical form, such as a small kana's, or its own glyph. */
    uprightOf: (codepoint: number) => number | undefined
    /** The height of a glyph's vertical origin, where its top sits in the column. */
    originOf: (glyph: number) => number
  }
}

interface Placement {
  components: Component[]
  /** Where each base starts, and the last one ends: along the line, or down the column. */
  stops: number[]
  squeezes: number[]
  advance: number
  vertical?: Outline['vertical']
}

function glyphFor(lookup: (cp: number) => number | undefined, char: string): number {
  const glyph = lookup(char.codePointAt(0)!)
  if (glyph === undefined)
    throw new Error(`the base font has no glyph for ruby character ${char}`)
  return glyph
}

/** How far a ruby is squeezed into its span, or left to overhang it. */
function squeezeOf(natural: number, span: number, metrics: Plan['metrics'], upm: number): number {
  return Math.min(natural <= span ? 1 : Math.max(span / natural, metrics.compressionFloor), metrics.maxRubyWidth * upm / natural)
}

/** Latin ruby, romaji, is set sideways in vertical text, as browsers set Latin; kana stand upright. */
const SIDEWAYS = /\p{Script=Latin}/u

/**
 * Bases one below another, each ruby right of its span and centred along it:
 * kana upright in their vertical forms, romaji turned a quarter clockwise to
 * read downward, squeezed to fit and then overhanging as across a line.
 */
function placeVertical(spec: PlanGlyph, ctx: DrawContext, font: hb.Font, squeezes?: number[]): Placement {
  const { unitsPerEm: upm, metrics, em } = ctx
  const { column, uprightOf, originOf } = ctx.vertical!
  const upright = (cp: number): number => uprightOf(cp) ?? ctx.glyphOf(cp)!
  const components: Component[] = []
  const first = upright(spec.bases[0]!)
  const top = originOf(first)
  const stops = [0]
  for (const cp of spec.bases) {
    const glyph = upright(cp)
    components.push({ glyph, transform: [1, 0, 0, 1, 0, top - stops.at(-1)! - originOf(glyph)] })
    stops.push(stops.at(-1)! - font.glyphVAdvance(glyph))
  }
  const scale = metrics.rubyScale
  const left = column[1] + metrics.rubyGap * upm
  const used = spec.ruby.map((ruby, r) => {
    const sideways = SIDEWAYS.test(ruby.text)
    const glyphs = [...ruby.text].map(char => glyphFor(sideways ? ctx.glyphOf : uprightOf, char))
    const length = (glyph: number): number => sideways ? font.glyphHAdvance(glyph) : -font.glyphVAdvance(glyph)
    const natural = glyphs.reduce((sum, g) => sum + length(g), 0) * scale
    const span = stops[ruby.end]! - stops[ruby.start]!
    const squeeze = squeezes?.[r] ?? squeezeOf(natural, span, metrics, upm)
    let y = top - stops[ruby.start]! - (span - natural * squeeze) / 2
    for (const glyph of glyphs) {
      // Sideways, a glyph's baseline runs down the column and its top faces right.
      components.push(sideways
        ? { glyph, transform: [0, -scale * squeeze, scale, 0, left - em[0] * scale, y] }
        : { glyph, transform: [scale, 0, 0, scale * squeeze, left - column[0] * scale, y - originOf(glyph) * scale * squeeze] })
      y -= length(glyph) * scale * squeeze
    }
    return squeeze
  })
  return { components, stops, squeezes: used, advance: font.glyphHAdvance(first), vertical: { advance: stops.at(-1)!, origin: top } }
}

/** Bases side by side at `font`'s advances, each ruby centred over its span: squeezed to fit, then overhanging. */
function place(spec: PlanGlyph, ctx: DrawContext, font: hb.Font, squeezes?: number[]): Placement {
  if (ctx.vertical)
    return placeVertical(spec, ctx, font, squeezes)
  const { unitsPerEm: upm, metrics, em } = ctx
  const components: Component[] = []
  const stops = [0]
  for (const cp of spec.bases) {
    const glyph = ctx.glyphOf(cp)!
    components.push({ glyph, transform: [1, 0, 0, 1, stops.at(-1)!, 0] })
    stops.push(stops.at(-1)! + font.glyphHAdvance(glyph))
  }
  const scale = metrics.rubyScale
  const bottom = em[1] + metrics.rubyGap * upm
  const used = spec.ruby.map((ruby, r) => {
    const glyphs = [...ruby.text].map(char => glyphFor(ctx.glyphOf, char))
    const natural = glyphs.reduce((sum, g) => sum + font.glyphHAdvance(g), 0) * scale
    const span = stops[ruby.end]! - stops[ruby.start]!
    const squeeze = squeezes?.[r] ?? squeezeOf(natural, span, metrics, upm)
    let x = stops[ruby.start]! + (span - natural * squeeze) / 2
    for (const glyph of glyphs) {
      components.push({ glyph, transform: [scale * squeeze, 0, 0, scale, x, bottom - em[0] * scale] })
      x += font.glyphHAdvance(glyph) * scale * squeeze
    }
    return squeeze
  })
  return { components, stops, squeezes: used, advance: stops.at(-1)! }
}

/** The plan's glyph at the default instance, with how its components move at each master. */
export function drawGlyph(spec: PlanGlyph, ctx: DrawContext): Outline {
  // A component's scale cannot vary, so each ruby is squeezed as tight as its widest master needs.
  const squeezes = [ctx.font, ...ctx.masters]
    .map(font => place(spec, ctx, font).squeezes)
    .reduce((a, b) => a.map((s, i) => Math.min(s, b[i]!)))
  const { components, stops, advance, vertical } = place(spec, ctx, ctx.font, squeezes)
  const deltas = ctx.masters.map((font) => {
    const master = place(spec, ctx, font, squeezes)
    // The advance and the bases then stay put, which the new glyph's metric variations rely on.
    if (master.stops.join() !== stops.join())
      throw new Error(`the base font varies the advance of ${String.fromCodePoint(...spec.bases)}, which Furifont does not support`)
    return master.components.map(({ transform: [, , , , dx, dy] }, i): [number, number] => {
      const [, , , , x, y] = components[i]!.transform
      return [Math.round(dx) - Math.round(x), Math.round(dy) - Math.round(y)]
    })
  })
  const pen = new Pen()
  for (const { glyph, transform } of components)
    pen.draw(ctx.font, glyph, transform)
  return { segments: pen.segments, advance, vertical, components, deltas, bounds: pen.bounds() }
}

export const emptyOutline = (advance: number): Outline => ({ segments: [], advance, components: [], deltas: [] })
