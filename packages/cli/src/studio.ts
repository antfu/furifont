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
import { buildFont, estimateFont, getDictionary, planWithBase, previewFont } from './build'
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

/** The wire contract of the functions below, as the studio page calls them. */
export interface StudioFunctions {
  'furifont:state': () => Promise<StudioState>
  'furifont:report': (config: FurifontConfigInput) => Promise<PlanReport>
  'furifont:preview': (config: FurifontConfigInput, text: string) => Promise<PreviewResult>
  'furifont:estimate': (config: FurifontConfigInput) => Promise<SizeEstimate>
  'furifont:build': (config: FurifontConfigInput) => { streamId: string }
  'furifont:save': (config: FurifontConfigInput) => Promise<string>
  'furifont:search': (query: string) => Promise<WordMatch[]>
}

declare module 'devframe' {
  interface DevframeRpcServerFunctions extends StudioFunctions {}
}

const SEARCH_LIMIT = 40

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
  ]
  for (const fn of functions)
    scope.rpc.register(fn)
}
