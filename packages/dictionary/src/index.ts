import type { Dictionary } from '@furifont/core'
import { readFile } from 'node:fs/promises'
import * as v from 'valibot'
import { DEFAULT_READINGS } from './defaults'

const DATA = new URL('../data/dictionary.json', import.meta.url)
const PLACES = new URL('../data/places.json', import.meta.url)
const JLPT = new URL('../data/jlpt.json', import.meta.url)

const DataSchema = v.object({
  sources: v.record(v.string(), v.string()),
  onyomi: v.record(v.string(), v.array(v.string())),
  // One tuple with an optional last item: a shorter tuple in a union would match first and drop it.
  entries: v.array(v.tuple([v.string(), v.string(), v.number(), v.string(), v.number(), v.optional(v.literal(1))])),
})

const PlacesSchema = v.array(v.tuple([v.string(), v.string()]))
const JlptSchema = v.array(v.tuple([v.string(), v.string(), v.picklist([1, 2, 3, 4, 5])]))

async function readJson<T extends v.GenericSchema>(url: URL, schema: T): Promise<v.InferOutput<T>> {
  return v.parse(schema, JSON.parse(await readFile(url, 'utf8')))
}

/** Loads the compiled dictionary: JMdict and JMnedict place names, aligned by JmdictFurigana, with KANJIDIC2's on'yomi and JLPT levels. */
export async function loadDictionary(): Promise<Dictionary> {
  const [data, places, jlpt] = await Promise.all([readJson(DATA, DataSchema), readJson(PLACES, PlacesSchema), readJson(JLPT, JlptSchema)])
  const levels = new Map(jlpt.map(([form, furigana, level]) => [`${form}|${furigana}`, level]))
  return {
    sources: data.sources,
    onyomi: data.onyomi,
    defaults: DEFAULT_READINGS,
    places: places.map(([form, furigana]) => ({ form, furigana })),
    entries: data.entries.map(([form, furigana, nf, priority, order, conjugates]) => {
      const level = levels.get(`${form}|${furigana}`)
      return {
        form,
        furigana,
        nf,
        priority,
        order,
        ...(conjugates && { conjugatesReading: true }),
        ...(level && { jlpt: level }),
      }
    }),
  }
}
