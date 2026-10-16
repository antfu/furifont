import type { Dataset } from './raw.ts'
/**
 * Adds a curated override to the `<dataset>.overrides.jsonc` beside a dataset
 * of raw/, with its comments: a reading in inline notation, which becomes a row
 * of that dataset and the default reading, or kanji with no reading, which are
 * left without ruby. The dataset is the one that already holds the word, or
 * `--source` names it, such as `places` for a place name no source lists. A
 * reading already there gets only the new reporter's line. Recompile
 * (`pnpm dict:compile`) and check with `lookup.ts` afterwards.
 *
 *   node scripts/override.ts '今日[きょう]' --reason "Not きょう in a date." [--by <name>] [--report <id>] [--source <dataset>]
 *   node scripts/override.ts 月 --reason "つき in a poem, がつ in a date."
 *   node scripts/override.ts '今日[きょう]' --source jlpt --level 5 --reason "..."
 *
 * Quote the notation: a shell reads `[...]` as a glob. `--by` and `--report`
 * write `// reported by <name> <id>`; without `--by` the name is `anonymous`.
 * A `jlpt` entry needs `--level` (1 to 5), a `tatoeba` entry `--uses`.
 */
import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { parseNotation } from '@furifont/core'
import { DATASETS, formOf, notationOf, overridesFile, parsePair, rawFile, readAllOverrides } from './raw.ts'

const { positionals: [entry, ...extra], values: args } = parseArgs({
  allowPositionals: true,
  options: {
    source: { type: 'string' },
    level: { type: 'string' },
    uses: { type: 'string' },
    reason: { type: 'string' },
    by: { type: 'string' },
    report: { type: 'string' },
  },
})

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()
const HAN_ONLY = /^[\p{Script=Han}〆]+$/u

if (!entry || extra.length)
  fail('Usage: override.ts <notation> --reason <why> [--source <dataset>] [--by <name>] [--report <id>]  (one entry per call; kanji only for a bare run)')
if (entry.includes('"') || entry.includes('\\'))
  fail('The entry must not contain quotes or backslashes.')
if (args.report && !args.by)
  console.warn('No --by: crediting the reporter as anonymous.')

// An entry with kana after its kanji is an okurigana pair: `上[うえ]に`, or `上が` to leave it to the font.
const pair = parsePair(entry)
const bare = !entry.includes('[')
const form = pair
  ? pair[0]
  : bare
    ? entry
    : (() => {
        try {
          return parseNotation(entry).form
        }
        catch (error) {
          return fail(`"${entry}" is not inline notation like 今日[きょう]: ${error instanceof Error ? error.message : error}`)
        }
      })()
if (!pair && !HAN_ONLY.test(form))
  fail(`"${form}" is not a run of kanji: ${bare ? 'give kanji only for a bare run' : 'put the reading of every kanji in brackets, and leave okurigana out'}.`)

/** The datasets that already hold `form` as a word of their own, in the order that reads best. */
async function holding(): Promise<Dataset[]> {
  const overrides = await readAllOverrides()
  const rows = async (name: Dataset): Promise<string[]> => {
    const raw = JSON.parse(await readFile(rawFile(name), 'utf8'))
    return [
      ...name === 'jmdict'
        ? raw.entries.map((r: [string]) => r[0])
        : (raw as (string | string[])[]).map(r => typeof r === 'string' ? formOf(r) : r[0]!),
      ...overrides[name].map(formOf),
    ]
  }
  const found: Dataset[] = []
  for (const name of DATASETS) {
    if ((await rows(name)).includes(form))
      found.push(name)
  }
  return found
}

let source = (pair ? 'okurigana' : args.source) as Dataset | 'okurigana' | undefined
if (source && source !== 'okurigana' && !DATASETS.includes(source))
  fail(`--source must be one of ${DATASETS.join(', ')}.`)
if (!source) {
  const [first, ...others] = await holding()
  if (!first)
    fail(`No dataset holds ${form} yet: name the one to add it to with --source (${DATASETS.join(', ')}). A place name goes to places.`)
  source = first
  if (others.length)
    console.warn(`${form} is also in ${others.join(', ')}; writing to ${source}. Use --source to choose another.`)
}

let number: number | undefined
if (source === 'jlpt' || source === 'tatoeba') {
  const given = source === 'jlpt' ? args.level : args.uses
  number = Number(given)
  if (!given || !Number.isInteger(number) || number < 1 || (source === 'jlpt' && number > 5))
    fail(source === 'jlpt' ? 'A jlpt entry needs --level, 1 to 5.' : 'A tatoeba entry needs --uses, a count of 1 or more.')
}
else if (args.level || args.uses) {
  fail('--level is for jlpt entries and --uses for tatoeba entries only.')
}

if (pair && args.source && args.source !== 'okurigana')
  fail('An okurigana pair goes to okurigana only.')
const file = overridesFile(source)
const text = await readFile(file, 'utf8').catch((error: NodeJS.ErrnoException) => error.code === 'ENOENT'
  ? `// Curated overrides of ${source}, in inline notation. Add entries with \`pnpm dict:override\`.\n[\n]\n`
  : Promise.reject(error))
const end = text.lastIndexOf(']')
if (end < 0)
  fail(`Cannot find the array in ${file.pathname}.`)

const item = number === undefined ? `"${entry}"` : `["${entry}", ${number}]`
const credit = args.report ? `  // reported by ${oneLine(args.by ?? 'anonymous')} ${oneLine(args.report)}` : undefined
const lines = text.split('\n')
const at = lines.findIndex(l => l.trim().replace(/,$/, '') === item)

if (at >= 0) {
  if (!credit)
    fail(`${entry} is already in ${source}. Nothing to add without --report.`)
  const comments: string[] = []
  for (let i = at - 1; i >= 0 && lines[i]!.trim().startsWith('//'); i--)
    comments.push(lines[i]!)
  if (comments.includes(credit))
    fail(`${entry} is already credited to this report.`)
  lines.splice(at, 0, credit)
  await writeFile(file, lines.join('\n'))
  console.log(`${entry}: added the report to its existing entry in ${source}.`)
}
else {
  if (!args.reason)
    fail('--reason is required for a new entry: say why the default is wrong.')
  const clash = Object.entries(await readAllOverrides()).flatMap(([name, entries]) => entries.map(e => [name, e] as const)).find(([, e]) => formOf(e) === form && notationOf(e) !== entry)
  if (clash)
    console.warn(`Warning: ${clash[0]} already has ${notationOf(clash[1])} for ${form}; both are pinned, and the one the dictionary ranks first wins.`)
  const head = text.slice(0, end).trimEnd()
  const comma = head.endsWith('[') || head.endsWith(',') ? '' : ','
  const block = [`  // ${oneLine(args.reason)}`, ...credit ? [credit] : [], `  ${item}`].join('\n')
  await writeFile(file, `${head}${comma}\n${block}\n${text.slice(end)}`)
  console.log(`${entry}: added to ${source}. Run pnpm dict:compile, then pnpm dict:lookup ${form}.`)
}
