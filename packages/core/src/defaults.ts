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
    places: true,
    isolated: true,
    isolatedMinShare: 0.8,
    /** Sizes in em, relative to the base font. */
    metrics: {
      rubyScale: 0.4,
      rubyGap: 0.05,
      compressionFloor: 0.6,
      maxRubyWidth: 1.6,
    },
  },
  /** What the CLI adds to a plan: where the glyphs are drawn, and what is written. */
  build: {
    base: 'Source Han Sans JP Regular',
    formats: ['otf', 'woff2'],
  },
} as const

/** The prebuilt fonts: the release's, and the site's subset of them. */
export const PREBUILT = {
  /** Each Source Han face in each ruby script. The first is the default family. */
  fonts: [
    { family: 'Furifont Sans', base: 'Source Han Sans JP', face: 'sans', rubyScript: 'hiragana' },
    { family: 'Furifont Sans Romaji', base: 'Source Han Sans JP', face: 'sans', rubyScript: 'hepburn' },
    { family: 'Furifont Serif', base: 'Source Han Serif JP', face: 'serif', rubyScript: 'hiragana' },
    { family: 'Furifont Serif Romaji', base: 'Source Han Serif JP', face: 'serif', rubyScript: 'hepburn' },
  ],
  /** The weights of the release, each of the base's weights by name. */
  weights: [
    { style: 'Regular', weight: 400 },
    { style: 'Bold', weight: 700 },
  ],
  /**
   * Every weight in one font, from the base's variable font (`<base> VF`). It
   * is named apart, `<family> VF`, so it installs beside the static weights.
   */
  variable: {
    style: 'VF',
    weights: [250, 900],
  },
  /** What `fonts/` holds, which git keeps and the site serves: the variable WOFF2s. */
  site: {
    styles: ['VF'],
    formats: ['woff2'],
  },
  /** Options set on every prebuilt font over the defaults above, such as `{ nfMax: 24 }`. */
  options: {},
} as const satisfies {
  fonts: readonly { family: string, base: string, face: 'sans' | 'serif', rubyScript: 'hiragana' | 'hepburn' }[]
  weights: readonly { style: string, weight: number }[]
  variable: { style: string, weights: readonly [number, number] }
  site: { styles: readonly string[], formats: readonly ('otf' | 'woff2')[] }
  options: Omit<PlanOptionsInput, 'family' | 'rubyScript'>
}
