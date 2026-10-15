/// <reference lib="dom" />
import type { Toast } from './toast'
import { VERSION_PROBE } from '@furifont/core'
import { downloadLink, showToast } from './toast'

/** The bookmarklet's or userscript's own version, and where a reader gets a newer copy. */
export interface Update {
  version: string
  href: string
  /** The link's words. */
  text: string
  /** Fetches the site's `version.json` past the page's CSP, as a userscript can. */
  fetchText?: (url: string) => Promise<string>
}

/** `major.minor.patch` as a number that orders versions: the font's revision in thousandths, so `0.1.2` is 102. */
function versionNumber(version: string): number {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number)
  return major * 1000 + minor * 100 + patch
}

/** The version number of the `family` the page has, from the width of its probe: below 0 for a font from before the probe. */
function fontVersion(family: string): number {
  const context = document.createElement('canvas').getContext('2d')!
  // At 1000px, a pixel is a thousandth of an em.
  context.font = `1000px "${family}"`
  return Math.round(context.measureText(String.fromCodePoint(VERSION_PROBE.base, VERSION_PROBE.selector)).width) - 2000
}

/**
 * Says when the script, or the font of `family` the page has loaded, is older
 * than the release the site at `url` serves, with a link to a newer one of each.
 * Nothing shows when the site cannot say, as when a CSP blocks it.
 */
export async function showUpdates({ family, url, toast }: { family: string, url: string, toast: Toast }, update: Update): Promise<void> {
  const site = new URL('/version.json', url).href
  let latest: number
  try {
    // The site writes the file; checking its shape would ship a schema library in every bookmarklet.
    latest = versionNumber((JSON.parse(await (update.fetchText ? update.fetchText(site) : fetch(site).then(r => r.text()))) as { version: string }).version)
  }
  catch {
    return
  }
  const links = [...versionNumber(update.version) < latest ? [update] : [], ...fontVersion(family) < latest ? [downloadLink(url, toast)] : []]
  if (links.length)
    showToast(toast.outdated, links, toast.close)
}
