import { uint24At, view, Writer } from './binary'

interface Sequences {
  /** Bases whose sequence shows the default glyph, as ranges. */
  defaults: [start: number, additional: number][]
  mappings: [base: number, glyph: number][]
}

function readFormat14(table: Uint8Array): Map<number, Sequences> {
  const d = view(table)
  const selectors = new Map<number, Sequences>()
  for (let i = 0; i < d.getUint32(6); i++) {
    const record = 10 + i * 11
    const defaults = d.getUint32(record + 3)
    const mappings = d.getUint32(record + 7)
    selectors.set(uint24At(d, record), {
      defaults: defaults ? Array.from({ length: d.getUint32(defaults) }, (_, k) => [uint24At(d, defaults + 4 + k * 4), d.getUint8(defaults + 7 + k * 4)]) : [],
      mappings: mappings ? Array.from({ length: d.getUint32(mappings) }, (_, k) => [uint24At(d, mappings + 4 + k * 5), d.getUint16(mappings + 7 + k * 5)]) : [],
    })
  }
  return selectors
}

function writeFormat14(selectors: Map<number, Sequences>): Uint8Array {
  const sorted = [...selectors].sort((a, b) => a[0] - b[0])
  const w = new Writer().u16(14)
  const length = w.slot32()
  w.u32(sorted.length)
  const slots = sorted.map(([selector]) => {
    w.u24(selector)
    return [w.slot32(), w.slot32()] as const
  })
  sorted.forEach(([, { defaults, mappings }], i) => {
    const [defaultSlot, mappingSlot] = slots[i]!
    if (defaults.length) {
      w.link32(defaultSlot, 0)
      w.u32(defaults.length)
      defaults.forEach(([start, additional]) => w.u24(start).u8(additional))
    }
    if (mappings.length) {
      w.link32(mappingSlot, 0)
      w.u32(mappings.length)
      mappings.toSorted((a, b) => a[0] - b[0]).forEach(([base, glyph]) => w.u24(base).u16(glyph))
    }
  })
  w.set32(length, w.length)
  return w.finish()
}

/**
 * Maps each base + selector sequence to its glyph in cmap format 14, beside
 * the font's own sequences. Other subtables are kept as bytes. An empty
 * format 14 subtable is dropped: browsers reject it.
 */
export function addVariationSequences(cmap: Uint8Array, variants: { base: number, selector: number, glyph: number }[]): Uint8Array {
  const d = view(cmap)
  const subtables = Array.from({ length: d.getUint16(2) }, (_, i) => {
    const offset = d.getUint32(4 + i * 8 + 4)
    const format = d.getUint16(offset)
    const length = format === 14 ? d.getUint32(offset + 2) : format >= 8 ? d.getUint32(offset + 4) : d.getUint16(offset + 2)
    return { platform: d.getUint16(4 + i * 8), encoding: d.getUint16(4 + i * 8 + 2), offset, format, bytes: cmap.subarray(offset, offset + length) }
  })
  const own = subtables.find(s => s.format === 14)
  const selectors = own ? readFormat14(own.bytes) : new Map<number, Sequences>()
  for (const { base, selector, glyph } of variants) {
    if (!selectors.has(selector))
      selectors.set(selector, { defaults: [], mappings: [] })
    selectors.get(selector)!.mappings.push([base, glyph])
  }
  const kept = subtables.filter(s => s.format !== 14)
  if (selectors.size)
    kept.push({ platform: 0, encoding: 5, offset: -1, format: 14, bytes: writeFormat14(selectors) })
  kept.sort((a, b) => a.platform - b.platform || a.encoding - b.encoding)
  const w = new Writer().u16(0).u16(kept.length)
  const slots = kept.map(s => w.u16(s.platform).u16(s.encoding).slot32())
  // Records that shared a subtable keep sharing it.
  const placed = new Map<number, number>()
  kept.forEach((s, i) => {
    if (!placed.has(s.offset)) {
      placed.set(s.offset, w.length)
      w.bytes(s.bytes)
      while (w.length % 4)
        w.u8(0)
    }
    w.set32(slots[i]!, placed.get(s.offset)!)
  })
  return w.finish()
}
