/** The release the site serves, for the bookmarklet and the userscript to tell whether they, or the installed fonts, are older. Prerendered with the site. */
export default defineEventHandler(() => ({ version: VERSION }))
