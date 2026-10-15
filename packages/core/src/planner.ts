import type { HanRun, RubySpan } from './dictionary'
import type { GlyphRegistry, RenderRuby, SingleLookups } from './glyphs'
import type { Dictionary, Plan, PlanGlyph, PlanOptions } from './schema'
import { formatNotation, getOrCreate, hanRuns, isHan, parseFurigana, parseNotation } from './dictionary'
import { emitFea } from './fea'
import { codepoints, createGlyphRegistry, createSingleLookups, glyphName, isGrouped } from './glyphs'
import { isOnyomi, toHepburn, toKatakana } from './kana'
import { JLPT_LEVELS, SCORE, sourceBit, weightOf } from './schema'

/** VS225: shows the kanji before it without ruby. */
export const SELECTOR_SUPPRESS = 0xE01E0
/** VS226: reading 1 of the kanji (or word) before it; VS227 reading 2, and so on. */
export const SELECTOR_FIRST_READING = 0xE01E1
/** The IVD leaves VS225..VS240 unregistered: one to suppress, fifteen readings. */
export const MAX_READINGS = 15
/** A lone kanji's reading needs this share of the evidence to be offered through a selector. */
const MIN_ALTERNATE_SHARE = 0.02
/** A suffix reading is the one a kanji takes in this share of the runs it ends, out of at least `SUFFIX_MIN_RUNS`. */
const SUFFIX_MIN_SHARE = 0.9
const SUFFIX_MIN_RUNS = 10

interface RunReading {
  spans: RubySpan[]
  /** Corpus weight of a tagged reading, as `weightOf` gives it; 0 for others. */
  weight: number
  score: number
  /** A mask of `SOURCES` bits. */
  sources: number
  /** Its place among the run's readings, which the dictionary ranks. */
  order: number
  /** Made the default by the dictionary's curated list (1) or by the user (2). */
  pinned?: number
  /** No list tags it and the sentences do not use it: its readings are no evidence for the kanji's own. */
  place?: boolean
}

interface LoneReading {
  weight: number
  score: number
  sources: number
}

interface DictionaryIndex {
  /** Runs of two or more kanji, by text, then their readings, ranked. */
  runs: Map<string, RunReading[]>
  /** The same, JMdict's readings only: the words protection and suffixes judge by. */
  jmdict: Map<string, RunReading[]>
  /** Kanji alone in a run that tagged words read, by kanji, then by reading. */
  singles: Map<string, Map<string, LoneReading>>
  /** Readings of kanji followed by okurigana in words with no priority tag, such as 奉る: selectable, never defaults. */
  inflecting: Map<string, Set<string>>
  /** The curated defaults: a lone kanji among them is pinned. */
  defaults: HanRun[]
}

export interface PlanReport {
  stats: {
    patterns: number
    places: number
    ambiguous: number
    isolated: number
    suffixes: number
    protectedAnnotated: number
    protectedBare: number
    glyphs: number
    rules: number
  }
  /**
   * The lists variation selectors index into, VS226 being the first entry,
   * and `salt` 1 the same entry through `font-feature-settings`.
   * Words list their readings in inline notation, the default first. `lone`
   * is the reading a kanji alone in its run shows without a selector.
   */
  ivs: {
    kanji: Record<string, string[]>
    words: Record<string, string[]>
    lone: Record<string, string>
    /** Whether the font maps `salt` n to the selector n after a run's first kanji: fonts built before it do not, and a preview does not. */
    salt: boolean
  }
}

export interface PlanResult {
  plan: Plan
  report: PlanReport
}

/** One chain rule of the main lookup: glyphs to match and, per position, the lookup to apply. */
export interface Rule {
  input: string[]
  lookups: (string | null)[]
  /** Codepoints of `input`, to keep only rules a sample text can trigger. */
  codepoints: number[]
  ignore?: boolean
}

interface Ligature {
  lookup: string
  glyph: string
  components: string[]
  /** Codepoints of the components, to keep only ligatures a sample text can form. */
  codepoints: number[]
}

interface PlanContext {
  options: PlanOptions
  removed: Set<string>
  covered: (text: string) => boolean
  /** On the JLPT lists the reader knows: left bare. */
  known: (sources: number) => boolean
  render: RenderRuby
  renderable: (run: HanRun) => boolean
}

const length = (text: string): number => [...text].length

function spanKey(spans: readonly RubySpan[]): string {
  return spans.map(s => `${s.start}-${s.end}:${s.ruby}`).join(';')
}

