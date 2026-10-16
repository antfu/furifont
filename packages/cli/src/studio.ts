import type { PlanReport, Reading, RubySpan, Source } from '@furifont/core'
import type { DevframeNodeContext } from 'devframe'
import type { SizeEstimate } from './build'
import type { FurifontConfig, FurifontConfigInput } from './config'
import { Buffer } from 'node:buffer'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { BASE_FONTS } from '@furifont/compiler'
import { formatNotation, parseFurigana, sourceBit, sourcesIn } from '@furifont/core'
import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'
import { bucketWords, buildFont, estimateFont, getDictionary, planWithBase, previewFont } from './build'
import { CONFIG_FILE, FurifontConfigSchema, loadConfig } from './config'

/** The RPC namespace the app's studio calls into. */
export const STUDIO_ID = 'furifont'
/** Streaming channel carrying {@link BuildEvent}s. */
export const BUILD_CHANNEL = 'build'
/** Where built fonts are served from, relative to the studio. */
const FONTS_PATH = '/fonts/'

export interface StudioState {
  config: FurifontConfigInput
  configPath: string
  outDir: string
  sources: Record<string, string>
  /** Fonts the build downloads by name. */
  baseFonts: readonly string[]
}

export interface PreviewResult {
  /** The preview font, base64-encoded OpenType. */
  font: string
  /** Whether it has every weight, which the preview can then set. */
  variable: boolean
  stats: PlanReport['stats']
  ms: number
}

export type BuildEvent
  = | { type: 'progress', step: string, done: number | null, total: number | null }
    | { type: 'done', files: { name: string, url: string, bytes: number }[], stats: PlanReport['stats'] }
    | { type: 'error', message: string }

export interface WordMatch {
  form: string
  /** Each reading with its score and its sources, as `SOURCES` names them. */
  readings: { notation: string, score: number, sources: Source[] }[]
}

/** A spread of one bucket of words, as the overview lists it. */
export interface WordSample {
  /** Words in the bucket. */
  size: number
  /** Each with its place among all the words, most common first, and its best reading. */
  words: { rank: number, notation: string }[]
}

export interface WordSamples {
  skip: WordSample
  take: WordSample
  rest: WordSample
}

/** The wire contract of the functions below, as the studio page calls them. */
export interface StudioFunctions {
  'furifont:state': () => Promise<StudioState>
  'furifont:report': (config: FurifontConfigInput) => Promise<PlanReport>
  'furifont:preview': (config: FurifontConfigInput, text: string) => Promise<PreviewResult>
  'furifont:estimate': (config: FurifontConfigInput) => Promise<SizeEstimate>
  'furifont:build': (config: FurifontConfigInput) => { streamId: string }
  'furifont:save': (config: FurifontConfigInput) => Promise<string>
  'furifont:search': (query: string) => Promise<WordMatch[]>
  'furifont:sample': (config: FurifontConfigInput) => Promise<WordSamples>
}

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends StudioFunctions {}
}

const SEARCH_LIMIT = 40
/** Words listed from each bucket of the overview. */
const SAMPLE_SIZE = 20
/** How far, of one step, a sampled word may stray from its even place. */
const SAMPLE_JITTER = 0.6

/** `count` indexes spread over `size`, one per step, each moved by up to half of {@link SAMPLE_JITTER} of a step either way. */
function spreadIndexes(size: number, count: number, random: () => number = Math.random): number[] {
  if (size <= count)
    return Array.from({ length: size }, (_, i) => i)
  const step = size / count
  return Array.from({ length: count }, (_, n) => Math.min(size - 1, Math.max(0, Math.round(n * step + (random() - 0.5) * SAMPLE_JITTER * step))))
}

async function sampleWords(config: FurifontConfig, cwd: string): Promise<WordSamples> {
  const [{ runs }, buckets] = await Promise.all([getDictionary(), bucketWords(config, cwd)])
  let offset = 0
  const sample = (words: string[]): WordSample => {
    const start = offset
    offset += words.length
    return {
      size: words.length,
      words: spreadIndexes(words.length, SAMPLE_SIZE).map((i) => {
        const form = words[i]!
        const [furigana] = Object.entries(runs[form] ?? {}).reduce((a, b) => b[1][0] > a[1][0] ? b : a)
        return { rank: start + i + 1, notation: formatNotation(form, parseFurigana(furigana)) }
      }),
    }
  }
  return { skip: sample(buckets.skip), take: sample(buckets.take), rest: sample(buckets.rest) }
}

function wordReading(form: string, spans: RubySpan[], [score, sources]: Reading): WordMatch['readings'][number] {
  return { notation: formatNotation(form, spans), score, sources: sourcesIn(sources) }
}

