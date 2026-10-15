import { view, Writer } from './binary'

interface NameRecord {
  platform: number
  encoding: number
  language: number
  id: number
  bytes: Uint8Array
}

const RIBBI = new Set(['Regular', 'Bold', 'Italic', 'Bold Italic'])
/** The names Furifont rewrites. */
const REPLACED = new Set([1, 2, 3, 4, 5, 6, 10, 16, 17])

function readNames(table: Uint8Array): NameRecord[] {
  const d = view(table)
  const strings = d.getUint16(4)
  return Array.from({ length: d.getUint16(2) }, (_, i) => {
    const at = 6 + i * 12
    const start = strings + d.getUint16(at + 10)
    return {
      platform: d.getUint16(at),
      encoding: d.getUint16(at + 2),
      language: d.getUint16(at + 4),
      id: d.getUint16(at + 6),
      bytes: table.subarray(start, start + d.getUint16(at + 8)),
    }
  })
}

function decode(record: NameRecord): string {
  if (record.platform === 1)
    return String.fromCharCode(...record.bytes)
  return new TextDecoder('utf-16be').decode(record.bytes)
}

/** The English name with this ID, as fontTools' getDebugName picks it. */
export function nameOf(table: Uint8Array, id: number): string | undefined {
  const records = readNames(table).filter(r => r.id === id)
  const record = records.find(r => r.platform === 3 && r.language === 0x409)
    ?? records.find(r => r.platform === 1 && r.language === 0)
    ?? records[0]
  return record && decode(record)
}

export function styleOf(table: Uint8Array): string {
  return nameOf(table, 17) ?? nameOf(table, 2) ?? 'Regular'
}

export interface FontNames {
  family: string
  style: string
  full: string
  postScript: string
}

export function fontNames(table: Uint8Array, family: string): FontNames {
  const style = styleOf(table)
  return { family, style, full: `${family} ${style}`, postScript: `${family.replaceAll(' ', '')}-${style.replaceAll(' ', '')}` }
}

function utf16(text: string): Uint8Array {
  const w = new Writer()
  for (let i = 0; i < text.length; i++)
    w.u16(text.charCodeAt(i))
  return w.finish()
}

/** A variable font's named instances' PostScript names, after the new family: `FurifontSansVF-Bold`. */
export function instancePostScriptNames(fvar: Uint8Array, table: Uint8Array, names: FontNames): [number, string][] {
  const d = view(fvar)
  const axisCount = d.getUint16(8)
  const size = d.getUint16(14)
  if (size < axisCount * 4 + 6)
    return []
  const prefix = names.family.replaceAll(' ', '')
  return Array.from({ length: d.getUint16(12) }, (_, i): [number, string] => {
    const at = d.getUint16(4) + axisCount * d.getUint16(10) + i * size
    return [d.getUint16(at + 4 + axisCount * 4), `${prefix}-${(nameOf(table, d.getUint16(at)) ?? '').replaceAll(' ', '')}`]
  }).filter(([id]) => id !== 0xFFFF)
}

/**
 * Replaces the family, style and version names, and the `extra` ones by ID; a
 * style beyond the four RIBBI ones gets typographic names.
 */
export function renameFont(table: Uint8Array, names: FontNames, revision: string, description: string, extra: [number, string][]): Uint8Array {
  const { family, style, full, postScript } = names
  const ribbi = RIBBI.has(style)
  const entries: [number, string][] = [
    [1, ribbi ? family : full],
    [2, ribbi ? style : 'Regular'],
    [3, `${revision};${postScript}`],
    [4, full],
    [5, `Version ${revision}`],
    [6, postScript],
    [10, description],
  ]
  if (!ribbi)
    entries.push([16, family], [17, style])
  entries.push(...extra)
  const records = readNames(table).filter(r => !REPLACED.has(r.id) && !extra.some(([id]) => id === r.id))
  for (const [id, value] of entries) {
    records.push({ platform: 3, encoding: 1, language: 0x409, id, bytes: utf16(value) })
    // Mac Roman is ASCII in this range; other names stay Windows-only.
    if (/^[\x20-\x7E]*$/.test(value))
      records.push({ platform: 1, encoding: 0, language: 0, id, bytes: Uint8Array.from(value, c => c.charCodeAt(0)) })
  }
  records.sort((a, b) => a.platform - b.platform || a.encoding - b.encoding || a.language - b.language || a.id - b.id)
  const head = new Writer().u16(0).u16(records.length).u16(6 + records.length * 12)
  const strings = new Writer()
  for (const r of records) {
    head.u16(r.platform).u16(r.encoding).u16(r.language).u16(r.id).u16(r.bytes.length).u16(strings.length)
    strings.bytes(r.bytes)
  }
  return head.bytes(strings.finish()).finish()
}