/** Pinned first; then readings that are evidence, before a place name's or a rare word's; then as the dictionary ranks them. */
function rank(a: RunReading, b: RunReading): number {
  return (b.pinned ?? 0) - (a.pinned ?? 0)
    || Number(a.place ?? false) - Number(b.place ?? false)
    || a.order - b.order
}

const isJmdict = (reading: { sources: number }): boolean => !!(reading.sources & sourceBit('jmdict'))

const PIN = sourceBit('default')

function indexRuns(index: DictionaryIndex, runs: Dictionary['runs']): void {
  for (const [text, readings] of Object.entries(runs)) {
    const ranked: RunReading[] = []
    for (const [furigana, [score, sources]] of Object.entries(readings)) {
      const spans = parseFurigana(furigana)
      if (sources & PIN)
        index.defaults.push({ text, spans })
      if (sources & ~PIN)
        ranked.push({ spans, weight: weightOf(score), score, sources, order: ranked.length })
    }
    index.runs.set(text, ranked)
    if (ranked.some(isJmdict))
      index.jmdict.set(text, ranked.filter(isJmdict))
  }
}

function indexKanji(index: DictionaryIndex, kanji: Dictionary['kanji']): void {
  for (const [text, readings] of Object.entries(kanji)) {
    for (const [ruby, [score, sources]] of Object.entries(readings)) {
      if (weightOf(score))
        getOrCreate(index.singles, text, () => new Map()).set(ruby, { weight: weightOf(score), score, sources })
      if (sources & sourceBit('inflecting'))
        getOrCreate(index.inflecting, text, () => new Set()).add(ruby)
      if (sources & PIN)
        index.defaults.push({ text, spans: [{ start: 0, end: 1, ruby }] })
    }
  }
}

/** The compiled dictionary as the planner looks it up. */
function indexDictionary(dictionary: Dictionary): DictionaryIndex {
  const index: DictionaryIndex = { runs: new Map(), jmdict: new Map(), singles: new Map(), inflecting: new Map(), defaults: [] }
  indexRuns(index, dictionary.runs)
  indexKanji(index, dictionary.kanji)
  return index
}

function createContext(dictionary: Dictionary, options: PlanOptions, coverage: ReadonlySet<number>): PlanContext {
  const covered = (text: string): boolean => codepoints(text).every(cp => coverage.has(cp))
  const render: RenderRuby = (run, index) => {
    const span = run.spans[index]!
    if (options.rubyScript === 'hepburn')
      return toHepburn(span.ruby, run.spans.slice(index + 1).map(s => s.ruby).join(''))
    const kanji = [...run.text].slice(span.start, span.end)
    if (options.rubyScript === 'katakanaOn' && kanji.length === 1 && isOnyomi(span.ruby, dictionary.onyomi[kanji[0]!] ?? []))
      return toKatakana(span.ruby)
    return span.ruby
  }
  // N4 skips levels 5 and 4.
  const known = options.skipJlpt ? JLPT_LEVELS.slice(0, JLPT_LEVELS.indexOf(options.skipJlpt) + 1).reduce((mask, level) => mask | sourceBit(level), 0) : 0
  return {
    options,
    removed: new Set([...dictionary.bare, ...options.words.remove]),
    covered,
    known: sources => !!(sources & known),
    render,
    renderable: run => covered(run.text) && run.spans.every((_, i) => covered(render(run, i))),
  }
}

type Patterns = Map<string, RunReading[]>

function notationRuns(notation: string): HanRun[] {
  const { form, spans } = parseNotation(notation)
  return hanRuns(form, spans)
}

function addCustomRuns(patterns: Patterns, lonePins: Map<string, string>, runs: HanRun[], pinned: number, ctx: PlanContext): void {
  for (const run of runs.filter(ctx.renderable)) {
    if (length(run.text) === 1) {
      if (pinned)
        lonePins.set(run.text, run.spans[0]!.ruby)
      continue
    }
    // The curated defaults only choose among the readings of selected words; the user's lists may add words.
    if (pinned === 1 && !patterns.has(run.text))
      continue
    const readings = getOrCreate(patterns, run.text, () => [])
    const existing = readings.find(r => spanKey(r.spans) === spanKey(run.spans))
    if (existing)
      existing.pinned = Math.max(existing.pinned ?? 0, pinned)
    else
      readings.push({ spans: run.spans, weight: 1, score: 100, sources: 0, order: Number.MAX_SAFE_INTEGER, pinned })
  }
}

