/** A run of kanji, then the reading its okurigana pick: the okurigana that read one way, under that reading. `""` holds pairs that read two ways. */
export type PackedOkurigana = Record<string, Record<string, string[]>>

/**
 * Packs pairs (来ない こ, 一人も ひとり) by the run of kanji and then by reading.
 * That is a quarter fewer bytes than a flat list, and a page only parses it:
 * it inverts the okurigana of a run when it first meets that run. Nothing is
 * lost, so `unpackOkurigana` gives the pairs back.
 */
export function packOkurigana(pairs: Iterable<[key: string, reading: string | null]>): PackedOkurigana {
  const table: PackedOkurigana = {}
  for (const [key, reading] of pairs) {
    const run = /^\p{sc=Han}+/u.exec(key)![0]
    ;((table[run] ??= {})[reading ?? ''] ??= []).push(key.slice(run.length))
  }
  // Sorted, so the file diffs and compresses well.
  return Object.fromEntries(Object.entries(table).sort(([a], [b]) => a.localeCompare(b, 'ja')).map(([run, group]) =>
    [run, Object.fromEntries(Object.entries(group).sort(([a], [b]) => a.localeCompare(b, 'ja')).map(([reading, list]) => [reading, list.toSorted()]))]))
}

export function unpackOkurigana(table: PackedOkurigana): [key: string, reading: string | null][] {
  return Object.entries(table).flatMap(([run, group]) => Object.entries(group).flatMap(([reading, list]) => list.map((okurigana): [string, string | null] => [run + okurigana, reading || null])))
}

/** The file: a run a line, so updates diff well. */
export function formatPacked(table: PackedOkurigana): string {
  return `{\n${Object.entries(table).map(([run, group]) => `${JSON.stringify(run)}:${JSON.stringify(group)}`).join(',\n')}\n}\n`
}

/**
 * The pairs that change what a page shows. A page takes the longest pair a
 * text starts with, and shows nothing for a null one or a reading the font
 * cannot `shown`, so these read as null; then a pair that reads as the
 * shorter pair it extends would anyway is dropped.
 */
export function prunePairs(pairs: Iterable<[key: string, reading: string | null]>, shown: (run: string, reading: string) => boolean): [key: string, reading: string | null][] {
  const kept = new Map<string, string | null>()
  for (const [key, reading] of [...pairs].sort((a, b) => a[0].length - b[0].length)) {
    const run = /^\p{sc=Han}+/u.exec(key)![0]
    const read = reading !== null && shown(run, reading) ? reading : null
    let shorter: string | null = null
    for (let end = key.length - 1; end > run.length; end--) {
      if (kept.has(key.slice(0, end))) {
        shorter = kept.get(key.slice(0, end)) ?? null
        break
      }
    }
    if (read !== shorter)
      kept.set(key, read)
  }
  return [...kept]
}
