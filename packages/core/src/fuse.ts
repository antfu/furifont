import type { DictionaryEntry, DictionarySources, HanRun, RubySpan } from './dictionary'
import type { Dictionary, ManualSource, Reading, Source } from './schema'
import { getOrCreate, hanRuns, parseFurigana, parseNotation } from './dictionary'
import { JLPT_LEVELS, MANUAL_SOURCES, SCORE, scoreOf, SOURCE_BITS, sourceBit } from './schema'

/** JMdict orders readings within a form; a run read inside a longer form ranks after the form's own readings. */
const OTHER_FORM_ORDER = 1000
const OKURIGANA = /[\u3041-\u3096]/
/** Uses in Tatoeba's sentences that make a word one of the sentences'. */
const MIN_USES = 3
/** With this many uses alone in the sentences, they decide how a lone kanji reads rather than the word lists. */
const LONE_MIN_USES = 20
/** A tagged reading of a kanji that the sentences decide keeps this score at most, so it stays among the kanji's readings. */
const LONE_TAGGED_FLOOR = 60
const PRIORITY_LISTS = ['ichi', 'news', 'spec', 'gai'] as const
const MANUAL_BITS = MANUAL_SOURCES.reduce((mask, name) => mask | sourceBit(name), 0)

/** What the sources say of a reading as entries add up, before it is scored. */
interface Evidence {
  sources: number
  /** Its position in JMdict's order, for a JMdict reading. */
  order?: number
  /** The most frequent tagged entry's newspaper bucket, or 24 for a `*1` tag and 48 for others. */
  rank?: number
  /** Easiest JLPT level listing it, 5 for N5. */
  jlpt?: number
  uses?: number
}

type Readings = Map<string, Evidence>

/** The evidence of `text` read as `key`, met for the first time or not. */
function evidenceOf(table: Map<string, Readings>, text: string, key: string): Evidence {
  return getOrCreate(getOrCreate(table, text, () => new Map()), key, (): Evidence => ({ sources: 0 }))
}

/** Spans as a JmdictFurigana alignment: `0:に;1:ほん`, `0-1:きょう`. */
export function formatFurigana(spans: readonly RubySpan[]): string {
  return spans.map(s => `${s.end - s.start > 1 ? `${s.start}-${s.end - 1}` : s.start}:${s.ruby}`).join(';')
}

/** Rough corpus frequency of a tagged entry, in newspaper buckets of ~500 words each. */
function rankOf(entry: DictionaryEntry): number | undefined {
  if (entry.priority)
    return entry.nf || Number(/nf(\d+)/.exec(entry.priority)?.[1] ?? 0) || (/[a-z]1\b/.test(entry.priority) ? 24 : 48)
}

/** Adds what a JMdict entry says of a reading: its lists, its rank and its JLPT level. */
function addEntry(into: Evidence, entry: DictionaryEntry): void {
  into.sources |= sourceBit('jmdict')
  if (entry.jlpt)
    into.jlpt = Math.max(into.jlpt ?? 0, entry.jlpt)
  const rank = rankOf(entry)
  if (!rank)
    return
  into.rank = Math.min(into.rank ?? rank, rank)
  if (entry.nf)
    into.sources |= sourceBit('nf')
  for (const list of PRIORITY_LISTS.filter(list => new RegExp(`\\b${list}[12]\\b`).test(entry.priority)))
    into.sources |= sourceBit(list)
}

function addRun(runs: Map<string, Readings>, run: HanRun, entry: DictionaryEntry): void {
  const evidence = evidenceOf(runs, run.text, formatFurigana(run.spans))
  const order = run.text === entry.form ? entry.order : OTHER_FORM_ORDER + entry.order
  evidence.order = Math.min(evidence.order ?? order, order)
  if (entry.tatoeba)
    evidence.uses = Math.max(evidence.uses ?? 0, entry.tatoeba)
  addEntry(evidence, entry)
}

interface Kanji {
  /** Readings of tagged words, which alone weigh in a lone kanji's reading. */
  tagged: Map<string, Readings>
  /** Uses in Tatoeba's sentences of each reading of the kanji alone in its run, tagged words or not: 箱 はこ and ゴミ箱 ばこ alike. */
  uses: Map<string, Map<string, number>>
  inflecting: Map<string, Set<string>>
}