/** A run's readings from the plan's sources that the font can draw: those the lists or the sentences back, else the first, which is no evidence for its kanji's. */
function wordReadings(text: string, readings: RunReading[], wanted: number, ctx: PlanContext): RunReading[] {
  const selected = readings.filter(r => r.sources & wanted && ctx.renderable({ text, spans: r.spans }))
  const backed = selected.filter(r => r.score > SCORE.used)
  return backed.length ? backed.map(r => ({ ...r })) : selected.slice(0, 1).map(r => ({ ...r, place: true }))
}

interface Selection {
  patterns: Patterns
  lonePins: Map<string, string>
  /** Words left bare whole, as known or among the most common. */
  skipped: Set<string>
  /** Lone kanji among the most common, or whose reading is on the JLPT lists the reader knows. */
  skippedKanji: Set<string>
}

/**
 * The words of the plan's sources, but those the reader knows, those the
 * user removes and, by score, the `skip` most common, words and lone kanji
 * together; then the `take` next words, and the user's own. A word is skipped
 * whole: were only its known reading dropped, 今日 would show こんにち.
 */
function selectWords(index: DictionaryIndex, ctx: PlanContext): Selection {
  const wanted = ctx.options.sources.reduce((mask, source) => mask | sourceBit(source), 0)
  const skipped = new Set<string>()
  const skippedKanji = new Set<string>()
  const words: [text: string, readings: RunReading[]][] = []
  for (const [text, readings] of index.runs) {
    if (ctx.removed.has(text))
      continue
    if (readings.some(r => ctx.known(r.sources))) {
      skipped.add(text)
      continue
    }
    const chosen = wordReadings(text, readings, wanted, ctx)
    if (chosen.length)
      words.push([text, chosen])
  }
  const kanji = [...index.singles].map(([text, readings]): [string, LoneReading] => [text, [...readings.values()].reduce((a, b) => b.score > a.score ? b : a)])
  for (const [text] of kanji.filter(([, top]) => ctx.known(top.sources)))
    skippedKanji.add(text)
  const byScore = [
    ...words.map(([text, readings]) => ({ text, score: Math.max(...readings.map(r => r.score)), word: true })),
    ...kanji.filter(([text]) => !skippedKanji.has(text)).map(([text, top]) => ({ text, score: top.score, word: false })),
  ].sort((a, b) => b.score - a.score)
  for (const { text, word } of byScore.slice(0, ctx.options.skip))
    (word ? skipped : skippedKanji).add(text)
  const taken = new Set(byScore.slice(ctx.options.skip).filter(item => item.word).slice(0, ctx.options.take).map(item => item.text))
  const patterns: Patterns = new Map(words.filter(([text]) => taken.has(text)))
  const lonePins = new Map<string, string>()
  addCustomRuns(patterns, lonePins, ctx.options.words.add.flatMap(notationRuns), 0, ctx)
  addCustomRuns(patterns, lonePins, index.defaults, 1, ctx)
  addCustomRuns(patterns, lonePins, ctx.options.words.pin.flatMap(notationRuns), 2, ctx)
  for (const readings of patterns.values())
    readings.sort(rank).splice(MAX_READINGS)
  return { patterns, lonePins, skipped, skippedKanji }
}

/** Readings of a lone kanji the font can draw, heaviest first, with their share of the evidence. */
function loneReadings(kanji: string, readings: Map<string, LoneReading>, ctx: PlanContext): { ruby: string, weight: number, share: number }[] {
  const drawable = [...readings].filter(([ruby]) => ctx.renderable({ text: kanji, spans: [{ start: 0, end: 1, ruby }] }))
  const total = drawable.reduce((sum, [, r]) => sum + r.weight, 0)
  return drawable.map(([ruby, r]) => ({ ruby, weight: r.weight, share: r.weight / total })).sort((a, b) => b.weight - a.weight)
}

type AddEvidence = (kanji: string, ruby: string, weight: number) => void

function addWordEvidence(patterns: Patterns, add: AddEvidence): void {
  for (const [text, readings] of patterns) {
    const chars = [...text]
    for (const r of readings.filter(r => !r.place)) {
      for (const s of r.spans.filter(s => s.end - s.start === 1))
        add(chars[s.start]!, s.ruby, r.weight || 1e-6)
    }
  }
}

