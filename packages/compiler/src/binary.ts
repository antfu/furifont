/** A 16-bit offset that does not fit: the caller may split the table and retry. */
export class OffsetOverflow extends Error {}

function offset16(value: number): number {
  if (value > 0xFFFF)
    throw new OffsetOverflow(`offset ${value} does not fit in 16 bits`)
  return value
}

export const view = (bytes: Uint8Array): DataView => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

export const tagAt = (bytes: Uint8Array, at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4))

export const uint24At = (data: DataView, at: number): number => (data.getUint8(at) << 16) | data.getUint16(at + 1)

/** A big-endian byte buffer that grows as it is written. */
export class Writer {
  private data = new Uint8Array(256)
  length = 0

  private reserve(n: number): void {
    if (this.length + n <= this.data.length)
      return
    const next = new Uint8Array(Math.max(this.data.length * 2, this.length + n))
    next.set(this.data.subarray(0, this.length))
    this.data = next
  }

  u8(value: number): this {
    this.reserve(1)
    this.data[this.length++] = value & 0xFF
    return this
  }

  u16(value: number): this {
    return this.u8(value >> 8).u8(value)
  }

  u24(value: number): this {
    return this.u8(value >> 16).u16(value)
  }

  u32(value: number): this {
    return this.u16(value >>> 16).u16(value)
  }

  tag(tag: string): this {
    for (let i = 0; i < 4; i++)
      this.u8(tag.charCodeAt(i))
    return this
  }

  bytes(bytes: Uint8Array): this {
    this.reserve(bytes.length)
    this.data.set(bytes, this.length)
    this.length += bytes.length
    return this
  }

  /** Room for a 16-bit offset, filled in by {@link link16}. */
  slot16(): number {
    this.u16(0)
    return this.length - 2
  }

  slot32(): number {
    this.u32(0)
    return this.length - 4
  }

  /** Points the offset at `slot` to the current end, counted from `from`. */
  link16(slot: number, from = 0): void {
    this.set16(slot, offset16(this.length - from))
  }

  link32(slot: number, from: number): void {
    this.set32(slot, this.length - from)
  }

  set16(at: number, value: number): void {
    this.data[at] = (value >> 8) & 0xFF
    this.data[at + 1] = value & 0xFF
  }

  set32(at: number, value: number): void {
    this.set16(at, value >>> 16)
    this.set16(at + 2, value)
  }

  /** Lays `children` out after what is written so far, each pointed to by its 16-bit slot. */
  children(slots: number[], children: Uint8Array[]): this {
    children.forEach((child, i) => {
      this.link16(slots[i]!)
      this.bytes(child)
    })
    return this
  }

  finish(): Uint8Array {
    return this.data.slice(0, this.length)
  }
}
