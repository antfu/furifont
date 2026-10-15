import type { Dictionary } from '@furifont/core'
import { DictionarySchema } from '@furifont/core'
import * as v from 'valibot'

/** A string, not a literal: TypeScript leaves the file untyped rather than inferring it, and bundlers split it into a lazy chunk. */
const NAME: string = 'dictionary'

/** Loads the compiled dictionary: JMdict, JMnedict's place names and the word lists kept by hand, fused by the Han runs a font sees, with KANJIDIC2's on'yomi, JLPT levels and uses in Tatoeba's sentences. */
export async function loadDictionary(): Promise<Dictionary> {
  const { default: data } = await import(`../data/${NAME}.json`, { with: { type: 'json' } })
  return v.parse(DictionarySchema, data)
}
