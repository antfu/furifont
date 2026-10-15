/**
 * Reads text through a simulated font built with the default options over
 * every kanji, and lists what it shows wrong. First every Han run of the
 * dictionary: a reading none of its words has (misread), ruby on only some
 * of its kanji (partial), or none on a common word (bare). Then every pair of
 * the `--words` most common runs written together, as running text does, when
 * the pair is no run of its own: ruby that is no reading of either (misread).
 * Most common first.
 *
 *   node scripts/audit.ts [--words 1000] [--limit 50] [--json]
 */
import type { RubySpan } from '@furifont/core'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { createRubyReader } from '@furifont/compiler'
import { createFontPlanner, formatNotation, parseFurigana, resolveOptions, SCORE } from '@furifont/core'
import { loadDictionary } from '@furifont/dictionary'

const KINDS = ['misread', 'partial', 'bare', 'compound'] as const

interface Reading {
  spans: RubySpan[]
  /** The dictionary's score, higher for a more common reading. */
  score: number
  tagged: boolean
}

interface Finding {
  kind: typeof KINDS[number]
  text: string
  shown: string
  readings: string[]
  score: number
  tagged: boolean
}

const { values: args } = parseArgs({ options: {
  words: { type: 'string', default: '1000' },
  limit: { type: 'string', default: '50' },
  json: { type: 'boolean', default: false },
} })

const dictionary = await loadDictionary()
const runs = new Map<string, Map<string, Reading>>()
for (const [table, spansOf] of [[dictionary.runs, parseFurigana], [dictionary.kanji, (ruby: string) => [{ start: 0, end: 1, ruby }]]] as const) {
  for (const [text, readings] of Object.entries(table)) {
    runs.set(text, new Map(Object.entries(readings).map(([key, [score]]) => {
      const spans = spansOf(key)
      return [formatNotation(text, spans), { spans, score, tagged: score > SCORE.tagged }]
    })))
  }
}

// Every character the dictionary writes: the font a base font with every kanji would give.
const coverage = new Set([...runs].flatMap(([text, readings]) => [text, ...readings.keys()]).flatMap(t => [...t].map(c => c.codePointAt(0)!)))
const { plan } = createFontPlanner(dictionary)(resolveOptions(), coverage)
const read = createRubyReader(plan)

const same = (a: RubySpan, b: RubySpan): boolean => a.start === b.start && a.end === b.end && a.ruby === b.ruby
/** Whether some reading has every span shown. */
const fits = (shown: RubySpan[], readings: Iterable<Reading>): boolean => [...readings].some(r => shown.every(s => r.spans.some(t => same(s, t))))
const best = (readings: Iterable<Reading>): Reading => [...readings].sort((a, b) => b.score - a.score)[0]!
const findings: Finding[] = []
const stats = { runs: { texts: 0, kanji: 0, annotated: 0 }, compounds: { texts: 0, kanji: 0, annotated: 0 } }
function count(into: typeof stats.runs, text: string, shown: RubySpan[]): void {
  into.texts++
  into.kanji += [...text].length
  into.annotated += shown.reduce((n, s) => n + s.end - s.start, 0)
}

for (const [text, readings] of runs) {
  const shown = read(text)
  count(stats.runs, text, shown)
  const covered = shown.reduce((n, s) => n + s.end - s.start, 0) === [...text].length
  const tagged = [...readings.values()].some(r => r.tagged)
  const kind = !fits(shown, readings.values()) ? 'misread' : !shown.length ? (tagged ? 'bare' : undefined) : covered ? undefined : 'partial'
  if (kind)
    findings.push({ kind, text, shown: formatNotation(text, shown), readings: [...readings.keys()], ...best(readings.values()) })
}

const common = [...runs].filter(([, r]) => [...r.values()].some(r => r.tagged)).sort((a, b) => best(b[1].values()).score - best(a[1].values()).score).slice(0, Number(args.words))
for (const [a, aReadings] of common) {
  const size = [...a].length
  for (const [b, bReadings] of common) {
    const text = a + b
    if (runs.has(text))
      continue
    const shown = read(text)
    count(stats.compounds, text, shown)
    const head = shown.filter(s => s.end <= size)
    const tail = shown.filter(s => s.start >= size).map(s => ({ ...s, start: s.start - size, end: s.end - size }))
    if (head.length + tail.length < shown.length || !fits(head, aReadings.values()) || !fits(tail, bReadings.values())) {
      const score = Math.min(best(aReadings.values()).score, best(bReadings.values()).score)
      findings.push({ kind: 'compound', text, shown: formatNotation(text, shown), readings: [...aReadings.keys(), '+', ...bReadings.keys()], score, tagged: true })
    }
  }
}
findings.sort((a, b) => b.score - a.score || a.text.localeCompare(b.text))

if (args.json) {
  process.stdout.write(`${JSON.stringify({ stats, findings }, null, 2)}\n`)
}
else {
  const limit = Number(args.limit)
  const share = ({ kanji, annotated }: typeof stats.runs): string => `${(annotated / kanji * 100).toFixed(1)}% of their kanji annotated`
  const out = [
    `# Dictionary audit\n`,
    `- ${stats.runs.texts} dictionary runs, ${share(stats.runs)}: ${KINDS.slice(0, 3).map(k => `${findings.filter(f => f.kind === k).length} ${k}`).join(', ')}.`,
    `- ${stats.compounds.texts} compounds of the ${common.length} most common runs, ${share(stats.compounds)}: ${findings.filter(f => f.kind === 'compound').length} misread.\n`,
  ]
  for (const kind of KINDS) {
    const found = findings.filter(f => f.kind === kind)
    out.push(`## ${kind} (${found.length})\n`, '| text | shown | dictionary | score |', '| --- | --- | --- | --- |')
    for (const f of found.slice(0, limit))
      out.push(`| ${f.text} | ${f.shown} | ${f.readings.join(' ')} | ${f.score} |`)
    out.push('')
  }
  process.stdout.write(`${out.join('\n')}\n`)
}
