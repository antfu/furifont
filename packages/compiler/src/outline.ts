import type { Plan, PlanGlyph } from '@furifont/core'
import type * as hb from 'harfbuzzjs'

/** A path segment ending at an absolute, rounded point: `C` and `Q` list their control points first. */
interface Segment {
  type: 'M' | 'L' | 'Q' | 'C'
  points: number[]
}

export interface Outline {
  segments: Segment[]
  advance: number
  /** Control box of the points, `[xMin, yMin, xMax, yMax]`; none for an empty glyph. */
  bounds?: [number, number, number, number]
}

type Transform = [scaleX: number, scaleY: number, dx: number, dy: number]

/** Draws base glyphs, transformed, into one outline; the closing line HarfBuzz adds is implicit in both CFF and glyf. */
class Pen {
  segments: Segment[] = []
  private start = 0

  draw(font: hb.Font, glyph: number, [sx, sy, dx, dy]: Transform): void {
    for (const { type, values } of font.glyphToJson(glyph)) {
      if (type === 'Z') {
        this.close()
        continue
      }
      if (type !== 'M' && type !== 'L' && type !== 'Q' && type !== 'C')
        throw new Error(`unexpected path command ${type}`)
      if (type === 'M')
        this.start = this.segments.length
      this.segments.push({ type, points: values.map((v, i) => Math.round(i % 2 ? sy * v + dy : sx * v + dx)) })
    }
  }

  private close(): void {
    const first = this.segments[this.start]!.points
    const last = this.segments.at(-1)!
    if (last.type === 'L' && last.points[0] === first[0] && last.points[1] === first[1])
      this.segments.pop()
  }

  outline(advance: number): Outline {
    const points = this.segments.flatMap(s => s.points)
    if (!points.length)
      return { segments: [], advance }
    const xs = points.filter((_, i) => i % 2 === 0)
    const ys = points.filter((_, i) => i % 2 === 1)
    return { segments: this.segments, advance, bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
  }
}

export interface DrawContext {
  font: hb.Font
  unitsPerEm: number
  metrics: Plan['metrics']
  /** Bottom and top of the ideographic em box, which ruby sits on. */
  em: [number, number]
  glyphOf: (codepoint: number) => number | undefined
}

/** Bases side by side, each ruby centred over its span: squeezed to fit, then overhanging. */
export function drawGlyph(spec: PlanGlyph, ctx: DrawContext): Outline {
  const { font, unitsPerEm: upm, metrics, em } = ctx
  const pen = new Pen()
  const stops = [0]
  for (const cp of spec.bases) {
    const glyph = ctx.glyphOf(cp)!
    pen.draw(font, glyph, [1, 1, stops.at(-1)!, 0])
    stops.push(stops.at(-1)! + font.glyphHAdvance(glyph))
  }
  const scale = metrics.rubyScale
  const bottom = em[1] + metrics.rubyGap * upm
  for (const ruby of spec.ruby) {
    const glyphs = [...ruby.text].map((char) => {
      const glyph = ctx.glyphOf(char.codePointAt(0)!)
      if (glyph === undefined)
        throw new Error(`the base font has no glyph for ruby character ${char}`)
      return glyph
    })
    const natural = glyphs.reduce((sum, g) => sum + font.glyphHAdvance(g), 0) * scale
    const span = stops[ruby.end]! - stops[ruby.start]!
    let squeeze = natural <= span ? 1 : Math.max(span / natural, metrics.compressionFloor)
    squeeze = Math.min(squeeze, metrics.maxRubyWidth * upm / natural)
    let x = stops[ruby.start]! + (span - natural * squeeze) / 2
    for (const glyph of glyphs) {
      pen.draw(font, glyph, [scale * squeeze, scale, x, bottom - em[0] * scale])
      x += font.glyphHAdvance(glyph) * scale * squeeze
    }
  }
  return pen.outline(stops.at(-1)!)
}

export const emptyOutline = (advance: number): Outline => ({ segments: [], advance })
