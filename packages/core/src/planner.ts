import type { Dictionary, DictionaryEntry, HanRun, RubySpan } from './dictionary'
import type { GlyphRegistry, RenderRuby } from './glyphs'
import type { Plan, PlanGlyph, PlanOptions } from './schema'
import { formatNotation, hanRuns, isHan, parseFurigana, parseNotation } from './dictionary'
import { emitFea } from './fea'
import { codepoints, createGlyphRegistry, glyphName, isGrouped } from './glyphs'
import { isOnyomi, toHepburn, toKatakana } from './kana'

/** VS225: shows the kanji before it without ruby. */
export const SELECTOR_SUPPRESS = 0xE01E0
/** VS226: reading 1 of the kanji (or word) before it; VS227 reading 2, and so on. */
export const SELECTOR_FIRST_READING = 0xE01E1
/** The IVD leaves VS225..VS240 unregistered: one to suppress, fifteen readings. */
export const MAX_READINGS = 15
/** A lone kanji's reading needs this share of the evidence to be offered through a selector. */
const MIN_ALTERNATE_SHARE = 0.1

interface RunReading {
  spans: RubySpan[]
  /** Corpus weight of the most frequent entry with this reading. */
  weight: number
  tagged: boolean
  order: number
  /** Best newspaper bucket among priority-tagged entries, 0 when none. */
  nf: number
  /** Priority tags of the entries with this reading. */
  tags: Set<string>
  pinned?: boolean
}

interface SingleReading {
  weight: number
  nf: number
  tags: Set<string>
}

interface DictionaryIndex {
  /** Runs of two or more kanji, by text, then by reading. */
  runs: Map<string, Map<string, RunReading>>
  /** Kanji alone in a run, by kanji, then by reading. */
  singles: Map<string, Map<string, SingleReading>>
}

export interface PlanReport {
  stats: {
    patterns: number
    ambiguous: number
    isolated: number
    protectedAnnotated: number
    protectedBare: number
    glyphs: number
    rules: number
  }
  /**
   * The lists variation selectors index into, VS226 being the first entry.
   * Words list their readings in inline notation, the default first.
   */
  ivs: { kanji: Record<string, string[]>, words: Record<string, string[]> }
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
}

interface PlanContext {
  options: PlanOptions
  removed: Set<string>
  covered: (text: string) => boolean
  selected: (reading: { nf: number, tags: Set<string> }) => boolean
  render: RenderRuby
  renderable: (run: HanRun) => boolean
}

const length = (text: string): number => [...text].length

function spanKey(spans: readonly RubySpan[]): string {
  return spans.map(s => `${s.start}-${s.end}:${s.ruby}`).join(';')
}

function rank(a: RunReading, b: RunReading): number {
  return Number(!!b.pinned) - Number(!!a.pinned)
    || Number(b.tagged) - Number(a.tagged)
    || a.order - b.order
    || b.weight - a.weight
}

/** Rough corpus frequency of an entry: nf buckets hold ~500 words each, ranked by frequency. */
function entryWeight(entry: DictionaryEntry): number {
  if (!entry.priority)
    return 0
  const nf = entry.nf || Number(/nf(\d+)/.exec(entry.priority)?.[1] ?? 0)
  if (nf)
    return 1 / nf
  return /[a-z]1\b/.test(entry.priority) ? 1 / 24 : 1 / 48
}

function keepBest<T extends { weight: number, nf: number, tags: Set<string> }>(current: T, value: T): void {
  current.weight = Math.max(current.weight, value.weight)
  if (value.nf && (!current.nf || value.nf < current.nf))
    current.nf = value.nf
  for (const tag of value.tags)
    current.tags.add(tag)
}

function priorityTags(entry: DictionaryEntry): Set<string> {
  return new Set(entry.priority.split(' ').filter(Boolean))
}

function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key)
  if (value === undefined)
    map.set(key, value = create())
  return value
}

