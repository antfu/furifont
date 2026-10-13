import { view, Writer } from './binary'

/** The first glyph-name index that refers to the table's own strings, after the 258 standard Mac names. */
const MAC_NAMES = 258

/** The names a format 2 post table spells out itself. */
function ownNames(post: Uint8Array): string[] {
  const d = view(post)
  const names: string[] = []
  for (let at = 34 + d.getUint16(32) * 2; at < post.length; at += 1 + post[at]!)
    names.push(String.fromCharCode(...post.subarray(at + 1, at + 1 + post[at]!)))
  return names
}

export function postGlyphNames(post: Uint8Array): Set<string> {
  return new Set(view(post).getUint32(0) === 0x00020000 ? ownNames(post) : [])
}

/** Names the appended glyphs in a format 2 table; other formats carry no names to extend. */
export function appendGlyphNames(post: Uint8Array, names: string[]): Uint8Array {
  const d = view(post)
  if (d.getUint32(0) !== 0x00020000)
    return post
  const count = d.getUint16(32)
  const strings = ownNames(post)
  const w = new Writer().bytes(post.subarray(0, 32)).u16(count + names.length)
  for (let g = 0; g < count; g++)
    w.u16(d.getUint16(34 + g * 2))
  names.forEach((_, i) => w.u16(MAC_NAMES + strings.length + i))
  for (const name of [...strings, ...names])
    w.u8(name.length).bytes(Uint8Array.from(name, c => c.charCodeAt(0)))
  return w.finish()
}
