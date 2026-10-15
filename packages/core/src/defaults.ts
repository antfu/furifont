import type { PlanOptionsInput } from './schema'

/**
 * Every default of a build, and how the prebuilt fonts are built, in one place.
 * Config files, the CLI, the studio and `scripts/build-fonts.ts` all read it, so
 * a change here reaches them together. What an option means is in `schema.ts`.
 */
export const DEFAULTS = {
  /** What a plan does when a config leaves an option out. */
  plan: {
    family: 'Furifont Sans',
    rubyScript: 'hiragana',
    /** Newspaper frequency buckets, nf01 to nf48: the window of words that get ruby. All of them: it adds about 400 glyphs. */
    nfMin: 1,
    nfMax: 48,
    /** JMdict priority tags that select a word whatever its bucket: the first tier of each list, which JMdict marks as common. */
    selectTags: ['ichi1', 'news1', 'spec1', 'gai1'],
    /** Uses in Tatoeba's example sentences that select a word whatever its bucket: about 1,000 more words, and 50 glyphs. */
    minExamples: 3,
    places: true,
    isolated: true,
    isolatedMinShare: 0.8,
    /** Sizes in em, relative to the base font. */
    metrics: {
      rubyScale: 0.5,
      rubyGap: 0.05,
      compressionFloor: 0.8,
      maxRubyWidth: 1.5,
    },
  },
  /** What the CLI adds to a plan: where the glyphs are drawn, and what is written. */
  build: {
    base: 'Source Han Sans JP VF',
    formats: ['otf', 'woff2'],
  },
} as const

/** The prebuilt fonts, which each release carries; the site serves their variable WOFF2s. */
export const PREBUILT = {
  /** Each Source Han face in each ruby script. The first is the default family. */
  fonts: [
    { family: 'Furifont Sans', base: 'Source Han Sans JP', face: 'sans', rubyScript: 'hiragana' },
    { family: 'Furifont Sans Romaji', base: 'Source Han Sans JP', face: 'sans', rubyScript: 'hepburn' },
    { family: 'Furifont Serif', base: 'Source Han Serif JP', face: 'serif', rubyScript: 'hiragana' },
    { family: 'Furifont Serif Romaji', base: 'Source Han Serif JP', face: 'serif', rubyScript: 'hepburn' },
  ],
  /** The static weights of the release, each of the base's weights by name. Bold is the variable font's. */
  weights: [
    { style: 'Regular', weight: 400 },
  ],
  /**
   * Every weight in one font, from the base's variable font (`<base> VF`). It
   * is named apart, `<family> VF`, so it installs beside the static weights.
   */
  variable: {
    style: 'VF',
    weights: [250, 900],
  },
  /** Options set on every prebuilt font over the defaults above, such as `{ nfMax: 24 }`. */
  options: {},
} as const satisfies {
  fonts: readonly { family: string, base: string, face: 'sans' | 'serif', rubyScript: 'hiragana' | 'hepburn' }[]
  weights: readonly { style: string, weight: number }[]
  variable: { style: string, weights: readonly [number, number] }
  options: Omit<PlanOptionsInput, 'family' | 'rubyScript'>
}

/**
 * The sequence, 。 and VS1, a page measures to tell which version of Furifont
 * it has: the font maps it to an empty glyph two ems wide plus the revision in
 * ems (`0.1.2`, revision 0.102, is 2.102 ems). A font from before it draws the
 * 。 alone, an em wide at most.
 */
export const VERSION_PROBE = { base: 0x3002, selector: 0xFE00 } as const
