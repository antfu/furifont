export interface Family {
  family: string
  /** File name stem: `<stem>-Regular.woff2`. */
  stem: string
  script: string
}

/** The prebuilt fonts, one family per ruby script. */
export const FAMILIES: Family[] = [
  { family: 'Furifont Sans JP', stem: 'FurifontSansJP', script: 'Hiragana' },
  { family: 'Furifont Sans JP Kata', stem: 'FurifontSansJPKata', script: 'Katakana on\'yomi' },
  { family: 'Furifont Sans JP Romaji', stem: 'FurifontSansJPRomaji', script: 'Romaji' },
]

export const WEIGHTS = [
  { weight: 400, style: 'Regular' },
  { weight: 700, style: 'Bold' },
] as const

export const REPOSITORY = 'https://github.com/antfu/furigana-font'

export function releaseUrl(file: string): string {
  return `${REPOSITORY}/releases/latest/download/${file}`
}
