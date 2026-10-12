import type { Plan } from '@furifont/core'
import type { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { PlanSchema } from '@furifont/core'
import * as v from 'valibot'

export { fetchBaseFont, SOURCE_HAN_SANS_JP_WEIGHTS } from './base-fonts'
export type { SourceHanSansWeight } from './base-fonts'

const SCRIPT = fileURLToPath(new URL('../python/furifont.py', import.meta.url))
const INSTALL_HINT = 'python3 -m pip install fonttools uharfbuzz brotli'

export interface PythonOptions {
  /** Python executable; defaults to `$FURIFONT_PYTHON`, then `python3`. */
  python?: string
}

export interface FontInfo {
  /** Every codepoint in the font's cmap: what the planner may use. */
  codepoints: number[]
  family: string
  style: string
  unitsPerEm: number
  glyphCount: number
}

export interface CompileProgress {
  step: 'load' | 'draw' | 'features' | 'save' | 'woff2'
  done: number | null
  total: number | null
}

export interface CompileOptions extends PythonOptions {
  plan: Plan
  /** Path of the base font (OTF or TTF). */
  base: string
  /** Path to write the OpenType font to. */
  output: string
  /** Also write a WOFF2 here. */
  woff2?: string
  /** Write the glyph order, named as the plan names glyphs, here. */
  glyphNames?: string
  onProgress?: (progress: CompileProgress) => void
}

export interface CompileResult {
  glyphCount: number
  family: string
  style: string
}

const FontInfoSchema = v.object({
  codepoints: v.array(v.number()),
  family: v.string(),
  style: v.string(),
  unitsPerEm: v.number(),
  glyphCount: v.number(),
})

const CompileResultSchema = v.object({ glyphCount: v.number(), family: v.string(), style: v.string() })

const MessageSchema = v.union([
  v.object({ step: v.picklist(['load', 'draw', 'features', 'save', 'woff2']), done: v.nullable(v.number()), total: v.nullable(v.number()) }),
  v.object({ error: v.string() }),
])

function pythonPath(options: PythonOptions): string {
  return options.python ?? process.env.FURIFONT_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')
}

function parseMessage(line: string): v.InferOutput<typeof MessageSchema> | undefined {
  try {
    const result = v.safeParse(MessageSchema, JSON.parse(line))
    return result.success ? result.output : undefined
  }
  catch {
    return undefined
  }
}

function run(args: string[], options: PythonOptions, onProgress?: (p: CompileProgress) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath(options), [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let failure: string | undefined
    child.stdout.on('data', (chunk: Buffer) => stdout += chunk)
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk
      const lines = stderr.split('\n')
      stderr = lines.pop()!
      for (const line of lines) {
        const message = parseMessage(line)
        if (!message)
          failure = failure ? `${failure}\n${line}` : line
        else if ('error' in message)
          failure = message.error
        else
          onProgress?.(message)
      }
    })
    child.on('error', error => reject(new Error(`Could not run ${pythonPath(options)}: ${error.message}. Furifont needs Python 3.10+ with: ${INSTALL_HINT}`)))
    child.on('close', (code) => {
      if (code === 0)
        resolve(stdout)
      else
        reject(new Error(failure ?? (stderr || `furifont.py exited with code ${code}`)))
    })
  })
}

/** Whether Python and the font libraries are installed, with a hint when they are not. */
export async function checkPython(options: PythonOptions = {}): Promise<{ ok: true } | { ok: false, message: string }> {
  return new Promise((resolve) => {
    const child = spawn(pythonPath(options), ['-c', 'import fontTools, uharfbuzz, brotli'], { stdio: 'ignore' })
    child.on('error', () => resolve({ ok: false, message: `${pythonPath(options)} not found. Install Python 3.10+, then: ${INSTALL_HINT}` }))
    child.on('close', code => resolve(code === 0 ? { ok: true } : { ok: false, message: `Missing Python packages. Run: ${INSTALL_HINT}` }))
  })
}

export async function readFontInfo(font: string, options: PythonOptions = {}): Promise<FontInfo> {
  return v.parse(FontInfoSchema, JSON.parse(await run(['info', font], options)))
}

/** Draws the plan's glyphs into the base font, compiles its rules, and checks the result with HarfBuzz. */
export async function compileFont(options: CompileOptions): Promise<CompileResult> {
  const plan = v.parse(PlanSchema, options.plan)
  const dir = await mkdtemp(join(tmpdir(), 'furifont-'))
  try {
    const planPath = join(dir, 'plan.json')
    await writeFile(planPath, JSON.stringify(plan))
    const args = ['build', planPath, options.base, options.output]
    if (options.woff2)
      args.push('--woff2', options.woff2)
    if (options.glyphNames)
      args.push('--names', options.glyphNames)
    return v.parse(CompileResultSchema, JSON.parse(await run(args, options, options.onProgress)))
  }
  finally {
    await rm(dir, { recursive: true, force: true })
  }
}
