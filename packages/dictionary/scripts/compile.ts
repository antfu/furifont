/**
 * Fuses the sources under raw/, each amended by its `.overrides.jsonc`, into
 * data/dictionary.json, readings by the Han run a font sees, and keeps the
 * okurigana pairs of raw/okurigana.json that a page can use with the font
 * the default options build into data/okurigana.json. Offline: `pnpm dict:update`
 * refreshes raw/.
 *
 *   node scripts/compile.ts
 */
import type { Dictionary, DictionaryEntry } from '@furifont/core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createFontPlanner, formatDictionary, formatFurigana, fuseDictionary, MANUAL_SOURCES, parseNotation, resolveOptions } from '@furifont/core'
import { createOkuriganaReader } from '@furifont/helper-web'
import * as v from 'valibot'
import { formatPacked, packOkurigana, prunePairs, unpackOkurigana } from '../src/okurigana.ts'
import { isBare, notationOf, numberOf, rawFile, readAllOverrides } from './raw.ts'

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
  return v.parse(schema, JSON.parse(await readFile(rawFile(name), 'utf8')))
}

const [jmdict, places, jlpt, tatoeba, packed, ...lists] = await Promise.all([
  readRaw('jmdict', JmdictSchema),
  readRaw('places', PlacesSchema),
  readRaw('jlpt', JlptSchema),
  readRaw('tatoeba', TatoebaSchema),
  readRaw('okurigana', PackedSchema),
  // Scripts compile the lists from web pages, but for the mahjong yaku, kept by hand from the Japan
  // Professional Mahjong League's list (https://www.ma-jan.or.jp/activity/yaku.html) in hiragana.
  ...MANUAL_SOURCES.map(name => readRaw(name, NotationsSchema)),
])

// Each override is a row of its own dataset, and pins its reading; a bare one only keeps its run without ruby.
const overrides = await readAllOverrides()
function rowsOf(name: keyof typeof overrides) {
  return overrides[name].filter(o => !isBare(o)).map((o) => {
    const { form, spans } = parseNotation(notationOf(o))
    return { form, furigana: formatFurigana(spans), notation: notationOf(o), n: numberOf(o) }
  })
}
/** JMdict orders a form's readings; an override ranks after them, and its pin decides. */
const OVERRIDE_ORDER = 999
jmdict.entries.push(...rowsOf('jmdict').map((r): typeof jmdict.entries[number] => [r.form, r.furigana, 0, '', OVERRIDE_ORDER, undefined]))
places.push(...rowsOf('places').map((r): [string, string] => [r.form, r.furigana]))
jlpt.push(...rowsOf('jlpt').map((r): typeof jlpt[number] => [r.form, r.furigana, v.parse(v.picklist([1, 2, 3, 4, 5]), r.n)]))
tatoeba.push(...rowsOf('tatoeba').map((r): typeof tatoeba[number] => [r.form, r.furigana, v.parse(v.pipe(v.number(), v.integer(), v.minValue(1)), r.n)]))
MANUAL_SOURCES.forEach((name, i) => lists[i]!.push(...rowsOf(name).map(r => r.notation)))
const allOverrides = Object.values(overrides).flat()

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
  defaults: allOverrides.filter(o => !isBare(o)).map(notationOf),
  bare: allOverrides.filter(isBare).map(notationOf),
})

/** Every character the dictionary writes, and the kana: the font a base font with every kanji would give. */
function fullCoverage(dictionary: Dictionary): Set<number> {
  const texts = [dictionary.runs, dictionary.kanji].flatMap(table => Object.entries(table).flatMap(([text, readings]) => [text, ...Object.keys(readings)]))
  const kana = Array.from({ length: 0x30FF - 0x3041 + 1 }, (_, i) => 0x3041 + i)
  return new Set([...texts.flatMap(t => [...t].map(c => c.codePointAt(0)!)), ...kana])
}

// The reading lists of the font the default options build, which the site serves.
const { ivs } = createFontPlanner(dictionary)(resolveOptions(), fullCoverage(dictionary)).report
const reader = createOkuriganaReader({ pairs: {}, readings: ivs.kanji, words: ivs.words, lone: ivs.lone })
const pairs = unpackOkurigana(packed)
const okurigana = prunePairs(pairs, (run, reading) => reader.saltOf(run, reading) > 0)

await mkdir(DATA, { recursive: true })
await writeFile(new URL('dictionary.json', DATA), formatDictionary(dictionary))
await writeFile(new URL('okurigana.json', DATA), formatPacked(packOkurigana(okurigana)))
console.log(`Wrote ${Object.keys(dictionary.runs).length} runs, ${Object.keys(dictionary.kanji).length} kanji and ${okurigana.length} of ${pairs.length} okurigana pairs`)