function indexRun(index: DictionaryIndex, run: HanRun, entry: DictionaryEntry): void {
  const reading = { spans: run.spans, weight: entryWeight(entry), tagged: !!entry.priority, order: entry.order, nf: entry.priority ? entry.nf : 0, tags: priorityTags(entry) }
  const readings = getOrCreate(index.runs, run.text, () => new Map())
  const current = readings.get(spanKey(run.spans))
  if (!current) {
    readings.set(spanKey(run.spans), reading)
    return
  }
  keepBest(current, reading)
  current.tagged ||= reading.tagged
  current.order = Math.min(current.order, reading.order)
}

function indexSingle(index: DictionaryIndex, run: HanRun, entry: DictionaryEntry): void {
  const ruby = run.spans[0]!.ruby
  const readings = getOrCreate(index.singles, run.text, () => new Map())
  // 来る reads く, き or こ as it conjugates: its dictionary form alone is no evidence.
  for (const r of entry.conjugatesReading && ruby === 'く' ? ['く', 'き', 'こ'] : [ruby]) {
    const value = { weight: entryWeight(entry), nf: entry.nf, tags: priorityTags(entry) }
    const current = readings.get(r)
    if (current)
      keepBest(current, value)
    else
      readings.set(r, value)
  }
}

function indexEntry(index: DictionaryIndex, entry: DictionaryEntry): void {
  for (const run of hanRuns(entry.form, parseFurigana(entry.furigana))) {
    if (length(run.text) > 1)
      indexRun(index, run, entry)
    else if (entry.priority)
      indexSingle(index, run, entry)
  }
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
  return {
    options,
    removed: new Set(options.words.remove),
    covered,
    selected: r => (r.nf > 0 && r.nf <= options.nfMax) || options.selectTags.some(t => r.tags.has(t)),
    render,
    renderable: run => covered(run.text) && run.spans.every((_, i) => covered(render(run, i))),
  }
}

type Patterns = Map<string, RunReading[]>

function addCustomWord(patterns: Patterns, lonePins: Map<string, string>, notation: string, pinned: boolean, ctx: PlanContext): void {
  const { form, spans } = parseNotation(notation)
  for (const run of hanRuns(form, spans).filter(ctx.renderable)) {
    if (length(run.text) === 1) {
      if (pinned)
        lonePins.set(run.text, run.spans[0]!.ruby)
      continue
    }
    const readings = getOrCreate(patterns, run.text, () => [])
    const existing = readings.find(r => spanKey(r.spans) === spanKey(run.spans))
    if (existing)
      existing.pinned ||= pinned
    else
      readings.push({ spans: run.spans, weight: 1, tagged: true, order: Number.MAX_SAFE_INTEGER, nf: 1, tags: new Set(), pinned })
  }
}

/** Runs of common words, plus custom words; pinned readings of lone kanji are returned apart. */
function selectWords(index: DictionaryIndex, ctx: PlanContext): { patterns: Patterns, lonePins: Map<string, string> } {
  const patterns: Patterns = new Map()
  for (const [text, readings] of index.runs) {
    const common = [...readings.values()].filter(r => ctx.selected(r) && ctx.renderable({ text, spans: r.spans }))
    if (common.length && !ctx.removed.has(text))
      patterns.set(text, common.map(r => ({ ...r })))
  }
  const lonePins = new Map<string, string>()
  for (const notation of ctx.options.words.add)
    addCustomWord(patterns, lonePins, notation, false, ctx)
  for (const notation of ctx.options.words.pin)
    addCustomWord(patterns, lonePins, notation, true, ctx)
  for (const readings of patterns.values())
    readings.sort(rank).splice(MAX_READINGS)
  return { patterns, lonePins }
}

/** Readings of a lone kanji the font can draw, heaviest first, with their share of the evidence. */
function loneReadings(kanji: string, readings: Map<string, SingleReading>, ctx: PlanContext): { ruby: string, weight: number, share: number }[] {
  const drawable = [...readings].filter(([ruby]) => ctx.renderable({ text: kanji, spans: [{ start: 0, end: 1, ruby }] }))
  const total = drawable.reduce((sum, [, r]) => sum + r.weight, 0)
  return drawable.map(([ruby, r]) => ({ ruby, weight: r.weight, share: r.weight / total })).sort((a, b) => b.weight - a.weight)
}

