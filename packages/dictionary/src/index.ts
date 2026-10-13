import type { Dictionary } from '@furifont/core'
import * as v from 'valibot'
import { DEFAULT_READINGS } from './defaults'

const DataSchema = v.object({
  sources: v.record(v.string(), v.string()),
  onyomi: v.record(v.string(), v.array(v.string())),
  // One tuple with an optional last item: a shorter tuple in a union would match first and drop it.
  entries: v.array(v.tuple([v.string(), v.string(), v.number(), v.string(), v.number(), v.optional(v.literal(1))])),
})

const PlacesSchema = v.array(v.tuple([v.string(), v.string()]))
const JlptSchema = v.array(v.tuple([v.string(), v.string(), v.picklist([1, 2, 3, 4, 5])]))

/**
 * A data file as a JSON module, which Node loads and bundlers split into a
 * lazy chunk. The path is a template so that TypeScript leaves the 11 MB file
 * untyped rather than inferring it.
 */
async function readData<T extends v.GenericSchema>(name: 'dictionary' | 'places' | 'jlpt', schema: T): Promise<v.InferOutput<T>> {
  const { default: data } = await import(`../data/${name}.json`, { with: { type: 'json' } })
  return v.parse(schema, data)
}

/** Loads the compiled dictionary: JMdict and JMnedict place names, aligned by JmdictFurigana, with KANJIDIC2's on'yomi and JLPT levels. */
export async function loadDictionary(): Promise<Dictionary> {
  const [data, places, jlpt] = await Promise.all([readData('dictionary', DataSchema), readData('places', PlacesSchema), readData('jlpt', JlptSchema)])
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