/** Last in each list: readings a selector helper may need for verbs too rare to rank. */
function addRareVerbEvidence(inflecting: DictionaryIndex['inflecting'], ctx: PlanContext, add: AddEvidence): void {
  for (const [kanji, rubies] of inflecting) {
    for (const ruby of [...rubies].filter(ruby => !ctx.removed.has(kanji) && ctx.renderable({ text: kanji, spans: [{ start: 0, end: 1, ruby }] })))
      add(kanji, ruby, 1e-9)
  }
}

/**
 * A kanji alone in its run gets ruby only when one reading clearly dominates
 * the common words it stands alone in, or the sentences' uses of it alone
 * (ゴミ箱 is common, yet 箱 reads はこ), whatever the word list's size: verbs
 * like 書く rank low in newspapers yet decide how 書 reads. Every kanji also
 * gets an ordered list of its readings, which the variation selectors index
 * into, except a kanji whose dominant reading the reader is taken to know.
 */
function chooseLoneKanji(index: DictionaryIndex, { patterns, lonePins, skippedKanji }: Selection, ctx: PlanContext): { isolated: Map<string, string>, kanjiReadings: Map<string, string[]> } {
  const isolated = new Map(ctx.options.isolated ? lonePins : [])
  const skipped = new Set<string>()
  const evidence = new Map<string, Map<string, number>>()
  const add: AddEvidence = (kanji, ruby, weight) => {
    const readings = getOrCreate(evidence, kanji, () => new Map<string, number>())
    readings.set(ruby, (readings.get(ruby) ?? 0) + weight)
  }
  for (const [kanji, ruby] of lonePins)
    add(kanji, ruby, 1)
  for (const [kanji, readings] of index.singles) {
    if (ctx.removed.has(kanji))
      continue
    const ranked = loneReadings(kanji, readings, ctx).filter(r => r.share >= MIN_ALTERNATE_SHARE)
    const top = ranked[0]
    if (top && !lonePins.has(kanji) && skippedKanji.has(kanji))
      skipped.add(kanji)
    else if (top && top.share >= ctx.options.isolatedMinShare && ctx.options.isolated && !isolated.has(kanji))
      isolated.set(kanji, top.ruby)
    for (const r of ranked)
      add(kanji, r.ruby, r.weight)
  }
  addWordEvidence(patterns, add)
  addRareVerbEvidence(index.inflecting, ctx, add)
  const kanjiReadings = new Map<string, string[]>()
  for (const [kanji, readings] of evidence) {
    if (skipped.has(kanji))
      continue
    const ordered = [...readings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    kanjiReadings.set(kanji, ordered.slice(0, MAX_READINGS).map(([r]) => r))
  }
  return { isolated, kanjiReadings }
}

interface Suffixes {
  readings: Map<string, string>
  /** Suffixes that start more of the dictionary's runs than they end: before another kanji, they may start a word the font does not know, as 大 does. */
  final: Set<string>
}

/**
 * A kanji no word claimed after another kanji, as 的 in 平均的 or 者 in
 * 被災者支援, reads as it reads ending the dictionary's runs, when one reading
 * clearly dominates there: 的 てき, 化 か; not 人, にん or じん.
 */
function chooseSuffixes(index: DictionaryIndex, ctx: PlanContext): Suffixes {
  const suffixes: Suffixes = { readings: new Map(), final: new Set() }
  if (!ctx.options.isolated)
    return suffixes
  const evidence = new Map<string, Map<string, number>>()
  const count = (counts: Map<string, number>, key: string): void => void counts.set(key, (counts.get(key) ?? 0) + 1)
  const starts = new Map<string, number>()
  const ends = new Map<string, number>()
  for (const [text, readings] of index.jmdict) {
    const chars = [...text]
    count(starts, chars[0]!)
    count(ends, chars.at(-1)!)
    for (const { spans } of readings) {
      const span = spans.at(-1)!
      if (span.end - span.start === 1)
        count(getOrCreate(evidence, chars.at(-1)!, () => new Map()), span.ruby)
    }
  }
  for (const [kanji, counts] of evidence) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0)
    const [ruby, top] = [...counts].sort((a, b) => b[1] - a[1])[0]!
    if (total < SUFFIX_MIN_RUNS || top / total < SUFFIX_MIN_SHARE || ctx.removed.has(kanji) || !ctx.renderable({ text: kanji, spans: [{ start: 0, end: 1, ruby }] }))
      continue
    suffixes.readings.set(kanji, ruby)
    if ((starts.get(kanji) ?? 0) > ends.get(kanji)!)
      suffixes.final.add(kanji)
  }
  return suffixes
}

