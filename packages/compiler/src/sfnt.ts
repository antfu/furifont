import { tagAt, view, Writer } from './binary'

export interface Sfnt {
  /** `0x00010000` for TrueType outlines, `OTTO` for CFF. */
  flavor: number
  tables: Map<string, Uint8Array>
}

const FLAVORS = new Set([0x00010000, 0x4F54544F, 0x74727565])

export function readSfnt(data: Uint8Array): Sfnt {
  const d = view(data)
  const flavor = d.getUint32(0)
  if (!FLAVORS.has(flavor))
    throw new Error('the base font must be an OpenType or TrueType file, not WOFF, WOFF2 or a collection')
  const tables = new Map<string, Uint8Array>()
  for (let i = 0; i < d.getUint16(4); i++) {
    const record = 12 + i * 16
    const offset = d.getUint32(record + 8)
    tables.set(tagAt(data, record), data.subarray(offset, offset + d.getUint32(record + 12)))
  }
  return { flavor, tables }
}

function checksum(bytes: Uint8Array): number {
  const padded = new Uint8Array((bytes.length + 3) & ~3)
  padded.set(bytes)
  const d = view(padded)
  let sum = 0
  for (let i = 0; i < padded.length; i += 4)
    sum = (sum + d.getUint32(i)) >>> 0
  return sum
}

export function writeSfnt({ flavor, tables }: Sfnt): Uint8Array {
  const tags = [...tables.keys()].sort()
  const range = 2 ** Math.floor(Math.log2(tags.length))
  const directory = new Writer().u32(flavor).u16(tags.length).u16(range * 16).u16(Math.log2(range)).u16((tags.length - range) * 16)
  let offset = 12 + tags.length * 16
  const placed: { tag: string, offset: number, data: Uint8Array }[] = []
  for (const tag of tags) {
    const data = tables.get(tag)!
    // The head checksum is taken with checkSumAdjustment zeroed.
    if (tag === 'head')
      view(data).setUint32(8, 0)
    directory.tag(tag).u32(checksum(data)).u32(offset).u32(data.length)
    placed.push({ tag, offset, data })
    offset += (data.length + 3) & ~3
  }
  const file = new Uint8Array(offset)
  file.set(directory.finish())
  for (const table of placed)
    file.set(table.data, table.offset)
  const head = placed.find(t => t.tag === 'head')!
  view(file).setUint32(head.offset + 8, (0xB1B0AFBA - checksum(file)) >>> 0)
  return file
}
