import type { Dictionary } from '@furifont/core'
import { readFile } from 'node:fs/promises'
import * as v from 'valibot'
import { DEFAULT_READINGS } from './defaults'

const DATA = new URL('../data/dictionary.json', import.meta.url)
const PLACES = new URL('../data/places.json', import.meta.url)

const DataSchema = v.object({
  sources: v.record(v.string(), v.string()),
  onyomi: v.record(v.string(), v.array(v.string())),
  // One tuple with an optional last item: a shorter tuple in a union would match first and drop it.
  entries: v.array(v.tuple([v.string(), v.string(), v.number(), v.string(), v.number(), v.optional(v.literal(1))])),
})

const PlacesSchema = v.array(v.tuple([v.string(), v.string()]))

/** Loads the compiled dictionary: JMdict and JMnedict place names, aligned by JmdictFurigana, with KANJIDIC2's on'yomi. */
export async function loadDictionary(): Promise<Dictionary> {
  const [data, places] = await Promise.all([
    readFile(DATA, 'utf8').then(text => v.parse(DataSchema, JSON.parse(text))),
    readFile(PLACES, 'utf8').then(text => v.parse(PlacesSchema, JSON.parse(text))),
  ])
  return {
    sources: data.sources,
    onyomi: data.onyomi,
    defaults: DEFAULT_READINGS,
    places: places.map(([form, furigana]) => ({ form, furigana })),
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
