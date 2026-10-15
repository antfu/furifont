/** The docs pages, in reading order: each one is `content/docs/<locale>/<slug>.md`. */
export const DOCS = ['install', 'website', 'readings'] as const

export type Doc = typeof DOCS[number]

const sources = import.meta.glob<string>('../../content/docs/*/*.md', { query: '?raw', import: 'default' })

/** A page in the interface's language, or in English until it is translated. */
export function loadDoc(doc: Doc, locale: string): Promise<string> {
  const load = sources[`../../content/docs/${locale}/${doc}.md`] ?? sources[`../../content/docs/en/${doc}.md`]!
  return load()
}
