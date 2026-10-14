/** What the page reads okurigana pairs from: the packed pairs, and the font's reading lists (`.ivs.json`). */
export interface OkuriganaTables {
  /** By run of kanji, then by reading: `{ 来: { こ: ['ない'], '': ['に'] } }`, where `''` holds the okurigana that read two ways. */
  pairs: Record<string, Record<string, string[]>>
  /** A kanji to its readings, in the order `salt` counts them. */
  readings: Record<string, string[]>
  /** A word to its readings in notation (今[こん]日[にち]), in the same order. */
  words: Record<string, string[]>
  /** A kanji alone to the reading the font shows without help. */
  lone: Record<string, string>
}

/** A run of kanji in a text that a pair reads, and the `salt` value that makes the font show that reading. */
interface OkuriganaMatch {
  at: number
  length: number
  reading: string
  salt: number
}

export interface OkuriganaReader {
  find: (value: string) => OkuriganaMatch[]
  /** The `salt` value of a run of kanji read as `reading`, or 0 when the font cannot show it or already does. */
  saltOf: (run: string, reading: string) => number
}

/**
 * Reads runs of kanji in a text by the okurigana after them: 来 is こ in 来ない
 * and き in 来ます, 一人 is ひとり in 一人も. The bookmarklet and the userscript
 * ship this as source text, so it MUST NOT use anything from outside its own body.
 */
export function createOkuriganaReader(tables: OkuriganaTables): OkuriganaReader {
  // The okurigana of each run met so far, by okurigana: inverting the whole file would cost more than pages need.
  const inverted = new Map<string, { reading: Map<string, string | null>, longest: number } | undefined>()
  // A whole run of kanji, before hiragana: the only runs the pairs can speak for.
  const RUN = /(?<!\p{sc=Han})\p{sc=Han}+(?=\p{sc=Hiragana})/gu

  /** What follows `run` in the pairs: its okurigana with the reading each gives (null when they read two ways), and the longest of them. */
  const okuriganaOf = (run: string): { reading: Map<string, string | null>, longest: number } | undefined => {
    if (!inverted.has(run)) {
      const reading = new Map<string, string | null>()
      for (const [given, list] of Object.entries(tables.pairs[run] ?? {})) {
        for (const okurigana of list)
          reading.set(okurigana, given || null)
      }
      inverted.set(run, reading.size ? { reading, longest: Math.max(...[...reading.keys()].map(k => k.length)) } : undefined)
    }
    return inverted.get(run)
  }

  const saltOf = (run: string, reading: string): number => {
    const word = run.length > [...run][0]!.length
    // A word lists its readings in notation, 今[こん]日[にち]: the ruby is what to compare.
    const list = word ? tables.words[run]?.map(notation => [...notation.matchAll(/\[([^\]]*)\]/g)].map(m => m[1]).join('')) : tables.readings[run]
    const index = list?.indexOf(reading) ?? -1
    // The font counts up to 15 readings. A word shows its first by itself, and a kanji alone the one in `lone`.
    return index >= (word ? 1 : 0) && index < 15 && tables.lone[run] !== reading ? index + 1 : 0
  }

  /** The runs of kanji in `value` the pairs can read: the longest pair the text starts with decides, and a null one leaves the run bare. */
  const find = (value: string): OkuriganaMatch[] => {
    const found = []
    for (const { 0: run, index: at } of value.matchAll(RUN)) {
      const okurigana = okuriganaOf(run)
      const after = value.slice(at + run.length, at + run.length + (okurigana?.longest ?? 0))
      let reading: string | null | undefined
      for (let kept = after.length; kept > 0 && reading === undefined; kept--)
        reading = okurigana?.reading.get(after.slice(0, kept))
      const salt = reading ? saltOf(run, reading) : 0
      if (reading && salt)
        found.push({ at, length: run.length, reading, salt })
    }
    return found
  }

  return { find, saltOf }
}
