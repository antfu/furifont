import type { FontNames } from './names'
import type { Outline } from './outline'
import { view, Writer } from './binary'
import { charstring } from './charstring'

/** A DICT operand: a number, or a real kept as its original bytes so it round-trips exactly. */
type Operand = number | Uint8Array
type Dict = Map<number, Operand[]>

const op = { FullName: 2, FamilyName: 3, FontBBox: 5, charset: 15, Encoding: 16, CharStrings: 17, Private: 18, Subrs: 19, defaultWidthX: 20, nominalWidthX: 21, ROS: 1230, CIDCount: 1234, FDArray: 1236, FDSelect: 1237, FontName: 1238 } as const
const STANDARD_STRINGS = 391

function readNumber(bytes: Uint8Array, at: number): [value: number, next: number] {
  const b = bytes[at]!
  if (b >= 32 && b <= 246)
    return [b - 139, at + 1]
  if (b >= 247 && b <= 250)
    return [(b - 247) * 256 + bytes[at + 1]! + 108, at + 2]
  if (b >= 251 && b <= 254)
    return [-(b - 251) * 256 - bytes[at + 1]! - 108, at + 2]
  if (b === 28)
    return [view(bytes).getInt16(at + 1), at + 3]
  if (b === 29)
    return [view(bytes).getInt32(at + 1), at + 5]
  throw new Error(`unexpected CFF DICT byte ${b}`)
}

function readDict(bytes: Uint8Array): Dict {
  const dict: Dict = new Map()
  let operands: Operand[] = []
  for (let at = 0; at < bytes.length;) {
    const b = bytes[at]!
    if (b <= 21) {
      dict.set(b === 12 ? 1200 + bytes[at + 1]! : b, operands)
      operands = []
      at += b === 12 ? 2 : 1
    }
    else if (b === 30) {
      const start = at++
      while ((bytes[at]! & 0x0F) !== 0x0F && (bytes[at]! >> 4) !== 0x0F)
        at++
      operands.push(bytes.subarray(start, ++at))
    }
    else {
      const [value, next] = readNumber(bytes, at)
      operands.push(value)
      at = next
    }
  }
  return dict
}

/** Integers take five bytes, so an offset can change without moving anything after it. */
function writeDict(dict: Dict): Uint8Array {
  const w = new Writer()
  for (const [key, operands] of dict) {
    for (const operand of operands) {
      if (typeof operand === 'number')
        w.u8(29).u32(operand)
      else
        w.bytes(operand)
    }
    if (key >= 1200)
      w.u8(12).u8(key - 1200)
    else
      w.u8(key)
  }
  return w.finish()
}

function integer(operands: Operand[] | undefined, fallback = 0): number {
  const value = operands?.[0]
  if (value === undefined)
    return fallback
  if (typeof value !== 'number')
    throw new Error('expected an integer in the CFF DICT')
  return value
}

interface Index {
  items: Uint8Array[]
  end: number
}

function readIndex(cff: Uint8Array, at: number): Index {
  const d = view(cff)
  const count = d.getUint16(at)
  if (!count)
    return { items: [], end: at + 2 }
  const size = d.getUint8(at + 2)
  const offset = (i: number): number => {
    let value = 0
    for (let k = 0; k < size; k++)
      value = value * 256 + d.getUint8(at + 3 + i * size + k)
    return value
  }
  const data = at + 2 + (count + 1) * size
  return { items: Array.from({ length: count }, (_, i) => cff.subarray(data + offset(i), data + offset(i + 1))), end: data + offset(count) }
}

function writeIndex(items: Uint8Array[]): Uint8Array {
  const w = new Writer().u16(items.length)
  if (!items.length)
    return w.finish()
  const total = items.reduce((sum, item) => sum + item.length, 1)
  const size = total < 0x100 ? 1 : total < 0x10000 ? 2 : total < 0x1000000 ? 3 : 4
  w.u8(size)
  const offset = (value: number): void => {
    for (let k = size - 1; k >= 0; k--)
      w.u8(Math.floor(value / 256 ** k))
  }
  let at = 1
  offset(at)
  for (const item of items)
    offset(at += item.length)
  for (const item of items)
    w.bytes(item)
  return w.finish()
}

interface Private {
  /** The Private DICT, then its local Subrs. */
  block: Uint8Array
  /** Size of the Private DICT alone. */
  size: number
  defaultWidthX: number
  nominalWidthX: number
}

