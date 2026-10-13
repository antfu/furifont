import type { Outline } from './outline'
import { view, Writer } from './binary'

const ON_CURVE = 0x01
const X_SHORT = 0x02
const Y_SHORT = 0x04
const REPEAT = 0x08
const X_SAME_OR_POSITIVE = 0x10
const Y_SAME_OR_POSITIVE = 0x20

interface Point {
  x: number
  y: number
  on: boolean
}

function contours(outline: Outline): Point[][] {
  const result: Point[][] = []
  for (const { type, points } of outline.segments) {
    if (type === 'C')
      throw new Error('cubic curves in a TrueType font')
    if (type === 'M')
      result.push([])
    const contour = result.at(-1)!
    for (let i = 0; i < points.length; i += 2)
      contour.push({ x: points[i]!, y: points[i + 1]!, on: type !== 'Q' || i === points.length - 2 })
  }
  for (const contour of result) {
    const [first, last] = [contour[0]!, contour.at(-1)!]
    if (contour.length > 1 && last.on && last.x === first.x && last.y === first.y)
      contour.pop()
  }
  return result
}

/** Writes one coordinate delta and returns its flag bits: none when 0 and `same`, one byte when short. */
function coordinate(delta: number, short: number, sameOrPositive: number, out: Writer): number {
  if (delta === 0)
    return sameOrPositive
  if (Math.abs(delta) >= 256) {
    out.u16(delta)
    return 0
  }
  out.u8(Math.abs(delta))
  return short | (delta > 0 ? sameOrPositive : 0)
}

/** Flags, each run of equal ones written once with a repeat count. */
function writeFlags(w: Writer, flags: number[]): void {
  for (let i = 0; i < flags.length;) {
    let repeat = 0
    while (flags[i + repeat + 1] === flags[i] && repeat < 255)
      repeat++
    if (repeat)
      w.u8(flags[i]! | REPEAT).u8(repeat)
    else
      w.u8(flags[i]!)
    i += repeat + 1
  }
}

/** A simple glyph without instructions, its bounding box taken from its points. */
function encodeGlyph(outline: Outline): { bytes: Uint8Array, points: number, contours: number } {
  const all = contours(outline)
  if (!outline.bounds || !all.length)
    return { bytes: new Uint8Array(), points: 0, contours: 0 }
  const [xMin, yMin, xMax, yMax] = outline.bounds
  const w = new Writer().u16(all.length).u16(xMin).u16(yMin).u16(xMax).u16(yMax)
  let end = -1
  for (const contour of all)
    w.u16(end += contour.length)
  w.u16(0)
  const flags: number[] = []
  const xs = new Writer()
  const ys = new Writer()
  let x = 0
  let y = 0
  for (const point of all.flat()) {
    flags.push((point.on ? ON_CURVE : 0) | coordinate(point.x - x, X_SHORT, X_SAME_OR_POSITIVE, xs) | coordinate(point.y - y, Y_SHORT, Y_SAME_OR_POSITIVE, ys))
    x = point.x
    y = point.y
  }
  writeFlags(w, flags)
  w.bytes(xs.finish()).bytes(ys.finish())
  return { bytes: w.finish(), points: flags.length, contours: all.length }
}

/** TrueType outlines: base glyphs kept as bytes, new ones appended, written with a long loca. */
export class Glyf {
  private readonly glyphs: Uint8Array[]
  maxPoints = 0
  maxContours = 0

  constructor(glyf: Uint8Array, loca: Uint8Array, longLoca: boolean, glyphCount: number) {
    const d = view(loca)
    const offset = (g: number): number => longLoca ? d.getUint32(g * 4) : d.getUint16(g * 2) * 2
    this.glyphs = Array.from({ length: glyphCount }, (_, g) => glyf.subarray(offset(g), offset(g + 1)))
  }

  get glyphCount(): number {
    return this.glyphs.length
  }

  addGlyph(outline: Outline): void {
    const { bytes, points, contours } = encodeGlyph(outline)
    this.glyphs.push(bytes)
    this.maxPoints = Math.max(this.maxPoints, points)
    this.maxContours = Math.max(this.maxContours, contours)
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
