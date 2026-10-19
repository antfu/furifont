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
  /** The glyphs annotating a whole run: one ligature when a reading spans several kanji. */
  run: (run: HanRun) => PlanGlyph[]
  /** A kanji with `ruby` and no run around it, for lone kanji and selectors. */
  lone: (text: string, ruby: string) => PlanGlyph
}

/** Glyphs keyed by what they draw, so every word sharing a reading shares the glyph. */
export function createGlyphRegistry(render: RenderRuby): GlyphRegistry {
  const glyphs = new Map<string, PlanGlyph>()
  const counters = new Map<string, number>()

  const draw = (text: string, ruby: PlanGlyph['ruby']): PlanGlyph => {
    const key = `${text}|${ruby.map(r => `${r.start}-${r.end}:${r.text}`).join(';')}`
    const existing = glyphs.get(key)
    if (existing)
      return existing
    const bases = codepoints(text)
    const base = bases.map(glyphName).join('_')
    const n = (counters.get(base) ?? 0) + 1
    counters.set(base, n)
    // Glyph names are capped at 63 characters.
    const glyph = { name: base.length > 56 ? `run${glyphs.size}.rb.${n}` : `${base}.rb.${n}`, bases, ruby }
    glyphs.set(key, glyph)
    return glyph
  }

  const kanji = (run: HanRun, index: number): PlanGlyph => {
    const span = run.spans[index]!
    return draw([...run.text].slice(span.start, span.end).join(''), [{ start: 0, end: 1, text: render(run, index) }])
  }

  return {
    all: () => [...glyphs.values()],
    run: run => isGrouped(run)
      ? [draw(run.text, run.spans.map((s, i) => ({ start: s.start, end: s.end, text: render(run, i) })))]
      : run.spans.map((_, i) => kanji(run, i)),
    lone: (text, ruby) => kanji({ text, spans: [{ start: 0, end: 1, ruby }] }, 0),
  }
}

export interface SingleLookups {
  /** The lookup that turns `input` into `output`: the nth distinct output of an input lives in `<prefix>_<n>`. */
  lookupFor: (input: string, output: string) => string
  all: () => { lookup: string, input: string, output: string }[]
}

/** Single substitutions, packed so each lookup maps an input glyph at most once. */
export function createSingleLookups(prefix = 'rb'): SingleLookups {
  const byInput = new Map<string, Map<string, number>>()
  return {
    lookupFor(input, output) {
      let outputs = byInput.get(input)
      if (!outputs)
        byInput.set(input, outputs = new Map())
      let slot = outputs.get(output)
      if (!slot)
        outputs.set(output, slot = outputs.size + 1)
      return `${prefix}_${slot}`
    },
    all: () => [...byInput].flatMap(([input, outputs]) => [...outputs].map(([output, slot]) => ({ lookup: `${prefix}_${slot}`, input, output }))),
  }
}
