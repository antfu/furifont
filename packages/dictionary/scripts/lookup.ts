/**
 * Says what a font with the default options shows for words, and what the
 * dictionary holds for them: the tool for checking a reader's report. Text is
 * split into runs of Han characters, as a browser shapes it, and each run is
 * read on its own. Build the packages first.
 *
 *   node scripts/lookup.ts <word>... [--json]
 */
import process from 'node:process'
import { parseArgs } from 'node:util'
import { createRubyReader } from '@furifont/compiler'
import { createFontPlanner, formatNotation, parseFurigana, resolveOptions, SCORE } from '@furifont/core'
import { loadDictionary } from '@furifont/dictionary'
import { formOf, isBare, notationOf, readAllOverrides } from './raw.ts'

const { positionals: words, values: args } = parseArgs({ allowPositionals: true, options: { json: { type: 'boolean', default: false } } })

const HAN_RUN = /[\p{Script=Han}〆]+/gu
const runs = [...new Set(words.flatMap(word => word.match(HAN_RUN) ?? []))]
if (!runs.length) {
  console.error('Usage: lookup.ts <word>... [--json]  (words need at least one kanji)')
  process.exit(1)
}

const dictionary = await loadDictionary()
const overrides = Object.entries(await readAllOverrides()).flatMap(([dataset, entries]) => entries.map(entry => ({ dataset, entry })))

/** Every character the dictionary writes, and the asked runs': the font a base font with every kanji would give. */
const coverage = new Set([
  ...Object.entries(dictionary.runs).flatMap(([text, readings]) => [text, ...Object.keys(readings)]),
  ...Object.entries(dictionary.kanji).flatMap(([text, readings]) => [text, ...Object.keys(readings)]),
  ...runs,
].flatMap(text => [...text].map(c => c.codePointAt(0)!)))
const { plan } = createFontPlanner(dictionary)(resolveOptions(), coverage)
const read = createRubyReader(plan)

const results = runs.map((text) => {
  const table = [...text].length === 1 ? dictionary.kanji[text] : dictionary.runs[text]
  const spansOf = (key: string) => [...text].length === 1 ? [{ start: 0, end: 1, ruby: key }] : parseFurigana(key)
  const readings = Object.entries(table ?? {})
    .map(([key, [score]]) => ({ reading: formatNotation(text, spansOf(key)), score, common: score > SCORE.tagged }))
    .sort((a, b) => b.score - a.score)
  const shown = read(text)
  return {
    text,
    /** Empty when the font leaves the run bare. */
    shown: shown.length ? formatNotation(text, shown) : undefined,
    readings,
    override: overrides.filter(o => !isBare(o.entry) && formOf(o.entry) === text).map(o => `${notationOf(o.entry)} (${o.dataset})`),
    bare: overrides.some(o => isBare(o.entry) && formOf(o.entry) === text),
  }
})

if (args.json) {
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`)
}
else {
  process.stdout.write(`${results.map(({ text, shown, readings, override, bare }) => [
    text,
    `  font shows: ${shown ?? '(bare: no ruby)'}`,
    readings.length ? '  dictionary:' : `  dictionary: ${[...text].length > 1 ? 'not a run of its own, so the font reads it by parts' : 'none'}`,
    ...readings.map(r => `    ${r.reading}  score ${r.score}${r.common ? ' (common)' : ''}`),
    ...override.map(n => `  override: ${n}`),
    ...(bare ? ['  bare form: kept bare on purpose when alone in a run'] : []),
  ].join('\n')).join('\n\n')}\n`)
}
