/// <reference lib="dom" />
import { PREBUILT } from '@furifont/core'
import { UNICODE_RANGE } from './stack'

/** Where a page gets a Furifont family. */
export interface FontSource {
  /** The family's name, as its files and an installed copy give it. */
  family: string
  /** Its Regular, downloaded when it is not installed. */
  url: string
  /** Fetches `url` past the page's CSP, as a userscript can. */
  fetchFont?: (url: string) => Promise<ArrayBuffer>
}

/**
 * Adds a Furifont family to the page's fonts, for its Japanese text only (see
 * {@link UNICODE_RANGE}), and says whether it could. An installed Furifont needs
 * no download and brings every weight of it; otherwise its Regular downloads
 * from `url`, which a CSP that blocks fonts from other sites makes fail.
 */
export async function loadFurifont({ family, url, fetchFont }: FontSource): Promise<boolean> {
  const face = (source: string | ArrayBuffer, weight = '400'): Promise<FontFace | undefined> =>
    new FontFace(family, source, { unicodeRange: UNICODE_RANGE, weight }).load().catch(() => undefined)
  // Chromium and Firefox find an installed font by its full name, WebKit by its family.
  const installed = await Promise.all(PREBUILT.weights.map(({ style, weight }) =>
    face(`local("${family} ${style}")${weight === 400 ? `,local("${family}")` : ''}`, String(weight))))
  const faces = installed.some(Boolean) ? installed : [await (fetchFont ? fetchFont(url).then(bytes => face(bytes), () => undefined) : face(`url("${url}")`))]
  for (const loaded of faces) {
    if (loaded)
      document.fonts.add(loaded)
  }
  return faces.some(Boolean)
}
