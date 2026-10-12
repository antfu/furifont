import type { Dictionary } from '@furifont/core'
import { readFile } from 'node:fs/promises'
import * as v from 'valibot'

const DATA = new URL('../data/dictionary.json', import.meta.url)

const DataSchema = v.object({
  sources: v.record(v.string(), v.string()),
  onyomi: v.record(v.string(), v.array(v.string())),
  entries: v.array(v.union([
    v.tuple([v.string(), v.string(), v.number(), v.string(), v.number()]),
    v.tuple([v.string(), v.string(), v.number(), v.string(), v.number(), v.literal(1)]),
  ])),
})

/** Loads the compiled JMdict + JmdictFurigana + KANJIDIC2 dictionary. */
export async function loadDictionary(): Promise<Dictionary> {
  const data = v.parse(DataSchema, JSON.parse(await readFile(DATA, 'utf8')))
  return {
    sources: data.sources,
    onyomi: data.onyomi,
    entries: data.entries.map(([form, furigana, nf, priority, order, conjugates]) => ({
      form,
      furigana,
      nf,
      priority,
      order,
      ...(conjugates && { conjugatesReading: true }),
    })),
  }
}
