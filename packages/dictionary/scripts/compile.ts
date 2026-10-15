/**
 * Fuses the sources under raw/ and the curated overrides into
 * data/dictionary.json, readings by the Han run a font sees, and keeps the
 * okurigana pairs of raw/okurigana.json that a page can use with the fonts
 * the default options build into data/okurigana.json. Offline: `pnpm dict:update`
 * refreshes raw/.
 *
 *   node scripts/compile.ts
 */
import type { Dictionary, DictionaryEntry, PlanOptionsInput } from '@furifont/core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createFontPlanner, formatDictionary, fuseDictionary, MANUAL_SOURCES, PRIORITY_TAGS, resolveOptions } from '@furifont/core'
import { createOkuriganaReader } from '@furifont/helper-web'
import * as v from 'valibot'
import { formatPacked, packOkurigana, prunePairs, unpackOkurigana } from '../src/okurigana.ts'
import { BARE_FORMS, OVERRIDE_READINGS } from '../src/overrides.ts'

const RAW = new URL('../raw/', import.meta.url)
const DATA = new URL('../data/', import.meta.url)

const JmdictSchema = v.object({
  sources: v.record(v.string(), v.string()),
  onyomi: v.record(v.string(), v.array(v.string())),
  // One tuple with an optional last item: a shorter tuple in a union would match first and drop it.
  entries: v.array(v.tuple([v.string(), v.string(), v.number(), v.string(), v.number(), v.optional(v.literal(1))])),
})
const PlacesSchema = v.array(v.tuple([v.string(), v.string()]))
const JlptSchema = v.array(v.tuple([v.string(), v.string(), v.picklist([1, 2, 3, 4, 5])]))
const TatoebaSchema = v.array(v.tuple([v.string(), v.string(), v.pipe(v.number(), v.integer(), v.minValue(1))]))
const NotationsSchema = v.array(v.string())
const PackedSchema = v.record(v.string(), v.record(v.string(), v.array(v.string())))

async function readRaw<T extends v.GenericSchema>(name: string, schema: T): Promise<v.InferOutput<T>> {
  return v.parse(schema, JSON.parse(await readFile(new URL(name, RAW), 'utf8')))
}

const [jmdict, places, jlpt, tatoeba, packed, ...lists] = await Promise.all([
  readRaw('jmdict.json', JmdictSchema),
  readRaw('places.json', PlacesSchema),
  readRaw('jlpt.json', JlptSchema),
  readRaw('tatoeba.json', TatoebaSchema),
  readRaw('okurigana.json', PackedSchema),
  // Scripts compile the lists from web pages, but for the mahjong yaku, kept by hand from the Japan
  // Professional Mahjong League's list (https://www.ma-jan.or.jp/activity/yaku.html) in hiragana.
  ...MANUAL_SOURCES.map(name => readRaw(`manual/${name}.json`, NotationsSchema)),
])

const levels = new Map(jlpt.map(([form, furigana, level]) => [`${form}|${furigana}`, level]))
const uses = new Map(tatoeba.map(([form, furigana, n]) => [`${form}|${furigana}`, n]))
const entries = jmdict.entries.map(([form, furigana, nf, priority, order, conjugates]): DictionaryEntry => {
  const key = `${form}|${furigana}`
  const level = levels.get(key)
  const n = uses.get(key)
  // On the pair's first entry only: homographs such as 正す ただす in three entries would count its uses thrice.
  uses.delete(key)
  return { form, furigana, nf, priority, order, ...(conjugates && { conjugatesReading: true }), ...(level && { jlpt: level }), ...(n && { tatoeba: n }) }
})

const dictionary = fuseDictionary({
  versions: jmdict.sources,
  onyomi: jmdict.onyomi,
  entries,
  places: places.map(([form, furigana]) => ({ form, furigana })),
  manual: Object.fromEntries(MANUAL_SOURCES.map((name, i) => [name, lists[i]!])),
  defaults: OVERRIDE_READINGS,
  bare: BARE_FORMS,
})

/** Every character the dictionary writes, and the kana: the font a base font with every kanji would give. */
function fullCoverage(dictionary: Dictionary): Set<number> {
  const texts = [dictionary.runs, dictionary.kanji].flatMap(table => Object.entries(table).flatMap(([text, readings]) => [text, ...Object.keys(readings)]))
  const kana = Array.from({ length: 0x30FF - 0x3041 + 1 }, (_, i) => 0x3041 + i)
  return new Set([...texts.flatMap(t => [...t].map(c => c.codePointAt(0)!)), ...kana])
}

/** The plans whose reading lists a page may read pairs with: the default font, and one that selects every tagged word. */
const PLANS: PlanOptionsInput[] = [{}, { selectTags: [...PRIORITY_TAGS], minTatoeba: 1 }]
const planFont = createFontPlanner(dictionary)
const coverage = fullCoverage(dictionary)
const readers = PLANS.map((options) => {
  const { ivs } = planFont(resolveOptions(options), coverage).report
  return createOkuriganaReader({ pairs: {}, readings: ivs.kanji, words: ivs.words, lone: ivs.lone })
})
const pairs = unpackOkurigana(packed)
const okurigana = prunePairs(pairs, (run, reading) => readers.some(r => r.saltOf(run, reading) > 0))

await mkdir(DATA, { recursive: true })
await writeFile(new URL('dictionary.json', DATA), formatDictionary(dictionary))
await writeFile(new URL('okurigana.json', DATA), formatPacked(packOkurigana(okurigana)))
console.log(`Wrote ${Object.keys(dictionary.runs).length} runs, ${Object.keys(dictionary.kanji).length} kanji and ${okurigana.length} of ${pairs.length} okurigana pairs`)