async function searchWords(query: string): Promise<WordMatch[]> {
  const { runs, kanji } = await getDictionary()
  const matches: WordMatch[] = []
  for (const form of Object.keys(kanji).filter(k => k.includes(query)))
    matches.push({ form, readings: Object.entries(kanji[form]!).map(([ruby, sources]) => wordReading(form, [{ start: 0, end: 1, ruby }], sources)) })
  for (const form of Object.keys(runs).filter(k => k.includes(query))) {
    if (matches.length >= SEARCH_LIMIT)
      break
    // JMdict's words, not the place names: a search for 日 means a word.
    const readings = Object.entries(runs[form]!).filter(([, [, sources]]) => sources & sourceBit('jmdict'))
    if (readings.length)
      matches.push({ form, readings: readings.map(([furigana, sources]) => wordReading(form, parseFurigana(furigana), sources)) })
  }
  // Exact and shorter forms first: what a search for 日 most likely means.
  return matches.slice(0, SEARCH_LIMIT).sort((a, b) => a.form.length - b.form.length)
}

/** Every function the studio page calls; registered under {@link STUDIO_ID}. */
export async function setupStudio(ctx: DevframeNodeContext): Promise<void> {
  const scope = ctx.scope(STUDIO_ID)
  const outDir = join(ctx.cwd, 'fonts')
  await mkdir(outDir, { recursive: true })
  ctx.views.hostStatic(FONTS_PATH, outDir)
  const channel = scope.rpc.streaming.create<BuildEvent>(BUILD_CHANNEL, { replayWindow: 256 })
  // Devframe passes arguments through as sent: every handler parses its own.
  const parse = (input: FurifontConfigInput): FurifontConfig => v.parse(FurifontConfigSchema, input)
  const Text = v.pipe(v.string(), v.maxLength(2000))
  const Query = v.pipe(v.string(), v.trim(), v.nonEmpty(), v.maxLength(20))

  const functions = [
    defineRpcFunction({
      name: 'state',
      type: 'query',
      jsonSerializable: true,
      handler: async (): Promise<StudioState> => ({
        config: await loadConfig(ctx.cwd),
        configPath: join(ctx.cwd, CONFIG_FILE),
        outDir,
        sources: (await getDictionary()).versions,
        baseFonts: BASE_FONTS.map(f => f.name),
      }),
    }),
    defineRpcFunction({
      name: 'report',
      type: 'query',
      jsonSerializable: true,
      handler: async (options: FurifontConfigInput): Promise<PlanReport> => (await planWithBase(parse(options), ctx.cwd)).report,
    }),
    defineRpcFunction({
      name: 'preview',
      type: 'action',
      jsonSerializable: true,
      handler: async (options: FurifontConfigInput, text: string): Promise<PreviewResult> => {
        const started = performance.now()
        const { font, report, variable } = await previewFont(parse(options), v.parse(Text, text), ctx.cwd)
        return { font: Buffer.from(font).toString('base64'), variable, stats: report.stats, ms: Math.round(performance.now() - started) }
      },
    }),
    defineRpcFunction({
      name: 'estimate',
      type: 'query',
      jsonSerializable: true,
      handler: (options: FurifontConfigInput): Promise<SizeEstimate> => estimateFont(parse(options), ctx.cwd),
    }),
    defineRpcFunction({
      name: 'build',
      type: 'action',
      jsonSerializable: true,
      handler: (options: FurifontConfigInput): { streamId: string } => {
        const parsed = parse(options)
        const stream = channel.start()
        buildFont(parsed, {
          cwd: ctx.cwd,
          outDir,
          onProgress: p => stream.write({ type: 'progress', ...p }),
        })
          .then(({ files, report }) => stream.write({
            type: 'done',
            files: files.map(f => ({ name: f.name, url: `.${FONTS_PATH}${f.name}`, bytes: f.bytes })),
            stats: report.stats,
          }))
          .catch((error: Error) => stream.write({ type: 'error', message: error.message }))
          .finally(() => stream.close())
        return { streamId: stream.id }
      },
    }),
    defineRpcFunction({
      name: 'save',
      type: 'action',
      jsonSerializable: true,
      handler: async (options: FurifontConfigInput): Promise<string> => {
        const path = join(ctx.cwd, CONFIG_FILE)
        await writeFile(path, `${JSON.stringify(parse(options), null, 2)}\n`)
        return path
      },
    }),
    defineRpcFunction({
      name: 'search',
      type: 'query',
      jsonSerializable: true,
      handler: (query: string): Promise<WordMatch[]> => searchWords(v.parse(Query, query)),
    }),
    defineRpcFunction({
      name: 'sample',
      type: 'query',
      jsonSerializable: true,
      handler: (options: FurifontConfigInput): Promise<WordSamples> => sampleWords(parse(options), ctx.cwd),
    }),
  ]
  for (const fn of functions)
    scope.rpc.register(fn)
}
