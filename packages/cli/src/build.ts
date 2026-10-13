import type { CompileProgress } from '@furifont/compiler'
import type { Dictionary, Plan, PlanReport, PlanResult } from '@furifont/core'
import type { FurifontConfig } from './config'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { brotliCompress, constants } from 'node:zlib'
import { BASE_FONTS, compileFont, fetchBaseFont, readFontInfo } from '@furifont/compiler'
import { createFontPlanner } from '@furifont/core'
import { loadDictionary } from '@furifont/dictionary'

export interface BuiltFile {
  name: string
  path: string
  bytes: number
}

export interface BuildResult {
  files: BuiltFile[]
  report: PlanReport
}

const brotli = promisify(brotliCompress)

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

/** Plans a font for `config`; with `previewText`, only what that text needs. */
export async function planWithBase(config: FurifontConfig, cwd: string, previewText?: string): Promise<PlanResult & { base: string }> {
  planner ??= getDictionary().then(createFontPlanner)
  const base = await resolveBase(config.base, cwd)
  let coverage = coverages.get(base)
  if (!coverage)
    coverages.set(base, coverage = readFontInfo(base).then(info => new Set(info.codepoints)))
  return { ...(await planner)(config, await coverage, previewText), base }
}

function fileStem(config: FurifontConfig, style: string): string {
  return `${config.family.replaceAll(' ', '')}-${style.replaceAll(' ', '')}`
}

/** Builds `<Family>-<Style>.otf`, `.woff2` and the selector reference `.ivs.json` into `outDir`. */
export async function buildFont(config: FurifontConfig, options: { cwd: string, outDir: string, onProgress?: (p: CompileProgress) => void }): Promise<BuildResult> {
  const { plan, report, base } = await planWithBase(config, options.cwd)
  await mkdir(options.outDir, { recursive: true })
  // Unique per build: several may run at once, and the style is only known once compiled.
  const work = join(options.outDir, `.furifont-${randomUUID()}`)
  const otf = `${work}.otf`
  const woff2 = `${work}.woff2`
  try {
    const result = await compileFont({ plan, base, output: otf, woff2, onProgress: options.onProgress })
    const stem = fileStem(config, result.style)
    const files: BuiltFile[] = []
    for (const [from, ext] of [[otf, 'otf'], [woff2, 'woff2']] as const) {
      const path = join(options.outDir, `${stem}.${ext}`)
      await rename(from, path)
      files.push({ name: `${stem}.${ext}`, path, bytes: (await stat(path)).size })
    }
    const ivs = join(options.outDir, `${stem}.ivs.json`)
    await writeFile(ivs, `${JSON.stringify(report.ivs)}\n`)
    files.push({ name: `${stem}.ivs.json`, path: ivs, bytes: (await stat(ivs)).size })
    return { files, report }
  }
  finally {
    await Promise.all([rm(otf, { force: true }), rm(woff2, { force: true })])
  }
}

async function compileOpenType({ plan, base }: { plan: Plan, base: string }): Promise<Uint8Array> {
  const output = join(tmpdir(), `furifont-${process.pid}-${randomUUID()}.otf`)
  try {
    await compileFont({ plan, base, output })
    return new Uint8Array(await readFile(output))
  }
  finally {
    await rm(output, { force: true })
  }
}

/** Compiles a small font covering only `text`, for a live preview. */
export async function previewFont(config: FurifontConfig, text: string, cwd: string): Promise<{ font: Uint8Array, report: PlanReport }> {
  const planned = await planWithBase(config, cwd, text)
  return { font: await compileOpenType(planned), report: planned.report }
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
  const otf = await compileOpenType(await planWithBase(config, cwd))
  const fast = await brotli(otf, {
    params: {
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_FONT,
      [constants.BROTLI_PARAM_QUALITY]: 8,
      [constants.BROTLI_PARAM_LGWIN]: constants.BROTLI_MAX_WINDOW_BITS,
      [constants.BROTLI_PARAM_SIZE_HINT]: otf.length,
    },
  })
  return { otf: otf.length, woff2: Math.round(fast.length * FAST_WOFF2_RATIO) }
}
