/**
 * Compiles the JR station list of Desktop Tetsu (https://www.desktoptetsu.com/quiz/jr-stations.htm)
 * into raw/jr-stations.json: the runs of kanji in the stations' names
 * with the reading each takes, in inline notation, one a line.
 *
 *   node scripts/manual/jr-stations.ts
 */
import { writeFile } from 'node:fs/promises'
import { hanRuns, parseNotation } from '@furifont/core'
import { alignRuns } from './align.ts'

const URL_STATIONS = 'https://www.desktoptetsu.com/quiz/jr-stations.htm'
const OUTPUT = new URL('../../raw/jr-stations.json', import.meta.url)

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': '\'', '&nbsp;': ' ' }

/** The `[name, reading]` of each row of the page's table, which has nine cells a station. */
function parseRows(html: string): [name: string, reading: string][] {
  const rows: [string, string][] = []
  for (const [, row] of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row!.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(([, cell]) => cell!.replace(/<[^>]+>/g, '').replace(/&\w+;|&#\d+;/g, e => ENTITIES[e] ?? e).trim())
    if (cells.length === 9 && /^[\p{sc=Hiragana}ー]+$/u.test(cells[1]!))
      rows.push([cells[0]!, cells[1]!])
  }
  return rows
}

const response = await fetch(URL_STATIONS)
if (!response.ok)
  throw new Error(`${URL_STATIONS}: ${response.status}`)
const rows = parseRows(await response.text())

// A run read two ways by two stations is ambiguous, so neither is kept.
const readings = new Map<string, Set<string>>()
for (const [name, reading] of rows) {
  for (const [run, ruby] of alignRuns(name, reading)) {
    if ([...run].length > 1)
      (readings.get(run) ?? readings.set(run, new Set()).get(run)!).add(ruby)
  }
}
const notations = [...readings].filter(([, set]) => set.size === 1).map(([run, [ruby]]) => `${run}[${ruby}]`).sort((a, b) => a.localeCompare(b, 'ja'))
for (const notation of notations) {
  const { form, spans } = parseNotation(notation)
  if (hanRuns(form, spans).length !== 1)
    throw new Error(`${notation} does not read as one run`)
}

await writeFile(OUTPUT, `[\n${notations.map(n => JSON.stringify(n)).join(',\n')}\n]\n`)
console.log(`Wrote ${notations.length} runs from ${rows.length} stations, dropping ${[...readings.values()].filter(set => set.size > 1).length} ambiguous`)