/**
 * A kanji alone in its run gets ruby only when one reading clearly dominates
 * the words it stands alone in. Every kanji also gets an ordered list of its
 * readings, which the variation selectors index into.
 */
function chooseLoneKanji(index: DictionaryIndex, patterns: Patterns, lonePins: Map<string, string>, ctx: PlanContext): { isolated: Map<string, string>, kanjiReadings: Map<string, string[]> } {
  const isolated = new Map(lonePins)
  const evidence = new Map<string, Map<string, number>>()
  const addEvidence = (kanji: string, ruby: string, weight: number): void => {
    const readings = getOrCreate(evidence, kanji, () => new Map<string, number>())
    readings.set(ruby, (readings.get(ruby) ?? 0) + weight)
  }
  for (const [kanji, ruby] of lonePins)
    addEvidence(kanji, ruby, 1)
  for (const [kanji, readings] of index.singles) {
    if (ctx.removed.has(kanji) || ![...readings.values()].some(ctx.selected))
      continue
    const ranked = loneReadings(kanji, readings, ctx).filter(r => r.share >= MIN_ALTERNATE_SHARE)
    if (ranked[0] && ranked[0].share >= ctx.options.isolatedMinShare && !isolated.has(kanji))
      isolated.set(kanji, ranked[0].ruby)
    for (const r of ranked)
      addEvidence(kanji, r.ruby, r.weight)
  }
  for (const [text, readings] of patterns) {
    const chars = [...text]
    for (const r of readings.flatMap(r => r.spans.filter(s => s.end - s.start === 1).map(s => ({ s, weight: r.weight }))))
      addEvidence(chars[r.s.start]!, r.s.ruby, r.weight || 1e-6)
  }
  const kanjiReadings = new Map<string, string[]>()
  for (const [kanji, readings] of evidence) {
    const ordered = [...readings].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    kanjiReadings.set(kanji, ordered.slice(0, MAX_READINGS).map(([r]) => r))
  }
  return { isolated, kanjiReadings }
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

/** Runs the longest-match rules over `chars` and reports whether any kanji gets a reading other than `expected`. */
function misreads(chars: string[], expected: (string | undefined)[], known: Known, longest: number): boolean {
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
    p += Math.max(size, 1)
  }
  return false
}

type Known = Map<string, (string | undefined)[] | null>

/**
 * Longer dictionary words that the selected words would misread, such as
 * 大人気 read through 大人: annotated with their own reading when that only
 * takes readings the font already has, left bare otherwise.
 */
function findMisreadRuns(index: DictionaryIndex, patterns: Patterns, kanjiReadings: Map<string, string[]>, ctx: PlanContext): Map<string, RubySpan[] | null> {
  const known: Known = new Map([...patterns].map(([text, readings]) => [text, assignment(readings[0]!.spans, length(text))]))
  const protectedRuns = new Map<string, RubySpan[] | null>()
  for (const text of [...ctx.removed].filter(t => length(t) > 1)) {
    known.set(text, null)
    protectedRuns.set(text, null)
  }
  const protect = (text: string, readings: Map<string, RunReading>, longest: number): boolean => {
    const chars = [...text]
    const truth = [...readings.values()].sort(rank)[0]!
    const expected = assignment(truth.spans, chars.length)
    if (!misreads(chars, expected, known, longest))
      return false
    const run = { text, spans: truth.spans }
    const reusable = !isGrouped(run) && ctx.renderable(run) && truth.spans.every(s => kanjiReadings.get(chars[s.start]!)?.includes(s.ruby))
    protectedRuns.set(text, reusable ? truth.spans : null)
    known.set(text, reusable ? expected : null)
    return true
  }
  // Each protected run is a new rule that can misread others in turn.
  for (let pass = 0, changed = true; changed && pass < 5; pass++) {
    const longest = Math.max(2, ...[...known.keys()].map(length))
    changed = false
    for (const [text, readings] of index.runs) {
      if (!known.has(text) && ctx.covered(text) && protect(text, readings, longest))
        changed = true
    }
  }
  return protectedRuns
}