function addKanji(kanji: Kanji, run: HanRun, entry: DictionaryEntry): void {
  const ruby = run.spans[0]!.ruby
  // 来る's dictionary form says nothing of 来た.
  if (entry.tatoeba && !entry.conjugatesReading) {
    const uses = getOrCreate(kanji.uses, run.text, () => new Map())
    uses.set(ruby, (uses.get(ruby) ?? 0) + entry.tatoeba)
  }
  if (rankOf(entry)) {
    // 来る reads く, き or こ as it conjugates: its dictionary form alone is no evidence.
    for (const r of entry.conjugatesReading && ruby === 'く' ? ['く', 'き', 'こ'] : [ruby])
      addEntry(evidenceOf(kanji.tagged, run.text, r), entry)
  }
  else if (OKURIGANA.test(entry.form[entry.form.indexOf(run.text) + run.text.length] ?? '')) {
    getOrCreate(kanji.inflecting, run.text, () => new Set()).add(ruby)
  }
}

/** Its sources with the JLPT level and Tatoeba's sentences as bits. */
function sourcesOf(evidence: Evidence): number {
  const level = evidence.jlpt && JLPT_LEVELS[5 - evidence.jlpt]
  return evidence.sources | (level ? sourceBit(level) : 0) | ((evidence.uses ?? 0) >= MIN_USES ? sourceBit('tatoeba') : 0)
}

/** Kanji up to this many are scored as the sources say; each one more costs {@link LONG_PENALTY} points. */
const LONG_RUN = 4
const LONG_PENALTY = 2

/** The lowest score still in the tier of `score`: a long run scores lower, but never as another kind of word. */
const tierFloor = (score: number): number => score > SCORE.tagged ? SCORE.tagged + 1 : score > SCORE.used ? SCORE.used + 1 : score > SCORE.listed ? SCORE.listed + 1 : score

/** How common a run's reading is, by the most telling of its sources, less for each kanji past {@link LONG_RUN}: a long word is rarer than its parts. */
function runScore(evidence: Evidence, size: number): number {
  const score = sourceScore(evidence)
  return Math.max(tierFloor(score), score - Math.max(0, size - LONG_RUN) * LONG_PENALTY)
}

function sourceScore(evidence: Evidence): number {
  const uses = evidence.uses ?? 0
  return Math.max(
    evidence.rank ? scoreOf(1 / evidence.rank) : 0,
    uses >= MIN_USES ? SCORE.used + Math.min(uses, SCORE.tagged - SCORE.used) : 0,
    evidence.sources & MANUAL_BITS ? 15 : 0,
    evidence.sources & sourceBit('place') ? 10 : 0,
    evidence.order === undefined ? 0 : SCORE.listed,
  )
}

const tier = (score: number): number => [SCORE.tagged, SCORE.used, SCORE.listed].filter(bound => score > bound).length

interface Scored {
  key: string
  spans: RubySpan[]
  score: number
  sources: number
  order: number
}

/**
 * A run's readings ranked, the default first: tagged ones, then those the
 * sentences use, each by JMdict's order; then the lists' and the place
 * names', then the other JMdict words', each by score. Readings of the same
 * kana are one, under the alignment that splits them most: 倉本 くら・もと
 * rather than くらもと.
 */
function rankReadings(readings: Readings, size: number): [string, Reading][] {
  const byKana = new Map<string, Scored>()
  for (const [key, evidence] of readings) {
    const spans = parseFurigana(key)
    const reading = { key, spans, score: runScore(evidence, size), sources: sourcesOf(evidence), order: evidence.order ?? Infinity }
    const kana = spans.map(s => s.ruby).join('')
    const same = byKana.get(kana)
    if (!same) {
      byKana.set(kana, reading)
      continue
    }
    const finer = reading.spans.length > same.spans.length ? reading : same
    byKana.set(kana, { ...finer, score: Math.max(same.score, reading.score), sources: same.sources | reading.sources, order: Math.min(same.order, reading.order) })
  }
  return [...byKana.values()]
    .sort((a, b) => tier(b.score) - tier(a.score) || (tier(a.score) > 1 ? a.order - b.order || b.score - a.score : b.score - a.score || a.order - b.order))
    .map(r => [r.key, [r.score, r.sources]])
}

/**
 * When the sentences use a kanji alone often enough to tell, each reading
 * scores by its share of those uses, so that its weight in the planner is
 * about that share; a tagged one keeps a little, to stay among its readings.
 */
function scoreUses(readings: Map<string, Reading>, uses: Map<string, number>): void {
  const total = [...uses.values()].reduce((a, b) => a + b, 0)
  if (total < LONE_MIN_USES)
    return
  for (const reading of readings.values())
    reading[0] = Math.min(reading[0], LONE_TAGGED_FLOOR)
  for (const [ruby, n] of uses) {
    const reading = getOrCreate(readings, ruby, (): Reading => [0, sourceBit('jmdict')])
    reading[0] = Math.max(reading[0], scoreOf(n / total))
    if (n >= MIN_USES)
      reading[1] |= sourceBit('tatoeba')
  }
}

