import type { RubySpan } from './dictionary'
import { getOrCreate } from './dictionary'

/** A suffix reading is the one a kanji takes in this share of the runs it ends, out of at least `SUFFIX_MIN_RUNS`. */
const SUFFIX_MIN_SHARE = 0.9
const SUFFIX_MIN_RUNS = 10

export interface Suffixes {
  readings: Map<string, string>
  /** Suffixes that start more of the dictionary's runs than they end: before another kanji, they may start a word the font does not know, as 大 does. */
  final: Set<string>
}

/**
 * The kanji that read one way ending the runs, given each run with the spans
 * of its JMdict readings: 的 てき, 化 か; not 人, にん or じん.
 */
export function pickSuffixes(runs: Iterable<readonly [text: string, readings: readonly (readonly RubySpan[])[]]>): Suffixes {
  const suffixes: Suffixes = { readings: new Map(), final: new Set() }
  const evidence = new Map<string, Map<string, number>>()
  const count = (counts: Map<string, number>, key: string): void => void counts.set(key, (counts.get(key) ?? 0) + 1)
  const starts = new Map<string, number>()
  const ends = new Map<string, number>()
  for (const [text, readings] of runs) {
    const chars = [...text]
    count(starts, chars[0]!)
    count(ends, chars.at(-1)!)
    for (const spans of readings) {
      const span = spans.at(-1)!
      if (span.end - span.start === 1)
        count(getOrCreate(evidence, chars.at(-1)!, () => new Map()), span.ruby)
    }
  }
  for (const [kanji, counts] of evidence) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0)
    const [ruby, top] = [...counts].sort((a, b) => b[1] - a[1])[0]!
    if (total < SUFFIX_MIN_RUNS || top / total < SUFFIX_MIN_SHARE)
      continue
    suffixes.readings.set(kanji, ruby)
    if ((starts.get(kanji) ?? 0) > ends.get(kanji)!)
      suffixes.final.add(kanji)
  }
  return suffixes
}
