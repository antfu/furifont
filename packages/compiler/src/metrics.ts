import { view, Writer } from './binary'

/** Advance and side bearing, with the glyph's extent along the same axis for the header's statistics. */
export interface Metric {
  advance: number
  bearing: number
  /** `[min, max]` along the axis; none for an empty glyph. */
  extent?: [number, number]
}

/** Every glyph's advance and side bearing in hmtx or vmtx, whose header (hhea or vhea) says how many are long. */
export function readMetrics(table: Uint8Array, header: Uint8Array, glyphCount: number): [advance: number, bearing: number][] {
  const d = view(table)
  const longCount = view(header).getUint16(34)
  return Array.from({ length: glyphCount }, (_, g) => [
    d.getUint16(Math.min(g, longCount - 1) * 4),
    g < longCount ? d.getInt16(g * 4 + 2) : d.getInt16(longCount * 4 + (g - longCount) * 2),
  ])
}

/**
 * Appends metrics to hmtx or vmtx and refreshes its header (hhea or vhea):
 * the long-metric count, the largest advance and the side-bearing extremes.
 */
export function appendMetrics(table: Uint8Array, header: Uint8Array, glyphCount: number, added: Metric[]): { table: Uint8Array, header: Uint8Array } {
  const metrics = readMetrics(table, header, glyphCount)
  metrics.push(...added.map((m): [number, number] => [m.advance, m.bearing]))
  // Trailing glyphs that share the last advance need not repeat it.
  let long = metrics.length
  while (long > 1 && metrics[long - 1]![0] === metrics[long - 2]![0])
    long--
  const w = new Writer()
  metrics.forEach(([advance, bearing], g) => {
    if (g < long)
      w.u16(advance!)
    w.u16(bearing!)
  })
  const head = header.slice()
  const h = view(head)
  h.setUint16(34, long)
  h.setUint16(10, Math.max(h.getUint16(10), ...added.map(m => m.advance)))
  for (const { advance, bearing, extent } of added.filter(m => m.extent)) {
    const size = extent![1] - extent![0]
    h.setInt16(12, Math.min(h.getInt16(12), bearing))
    h.setInt16(14, Math.min(h.getInt16(14), advance - bearing - size))
    h.setInt16(16, Math.max(h.getInt16(16), bearing + size))
  }
  return { table: w.finish(), header: head }
}
