import * as v from 'valibot'
import { DEFAULTS } from './defaults'

export const RUBY_SCRIPTS = ['hiragana', 'katakanaOn', 'hepburn'] as const
export const PRIORITY_TAGS = ['ichi1', 'ichi2', 'news1', 'news2', 'spec1', 'spec2', 'gai1', 'gai2'] as const
/** Easiest first. */
/** The dictionary's manually maintained sources, which a plan may include by name. */
export const MANUAL_SOURCES = ['mahjong-yaku', 'jr-stations', 'yojijukugo'] as const
export type ManualSource = typeof MANUAL_SOURCES[number]
export const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const
export type RubyScript = typeof RUBY_SCRIPTS[number]

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

const Bucket = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(48))

/** `schema`, checking that its frequency window `nfMin..nfMax` holds a bucket; for schemas that extend the options too. */
export function withNfWindow<T extends v.GenericSchema<unknown, { nfMin: number, nfMax: number }>>(schema: T): v.SchemaWithPipe<readonly [T, v.CheckAction<v.InferOutput<T>, string>]> {
  return v.pipe(schema, v.check(o => o.nfMin <= o.nfMax, 'nfMin must not exceed nfMax'))
}

export const PlanOptionsSchema = withNfWindow(v.object({
  family: v.optional(v.pipe(v.string(), v.trim(), v.nonEmpty(), v.check(name => !/source/i.test(name), 'Source is a reserved font name of the base font')), DEFAULTS.plan.family),
  rubyScript: v.optional(v.picklist(RUBY_SCRIPTS), DEFAULTS.plan.rubyScript),
  /**
   * Words whose newspaper frequency bucket is below this stay bare: the most
   * common ones, which a reader knows. Tags don't bring them back.
   */
  nfMin: v.optional(Bucket, DEFAULTS.plan.nfMin),
  /** Words whose newspaper frequency bucket is at most this are annotated. */
  nfMax: v.optional(Bucket, DEFAULTS.plan.nfMax),
  /**
   * JMdict priority tags that select a word whatever its frequency bucket:
   * `spec1` catches words like 日本 that the newspaper ranking misses.
   */
  selectTags: v.optional(v.array(v.picklist(PRIORITY_TAGS)), () => [...DEFAULTS.plan.selectTags]),
  /**
   * Words of two or more kanji that Tatoeba's example sentences use at least
   * this many times are annotated whatever their bucket: everyday words that
   * no list tags, such as 留守中, which would otherwise be bare or read as a
   * place name (国中 くになか, not くにじゅう). The sentences also decide how a
   * lone kanji reads, where they use it alone often enough. 0 turns them off.
   */
  minTatoeba: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), DEFAULTS.plan.minTatoeba),
  /** Words on the JLPT lists of this level and every easier one stay bare. */
  skipJlpt: v.optional(v.picklist(JLPT_LEVELS)),
  /** Annotate place names from the dictionary where no common word claims the run. */
  places: v.optional(v.boolean(), DEFAULTS.plan.places),
  /** Annotate the words of JMdict that no list ranks or tags (such as 四字熟語), where no common word, manual list or place name claims the run; each gets its first reading. */
  untagged: v.optional(v.boolean(), DEFAULTS.plan.untagged),
  /** The dictionary's manually maintained sources (such as `mahjong-yaku`) to annotate; all of them when left out. */
  manual: v.optional(v.array(v.picklist(MANUAL_SOURCES))),
  /** Annotate a kanji alone in its run, or one no word claims after another kanji (a suffix); when off, only selectors give them ruby. */
  isolated: v.optional(v.boolean(), DEFAULTS.plan.isolated),
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
}))
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

/** Sources that give a reading a number. */
const MEASURES = {
  /** JMdict lists it: the reading's position among its form's, 1000 on when the run is part of a longer form. */
  jmdict: [0, Infinity],
  /** The reading's corpus frequency, in newspaper buckets: a tagged form's bucket, else 24 for a `*1` tag and 48 for others. Only tagged readings have one. */
  rank: [1, 48],
  /** Best newspaper bucket (nf01..nf48) of a priority-tagged form with the reading. */
  nf: [1, 48],
  /** Easiest JLPT level listing it, 5 for N5. */
  jlpt: [1, 5],
  /** Uses in Tatoeba's example sentences. */
  tatoeba: [1, Infinity],
} as const
/**
 * Sources that only list a reading: JMdict's priority tags, the manual
 * lists, JMnedict's place names, the curated defaults, and `inflecting`, a
 * kanji read before okurigana in a JMdict word no list tags, such as 奉る.
 */
