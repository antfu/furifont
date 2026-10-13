import type { Plan } from '@furifont/core'
import type { CompileProgress } from './build'
import { readFile, writeFile } from 'node:fs/promises'
import { PlanSchema } from '@furifont/core'
import * as hb from 'harfbuzzjs'
import * as v from 'valibot'
import { view } from './binary'
import { buildFont } from './build'
import { nameOf, styleOf } from './names'
import { readSfnt } from './sfnt'
import { toWoff2 } from './woff2'

export { BASE_FONTS, fetchBaseFont } from './base-fonts'
export type { BaseFont } from './base-fonts'
export type { CompileProgress } from './build'

export interface FontInfo {
  /** Every codepoint in the font's cmap: what the planner may use. */
  codepoints: number[]
  family: string
  style: string
  unitsPerEm: number
  glyphCount: number
}

export interface CompileOptions {
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

export async function readFontInfo(font: string): Promise<FontInfo> {
  const data = new Uint8Array(await readFile(font))
  const { tables } = readSfnt(data)
  const name = tables.get('name')!
  const face = new hb.Face(new hb.Blob(data))
  return {
    codepoints: [...face.collectUnicodes()].sort((a, b) => a - b),
    family: nameOf(name, 16) ?? nameOf(name, 1) ?? '',
    style: styleOf(name),
    unitsPerEm: face.upem,
    glyphCount: view(tables.get('maxp')!).getUint16(4),
  }
}

/** Draws the plan's glyphs into the base font, compiles its rules, and checks the result with HarfBuzz. */
export async function compileFont(options: CompileOptions): Promise<CompileResult> {
  const plan = v.parse(PlanSchema, options.plan)
  const { font, glyphNames, style } = await buildFont(plan, new Uint8Array(await readFile(options.base)), options.onProgress)
  await writeFile(options.output, font)
  if (options.woff2) {
    options.onProgress?.({ step: 'woff2', done: null, total: null })
    await writeFile(options.woff2, await toWoff2(font))
  }
  if (options.glyphNames)
    await writeFile(options.glyphNames, JSON.stringify(glyphNames))
  return { glyphCount: glyphNames.length, family: plan.names.family, style }
}
