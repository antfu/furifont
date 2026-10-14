/**
 * What Furifont draws on a page: kanji, kana, CJK punctuation, full-width forms,
 * and the variation selectors that pick a reading. As the `unicode-range` of its
 * faces, it leaves the rest to the page's fonts: Latin text, and icons drawn from
 * ligatures or private-use code points.
 */
export const UNICODE_RANGE = 'U+2E80-2FDF,U+3000-30FF,U+3190-319F,U+31F0-31FF,U+3400-4DBF,U+4E00-9FFF,U+F900-FAFF,U+FE00-FE0F,U+FF00-FFEF,U+20000-3FFFF,U+E0100-E01EF'

/** A run of the text Furifont draws. */
export const JAPANESE = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]/u

/** The families of a `font-family` value, as written: quoted names keep their quotes. */
export function parseFontStack(value: string): string[] {
  return (value.match(/\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^,]+)/g) ?? []).map(family => family.trim()).filter(Boolean)
}

/** A family of a stack without its quotes. */
export function familyName(family: string): string {
  return family.replace(/^(["'])(.*)\1$/, '$2')
}

/** Families made for code, by name: 等幅 is Japanese for monospace (Osaka−等幅). */
const MONOSPACED = /mono|courier|consol|menlo|monaco|等幅/i

/** Whether a stack sets code, where kanji keep the page's font: it falls back to monospace, or starts with a monospaced family. */
export function isMonospace(stack: string[]): boolean {
  const names = stack.map(familyName)
  return names.some(name => name === 'monospace' || name === 'ui-monospace') || MONOSPACED.test(names[0] ?? '')
}