/** Per character, the span reading it; keys are relative so they compare at any offset. */
function assignment(spans: readonly RubySpan[], size: number): (string | undefined)[] {
  const out: (string | undefined)[] = Array.from({ length: size })
  for (const s of spans) {
    for (let i = s.start; i < s.end; i++)
      out[i] = `${s.start - i}:${s.end - i}:${s.ruby}`
  }
  return out
}

/** The suffix reading of the kanji at `p` of a run when no word claimed it. */
function suffixAt(chars: string[], p: number, suffixes: Suffixes): string | undefined {
  const kanji = chars[p]!
  return p > 0 && (p === chars.length - 1 || !suffixes.final.has(kanji)) ? suffixes.readings.get(kanji) : undefined
}

/** Runs the longest-match rules, then the suffix ones, over `chars` and reports whether any kanji gets a reading other than `expected`. */
function misreads(chars: string[], expected: (string | undefined)[], known: Known, longest: number, suffixes: Suffixes): boolean {
  for (let p = 0; p < chars.length;) {
    let size = Math.min(longest, chars.length - p)
    for (; size >= 2; size--) {
      const hit = known.get(chars.slice(p, p + size).join(''))
      if (hit !== undefined) {
        if (hit?.some((key, i) => key !== undefined && key !== expected[p + i]))
          return true
        break
      }
    }
    const suffix = size < 2 ? suffixAt(chars, p, suffixes) : undefined
    if (suffix !== undefined && expected[p] !== `0:1:${suffix}`)
      return true
    p += Math.max(size, 1)
  }
  return false
}

type Known = Map<string, (string | undefined)[] | null>

/**
 * Longer dictionary words that the selected words would misread, such as
 * 大人気 read through 大人: annotated with their own reading when that only
 * takes readings the font already has, left bare otherwise. Skipped words are
 * always left bare.
 */
function findMisreadRuns(index: DictionaryIndex, patterns: Patterns, kanjiReadings: Map<string, string[]>, suffixes: Suffixes, skipped: Set<string>, ctx: PlanContext): Map<string, RubySpan[] | null> {
  const known: Known = new Map([...patterns].map(([text, readings]) => [text, assignment(readings[0]!.spans, length(text))]))
  const protectedRuns = new Map<string, RubySpan[] | null>()
  for (const text of [...ctx.removed].filter(t => length(t) > 1)) {
    known.set(text, null)
    protectedRuns.set(text, null)
  }
  const protect = (text: string, readings: RunReading[], longest: number): boolean => {
    const chars = [...text]
    // Without kana context a run may be any of its words: 大人気 is だいにんき, or おとなげ in 大人気ない.
    const candidates = [...new Set(readings.map(r => assignment(r.spans, chars.length).join('|')))]
    const expected = readings.map(r => assignment(r.spans, chars.length))
    if (!expected.some(e => misreads(chars, e, known, longest, suffixes)))
      return false
    const truth = readings.toSorted(rank)[0]!
    const run = { text, spans: truth.spans }
    const reusable = !skipped.has(text) && candidates.length === 1 && !isGrouped(run) && ctx.renderable(run) && truth.spans.every(s => kanjiReadings.get(chars[s.start]!)?.includes(s.ruby))
    protectedRuns.set(text, reusable ? truth.spans : null)
    known.set(text, reusable ? expected[0]! : null)
    return true
  }
  // Each protected run is a new rule that can misread others in turn.
  for (let pass = 0, changed = true; changed && pass < 5; pass++) {
    // A loop, not Math.max(...keys): with place names there are too many keys to spread.
    let longest = 2
    for (const text of known.keys())
      longest = Math.max(longest, length(text))
    changed = false
    for (const [text, readings] of index.jmdict) {
      if (!known.has(text) && ctx.covered(text) && protect(text, readings, longest))
        changed = true
    }
  }
  return protectedRuns
}

interface Variant {
  name: string
  base: number
  selector: number
}

/** A kanji and its selector glyphs, in order: `salt` n picks the nth, as the selector after a run's first kanji does. */
interface Alternate {
  input: string
  outputs: string[]
}

interface VariantReading {
  input: string
  glyph: PlanGlyph
  selector: number
}

/**
 * A base kanji followed by a variation selector is its own glyph, mapped in
 * `cmap` format 14 like any registered ideographic variation. Browsers keep a
 * supported sequence in the run they shape (they split unsupported ones off),
 * and the rules see the choice as a glyph. The glyph itself is empty: the rules
 * always replace it, by a ruby glyph or, failing that, by the bare kanji.
 */
