/**
 * Adds a curated override to `src/overrides.ts` with its comments: a reading
 * to make the default, in inline notation, or with `--bare` a run to leave
 * without ruby. A reading already there gets only the new reporter's line.
 * Recompile (`pnpm dict:compile`) and check with `lookup.ts` afterwards.
 *
 *   node scripts/override.ts '今日[きょう]' --reason "Not きょう in a date." [--by <name>] [--report <id>]
 *   node scripts/override.ts 月 --bare --reason "つき in a poem, がつ in a date."
 *
 * Quote the notation: a shell reads `[...]` as a glob. `--by` and `--report`
 * write `// reported by <name> <id>`; without `--by` the name is `anonymous`.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { parseNotation } from '@furifont/core'

const { positionals: [entry, ...extra], values: args } = parseArgs({
  allowPositionals: true,
  options: {
    bare: { type: 'boolean', default: false },
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
  fail('Usage: override.ts <notation> --reason <why> [--by <name>] [--report <id>] [--bare]  (one entry per call)')
if (entry.includes('\'') || entry.includes('\\'))
  fail('The entry must not contain quotes or backslashes.')
if (args.report && !args.by)
  console.warn('No --by: crediting the reporter as anonymous.')

const form = args.bare
  ? entry
  : (() => {
      try {
        return parseNotation(entry).form
      }
      catch (error) {
        return fail(`"${entry}" is not inline notation like 今日[きょう]: ${error instanceof Error ? error.message : error}`)
      }
    })()
if (!HAN_ONLY.test(form))
  fail(`"${form}" is not a run of kanji: ${args.bare ? 'give kanji only' : 'put the reading of every kanji in brackets, and leave okurigana out'}.`)

const list = args.bare ? 'BARE_FORMS' : 'OVERRIDE_READINGS'
const file = fileURLToPath(new URL('../src/overrides.ts', import.meta.url))
const source = readFileSync(file, 'utf8')
const start = source.indexOf(`export const ${list}: string[] = [`)
const end = source.indexOf('\n]', start)
if (start < 0 || end < 0)
  fail(`Cannot find ${list} in ${file}.`)

const body = source.slice(start, end)
const line = `  '${entry}',`
const credit = args.report ? `  // reported by ${oneLine(args.by ?? 'anonymous')} ${oneLine(args.report)}` : undefined

if (body.split('\n').includes(line)) {
  if (!credit)
    fail(`${entry} is already in ${list}. Nothing to add without --report.`)
  if (body.includes(credit))
    fail(`${entry} is already credited to this report.`)
  writeFileSync(file, source.replace(`\n${line}\n`, `\n${credit}\n${line}\n`))
  console.log(`${entry}: added the report to its existing entry in ${list}.`)
}
else {
  if (!args.reason)
    fail('--reason is required for a new entry: say why the default is wrong.')
  if (!args.bare) {
    const clash = source.slice(source.indexOf('OVERRIDE_READINGS'), end).split('\n').find(l => l.startsWith('  \'') && l.length > 4 && parseNotation(l.slice(3, l.lastIndexOf('\''))).form === form)
    if (clash)
      console.warn(`Warning: ${list} already has ${clash.trim()} for ${form}; both are pinned, and the one the dictionary ranks first wins.`)
  }
  const comments = [`  // ${oneLine(args.reason)}`, ...credit ? [credit] : []]
  writeFileSync(file, `${source.slice(0, end)}\n${[...comments, line].join('\n')}${source.slice(end)}`)
  console.log(`${entry}: added to ${list}. Run pnpm dict:compile, then pnpm dict:lookup ${form}.`)
}
