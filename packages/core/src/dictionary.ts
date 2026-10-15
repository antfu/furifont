import type { ManualSource } from './schema'

/** One (written form, reading) pair of JMdict, aligned by JmdictFurigana. */
export interface DictionaryEntry {
  form: string
  /** JmdictFurigana alignment: `0:に;1:ほん`, or `0-1:きょう` for a reading spanning characters. */
  furigana: string
  /** The form's newspaper frequency bucket (nf01..nf48), 0 when unranked. */
  nf: number
  /** The reading's JMdict priority tags, space separated; empty for uncommon readings. */
  priority: string
  /** Position of the reading among the form's readings, in JMdict order. */
  order: number
  /** `来る`-type verb, whose kanji reads differently as it conjugates. */
  conjugatesReading?: boolean
  /** The JLPT level whose word list has this pair: 5 for N5 down to 1 for N1. */
  jlpt?: number
  /** How many times Tatoeba's example sentences use the pair, spelled this way. */
  tatoeba?: number
}

/** Everything `fuseDictionary` merges into a `Dictionary`. */
export interface DictionarySources {
  versions: Record<string, string>
  onyomi: Record<string, string[]>
  entries: DictionaryEntry[]
  /** Place names, each with the one reading to show; common words take precedence over them. */
  places: { form: string, furigana: string }[]
  /** Word lists kept by hand, by source name, in inline notation; like place names, they fill runs no common word claims. */
  manual: Partial<Record<ManualSource, string[]>>
  /** Curated default readings in inline notation, for words the data ranks wrong; pins override them. */
  defaults: string[]
  bare: string[]
}

/** A ruby annotation over characters `[start, end)` of a run. */
export interface RubySpan {
  start: number
  end: number
  ruby: string
}

/** A maximal sequence of Han characters with its reading, the unit a shaper sees. */
export interface HanRun {
  text: string
  spans: RubySpan[]
}

const HAN = /\p{Script=Han}/u

export function isHan(char: string): boolean {
  return HAN.test(char)
}

/** Spans of a JmdictFurigana alignment; a loop, not splits, as the planner parses the 400,000 readings of the dictionary as it starts. */
export function parseFurigana(furigana: string): RubySpan[] {
  const spans: RubySpan[] = []
  for (const part of furigana.split(';')) {
    if (!part)
      continue
    const colon = part.indexOf(':')
    const range = colon < 0 ? part : part.slice(0, colon)
    const dash = range.indexOf('-')
    const start = Number(dash < 0 ? range : range.slice(0, dash))
    spans.push({ start, end: (dash < 0 ? start : Number(range.slice(dash + 1))) + 1, ruby: colon < 0 ? '' : part.slice(colon + 1) })
  }
  return spans
}

/**
 * Splits a form into its Han runs. Browsers itemize text by script before
 * shaping, so a font only ever sees one run at a time: okurigana and other
 * kana are never visible as context. Runs with an unannotated kanji or an
 * annotation leaking outside the run are dropped.
 */
export function hanRuns(form: string, spans: readonly RubySpan[]): HanRun[] {
  const chars = [...form]
  const runs: HanRun[] = []
  for (let i = 0; i < chars.length;) {
    if (!isHan(chars[i]!)) {
      i++
      continue
    }
    let end = i
    while (end < chars.length && isHan(chars[end]!))
      end++
    const inside = spans.filter(s => s.start < end && s.end > i)
    const covered = inside.reduce((n, s) => n + s.end - s.start, 0)
    if (covered === end - i && inside.every(s => s.start >= i && s.end <= end && s.ruby))
      runs.push({ text: chars.slice(i, end).join(''), spans: inside.map(s => ({ ...s, start: s.start - i, end: s.end - i })) })
    i = end
  }
  return runs
}

/**
 * Parses the inline notation for custom words: `日[に]本[ほん]` for one reading
 * per kanji, `今日[きょう]` for a reading over several kanji, kana as written.
 */
export function parseNotation(notation: string): { form: string, spans: RubySpan[] } {
  const spans: RubySpan[] = []
  let form = ''
  for (const match of notation.matchAll(/([^[\]]*)\[([^\]]*)\]|([^[\]]+)$/g)) {
    const [, base = match[3]!, ruby] = match
    const chars = [...base]
    const start = [...form].length
    form += base
    if (ruby === undefined)
      continue
    let kanjiFrom = chars.length
    while (kanjiFrom > 0 && isHan(chars[kanjiFrom - 1]!))
      kanjiFrom--
    if (kanjiFrom === chars.length)
      throw new Error(`"[${ruby}]" in "${notation}" does not follow a kanji`)
    spans.push({ start: start + kanjiFrom, end: start + chars.length, ruby })
  }
  if (!spans.length)
    throw new Error(`"${notation}" has no reading, write it like 日[に]本[ほん]`)
  return { form, spans }
}

export function formatNotation(text: string, spans: readonly RubySpan[]): string {
  const chars = [...text]
  let out = ''
  let at = 0
  for (const s of spans) {
    out += `${chars.slice(at, s.end).join('')}[${s.ruby}]`
    at = s.end
  }
  return out + chars.slice(at).join('')
}

export function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key)
  if (value === undefined)
    map.set(key, value = create())
  return value
}
