import * as v from 'valibot'
import { DEFAULTS } from './defaults'

export const RUBY_SCRIPTS = ['hiragana', 'katakanaOn', 'hepburn'] as const
export const PRIORITY_TAGS = ['ichi1', 'ichi2', 'news1', 'news2', 'spec1', 'spec2', 'gai1', 'gai2'] as const
/** Easiest first. */
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
  minExamples: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0)), DEFAULTS.plan.minExamples),
  /** Words on the JLPT lists of this level and every easier one stay bare. */
  skipJlpt: v.optional(v.picklist(JLPT_LEVELS)),
  /** Annotate place names from the dictionary where no common word claims the run. */
  places: v.optional(v.boolean(), DEFAULTS.plan.places),
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
