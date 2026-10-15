import type { Outline } from './outline'
import { view, Writer } from './binary'

const ARG_1_AND_2_ARE_WORDS = 0x0001
const ARGS_ARE_XY_VALUES = 0x0002
const MORE_COMPONENTS = 0x0020
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040
const UNSCALED_COMPONENT_OFFSET = 0x1000

/**
 * A composite of the base glyphs, so a variable font's own variations draw it
 * at every weight; its bounding box is the default instance's.
 */
function encodeComposite({ components, bounds }: Outline): Uint8Array {
  if (!bounds)
    return new Uint8Array()
  const w = new Writer().u16(-1).u16(bounds[0]).u16(bounds[1]).u16(bounds[2]).u16(bounds[3])
  components.forEach(({ glyph, transform: [sx, sy, dx, dy] }, i) => {
    const scaled = sx !== 1 || sy !== 1
    w.u16(ARG_1_AND_2_ARE_WORDS | ARGS_ARE_XY_VALUES | UNSCALED_COMPONENT_OFFSET | (scaled ? WE_HAVE_AN_X_AND_Y_SCALE : 0) | (i < components.length - 1 ? MORE_COMPONENTS : 0))
    w.u16(glyph).u16(Math.round(dx)).u16(Math.round(dy))
    // F2Dot14.
    if (scaled)
      w.u16(Math.round(sx * 0x4000)).u16(Math.round(sy * 0x4000))
  })
  return w.finish()
}

/** TrueType outlines: base glyphs kept as bytes, new ones appended as composites, written with a long loca. */
export class Glyf {
  private readonly glyphs: Uint8Array[]
  /** maxp's statistics of the composites: their points and contours as drawn, and their component count. */
  maxPoints = 0
  maxContours = 0
  maxComponents = 0

  constructor(glyf: Uint8Array, loca: Uint8Array, longLoca: boolean, glyphCount: number) {
    const d = view(loca)
    const offset = (g: number): number => longLoca ? d.getUint32(g * 4) : d.getUint16(g * 2) * 2
    this.glyphs = Array.from({ length: glyphCount }, (_, g) => glyf.subarray(offset(g), offset(g + 1)))
  }

  get glyphCount(): number {
    return this.glyphs.length
  }

  addGlyph(outline: Outline): void {
    this.glyphs.push(encodeComposite(outline))
    this.maxPoints = Math.max(this.maxPoints, outline.segments.reduce((sum, s) => sum + s.points.length / 2, 0))
    this.maxContours = Math.max(this.maxContours, outline.segments.filter(s => s.type === 'M').length)
    this.maxComponents = Math.max(this.maxComponents, outline.components.length)
  }

  compile(): { glyf: Uint8Array, loca: Uint8Array } {
    const glyf = new Writer()
    const loca = new Writer()
    for (const glyph of this.glyphs) {
      loca.u32(glyf.length)
      glyf.bytes(glyph)
      while (glyf.length % 4)
        glyf.u8(0)
    }
    loca.u32(glyf.length)
    return { glyf: glyf.finish(), loca: loca.finish() }
  }
}
