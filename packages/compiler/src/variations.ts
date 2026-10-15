import { view, Writer } from './binary'

const EMBEDDED_PEAK_TUPLE = 0x8000
const PRIVATE_POINT_NUMBERS = 0x2000
const DELTAS_ARE_ZERO = 0x80
const DELTAS_ARE_WORDS = 0x40
/** A TrueType glyph's four phantom points, after its components: the new glyphs' metrics never move. */
const PHANTOMS: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]]

function packDeltas(w: Writer, deltas: number[]): void {
  for (let i = 0; i < deltas.length; i += 64) {
    const run = deltas.slice(i, i + 64)
    if (run.every(d => d === 0)) {
      w.u8(DELTAS_ARE_ZERO | (run.length - 1))
    }
    else if (run.every(d => d >= -128 && d <= 127)) {
      w.u8(run.length - 1)
      run.forEach(d => w.u8(d))
    }
    else {
      w.u8(DELTAS_ARE_WORDS | (run.length - 1))
      run.forEach(d => w.u16(d))
    }
  }
}

/** One glyph's variation data: a tuple per master its components move at, each moving every point. */
function glyphVariations(deltas: [number, number][][], peaks: number[][]): Uint8Array {
  const tuples = deltas.flatMap((points, m) => points.some(([x, y]) => x || y) ? [{ points: [...points, ...PHANTOMS], peak: peaks[m]! }] : [])
  if (!tuples.length)
    return new Uint8Array()
  const data = tuples.map(({ points }) => {
    // Point numbers: 0, every point.
    const w = new Writer().u8(0)
    packDeltas(w, points.map(([x]) => x))
    packDeltas(w, points.map(([, y]) => y))
    return w.finish()
  })
  const w = new Writer().u16(tuples.length)
  const dataOffset = w.slot16()
  tuples.forEach(({ peak }, t) => {
    w.u16(data[t]!.length).u16(EMBEDDED_PEAK_TUPLE | PRIVATE_POINT_NUMBERS)
    peak.forEach(coord => w.u16(coord * 0x4000))
  })
  w.link16(dataOffset)
  data.forEach(d => w.bytes(d))
  if (w.length % 2)
    w.u8(0)
  return w.finish()
}

/**
 * Appends the new glyphs' variation data to gvar: `deltas` moves each one's
 * components at each master, which `peaks` places in normalized coordinates.
 */
export function appendGlyphVariations(gvar: Uint8Array, deltas: [number, number][][][], peaks: number[][]): Uint8Array {
  const d = view(gvar)
  const axisCount = d.getUint16(4)
  const sharedCount = d.getUint16(6)
  const glyphCount = d.getUint16(12)
  const long = (d.getUint16(14) & 1) === 1
  const arrayOffset = d.getUint32(16)
  const offset = (g: number): number => long ? d.getUint32(20 + g * 4) : d.getUint16(20 + g * 2) * 2
  const shared = gvar.subarray(d.getUint32(8), d.getUint32(8) + sharedCount * axisCount * 2)
  const glyphs = [
    ...Array.from({ length: glyphCount }, (_, g) => gvar.subarray(arrayOffset + offset(g), arrayOffset + offset(g + 1))),
    ...deltas.map(glyph => glyphVariations(glyph, peaks)),
  ]
  const sharedOffset = 20 + (glyphs.length + 1) * 4
  const w = new Writer().u16(1).u16(0).u16(axisCount).u16(sharedCount).u32(sharedOffset).u16(glyphs.length).u16(1).u32(sharedOffset + shared.length)
  let at = 0
  for (const glyph of glyphs) {
    w.u32(at)
    at += glyph.length
  }
  w.u32(at).bytes(shared)
  glyphs.forEach(glyph => w.bytes(glyph))
  return w.finish()
}

/**
 * Gives each new glyph in HVAR or VVAR the advance variation of the base glyph
 * it is `like`. The `sideMaps` after the advance map in the header (side
 * bearings, and VVAR's vertical origins), which would not cover the new
 * glyphs, go. Without an advance map, the table goes: gvar's phantom points
 * then vary the advances.
 */
export function appendAdvanceMap(table: Uint8Array, sideMaps: number, baseCount: number, likes: number[]): Uint8Array | undefined {
  const d = view(table)
  const map = d.getUint32(8)
  if (!map)
    return undefined
  const format = d.getUint8(map)
  const entryFormat = d.getUint8(map + 1)
  const size = ((entryFormat >> 4) & 3) + 1
  const count = format === 0 ? d.getUint16(map + 2) : d.getUint32(map + 2)
  const first = map + (format === 0 ? 4 : 6)
  // A glyph past the map takes its last entry.
  const entry = (g: number): Uint8Array => table.subarray(first + Math.min(g, count - 1) * size, first + Math.min(g, count - 1) * size + size)
  const w = new Writer().bytes(table)
  while (w.length % 2)
    w.u8(0)
  const start = w.length
  // Format 0, which every reader knows: a glyph count fits its 16 bits.
  w.u8(0).u8(entryFormat).u16(baseCount + likes.length)
  for (let g = 0; g < baseCount; g++)
    w.bytes(entry(g))
  likes.forEach(g => w.bytes(entry(g)))
  const out = w.finish()
  view(out).setUint32(8, start)
  for (let i = 0; i < sideMaps; i++)
    view(out).setUint32(12 + i * 4, 0)
  return out
}
