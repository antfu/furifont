import * as v from 'valibot'

/** Where the reader saw the wrong reading. */
export const REPORT_ENVIRONMENTS = ['playground', 'website', 'desktop', 'mobile'] as const

/** Words in one report, at most: a page of mistakes is better split. */
export const MAX_REPORT_WORDS = 20

function text(max: number) {
  return v.pipe(v.string(), v.trim(), v.maxLength(max))
}

function required(max: number) {
  return v.pipe(text(max), v.nonEmpty())
}

/** Blank optional fields drop out, so stored reports carry only what the reader gave. */
function optional(max: number) {
  return v.pipe(v.optional(text(max)), v.transform(value => value || undefined))
}

const ReportWordSchema = v.object({
  word: required(32),
  /** The reading it should have. */
  expected: required(64),
  /** The reading the font showed, if any. */
  shown: optional(64),
  /** The sentence it appeared in. */
  context: optional(200),
})

export const ReportSchema = v.object({
  words: v.pipe(v.array(ReportWordSchema), v.minLength(1), v.maxLength(MAX_REPORT_WORDS)),
  environment: v.object({
    type: v.picklist(REPORT_ENVIRONMENTS),
    /** The page, for `website`. */
    url: optional(500),
    /** The application, for `desktop` and `mobile`. */
    app: optional(100),
    os: optional(100),
  }),
  /** A font of `FAMILIES` with its `Regular` or `VF` build, or none when the reader does not know which. */
  family: optional(100),
  /** The site's release, which says what dictionary the playground used. */
  version: required(32),
  locale: required(16),
  note: optional(2000),
  /** How to credit the reader for the fix, if they want to be. */
  name: optional(100),
  /** A honeypot: hidden from people, so only bots fill it in. */
  nickname: v.optional(v.pipe(v.string(), v.empty())),
})

export type ReportInput = v.InferInput<typeof ReportSchema>
export type Report = v.InferOutput<typeof ReportSchema>