function createVariants(): { name: (kanji: string, n: number) => string, all: () => Variant[] } {
  const variants = new Map<string, Variant>()
  return {
    /** `kanji` written with VS225 + `n`: n = 0 drops the ruby, n >= 1 picks reading n. */
    name(kanji: string, n: number): string {
      const base = kanji.codePointAt(0)!
      const name = `${glyphName(base)}.vs${n}`
      variants.set(name, { name, base, selector: SELECTOR_SUPPRESS + n })
      return name
    },
    all: (): Variant[] => [...variants.values()],
  }
}

function buildRules(
  patterns: Patterns,
  kanjiReadings: Map<string, string[]>,
  protectedRuns: Map<string, RubySpan[] | null>,
  glyphs: GlyphRegistry,
): { rules: Rule[], ligatures: Ligature[], singles: SingleLookups, variants: Variant[], variantReadings: VariantReading[], alternates: Alternate[], ivsWords: Record<string, string[]> } {
  // Ligatures share lookups: the nth distinct ligature of a component sequence lives in lig_<n>.
  // A shorter sequence never meets a longer one in the same lookup by mistake: the rule for
  // the longer one would have matched first.
  const ligatures = new Map<string, Ligature>()
  const perComponents = new Map<string, number>()
  const ligatureLookup = (components: string[], glyph: string, codepoints: number[]): string => {
    const key = `${components.join(' ')}>${glyph}`
    let ligature = ligatures.get(key)
    if (!ligature) {
      const n = (perComponents.get(components.join(' ')) ?? 0) + 1
      perComponents.set(components.join(' '), n)
      ligatures.set(key, ligature = { lookup: `lig_${n}`, glyph, components, codepoints })
    }
    return ligature.lookup
  }
  const singles = createSingleLookups()
  const variants = createVariants()

  /** The rule annotating `run`; with `reading`, written with that reading's selector after its first kanji. */
  const runRule = (run: HanRun, reading?: number): Rule => {
    const cps = codepoints(run.text)
    const input = cps.map(glyphName)
    if (reading) {
      input[0] = variants.name(run.text, reading)
      cps.splice(1, 0, SELECTOR_SUPPRESS + reading)
    }
    const output = glyphs.run(run)
    if (isGrouped(run)) {
      const lookup = ligatureLookup(input, output[0]!.name, cps)
      return { input, lookups: input.map((_, i) => i === 0 ? lookup : null), codepoints: cps }
    }
    return { input, lookups: output.map((g, i) => singles.lookupFor(input[i]!, g.name)), codepoints: cps }
  }

  // Only rules starting on the same glyph compete: there, longest first.
  const rules: Rule[] = []
  const ivsWords: Record<string, string[]> = {}
  for (const [text, readings] of patterns) {
    rules.push(runRule({ text, spans: readings[0]!.spans }))
    if (readings.length < 2)
      continue
    readings.forEach((r, i) => rules.push(runRule({ text, spans: r.spans }, i + 1)))
    ivsWords[text] = readings.map(r => formatNotation(text, r.spans))
  }
  for (const [text, spans] of protectedRuns) {
    const cps = codepoints(text)
    rules.push(spans ? runRule({ text, spans }) : { input: cps.map(glyphName), lookups: [], codepoints: cps, ignore: true })
  }
  // A selector no word claimed picks the kanji's own reading, after the main lookup.
  const variantReadings: VariantReading[] = []
  for (const [kanji, readings] of kanjiReadings) {
    variants.name(kanji, 0)
    if (readings.length < 2)
      continue
    readings.forEach((ruby, i) => variantReadings.push({ input: variants.name(kanji, i + 1), glyph: glyphs.lone(kanji, ruby), selector: SELECTOR_SUPPRESS + i + 1 }))
  }
  rules.sort((a, b) => a.input[0]!.localeCompare(b.input[0]!) || b.input.length - a.input.length)
  // `salt` n is the selector n after the first kanji of a run, so it reaches every glyph a selector does: word rules, then the kanji's own reading. It counts up to the highest selector a rule or reading uses, with glyphs for the ones between.
  const top = new Map<number, number>()
  for (const { base, selector } of variants.all()) {
    if (selector > SELECTOR_SUPPRESS)
      top.set(base, Math.max(top.get(base) ?? 0, selector - SELECTOR_SUPPRESS))
  }
  const alternates = [...top].map(([base, n]) => ({ input: glyphName(base), outputs: Array.from({ length: n }, (_, i) => variants.name(String.fromCodePoint(base), i + 1)) }))
  return { rules, ligatures: [...ligatures.values()], singles, variants: variants.all(), variantReadings, alternates, ivsWords }
}

