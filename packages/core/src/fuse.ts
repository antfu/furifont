import type { DictionaryEntry, DictionarySources, HanRun, RubySpan } from './dictionary'
import type { Dictionary, ManualSource, ReadingSources } from './schema'
import { hanRuns, parseFurigana, parseNotation } from './dictionary'
import { getOrCreate } from './planner'
import { MANUAL_SOURCES, PRIORITY_TAGS } from './schema'

/** JMdict orders readings within a form; a run read inside a longer form ranks after the form's own readings. */
const OTHER_FORM_ORDER = 1000
const OKURIGANA = /[\u3041-\u3096]/

type Readings = Map<string, ReadingSources>

/** The sources of `text` read as `key`, met for the first time or not. */
function readingOf(table: Map<string, Readings>, text: string, key: string): ReadingSources {
  return getOrCreate(getOrCreate(table, text, () => new Map()), key, (): ReadingSources => ({}))
}

/** Spans as a JmdictFurigana alignment: `0:に;1:ほん`, `0-1:きょう`. */
function formatFurigana(spans: readonly RubySpan[]): string {
  return spans.map(s => `${s.end - s.start > 1 ? `${s.start}-${s.end - 1}` : s.start}:${s.ruby}`).join(';')
}

/** Rough corpus frequency of a tagged entry, in newspaper buckets of ~500 words each. */
function rankOf(entry: DictionaryEntry): number | undefined {
  if (entry.priority)
    return entry.nf || Number(/nf(\d+)/.exec(entry.priority)?.[1] ?? 0) || (/[a-z]1\b/.test(entry.priority) ? 24 : 48)
}

/** The most frequent of the tagged entries with a reading decides its rank and bucket; their tags add up. */
function addTagged(into: ReadingSources, entry: DictionaryEntry, rank: number): void {
  into.rank = Math.min(into.rank ?? rank, rank)
  if (entry.nf)
    into.nf = Math.min(into.nf ?? entry.nf, entry.nf)
  if (entry.jlpt)
    into.jlpt = Math.max(into.jlpt ?? 0, entry.jlpt)
  const tags = new Set(entry.priority.split(' '))
  for (const tag of PRIORITY_TAGS.filter(t => tags.has(t)))
    into[tag] = true
}

function addRun(runs: Map<string, Readings>, run: HanRun, entry: DictionaryEntry): void {
  const reading = readingOf(runs, run.text, formatFurigana(run.spans))
  const order = run.text === entry.form ? entry.order : OTHER_FORM_ORDER + entry.order
  reading.jmdict = Math.min(reading.jmdict ?? order, order)
  if (entry.tatoeba)
    reading.tatoeba = Math.max(reading.tatoeba ?? 0, entry.tatoeba)
  const rank = rankOf(entry)
  if (rank)
    addTagged(reading, entry, rank)
  else if (entry.jlpt)
    reading.jlpt = Math.max(reading.jlpt ?? 0, entry.jlpt)
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
  const rank = rankOf(entry)
  if (rank) {
    // 来る reads く, き or こ as it conjugates: its dictionary form alone is no evidence.
    for (const r of entry.conjugatesReading && ruby === 'く' ? ['く', 'き', 'こ'] : [ruby])
      addTagged(readingOf(kanji.tagged, run.text, r), entry, rank)
  }
  else if (OKURIGANA.test(entry.form[entry.form.indexOf(run.text) + run.text.length] ?? '')) {
    getOrCreate(kanji.inflecting, run.text, () => new Set()).add(ruby)
  }
}

/** A lone kanji's readings: the tagged ones and their uses first, then those only rare verbs give. Uses alone weigh in only beside a tagged reading. */
function kanjiReadings(kanji: Kanji): Map<string, Readings> {
  const out = new Map<string, Readings>()
  for (const [text, tagged] of kanji.tagged) {
    out.set(text, new Map(tagged))
    for (const [ruby, n] of kanji.uses.get(text) ?? [])
      readingOf(out, text, ruby).tatoeba = n
  }
  for (const [text, rubies] of kanji.inflecting) {
    for (const ruby of rubies)
      readingOf(out, text, ruby).inflecting = true
  }
  return out
}

function notationRuns(notation: string): HanRun[] {
  const { form, spans } = parseNotation(notation)
  return hanRuns(form, spans)
}

const toRecord = (map: Map<string, Readings>): Dictionary['runs'] => Object.fromEntries([...map].map(([text, readings]) => [text, Object.fromEntries(readings)]))

/** The runs each list names, as the planner reads them: no lone kanji, which would be no evidence for the kanji's reading. */
function listedRuns(sources: DictionarySources): [HanRun, ManualSource | 'place'][] {
  const manual = MANUAL_SOURCES.flatMap(name => (sources.manual[name] ?? []).flatMap(notationRuns).map((run): [HanRun, ManualSource] => [run, name]))
  const places = sources.places.flatMap((place): [HanRun, 'place'][] => {
    const runs = hanRuns(place.form, parseFurigana(place.furigana))
    return runs.length === 1 && runs[0]!.text === place.form ? [[runs[0]!, 'place']] : []
  })
  return [...manual, ...places].filter(([run]) => [...run.text].length > 1)
}

/**
 * Merges every source into the readings of the Han runs a font sees, each
 * reading with what each source says of it. What no font can show is left
 * out: a word's runs with an unannotated kanji, lone kanji of the word
 * lists, and the on'yomi of kanji no reading uses.
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
    readingOf(runs, run.text, formatFurigana(run.spans))[name] = true
  const lone = kanjiReadings(kanji)
  for (const run of sources.defaults.flatMap(notationRuns)) {
    const [table, key] = [...run.text].length > 1 ? [runs, formatFurigana(run.spans)] : [lone, run.spans[0]!.ruby]
    readingOf(table, run.text, key).default = true
  }
  const used = new Set([...runs.keys(), ...lone.keys()].flatMap(text => [...text]))
  return {
    versions: sources.versions,
    onyomi: Object.fromEntries(Object.entries(sources.onyomi).filter(([k]) => used.has(k))),
    runs: toRecord(runs),
    kanji: toRecord(lone),
    bare: sources.bare,
  }
}
