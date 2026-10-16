import type { BuiltFont, CompileProgress } from '@furifont/compiler'
import type { Dictionary, Plan, PlanReport, PlanResult, WordBuckets } from '@furifont/core'
import type { FurifontConfig } from './config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { BASE_FONTS, compileFont, readFontInfo, toWoff2 } from '@furifont/compiler'
import { brotli, subsetWasm } from '@furifont/compiler/node'
import { createFontPlanner } from '@furifont/core'
import { loadDictionary } from '@furifont/dictionary'
import pkg from '../package.json' with { type: 'json' }
import { fetchBaseFont } from './base-fonts'

export interface BuiltFile {
  name: string
  path: string
  bytes: number
}

export interface BuildResult {
  files: BuiltFile[]
  report: PlanReport
}

function cacheDir(): string {
  return join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'furifont')
}

/** The base font's path: a named one, such as Source Han Serif JP Bold, is downloaded once into the cache. */
function resolveBase(base: string, cwd: string): Promise<string> {
  const known = BASE_FONTS.find(f => f.name === base)
  return known ? fetchBaseFont(known, cacheDir()) : Promise.resolve(resolve(cwd, base))
}

let dictionary: Promise<Dictionary> | undefined
let planner: Promise<ReturnType<typeof createFontPlanner>> | undefined
const coverages = new Map<string, Promise<Set<number>>>()

/** The bundled dictionary, loaded once. */
export function getDictionary(): Promise<Dictionary> {
  return dictionary ??= loadDictionary()
}

/** The planner, and the base font's path with the codepoints it draws. */
async function plannerFor(config: FurifontConfig, cwd: string): Promise<{ plan: ReturnType<typeof createFontPlanner>, base: string, coverage: Set<number> }> {
  planner ??= getDictionary().then(createFontPlanner)
  const base = await resolveBase(config.base, cwd)
  let coverage = coverages.get(base)
  if (!coverage)
    coverages.set(base, coverage = readFile(base).then(font => new Set(readFontInfo(font).codepoints)))
  return { plan: await planner, base, coverage: await coverage }
}

/** Plans a font for `config`; with `previewText`, only what that text needs. */
export async function planWithBase(config: FurifontConfig, cwd: string, previewText?: string): Promise<PlanResult & { base: string }> {
  const { plan, base, coverage } = await plannerFor(config, cwd)
  return { ...plan(config, coverage, previewText), base }
}

/** Every word of the dictionary, most common first, as `config` skips, takes or leaves it. */
export async function bucketWords(config: FurifontConfig, cwd: string): Promise<WordBuckets> {
  const { plan, coverage } = await plannerFor(config, cwd)
  return plan.wordBuckets(config, coverage)
}

/** `<Family>-<Style>`, or a variable font's `<Family>`: its one file has every style. */
function fileStem(config: FurifontConfig, { style, variable }: BuiltFont): string {
  const family = config.family.replaceAll(' ', '')
  return variable ? family : `${family}-${style.replaceAll(' ', '')}`
}

/** The reproducible-builds convention: SOURCE_DATE_EPOCH, in seconds, stands for now. */
function buildDate(): Date {
  const epoch = process.env.SOURCE_DATE_EPOCH
  return epoch ? new Date(Number(epoch) * 1000) : new Date()
}

async function compileOpenType({ plan, base }: { plan: Plan, base: string }, config: FurifontConfig, onProgress?: (p: CompileProgress) => void): Promise<BuiltFont> {
  return compileFont({ plan, base: await readFile(base), subsetWasm, version: config.version ?? pkg.version, date: buildDate(), onProgress })
}

/**
 * Builds the OpenType font (`.otf`, or `.ttf` on a TrueType base) and `.woff2`,
 * as `config.formats` lists, and the selector reference `.ivs.json` into `outDir`.
 */
export async function buildFont(config: FurifontConfig, options: { cwd: string, outDir: string, onProgress?: (p: CompileProgress) => void }): Promise<BuildResult> {
  const planned = await planWithBase(config, options.cwd)
  const built = await compileOpenType(planned, config, options.onProgress)
  const { font } = built
  const outputs: [string, Uint8Array][] = []
  if (config.formats.includes('otf'))
    outputs.push([built.outlines === 'truetype' ? 'ttf' : 'otf', font])
  if (config.formats.includes('woff2')) {
    options.onProgress?.({ step: 'woff2', done: null, total: null })
    outputs.push(['woff2', await toWoff2(font, brotli)])
  }
  outputs.push(['ivs.json', new TextEncoder().encode(`${JSON.stringify(planned.report.ivs)}\n`)])
  const stem = fileStem(config, built)
  await mkdir(options.outDir, { recursive: true })
  const files: BuiltFile[] = []
  for (const [ext, data] of outputs) {
    const path = join(options.outDir, `${stem}.${ext}`)
    await writeFile(path, data)
    files.push({ name: `${stem}.${ext}`, path, bytes: data.length })
  }
  return { files, report: planned.report }
}

/** Compiles a small font covering only `text`, for a live preview. */
export async function previewFont(config: FurifontConfig, text: string, cwd: string): Promise<{ font: Uint8Array, report: PlanReport, variable: boolean }> {
  const planned = await planWithBase(config, cwd, text)
  const { font, variable } = await compileOpenType(planned, config)
  return { font, report: planned.report, variable }
}

/** Bytes of the fonts a build would write. */
export interface SizeEstimate {
  otf: number
  woff2: number
}

/**
 * Brotli quality 8 takes under a second where the WOFF2's quality 11 takes
 * half a minute, and its output is this much larger: within 2% from a test
 * subset to full fonts with place names. Lower qualities drift with size.
 */
const FAST_WOFF2_RATIO = 0.885

/** Compiles the OpenType font `config` builds, and estimates its WOFF2 from a fast Brotli pass. */
export async function estimateFont(config: FurifontConfig, cwd: string): Promise<SizeEstimate> {
  const { font } = await compileOpenType(await planWithBase(config, cwd), config)
  return { otf: font.length, woff2: Math.round((await brotli(font, 8)).length * FAST_WOFF2_RATIO) }
}
