import type { HanRun } from './dictionary'
import type { PlanGlyph } from './schema'

export function glyphName(codepoint: number): string {
  const hex = codepoint.toString(16).toUpperCase()
  return codepoint > 0xFFFF ? `u${hex}` : `uni${hex.padStart(4, '0')}`
}

export function codepoints(text: string): number[] {
  return [...text].map(c => c.codePointAt(0)!)
}

export function isGrouped(run: HanRun): boolean {
  return run.spans.some(s => s.end - s.start > 1)
}

/** Ruby text of span `index`, which may depend on the rest of the run (っ in romaji). */
export type RenderRuby = (run: HanRun, index: number) => string

export interface GlyphRegistry {
  all: () => PlanGlyph[]
  slot: (glyph: PlanGlyph) => number
  /** The glyphs annotating a whole run: one ligature when a reading spans several kanji. */
  run: (run: HanRun) => PlanGlyph[]
  /** A kanji with `ruby` and no run around it, for lone kanji and selectors. */
  lone: (text: string, ruby: string) => PlanGlyph
}

/**
 * Glyphs keyed by what they draw, so every word sharing a reading shares the
 * glyph. The nth glyph of a base character gets slot n: single-kanji glyphs
 * live in lookup `rb_<slot>`, which maps each kanji to at most one glyph.
 */
export function createGlyphRegistry(render: RenderRuby): GlyphRegistry {
  const glyphs = new Map<string, PlanGlyph>()
  const slots = new Map<PlanGlyph, number>()
  const counters = new Map<string, number>()

  const draw = (text: string, ruby: PlanGlyph['ruby']): PlanGlyph => {
    const key = `${text}|${ruby.map(r => `${r.start}-${r.end}:${r.text}`).join(';')}`
    const existing = glyphs.get(key)
    if (existing)
      return existing
    const bases = codepoints(text)
    const base = bases.map(glyphName).join('_')
    const slot = (counters.get(base) ?? 0) + 1
    counters.set(base, slot)
    // Glyph names are capped at 63 characters.
    const glyph = { name: base.length > 56 ? `run${glyphs.size}.rb.${slot}` : `${base}.rb.${slot}`, bases, ruby }
    glyphs.set(key, glyph)
    slots.set(glyph, slot)
    return glyph
  }

  const kanji = (run: HanRun, index: number): PlanGlyph => {
    const span = run.spans[index]!
    return draw([...run.text].slice(span.start, span.end).join(''), [{ start: 0, end: 1, text: render(run, index) }])
  }

  return {
    all: () => [...glyphs.values()],
    slot: glyph => slots.get(glyph)!,
    run: run => isGrouped(run)
      ? [draw(run.text, run.spans.map((s, i) => ({ start: s.start, end: s.end, text: render(run, i) })))]
      : run.spans.map((_, i) => kanji(run, i)),
    lone: (text, ruby) => kanji({ text, spans: [{ start: 0, end: 1, ruby }] }, 0),
  }
}
