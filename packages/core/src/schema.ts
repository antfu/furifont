import * as v from 'valibot'

export const RUBY_SCRIPTS = ['hiragana', 'katakanaOn', 'hepburn'] as const
export type RubyScript = typeof RUBY_SCRIPTS[number]

/** Sizes in em, relative to the base font. */
const RubyMetricsSchema = v.object({
  /** Ruby size relative to the base characters. */
  rubyScale: v.optional(v.pipe(v.number(), v.minValue(0.2), v.maxValue(0.8)), 0.5),
  /** Space between the top of the em box and the bottom of the ruby. */
  rubyGap: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(0.5)), 0.05),
  /** Ruby is squeezed horizontally down to this scale before it may overhang. */
  compressionFloor: v.optional(v.pipe(v.number(), v.minValue(0.3), v.maxValue(1)), 0.6),
  /** Widest a ruby may get, overhanging its base symmetrically. */
  maxRubyWidth: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(3)), 1.6),
})
export type RubyMetrics = v.InferOutput<typeof RubyMetricsSchema>

export const PlanOptionsSchema = v.object({
  family: v.optional(v.pipe(v.string(), v.trim(), v.nonEmpty(), v.check(name => !/source/i.test(name), 'Source is a reserved font name of the base font')), 'Furifont Sans JP'),
  rubyScript: v.optional(v.picklist(RUBY_SCRIPTS), 'hiragana'),
  /** Words whose newspaper frequency bucket is at most this are annotated. */
  nfMax: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(48)), 10),
  /** A kanji alone in its run is annotated only when one reading has this share of the evidence. */
  isolatedMinShare: v.optional(v.pipe(v.number(), v.minValue(0.5), v.maxValue(1)), 0.8),
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
  /** Variation selectors to map to empty zero-width glyphs, named like base characters. */
  selectors: v.array(Codepoint),
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
