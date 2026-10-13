import type { BuiltFont, CompileOptions } from './build'
import { PlanSchema } from '@furifont/core'
import * as hb from 'harfbuzzjs'
import * as v from 'valibot'
import { view } from './binary'
import { buildFont } from './build'
import { nameOf, styleOf } from './names'
import { readSfnt } from './sfnt'

export { BASE_FONTS } from './base-fonts'
export type { BaseFont } from './base-fonts'
export type { BuiltFont, CompileOptions, CompileProgress } from './build'
export type { SubsetWasm } from './subset'
export { toWoff2 } from './woff2'

export interface FontInfo {
  /** Every codepoint in the font's cmap: what the planner may use. */
  codepoints: number[]
  family: string
  style: string
  unitsPerEm: number
  glyphCount: number
}

export function readFontInfo(font: Uint8Array): FontInfo {
  const { tables } = readSfnt(font)
  const name = tables.get('name')!
  const face = new hb.Face(new hb.Blob(font))
  return {
    codepoints: [...face.collectUnicodes()].sort((a, b) => a - b),
    family: nameOf(name, 16) ?? nameOf(name, 1) ?? '',
    style: styleOf(name),
    unitsPerEm: face.upem,
    glyphCount: view(tables.get('maxp')!).getUint16(4),
  }
}

/** Draws the plan's glyphs into the base font, compiles its rules, and checks the result with HarfBuzz. */
export function compileFont(options: CompileOptions): Promise<BuiltFont> {
  const { base } = options
  return buildFont({
    ...options,
    plan: v.parse(PlanSchema, options.plan),
    // A Buffer's `slice` is a view, so the tables copied to be edited would edit the caller's bytes.
    base: new Uint8Array(base.buffer, base.byteOffset, base.byteLength),
  })
}
