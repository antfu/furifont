import { PREBUILT } from '@furifont/core'

export interface Family {
  family: string
  /** File name stem: `<stem>-Regular.otf`, and the variable font's `<stem>VF.woff2`. */
  stem: string
  face: 'sans' | 'serif'
  script: 'hiragana' | 'hepburn'
}

/** The prebuilt fonts, as `PREBUILT` in core lists them. */
export const FAMILIES: Family[] = PREBUILT.fonts.map(({ family, face, rubyScript }) => ({ family, stem: family.replaceAll(' ', ''), face, script: rubyScript }))

/** Static weights on the release, beside the variable font of every weight that the site serves. */
export const WEIGHTS = PREBUILT.weights

export const REPOSITORY = 'https://github.com/antfu/furifont'

/** The demo site: other pages load the fonts from here. */
export const SITE = 'https://furifont.antfu.me'

export function releaseUrl(file: string): string {
  return `${REPOSITORY}/releases/latest/download/${file}`
}

export function siteFontUrl(family: Family): string {
  return `${SITE}/fonts/${family.stem}VF.woff2`
}

/** The reading lists of a family's variable font, which say what `salt` n picks. */
export function siteReadingsUrl(family: Family): string {
  return `${SITE}/fonts/${family.stem}VF.ivs.json`
}

/** The okurigana pairs of one kanji, for pages that pick its reading with `salt`. */
export const SITE_PAIRS_URL = `${SITE}/okurigana.json`
