import * as v from 'valibot'
import { DEFAULTS } from './defaults'

export const FURIGANA_SCRIPTS = ['hiragana', 'katakanaOn', 'hepburn'] as const
/** The dictionary's manually maintained sources. */
export const MANUAL_SOURCES = ['mahjong-yaku', 'jr-stations', 'yojijukugo', 'japan-post'] as const
export type ManualSource = typeof MANUAL_SOURCES[number]
/**
 * The sources a plan takes words from: any JMdict word; JMdict's priority
 * lists (both tiers of each) and its newspaper ranking; words Tatoeba's
 * sentences use at least three times; JMnedict's place names; the manual lists.
 */
export const WORD_SOURCES = ['jmdict', 'ichi', 'news', 'spec', 'gai', 'nf', 'tatoeba', 'place', ...MANUAL_SOURCES] as const
export type WordSource = typeof WORD_SOURCES[number]
/** Easiest first. */
export const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const
/**
 * Every source a reading may have, a bit each in this order: the word
 * sources, then the easiest JLPT level listing it, `inflecting` (a kanji read
 * before okurigana in a JMdict word no list tags, such as 奉る) and `default`,
 * the dictionary's curated default.
 */
export const SOURCES = [...WORD_SOURCES, ...JLPT_LEVELS, 'inflecting', 'default'] as const
export type Source = typeof SOURCES[number]
export const sourceBit = (source: Source): number => 1 << SOURCES.indexOf(source)
/** The sources a mask of `SOURCES` bits names. */
export const sourcesIn = (mask: number): Source[] => SOURCES.filter(source => mask & sourceBit(source))
export type FuriganaScript = typeof FURIGANA_SCRIPTS[number]

/** Sizes in em, relative to the base font. */
const RubyMetricsSchema = v.object({
  /** Ruby size relative to the base characters. */
  rubyScale: v.optional(v.pipe(v.number(), v.minValue(0.2), v.maxValue(0.8)), DEFAULTS.plan.metrics.rubyScale),
  /** Space between the top of the em box and the bottom of the ruby. */
  rubyGap: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(0.5)), DEFAULTS.plan.metrics.rubyGap),
  /** Ruby is squeezed horizontally down to this scale before it may overhang. */
  compressionFloor: v.optional(v.pipe(v.number(), v.minValue(0.3), v.maxValue(1)), DEFAULTS.plan.metrics.compressionFloor),
  /** Widest a ruby may get, overhanging its base symmetrically. */
  maxRubyWidth: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(3)), DEFAULTS.plan.metrics.maxRubyWidth),
})
export type RubyMetrics = v.InferOutput<typeof RubyMetricsSchema>

const Count = v.pipe(v.number(), v.integer(), v.minValue(0))

export const PlanOptionsSchema = v.object({
  family: v.optional(v.pipe(v.string(), v.trim(), v.nonEmpty(), v.check(name => !/source/i.test(name), 'Source is a reserved font name of the base font')), DEFAULTS.plan.family),
  furiganaScript: v.optional(v.picklist(FURIGANA_SCRIPTS), DEFAULTS.plan.furiganaScript),
  /** The sources whose words get ruby. */
  sources: v.optional(v.array(v.picklist(WORD_SOURCES)), () => [...WORD_SOURCES]),
  /** The most common words left bare, by score: a reader knows them. Lone kanji count too. */
  skip: v.optional(Count, DEFAULTS.plan.skip),
  /** How many words get ruby after those skipped, by score; all of them when left out. `'max'` takes as many as the base font's glyph budget holds. */
  take: v.optional(v.union([v.pipe(Count, v.minValue(1)), v.literal('max')])),
  /** Words on the JLPT lists of this level and every easier one stay bare. */
  skipJlpt: v.optional(v.picklist(JLPT_LEVELS)),
  /** Annotate a kanji alone in its run, or one no word claims after another kanji (a suffix); when off, only selectors give them ruby. */
  isolated: v.optional(v.boolean(), DEFAULTS.plan.isolated),
  /** Romaji over hiragana and katakana, when the kanji's ruby is romaji too (`hepburn`). */
  kanaRomaji: v.optional(v.boolean(), DEFAULTS.plan.kanaRomaji),
  /** A kanji alone in its run is annotated only when one reading has this share of the evidence. */
  isolatedMinShare: v.optional(v.pipe(v.number(), v.minValue(0.5), v.maxValue(1)), DEFAULTS.plan.isolatedMinShare),
  words: v.optional(v.object({
    /** Extra words in inline notation, `日[に]本[ほん]`. */
    add: v.optional(v.array(v.string()), []),
    /** Written forms never to annotate. */
    remove: v.optional(v.array(v.string()), []),
    /** Readings to make the default, in inline notation. */
    pin: v.optional(v.array(v.string()), []),
  }), {}),
  metrics: v.optional(RubyMetricsSchema, {}),
})
export type PlanOptions = v.InferOutput<typeof PlanOptionsSchema>
export type PlanOptionsInput = v.InferInput<typeof PlanOptionsSchema>

export function resolveOptions(input: PlanOptionsInput = {}): PlanOptions {
  return v.parse(PlanOptionsSchema, input)
}

const Codepoint = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(0x10FFFF))

/**
 * The contract between the planner and the compiler. The compiler makes no
 * decision about readings: it draws what `glyphs` describes and compiles `fea`.
 * In `fea`, base characters are named `uniXXXX` / `uXXXXX` after their codepoint.
 */