/** A lone kanji's readings, the most common first: tagged words and the sentences score them; rare verbs add readings that score nothing. */
function kanjiReadings(kanji: Kanji): Map<string, Map<string, Reading>> {
  const out = new Map<string, Map<string, Reading>>()
  for (const [text, tagged] of kanji.tagged) {
    const readings = new Map([...tagged].map(([ruby, evidence]): [string, Reading] => [ruby, [scoreOf(1 / evidence.rank!), sourcesOf(evidence)]]))
    scoreUses(readings, kanji.uses.get(text) ?? new Map())
    // A reading the sentences barely use, and no list tags, weighs nothing.
    out.set(text, new Map([...readings].filter(([, [score]]) => score).sort((a, b) => b[1][0] - a[1][0])))
  }
  for (const [text, rubies] of kanji.inflecting) {
    const readings = getOrCreate(out, text, () => new Map())
    for (const ruby of rubies) {
      const [score, sources] = readings.get(ruby) ?? [0, sourceBit('jmdict')]
      readings.set(ruby, [score, sources | sourceBit('inflecting')])
    }
  }
  return out
}

function notationRuns(notation: string): HanRun[] {
  const { form, spans } = parseNotation(notation)
  return hanRuns(form, spans)
}

/** The runs each list names, as the planner reads them: no lone kanji, which would be no evidence for the kanji's reading. */
function listedRuns(sources: DictionarySources): [HanRun, ManualSource | 'place'][] {
  const manual = MANUAL_SOURCES.flatMap(name => (sources.manual[name] ?? []).flatMap(notationRuns).map((run): [HanRun, ManualSource] => [run, name]))
  const places = sources.places.flatMap((place): [HanRun, 'place'][] => {
    const runs = hanRuns(place.form, parseFurigana(place.furigana))
    return runs.length === 1 && runs[0]!.text === place.form ? [[runs[0]!, 'place']] : []
  })
  return [...manual, ...places].filter(([run]) => [...run.text].length > 1)
}

function addSource(readings: Map<string, Reading>, key: string, source: Source): void {
  const [score, sources] = readings.get(key) ?? [0, 0]
  readings.set(key, [score, sources | sourceBit(source)])
}

/**
 * Merges every source into the readings of the Han runs a font sees, each
 * reading with its score and sources. What no plan can use is left out: a
 * word's runs with an unannotated kanji, lone kanji of the lists or of words
 * no list tags but before okurigana, and the on'yomi of kanji no reading uses.
 */
export function fuseDictionary(sources: DictionarySources): Dictionary {
  const runs = new Map<string, Readings>()
  const kanji: Kanji = { tagged: new Map(), uses: new Map(), inflecting: new Map() }
  for (const entry of sources.entries) {
    for (const run of hanRuns(entry.form, parseFurigana(entry.furigana))) {
      if ([...run.text].length > 1)
        addRun(runs, run, entry)
      else
        addKanji(kanji, run, entry)
    }
  }
  for (const [run, name] of listedRuns(sources))
    evidenceOf(runs, run.text, formatFurigana(run.spans)).sources |= sourceBit(name)
  const ranked = new Map([...runs].map(([text, readings]) => [text, new Map(rankReadings(readings, [...text].length))]))
  const lone = kanjiReadings(kanji)
  // A default only pins a reading, so it comes last among the run's.
  for (const run of sources.defaults.flatMap(notationRuns)) {
    const [table, key] = [...run.text].length > 1 ? [ranked, formatFurigana(run.spans)] : [lone, run.spans[0]!.ruby]
    addSource(getOrCreate(table, run.text, () => new Map()), key, 'default')
  }
  const used = new Set([...ranked.keys(), ...lone.keys()].flatMap(text => [...text]))
  const toRecord = (table: Map<string, Map<string, Reading>>): Dictionary['runs'] => Object.fromEntries([...table].map(([text, readings]) => [text, Object.fromEntries(readings)]))
  return {
    versions: sources.versions,
    sources: SOURCE_BITS,
    onyomi: Object.fromEntries(Object.entries(sources.onyomi).filter(([k]) => used.has(k))),
    runs: toRecord(ranked),
    kanji: toRecord(lone),
    bare: sources.bare,
  }
}