function readPrivate(cff: Uint8Array, [size, offset]: Operand[]): Private {
  if (typeof size !== 'number' || typeof offset !== 'number')
    throw new Error('expected a Private DICT offset')
  const dict = readDict(cff.subarray(offset, offset + size))
  const widths = { defaultWidthX: integer(dict.get(op.defaultWidthX)), nominalWidthX: integer(dict.get(op.nominalWidthX)) }
  const subrs = integer(dict.get(op.Subrs))
  if (!subrs)
    return { block: cff.slice(offset, offset + size), size, ...widths }
  // The local Subrs move to right after the DICT; the offset's five bytes keep its size fixed.
  dict.set(op.Subrs, [0])
  const dictSize = writeDict(dict).length
  dict.set(op.Subrs, [dictSize])
  const block = new Writer().bytes(writeDict(dict)).bytes(cff.subarray(offset + subrs, readIndex(cff, offset + subrs).end)).finish()
  return { block, size: dictSize, ...widths }
}

/** Format 2: ranges of consecutive CIDs or SIDs, after .notdef. */
function writeCharset(ids: number[]): Uint8Array {
  const w = new Writer().u8(2)
  for (let g = 1; g < ids.length;) {
    let left = 0
    while (g + left + 1 < ids.length && ids[g + left + 1] === ids[g]! + left + 1 && left < 0xFFFF)
      left++
    w.u16(ids[g]!).u16(left)
    g += left + 1
  }
  return w.finish()
}

/** Format 3: ranges of glyphs that share a Font DICT. */
function writeFdSelect(fds: number[]): Uint8Array {
  const ranges: [number, number][] = []
  for (const [g, fd] of fds.entries()) {
    if (fd !== ranges.at(-1)?.[1])
      ranges.push([g, fd])
  }
  const w = new Writer().u8(3).u16(ranges.length)
  for (const [g, fd] of ranges)
    w.u16(g).u8(fd)
  return w.u16(fds.length).finish()
}

interface NewGlyph {
  charstring: Uint8Array
  /** CID, or the SID of the glyph name. */
  id: number
  fd: number
}

/** A CFF table that keeps every base glyph and subroutine as bytes, and appends glyphs. */
export class Cff {
  private readonly header: Uint8Array
  private readonly top: Dict
  private readonly strings: Uint8Array[]
  private readonly globalSubrs: Uint8Array
  private readonly charStrings: Uint8Array[]
  /** CID or glyph-name SID of each glyph. */
  private readonly charset: number[]
  private readonly fdSelect: number[] = []
  private readonly fdDicts: Dict[] = []
  private readonly privates: Private[]
  private readonly added: NewGlyph[] = []
  private readonly usedIds: Set<number>
  private nextCid = 1
  readonly isCid: boolean
  private postScriptName: string

  constructor(cff: Uint8Array) {
    const d = view(cff)
    this.header = cff.slice(0, d.getUint8(2))
    const names = readIndex(cff, this.header.length)
    const top = readIndex(cff, names.end)
    const strings = readIndex(cff, top.end)
    const globalSubrs = readIndex(cff, strings.end)
    this.postScriptName = new TextDecoder().decode(names.items[0])
    this.top = readDict(top.items[0]!)
    this.strings = strings.items
    this.globalSubrs = cff.slice(strings.end, globalSubrs.end)
    this.charStrings = readIndex(cff, integer(this.top.get(op.CharStrings))).items
    this.isCid = this.top.has(op.ROS)
    this.charset = this.readCharset(cff, integer(this.top.get(op.charset)))
    this.usedIds = new Set(this.charset)
    if (this.isCid) {
      this.readFdSelect(cff, integer(this.top.get(op.FDSelect)))
      this.fdDicts = readIndex(cff, integer(this.top.get(op.FDArray))).items.map(readDict)
      this.privates = this.fdDicts.map(fd => readPrivate(cff, fd.get(op.Private)!))
    }
    else {
      this.privates = [readPrivate(cff, this.top.get(op.Private)!)]
    }
    // OpenType maps characters with cmap; a custom CFF Encoding would need relocating for nothing.
    this.top.delete(op.Encoding)
  }

  get glyphCount(): number {
    return this.charStrings.length + this.added.length
  }

  private readCharset(cff: Uint8Array, at: number): number[] {
    if (at <= 2)
      throw new Error('CFF fonts with a predefined charset are not supported')
    const d = view(cff)
    const ids = [0]
    const format = d.getUint8(at++)
    while (ids.length < this.charStrings.length) {
      if (format === 0) {
        ids.push(d.getUint16(at))
        at += 2
        continue
      }
      const first = d.getUint16(at)
      const left = format === 1 ? d.getUint8(at + 2) : d.getUint16(at + 2)
      at += format === 1 ? 3 : 4
      for (let k = 0; k <= left; k++)
        ids.push(first + k)
    }
    return ids
  }

