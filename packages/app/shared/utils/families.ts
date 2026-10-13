export interface Family {
  family: string
  /** File name stem: `<stem>-Regular.woff2`. */
  stem: string
  face: 'sans' | 'serif'
  script: 'hiragana' | 'hepburn'
}

/** The prebuilt fonts: hiragana and romaji ruby on Source Han Sans and Serif. */
export const FAMILIES: Family[] = [
  { family: 'Furifont Sans JP', stem: 'FurifontSansJP', face: 'sans', script: 'hiragana' },
  { family: 'Furifont Sans JP Romaji', stem: 'FurifontSansJPRomaji', face: 'sans', script: 'hepburn' },
  { family: 'Furifont Serif JP', stem: 'FurifontSerifJP', face: 'serif', script: 'hiragana' },
  { family: 'Furifont Serif JP Romaji', stem: 'FurifontSerifJPRomaji', face: 'serif', script: 'hepburn' },
]

/** Weights on the release; the site serves Regular only. */
export const WEIGHTS = [
  { weight: 400, style: 'Regular' },
  { weight: 700, style: 'Bold' },
] as const

export const REPOSITORY = 'https://github.com/antfu/furigana-font'

/** The demo site: other pages load the fonts from here. */
export const SITE = 'https://furifont.antfu.me'

export function releaseUrl(file: string): string {
  return `${REPOSITORY}/releases/latest/download/${file}`
}

export function siteFontUrl(family: Family): string {
  return `${SITE}/fonts/${family.stem}-Regular.woff2`
}