function buildRules(
  patterns: Patterns,
  kanjiReadings: Map<string, string[]>,
  protectedRuns: Map<string, RubySpan[] | null>,
  glyphs: GlyphRegistry,
): { rules: Rule[], ligatures: Ligature[], ivsWords: Record<string, string[]> } {
  const ligatures: Ligature[] = []
  /** The rule annotating `run`, with `selector` written after its first kanji. */
  const runRule = (run: HanRun, selector?: number): Rule => {
    const cps = codepoints(run.text)
    if (selector)
      cps.splice(1, 0, selector)
    const input = cps.map(glyphName)
    const output = glyphs.run(run)
    if (isGrouped(run)) {
      const lookup = `lig_${ligatures.length + 1}`
      ligatures.push({ lookup, glyph: output[0]!.name, components: input })
      return { input, lookups: input.map((_, i) => i === 0 ? lookup : null), codepoints: cps }
    }
    const lookups: (string | null)[] = output.map(g => `rb_${glyphs.slot(g)}`)
    if (selector)
      lookups.splice(1, 0, null)
    return { input, lookups, codepoints: cps }
  }

  // Only rules starting on the same glyph compete: there, word selectors come
  // first, then kanji selectors, then words, longest first.
  const rules: Rule[] = []
  const ivsWords: Record<string, string[]> = {}
  for (const [text, readings] of patterns) {
    if (readings.length < 2)
      continue
    readings.forEach((r, i) => rules.push(runRule({ text, spans: r.spans }, SELECTOR_FIRST_READING + i)))
    ivsWords[text] = readings.map(r => formatNotation(text, r.spans))
  }
  for (const [kanji, readings] of kanjiReadings) {
    readings.forEach((ruby, i) => {
      const cps = [kanji.codePointAt(0)!, SELECTOR_FIRST_READING + i]
      rules.push({ input: cps.map(glyphName), lookups: [`rb_${glyphs.slot(glyphs.lone(kanji, ruby))}`, null], codepoints: cps })
    })
  }
  const words = [...patterns].map(([text, readings]) => runRule({ text, spans: readings[0]!.spans }))
  for (const [text, spans] of protectedRuns) {
    const cps = codepoints(text)
    words.push(spans ? runRule({ text, spans }) : { input: cps.map(glyphName), lookups: [], codepoints: cps, ignore: true })
  }
  words.sort((a, b) => a.input[0]!.localeCompare(b.input[0]!) || b.input.length - a.input.length)
  rules.push(...words)
  return { rules, ligatures, ivsWords }
}

function smokeChecks(patterns: Patterns, lone: { glyph: PlanGlyph }[], glyphs: GlyphRegistry): Plan['smoke'] {
  const byFrequency = [...patterns].sort((a, b) => (a[1][0]!.nf || 99) - (b[1][0]!.nf || 99))
  const checks: Plan['smoke'] = []
  for (const grouped of [false, true]) {
    for (const [text, readings] of byFrequency.filter(([text, r]) => isGrouped({ text, spans: r[0]!.spans }) === grouped).slice(0, 3))
      checks.push({ text, glyphs: glyphs.run({ text, spans: readings[0]!.spans }).map(g => g.name) })
  }
  if (lone[0])
    checks.push({ text: String.fromCodePoint(lone[0].glyph.bases[0]!), glyphs: [lone[0].glyph.name] })
  return checks
}

/**
 * Indexes the dictionary once into Han runs, then plans fonts from it. Every
 * decision about readings happens here: which words get ruby, which reading
 * is the default, which longer words must be protected from a shorter match.
 */
