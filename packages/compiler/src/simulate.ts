import type { Plan, PlanGlyph, RubySpan } from '@furifont/core'
import type { ChainRule, Lookup } from './fea'
import { glyphName, isHan } from '@furifont/core'
import { parseFeatures } from './fea'

/** Applies a lookup at `at`, in place: the position to go on from, or undefined when nothing matched. */
type Apply = (glyphs: number[], at: number) => number | undefined

interface Context {
  ignore: boolean
  backtrack: Set<number>[]
  input: { glyphs: Set<number>, lookup?: string }[]
  lookahead: Set<number>[]
}

function context(rule: ChainRule): Context {
  const set = (p: ChainRule['input'][number]): Set<number> => new Set(p.glyphs)
  return { ignore: rule.ignore, backtrack: rule.backtrack.map(set), input: rule.input.map(p => ({ glyphs: set(p), lookup: p.lookup })), lookahead: rule.lookahead.map(set) }
}

function matches(rule: Context, glyphs: number[], at: number): boolean {
  const end = at + rule.input.length
  return end + rule.lookahead.length <= glyphs.length
    && at >= rule.backtrack.length
    && rule.input.every((p, i) => p.glyphs.has(glyphs[at + i]!))
    && rule.lookahead.every((p, i) => p.has(glyphs[end + i]!))
    // Backtrack positions read outward from the input.
    && rule.backtrack.every((p, i) => p.has(glyphs[at - rule.backtrack.length + i]!))
}

/** First glyph to rules for a glyph-keyed subtable, else the rules to try in turn. */
function chainSubtable(rules: Context[]): (glyph: number) => Context[] {
  if (rules.some(r => [...r.backtrack, ...r.input.map(p => p.glyphs), ...r.lookahead].some(p => p.size > 1)))
    return () => rules
  const keyed = Map.groupBy(rules, r => [...r.input[0]!.glyphs][0]!)
  return glyph => keyed.get(glyph) ?? []
}

function compile(lookup: Lookup, nested: (name: string) => Apply): Apply {
  if (lookup.kind === 'chain') {
    const subtables = lookup.segments.map(rules => chainSubtable(rules.map(context)))
    return (glyphs, at) => {
      for (const subtable of subtables) {
        const rule = subtable(glyphs[at]!).find(r => matches(r, glyphs, at))
        if (!rule)
          continue
        const length = glyphs.length
        if (!rule.ignore) {
          // Each record applies where its position landed once earlier ones resized the buffer.
          rule.input.forEach((p, i) => p.lookup && nested(p.lookup)(glyphs, at + i + glyphs.length - length))
        }
        return at + rule.input.length + glyphs.length - length
      }
      return undefined
    }
  }
  if (lookup.kind === 'single') {
    const map = new Map(lookup.segments.toReversed().flat().map(s => [s.from[0]!, s.to[0]!]))
    return (glyphs, at) => {
      const to = map.get(glyphs[at]!)
      if (to === undefined)
        return undefined
      glyphs[at] = to
      return at + 1
    }
  }
  if (lookup.kind === 'ligature') {
    // Longest first, as the compiler writes each ligature set.
    const subtables = lookup.segments.map(s => Map.groupBy(s.toSorted((a, b) => b.from.length - a.from.length), l => l.from[0]!))
    return (glyphs, at) => {
      for (const subtable of subtables) {
        const ligature = subtable.get(glyphs[at]!)?.find(l => l.from.every((g, i) => glyphs[at + i] === g))
        if (ligature) {
          glyphs.splice(at, ligature.from.length, ligature.to[0]!)
          return at + 1
        }
      }
      return undefined
    }
  }
  throw new Error(`simulating ${lookup.kind} lookups is not supported`)
}

/**
 * Reads text the way a font built from `plan` shows it with its default
 * readings: each Han run apart, as browsers shape them, through the `rclt`
 * lookups in lookup order. Returns the ruby over the text's characters. It
 * leaves out variation selectors, `salt`, and the base font's own lookups.
 */
export function createRubyReader(plan: Plan): (text: string) => RubySpan[] {
  const ids = new Map<string, number>()
  const id = (name: string): number => {
    let found = ids.get(name)
    if (found === undefined)
      ids.set(name, found = ids.size)
    return found
  }
  const { lookups, features } = parseFeatures(plan.fea, id)
  const rclt = new Set(features.filter(f => f.tag === 'rclt').flatMap(f => f.lookups))
  // Compiled on first use: only what `rclt` reaches needs to be supported.
  const compiled = new Map<string, Apply>()
  const byName = new Map(lookups.map(l => [l.name, l]))
  const lookup = (name: string): Apply => {
    let apply = compiled.get(name)
    if (!apply)
      compiled.set(name, apply = compile(byName.get(name)!, lookup))
    return apply
  }
  const applied = lookups.filter(l => rclt.has(l.name)).map(l => lookup(l.name))
  const drawn = new Map<number, PlanGlyph>(plan.glyphs.map(g => [id(g.name), g]))

  const readRun = (chars: string[], offset: number): RubySpan[] => {
    const glyphs = chars.map(c => id(glyphName(c.codePointAt(0)!)))
    for (const apply of applied) {
      for (let at = 0; at < glyphs.length;)
        at = apply(glyphs, at) ?? at + 1
    }
    const spans: RubySpan[] = []
    for (const glyph of glyphs.map(g => drawn.get(g))) {
      spans.push(...glyph?.ruby.map(r => ({ start: offset + r.start, end: offset + r.end, ruby: r.text })) ?? [])
      offset += glyph?.bases.length ?? 1
    }
    return spans
  }

  return (text) => {
    const chars = [...text]
    const spans: RubySpan[] = []
    for (let start = 0, end = 0; start < chars.length; start = end) {
      if (!isHan(chars[start]!)) {
        end = start + 1
        continue
      }
      for (end = start; end < chars.length && isHan(chars[end]!);)
        end++
      spans.push(...readRun(chars.slice(start, end), start))
    }
    return spans
  }
}