  private readFdSelect(cff: Uint8Array, at: number): void {
    const d = view(cff)
    const format = d.getUint8(at)
    if (format === 0) {
      for (let g = 0; g < this.charStrings.length; g++)
        this.fdSelect.push(d.getUint8(at + 1 + g))
      return
    }
    for (let r = 0; r < d.getUint16(at + 1); r++) {
      const range = at + 3 + r * 3
      for (let g = d.getUint16(range); g < d.getUint16(range + 3); g++)
        this.fdSelect[g] = d.getUint8(range + 2)
    }
  }

  private string(text: string): number {
    this.strings.push(new TextEncoder().encode(text))
    return STANDARD_STRINGS + this.strings.length - 1
  }

  /** Names of the glyphs a name-keyed font names with its own strings. */
  glyphNames(): Set<string> {
    const decoder = new TextDecoder()
    return new Set(this.charset.filter(sid => sid >= STANDARD_STRINGS).map(sid => decoder.decode(this.strings[sid - STANDARD_STRINGS])))
  }

  /** Appends a glyph drawn in the Private DICT of `like`, the base glyph it is made from. */
  addGlyph(name: string, outline: Outline, like: number): void {
    const fd = this.isCid ? this.fdSelect[like]! : 0
    let id: number
    if (this.isCid) {
      // Subset CID fonts keep their original CIDs, which are 16-bit: reuse the gaps.
      while (this.usedIds.has(this.nextCid))
        this.nextCid++
      if (this.nextCid > 0xFFFF)
        throw new Error('no free CIDs left in the base font')
      id = this.nextCid
      this.usedIds.add(id)
    }
    else {
      id = this.string(name)
    }
    this.added.push({ charstring: charstring(outline, this.privates[fd]!), id, fd })
  }

  rename(names: FontNames): void {
    const old = this.postScriptName
    this.postScriptName = names.postScript
    this.top.set(op.FullName, [this.string(names.full)])
    this.top.set(op.FamilyName, [this.string(names.family)])
    const decoder = new TextDecoder()
    for (const fd of this.fdDicts) {
      const sid = fd.get(op.FontName)?.[0]
      if (typeof sid === 'number' && sid >= STANDARD_STRINGS)
        fd.set(op.FontName, [this.string(decoder.decode(this.strings[sid - STANDARD_STRINGS]).replace(old, names.postScript))])
    }
  }

  /** Grows FontBBox to cover `bounds`. */
  include([xMin, yMin, xMax, yMax]: [number, number, number, number]): void {
    const box = this.top.get(op.FontBBox)
    const [a = 0, b = 0, c = 0, e = 0] = box?.every(v => typeof v === 'number') ? box : []
    this.top.set(op.FontBBox, [Math.min(a, xMin), Math.min(b, yMin), Math.max(c, xMax), Math.max(e, yMax)])
  }

  /** The DICT holding each Private DICT's offset. */
  private privateOwner(i: number): Dict {
    return this.isCid ? this.fdDicts[i]! : this.top
  }

  compile(): Uint8Array {
    const ids = [...this.charset, ...this.added.map(g => g.id)]
    const sections: [number, Uint8Array][] = [[op.charset, writeCharset(ids)]]
    if (this.isCid) {
      sections.push([op.FDSelect, writeFdSelect([...this.fdSelect, ...this.added.map(g => g.fd)])])
      this.top.set(op.CIDCount, [Math.max(integer(this.top.get(op.CIDCount), 8720), Math.max(...ids) + 1)])
    }
    sections.push([op.CharStrings, writeIndex([...this.charStrings, ...this.added.map(g => g.charstring)])])
    const fdArray = (): Uint8Array => writeIndex(this.fdDicts.map(writeDict))
    // Every offset is a five-byte integer, so sizes are known before the offsets are.
    for (const key of [...sections.map(([key]) => key), ...(this.isCid ? [op.FDArray] : [])])
      this.top.set(key, [0])
    this.privates.forEach((p, i) => this.privateOwner(i).set(op.Private, [p.size, 0]))
    const name = writeIndex([new TextEncoder().encode(this.postScriptName)])
    const strings = writeIndex(this.strings)
    let at = this.header.length + name.length + writeIndex([writeDict(this.top)]).length + strings.length + this.globalSubrs.length
    for (const [key, bytes] of sections) {
      this.top.set(key, [at])
      at += bytes.length
    }
    if (this.isCid) {
      this.top.set(op.FDArray, [at])
      at += fdArray().length
    }
    for (const [i, p] of this.privates.entries()) {
      this.privateOwner(i).set(op.Private, [p.size, at])
      at += p.block.length
    }
    const w = new Writer().bytes(this.header).bytes(name).bytes(writeIndex([writeDict(this.top)])).bytes(strings).bytes(this.globalSubrs)
    sections.forEach(([, bytes]) => w.bytes(bytes))
    if (this.isCid)
      w.bytes(fdArray())
    this.privates.forEach(p => w.bytes(p.block))
    return w.finish()
  }
}