const LISTS = [...PRIORITY_TAGS, 'inflecting', 'place', ...MANUAL_SOURCES, 'default'] as const

/** What each source says of one reading; a source that does not list it is left out. */
export type ReadingSources = Partial<Record<keyof typeof MEASURES, number> & Record<typeof LISTS[number], true>>
type Source = keyof ReadingSources

/** Every source in the order the file writes them. */
const SOURCES: readonly Source[] = ['jmdict', 'rank', 'nf', ...PRIORITY_TAGS, 'jlpt', 'tatoeba', 'inflecting', 'place', ...MANUAL_SOURCES, 'default']
const isMeasure = (name: string): name is keyof typeof MEASURES => Object.hasOwn(MEASURES, name)

/** `jmdict:0 rank:2 ichi1 jlpt:5`: the sources of a reading as the file writes them, as JMdict writes its priority tags. */
function formatSources(sources: ReadingSources): string {
  return SOURCES.filter(name => sources[name] !== undefined).map(name => isMeasure(name) ? `${name}:${sources[name]}` : name).join(' ')
}

/** The sources of a reading as `formatSources` writes them, or the token that is none. */
function parseSources(text: string): ReadingSources | string {
  const sources: ReadingSources = {}
  for (const token of text.split(' ')) {
    const [name = '', value] = token.split(':')
    const n = Number(value)
    const list = LISTS.find(l => l === name)
    if (isMeasure(name) && Number.isInteger(n) && n >= MEASURES[name][0] && n <= MEASURES[name][1])
      sources[name] = n
    else if (list && value === undefined)
      sources[list] = true
    else
      return token
  }
  return sources
}

type Table = Record<string, Record<string, string>>
/** Checked by hand: valibot takes seconds over the 400,000 readings of the dictionary. */
function isTable(input: unknown): input is Table {
  const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
  return isRecord(input) && Object.values(input).every(readings => isRecord(readings) && Object.values(readings).every(text => typeof text === 'string'))
}

/** Readings by run or kanji, then by alignment or reading, each with its sources. */
const ReadingsSchema = v.pipe(
  v.custom<Table>(isTable, 'Expected readings by run, each a string of sources'),
  v.rawTransform(({ dataset, addIssue, NEVER }) => {
    const table: Record<string, Record<string, ReadingSources>> = {}
    for (const text in dataset.value) {
      const readings: Record<string, ReadingSources> = table[text] = {}
      for (const [key, value] of Object.entries(dataset.value[text]!)) {
        const sources = parseSources(value)
        if (typeof sources === 'string') {
          addIssue({ message: `"${sources}" in ${text} ${key} is no source of a reading` })
          return NEVER
        }
        readings[key] = sources
      }
    }
    return table
  }),
)

/**
 * The compiled dictionary, the contract between `@furifont/dictionary` and
 * the planner: readings by the Han run a font sees, each with what every
 * source says of it. Run readings are JmdictFurigana alignments within the run.
 */
export const DictionarySchema = v.object({
  /** Source datasets and the version each was compiled from. */
  versions: v.record(v.string(), v.string()),
  /** Kanji to its on'yomi, in hiragana. */
  onyomi: v.record(v.string(), v.array(v.string())),
  /** Runs of two or more kanji, then their alignments: `{ 日本: { '0-1:にほん': 'jmdict:0 rank:25 nf:25 news2 spec1 jlpt:3' } }`. */
  runs: ReadingsSchema,
  /** Kanji alone in a run, then their readings: `{ 来: { く: 'rank:3 nf:3 ichi1 news1 jlpt:5' } }`. */
  kanji: ReadingsSchema,
  /** Written forms never to annotate, such as 月, whose reading alone is a guess; users' removals add to them. */
  bare: v.array(v.string()),
})
export type Dictionary = v.InferOutput<typeof DictionarySchema>

/** The file `DictionarySchema` reads: an entry a line. */
export function formatDictionary(dictionary: Dictionary): string {
  const lines = <T>(table: Record<string, T>): string => Object.entries(table).map(([key, value]) => `${JSON.stringify(key)}:${JSON.stringify(value)}`).join(',\n')
  const written = (table: Dictionary['runs']): Record<string, Record<string, string>> => Object.fromEntries(Object.entries(table).map(([text, readings]) => [text, Object.fromEntries(Object.entries(readings).map(([key, sources]) => [key, formatSources(sources)]))]))
  return `{
"versions":${JSON.stringify(dictionary.versions)},
"bare":${JSON.stringify(dictionary.bare)},
"onyomi":{
${lines(dictionary.onyomi)}
},
"kanji":{
${lines(written(dictionary.kanji))}
},
"runs":{
${lines(written(dictionary.runs))}
}
}
`
}