function smokeChecks(patterns: Patterns, lone: { glyph: PlanGlyph }[], glyphs: GlyphRegistry): Plan['smoke'] {
  const byFrequency = [...patterns].sort((a, b) => b[1][0]!.score - a[1][0]!.score)
  const checks: Plan['smoke'] = []
  for (const grouped of [false, true]) {
    for (const [text, readings] of byFrequency.filter(([text, r]) => isGrouped({ text, spans: r[0]!.spans }) === grouped).slice(0, 3))
      checks.push({ text, glyphs: glyphs.run({ text, spans: readings[0]!.spans }).map(g => g.name) })
  }
  const [word, readings] = byFrequency.find(([, r]) => r.length > 1) ?? []
  if (word && readings) {
    const [first = '', ...rest] = [...word]
    checks.push({ text: first + String.fromCodePoint(SELECTOR_FIRST_READING + 1) + rest.join(''), glyphs: glyphs.run({ text: word, spans: readings[1]!.spans }).map(g => g.name) })
  }
  if (lone[0])
    checks.push({ text: String.fromCodePoint(lone[0].glyph.bases[0]!), glyphs: [lone[0].glyph.name] })
  return checks
}

/** Everything the planner decides for one set of options, before a preview narrows it. */
type Analysis = Pick<ReturnType<typeof selectWords>, 'patterns'>
  & ReturnType<typeof chooseLoneKanji>
  & ReturnType<typeof buildRules>
  & {
    protectedRuns: ReturnType<typeof findMisreadRuns>
    glyphs: ReturnType<typeof createGlyphRegistry>
    lone: LoneGlyph[]
    suffixes: LoneGlyph[]
    /** Glyphs of the suffixes that apply only at the end of a run. */
    finalSuffixes: Set<string>
  }

interface LoneGlyph {
  base: string
  glyph: PlanGlyph
}

/**
 * Indexes the compiled dictionary once, then plans fonts from it. Every
 * decision about readings happens here: which words get ruby, which reading
 * is the default, which longer words must be protected from a shorter match.
 */