export function createFontPlanner(dictionary: Dictionary) {
  const index: DictionaryIndex = { runs: new Map(), singles: new Map() }
  for (const entry of dictionary.entries)
    indexEntry(index, entry)
  const sources = Object.entries(dictionary.sources).map(([name, version]) => `${name} ${version}`).join(', ')

  /** Plans a font; with `previewText`, keeps only what that text can trigger. */
  return function planFont(options: PlanOptions, coverage: ReadonlySet<number>, previewText?: string): PlanResult {
    const ctx = createContext(dictionary, options, coverage)
    const { patterns, lonePins } = selectWords(index, ctx)
    const { isolated, kanjiReadings } = chooseLoneKanji(index, patterns, lonePins, ctx)
    const protectedRuns = findMisreadRuns(index, patterns, kanjiReadings, ctx)
    const glyphs = createGlyphRegistry(ctx.render)
    const { rules, ligatures, ivsWords } = buildRules(patterns, kanjiReadings, protectedRuns, glyphs)
    const lone = [...isolated].map(([kanji, ruby]) => ({ base: glyphName(kanji.codePointAt(0)!), glyph: glyphs.lone(kanji, ruby) }))

    const sample = previewText === undefined ? undefined : new Set(codepoints(previewText))
    const inSample = (cps: readonly number[]): boolean => !sample || cps.every(cp => sample.has(cp))
    const keptRules = rules.filter(r => inSample(r.codepoints))
    const keptLone = lone.filter(l => inSample(l.glyph.bases))
    const usedLookups = new Set(keptRules.flatMap(r => r.lookups))
    const keptLigatures = ligatures.filter(l => usedLookups.has(l.lookup))
    const usedSingles = new Set(keptRules.flatMap(r => r.lookups.map((lookup, i) => `${r.input[i]}@${lookup}`)))
    const keptNames = new Set([...keptLigatures.map(l => l.glyph), ...keptLone.map(l => l.glyph.name)])
    const keptGlyphs = glyphs.all().filter(g => keptNames.has(g.name) || usedSingles.has(`${glyphName(g.bases[0]!)}@rb_${glyphs.slot(g)}`))
    const han = [...coverage].filter(cp => inSample([cp]) && isHan(String.fromCodePoint(cp))).sort((a, b) => a - b)
    const selectors = Array.from({ length: MAX_READINGS + 1 }, (_, i) => SELECTOR_SUPPRESS + i).filter(cp => inSample([cp]))

    const fea = emitFea({
      hanClass: [...han.map(glyphName), ...keptGlyphs.map(g => g.name)],
      suppressSelector: selectors.includes(SELECTOR_SUPPRESS) ? glyphName(SELECTOR_SUPPRESS) : undefined,
      singles: keptGlyphs.filter(g => g.bases.length === 1).map(g => ({ lookup: `rb_${glyphs.slot(g)}`, base: glyphName(g.bases[0]!), glyph: g.name })),
      ligatures: keptLigatures,
      isolated: keptLone.map(l => ({ base: l.base, glyph: l.glyph.name })),
      rules: keptRules,
      rubyOff: keptGlyphs.map(g => ({ glyph: g.name, bases: g.bases.map(glyphName) })),
    })
    const named = new Set([...han, ...keptRules.flatMap(r => r.codepoints), ...keptGlyphs.flatMap(g => g.bases)])
    for (const cp of selectors)
      named.delete(cp)

    return {
      plan: {
        version: 1,
        names: {
          family: options.family,
          description: `Furigana rules compiled from ${sources} (CC BY-SA 4.0: EDRDG, JmdictFurigana).`,
        },
        metrics: options.metrics,
        codepoints: [...named].sort((a, b) => a - b),
        selectors,
        glyphs: keptGlyphs,
        fea,
        subset: sample && [...new Set([...sample, ...keptGlyphs.flatMap(g => g.ruby.flatMap(r => codepoints(r.text)))])].sort((a, b) => a - b),
        smoke: sample ? [] : smokeChecks(patterns, lone, glyphs),
      },
      report: {
        stats: {
          patterns: patterns.size,
          ambiguous: Object.keys(ivsWords).length,
          isolated: isolated.size,
          protectedAnnotated: [...protectedRuns.values()].filter(Boolean).length,
          protectedBare: [...protectedRuns.values()].filter(s => !s).length,
          glyphs: keptGlyphs.length,
          rules: keptRules.length,
        },
        ivs: { kanji: Object.fromEntries(kanjiReadings), words: ivsWords },
      },
    }
  }
}
