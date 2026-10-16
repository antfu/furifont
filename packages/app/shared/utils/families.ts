import { PREBUILT } from '@furifont/core'
import { version } from '../../../../package.json'

/** The release the site serves, which `/version.json` tells the bookmarklet and the userscript. */
export const VERSION = version

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

/** The lightest and heaviest weight of the variable font. */
export const [MIN_WEIGHT, MAX_WEIGHT] = PREBUILT.variable.weights

export const REPOSITORY = 'https://github.com/antfu/furifont'

/** The demo site: other pages load the fonts from here. */
export const SITE = 'https://furifont.antfu.me'

/** The release page of the version the site serves. */
export const RELEASE_URL = `${REPOSITORY}/releases/tag/v${VERSION}`

export function releaseUrl(file: string): string {
  return `${REPOSITORY}/releases/latest/download/${file}`
}

/**
 * A family's variable font (`woff2`) or its reading lists (`ivs.json`, which say
 * what `salt` n picks), relative to the site. The version busts caches: the site
 * serves these immutable, so a font and its readings change together.
 */
export function fontPath(family: Family, ext: 'woff2' | 'ivs.json'): string {
  return `fonts/${family.stem}VF.${ext}?v=${VERSION}`
}

export function siteFontUrl(family: Family): string {
  return `${SITE}/${fontPath(family, 'woff2')}`
}

export function siteReadingsUrl(family: Family): string {
  return `${SITE}/${fontPath(family, 'ivs.json')}`
}

/** The okurigana pairs of one kanji, for pages that pick its reading with `salt`. */
export const SITE_PAIRS_URL = `${SITE}/okurigana.json`