export function createFontPlanner(dictionary: Dictionary) {
  const index = indexDictionary(dictionary)
  const sources = Object.entries(dictionary.versions).map(([name, version]) => `${name} ${version}`).join(', ')

  /** Every decision for one set of options, over the whole dictionary: slow, and the same whatever the preview text. */
  function analyze(options: PlanOptions, coverage: ReadonlySet<number>): Analysis {
    const ctx = createContext(dictionary, options, coverage)
    const selection = selectWords(index, ctx)
    const { patterns, skipped } = selection
    const { isolated, kanjiReadings } = chooseLoneKanji(index, selection, ctx)
    const suffixes = chooseSuffixes(index, ctx)
    const protectedRuns = findMisreadRuns(index, patterns, kanjiReadings, suffixes, skipped, ctx)
    const glyphs = createGlyphRegistry(ctx.render)
    const { rules, ligatures, singles, variants, variantReadings, alternates, ivsWords } = buildRules(patterns, kanjiReadings, protectedRuns, glyphs)
    const loneGlyphs = (readings: Map<string, string>): LoneGlyph[] => [...readings].map(([kanji, ruby]) => ({ base: glyphName(kanji.codePointAt(0)!), glyph: glyphs.lone(kanji, ruby) }))
    return { patterns, isolated, kanjiReadings, protectedRuns, glyphs, rules, ligatures, singles, variants, variantReadings, alternates, ivsWords, lone: loneGlyphs(isolated), suffixes: loneGlyphs(suffixes.readings), finalSuffixes: new Set([...suffixes.final].map(k => glyphName(k.codePointAt(0)!))) }
  }

  // A live preview plans on every keystroke and the report on every change, with the same options: keep the last analysis.
  let last: { options: string, coverage: ReadonlySet<number>, analysis: Analysis } | undefined
  function analysisFor(options: PlanOptions, coverage: ReadonlySet<number>): Analysis {
    const key = JSON.stringify(options)
    if (last?.options !== key || last.coverage !== coverage)
      last = { options: key, coverage, analysis: analyze(options, coverage) }
    return last.analysis
  }

  /** Plans a font; with `previewText`, keeps only what that text can trigger. */
  return function planFont(options: PlanOptions, coverage: ReadonlySet<number>, previewText?: string): PlanResult {
    const { patterns, isolated, kanjiReadings, protectedRuns, glyphs, rules, ligatures, singles, variants, variantReadings, alternates, ivsWords, lone, suffixes, finalSuffixes } = analysisFor(options, coverage)

    const sample = previewText === undefined ? undefined : new Set(codepoints(previewText))
    const inSample = (cps: readonly number[]): boolean => !sample || cps.every(cp => sample.has(cp))
    const keptRules = rules.filter(r => inSample(r.codepoints))
    const keptLone = lone.filter(l => inSample(l.glyph.bases))
    const keptSuffixes = suffixes.filter(l => inSample(l.glyph.bases))
    const keptVariants = variants.filter(v => inSample([v.base, v.selector]))
    const keptVariantReadings = variantReadings.filter(v => inSample([...v.glyph.bases, v.selector]))
    // A preview skips `salt`: its selectors cover it, and the rules for every reading would grow the font on each keystroke.
    const keptAlternates = sample ? [] : alternates
    const usedLookups = new Set(keptRules.flatMap(r => r.lookups.map((lookup, i) => `${r.input[i]}@${lookup}`)))
    const keptSingles = singles.all().filter(s => usedLookups.has(`${s.input}@${s.lookup}`))
    const keptLigatures = ligatures.filter(l => inSample(l.codepoints))
    const keptNames = new Set([
      ...keptSingles.map(s => s.output),
      ...keptLigatures.map(l => l.glyph),
      ...keptLone.map(l => l.glyph.name),
      ...keptSuffixes.map(l => l.glyph.name),
      ...keptVariantReadings.map(v => v.glyph.name),
    ])
    const keptGlyphs = glyphs.all().filter(g => keptNames.has(g.name))
    const han = [...coverage].filter(cp => inSample([cp]) && isHan(String.fromCodePoint(cp))).sort((a, b) => a - b)

    const fea = emitFea({
      hanClass: [...han.map(glyphName), ...keptVariants.map(v => v.name), ...keptGlyphs.map(g => g.name)],
      singles: keptSingles,
      ligatures: keptLigatures,
      isolated: keptLone.map(l => ({ input: l.base, output: l.glyph.name })),
      suffixes: keptSuffixes.map(l => ({ input: l.base, output: l.glyph.name, final: finalSuffixes.has(l.base) })),
      rules: keptRules,
      variantReadings: keptVariantReadings.map(v => ({ input: v.input, output: v.glyph.name })),
      alternates: keptAlternates,
      variantsOff: keptVariants.map(v => ({ input: v.name, output: glyphName(v.base) })),
      rubyOff: keptGlyphs.map(g => ({ glyph: g.name, bases: g.bases.map(glyphName) })),
    })
    const named = new Set([...han, ...keptVariants.map(v => v.base), ...keptGlyphs.flatMap(g => g.bases)])

    return {
      plan: {
        version: 1,
        names: {
          family: options.family,
          description: `Furigana rules compiled from ${sources} (CC BY-SA 4.0: EDRDG, JmdictFurigana, stephenmk after Jonathan Waller; CC BY 2.0 FR: Tatoeba).`,
        },
        metrics: options.metrics,
        codepoints: [...named].sort((a, b) => a - b),
        variants: keptVariants,
        glyphs: keptGlyphs,
        fea,
        subset: sample && [...new Set([...sample, ...keptGlyphs.flatMap(g => g.ruby.flatMap(r => codepoints(r.text)))])].filter(cp => !keptVariants.some(v => v.selector === cp)).sort((a, b) => a - b),
        smoke: sample ? [] : smokeChecks(patterns, lone, glyphs),
      },
      report: {
        stats: {
          patterns: patterns.size,
          places: [...patterns.values()].filter(r => r[0]!.place).length,
          ambiguous: Object.keys(ivsWords).length,
          isolated: isolated.size,
          suffixes: suffixes.length,
          protectedAnnotated: [...protectedRuns.values()].filter(Boolean).length,
          protectedBare: [...protectedRuns.values()].filter(s => !s).length,
          glyphs: keptGlyphs.length,
          rules: keptRules.length,
        },
        ivs: { kanji: Object.fromEntries(kanjiReadings), words: ivsWords, lone: Object.fromEntries(isolated), salt: keptAlternates.length > 0 },
      },
    }
  }
}
