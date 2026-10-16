/**
 * Maintainer tool for the reports readers send from the `/report` page. It talks
 * to the site's Upstash Redis database, so it needs the database's REST URL and
 * token: the same `UPSTASH_REDIS_REST_*` or `KV_REST_API_*` pair the site uses.
 * It loads them from `.env.local` and `.env` in the repository root (both are
 * git-ignored); a variable already in the shell wins, then `.env.local`.
 * Use the site's own database here, not a development one.
 *
 *   node scripts/reports.ts list [--status open|done|invalid|all] [--json]
 *   node scripts/reports.ts done <id>...
 *   node scripts/reports.ts invalid <id>...
 *   node scripts/reports.ts reopen <id>...
 *
 * An <id> is a report's id, or the start of it, as `list` prints. A report with
 * no status is open. `done` means the reading is fixed; `invalid` means it
 * needs no fix (spam, a wrong report, a reading that is right).
 */
import { existsSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

type Status = 'done' | 'invalid'

/** The parts of a stored report this tool reads; the site's `StoredReport` has the rest. */
interface Report {
  words: { word: string, expected: string, shown?: string, context?: string }[]
  environment: { type: string, url?: string, app?: string, os?: string }
  family?: string
  version: string
  locale: string
  note?: string
  name?: string
  createdAt: string
  status?: Status
  handledAt?: string
}

interface Entry {
  key: string
  id: string
  report: Report
}

const FILTERS = ['open', 'done', 'invalid', 'all'] as const
const SET_STATUS = { done: 'done', invalid: 'invalid', reopen: undefined } as const

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

// loadEnvFile keeps a variable that is already set, so the file read first wins.
for (const name of ['.env.local', '.env']) {
  const path = fileURLToPath(new URL(`../${name}`, import.meta.url))
  if (existsSync(path))
    process.loadEnvFile(path)
}

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN

/** Runs one Redis command through Upstash's REST API. */
async function redis<T>(...command: (string | number)[]): Promise<T> {
  if (!url || !token)
    fail('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL and KV_REST_API_TOKEN).')
  const response = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(command),
  })
  const body = await response.json() as { result?: T, error?: string }
  if (!response.ok || body.error !== undefined)
    fail(`Redis ${command[0]} failed: ${body.error ?? response.statusText}`)
  return body.result as T
}

/** Upstash's client stores each report as a JSON string. */
function parse(key: string, value: unknown): Entry | undefined {
  try {
    return { key, id: key.slice(key.lastIndexOf(':') + 1), report: JSON.parse(String(value)) as Report }
  }
  catch {
    console.warn(`Skipped ${key}: not JSON.`)
  }
}

/** Every report, oldest first: the key starts with the ISO time. */
async function load(): Promise<Entry[]> {
  const keys: string[] = []
  let cursor = '0'
  do {
    const [next, page] = await redis<[string, string[]]>('SCAN', cursor, 'MATCH', 'report:*', 'COUNT', 1000)
    keys.push(...page)
    cursor = next
  } while (cursor !== '0')
  if (!keys.length)
    return []
  keys.sort()
  const values = await redis<(string | null)[]>('MGET', ...keys)
  return keys.flatMap((key, i) => parse(key, values[i]) ?? [])
}

function describe({ id, report }: Entry): string {
  const { environment, words } = report
  const where = environment.url ?? environment.app ?? environment.type
  const lines = [
    `${id}  ${report.createdAt.slice(0, 16).replace('T', ' ')}  [${report.status ?? 'open'}]  ${report.family ?? 'any font'} ${report.version} ${report.locale}  ${where}`,
    ...words.map(({ word, expected, shown, context }) =>
      `    ${word} → ${expected}${shown ? ` (shown: ${shown})` : ''}${context ? `  「${context}」` : ''}`),
  ]
  if (report.note)
    lines.push(`    note: ${report.note}`)
  if (report.name)
    lines.push(`    credit: ${report.name}`)
  return lines.join('\n')
}

const { positionals: [command, ...ids], values: flags } = parseArgs({
  allowPositionals: true,
  options: {
    status: { type: 'string', default: 'open' },
    json: { type: 'boolean' },
  },
})

if (command === 'list') {
  const filter = flags.status as (typeof FILTERS)[number]
  if (!FILTERS.includes(filter))
    fail(`--status is one of ${FILTERS.join(', ')}.`)
  const shown = (await load()).filter(({ report }) => filter === 'all' || (report.status ?? 'open') === filter)
  if (flags.json)
    console.log(JSON.stringify(shown.map(({ id, report }) => ({ id, ...report })), null, 2))
  else
    console.log(shown.length ? `${shown.map(describe).join('\n\n')}\n\n${shown.length} ${filter} report(s)` : `No ${filter} reports.`)
}
else if (command && command in SET_STATUS) {
  if (!ids.length)
    fail(`Usage: reports.ts ${command} <id>...`)
  const status = SET_STATUS[command as keyof typeof SET_STATUS]
  const entries = await load()
  // Resolve every id before the first write, so a typo changes nothing.
  const targets = ids.map((id) => {
    const matches = entries.filter(entry => entry.id.startsWith(id))
    if (matches.length !== 1)
      fail(matches.length ? `"${id}" matches ${matches.length} reports: give more of the id.` : `No report starts with "${id}".`)
    return matches[0]!
  })
  for (const { key, id, report } of targets) {
    const { status: _, handledAt: __, ...rest } = report
    const next = status ? { ...rest, status, handledAt: new Date().toISOString() } : rest
    // KEEPTTL: the site sets none today, but a status change is no reason to drop one.
    await redis('SET', key, JSON.stringify(next), 'KEEPTTL')
    console.log(`${id}: ${status ?? 'open'}`)
  }
}
else {
  fail('Usage: reports.ts <list|done|invalid|reopen> ...  (see the header of scripts/reports.ts)')
}