export const PlanSchema = v.object({
  version: v.literal(1),
  names: v.object({ family: v.string(), description: v.string() }),
  metrics: v.object({
    rubyScale: v.number(),
    rubyGap: v.number(),
    compressionFloor: v.number(),
    maxRubyWidth: v.number(),
  }),
  /** Base characters the rules name; each must be in the base font's cmap. */
  codepoints: v.array(Codepoint),
  /**
   * Base + variation selector sequences to map in `cmap` format 14, each to an
   * empty glyph named `name`, with the base's advance: the rules replace it.
   */
  variants: v.array(v.object({ name: v.pipe(v.string(), v.regex(/^[A-Z_][\w.]{0,62}$/i)), base: Codepoint, selector: Codepoint })),
  glyphs: v.array(v.object({
    name: v.pipe(v.string(), v.regex(/^[A-Z_][\w.]{0,62}$/i)),
    /** The base characters drawn side by side; more than one makes a ligature. */
    bases: v.pipe(v.array(Codepoint), v.minLength(1)),
    /** Ruby text drawn above characters `[start, end)` of `bases`. */
    ruby: v.array(v.object({ start: v.number(), end: v.number(), text: v.pipe(v.string(), v.nonEmpty()) })),
  })),
  fea: v.string(),
  /** Subset the base font to these codepoints before building (live previews). */
  subset: v.optional(v.array(Codepoint)),
  /** Shaping checks the compiler runs on its output: `text` must shape to `glyphs`. */
  smoke: v.array(v.object({ text: v.string(), glyphs: v.array(v.string()) })),
})
export type Plan = v.InferOutput<typeof PlanSchema>
export type PlanGlyph = Plan['glyphs'][number]

/**
 * The bounds of a reading's score, 0 to 100: above `tagged`, a word JMdict's
 * lists tag, by its weight; above `used`, one Tatoeba's sentences use (20 and
 * its uses, up to 50); above `listed`, one a manual list (15) or JMnedict (10)
 * names; any other JMdict word scores `listed`.
 */
export const SCORE = { tagged: 50, used: 20, listed: 5 } as const
/** Score points per factor e of weight: a point is a twelfth, about 9%, of it. */
const POINTS = 12

/**
 * The score of a tagged reading of corpus weight `weight`, at most 1: 1 / its
 * newspaper bucket, or a lone kanji's share of its uses. It is 100 for 1, 92
 * for 1/2, 54 for 1/48; a weight too small to score above `tagged` scores 0.
 */
export function scoreOf(weight: number): number {
  const score = Math.round(100 + POINTS * Math.log(weight))
  return score > SCORE.tagged ? score : 0
}

/** The corpus weight of a reading's score, which `scoreOf` gives; 0 for one no list tags. */
export const weightOf = (score: number): number => score > SCORE.tagged ? Math.exp((score - 100) / POINTS) : 0

/** A reading's score, higher for a more common one, and its sources as a mask of `SOURCES` bits. */
export type Reading = [score: number, sources: number]
type Table = Record<string, Record<string, Reading>>
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isReading = (value: unknown): value is Reading => Array.isArray(value) && value.length === 2 && value.every(Number.isInteger) && value[0] >= 0 && value[0] <= 100 && value[1] > 0 && value[1] < 1 << SOURCES.length

/** Readings by run or kanji, then by alignment or reading. Checked by hand: valibot takes seconds over the 400,000 readings of the dictionary. */
const ReadingsSchema = v.custom<Table>(
  input => isRecord(input) && Object.values(input).every(readings => isRecord(readings) && Object.values(readings).every(isReading)),
  'Expected readings by run, each [score, sources]',
)

/** The bit of each source, which the file writes for its readers. */
export const SOURCE_BITS: Record<string, number> = Object.fromEntries(SOURCES.map(source => [source, sourceBit(source)]))

/**
 * The compiled dictionary, the contract between `@furifont/dictionary` and
 * the planner: readings by the Han run a font sees, each with its score and
 * sources. A run's readings come ranked, the default first. Run readings are
 * JmdictFurigana alignments within the run.
 */
export const DictionarySchema = v.object({
  /** Source datasets and the version each was compiled from. */
  versions: v.record(v.string(), v.string()),
  /** The bit of each source in the readings' masks. */
  sources: v.custom<Record<string, number>>(input => isRecord(input) && JSON.stringify(input) === JSON.stringify(SOURCE_BITS), 'Expected the sources of this version of @furifont/core'),
  /** Kanji to its on'yomi, in hiragana. */
  onyomi: v.record(v.string(), v.array(v.string())),
  /** Runs of two or more kanji, then their alignments: `{ 日本: { '0-1:にほん': [75, 61] } }`. */
  runs: ReadingsSchema,
  /** Kanji alone in a run, then their readings: `{ 来: { く: [98, 2101] } }`. */
  kanji: ReadingsSchema,
  /** Written forms never to annotate, such as 月, whose reading alone is a guess; users' removals add to them. */
  bare: v.array(v.string()),
})
export type Dictionary = v.InferOutput<typeof DictionarySchema>

/** The file `DictionarySchema` reads: an entry a line. */
export function formatDictionary(dictionary: Dictionary): string {
  const lines = <T>(table: Record<string, T>): string => Object.entries(table).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(',\n')
  return `{
"versions":${JSON.stringify(dictionary.versions)},
"sources":${JSON.stringify(dictionary.sources)},
"bare":${JSON.stringify(dictionary.bare)},
"onyomi":{
${lines(dictionary.onyomi)}
},
"kanji":{
${lines(dictionary.kanji)}
},
"runs":{
${lines(dictionary.runs)}
}
}
`
}
