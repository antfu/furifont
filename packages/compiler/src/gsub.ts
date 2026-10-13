import type { ChainRule, Lookup, Resolve, Substitution } from './fea'
import { OffsetOverflow, tagAt, view, Writer } from './binary'
import { fail, parseFeatures } from './fea'

const LOOKUP_TYPE = { single: 1, multiple: 2, ligature: 4, chain: 6 } as const
const EXTENSION = 7

function coverage(glyphs: number[]): Uint8Array {
  const ranges: { start: number, end: number, index: number }[] = []
  glyphs.forEach((g, index) => {
    const range = ranges.at(-1)
    if (range && range.end + 1 === g)
      range.end = g
    else
      ranges.push({ start: g, end: g, index })
  })
  const w = new Writer()
  if (glyphs.length <= ranges.length * 3) {
    w.u16(1).u16(glyphs.length)
    glyphs.forEach(g => w.u16(g))
  }
  else {
    w.u16(2).u16(ranges.length)
    ranges.forEach(r => w.u16(r.start).u16(r.end).u16(r.index))
  }
  return w.finish()
}

/** A subtable of entries keyed by first glyph, split by first glyph until its 16-bit offsets fit. */
function keyed<T>(entries: Map<number, T>, build: (keys: number[], values: T[]) => Uint8Array): Uint8Array[] {
  const split = (keys: number[]): Uint8Array[] => {
    try {
      return [build(keys, keys.map(k => entries.get(k)!))]
    }
    catch (error) {
      if (!(error instanceof OffsetOverflow) || keys.length < 2)
        throw error
      const half = keys.length >> 1
      return [...split(keys.slice(0, half)), ...split(keys.slice(half))]
    }
  }
  return split([...entries.keys()].sort((a, b) => a - b))
}

/** format, coverage offset, then `count` offsets to the tables in `sets`. */
function withSets(format: number, keys: number[], sets: Uint8Array[]): Uint8Array {
  const w = new Writer().u16(format)
  const cov = w.slot16()
  w.u16(sets.length)
  const slots = sets.map(() => w.slot16())
  w.children(slots, sets)
  w.link16(cov)
  return w.bytes(coverage(keys)).finish()
}

/** `count` offsets, relative to this table, to `items` laid out after it. */
function offsetList(items: Uint8Array[]): Uint8Array {
  const w = new Writer().u16(items.length)
  const slots = items.map(() => w.slot16())
  return w.children(slots, items).finish()
}

function uniqueMapping(stmts: Substitution[], lookup: string): Map<number, number[]> {
  const map = new Map<number, number[]>()
  for (const { from, to } of stmts) {
    const existing = map.get(from[0]!)
    if (existing && existing.join() !== to.join())
      throw new Error(`lookup ${lookup} substitutes glyph ${from[0]} twice`)
    map.set(from[0]!, to)
  }
  return map
}

function singleSubtables(stmts: Substitution[], lookup: string): Uint8Array[] {
  return keyed(uniqueMapping(stmts, lookup), (keys, values) => {
    const outputs = values.map(v => v[0]!)
    const deltas = new Set(keys.map((k, i) => (outputs[i]! - k + 0x10000) % 0x10000))
    const w = new Writer()
    if (deltas.size === 1) {
      w.u16(1)
      const cov = w.slot16()
      w.u16([...deltas][0]!).link16(cov)
      return w.bytes(coverage(keys)).finish()
    }
    w.u16(2)
    const cov = w.slot16()
    w.u16(keys.length)
    outputs.forEach(g => w.u16(g))
    w.link16(cov)
    return w.bytes(coverage(keys)).finish()
  })
}

function multipleSubtables(stmts: Substitution[], lookup: string): Uint8Array[] {
  return keyed(uniqueMapping(stmts, lookup), (keys, values) => withSets(1, keys, values.map((sequence) => {
    const w = new Writer().u16(sequence.length)
    sequence.forEach(g => w.u16(g))
    return w.finish()
  })))
}

function ligatureSubtables(stmts: Substitution[]): Uint8Array[] {
  const sets = new Map<number, Substitution[]>()
  for (const s of stmts) {
    if (!sets.has(s.from[0]!))
      sets.set(s.from[0]!, [])
    sets.get(s.from[0]!)!.push(s)
  }
  // Longest first, so a ligature is not cut short by one of its prefixes.
  return keyed(sets, (keys, values) => withSets(1, keys, values.map(ligatures => offsetList(
    ligatures.toSorted((a, b) => b.from.length - a.from.length).map(({ from, to }) => {
      const w = new Writer().u16(to[0]!).u16(from.length)
      from.slice(1).forEach(g => w.u16(g))
      return w.finish()
    }),
  ))))
}

function lookupRecords(rule: ChainRule, index: (name: string) => number): [number, number][] {
  return rule.ignore ? [] : rule.input.flatMap((p, i) => p.lookup ? [[i, index(p.lookup)] as [number, number]] : [])
}

/** Glyph-keyed chain rules (format 1); within a first glyph, rules keep their order. */
function chainGlyphSubtables(rules: ChainRule[], index: (name: string) => number): Uint8Array[] {
  const sets = new Map<number, ChainRule[]>()
  for (const rule of rules) {
    const first = rule.input[0]!.glyphs[0]!
    if (!sets.has(first))
      sets.set(first, [])
    sets.get(first)!.push(rule)
  }
  return keyed(sets, (keys, values) => withSets(1, keys, values.map(set => offsetList(set.map((rule) => {
    const w = new Writer()
    const records = lookupRecords(rule, index)
    w.u16(rule.backtrack.length)
    rule.backtrack.toReversed().forEach(p => w.u16(p.glyphs[0]!))
    w.u16(rule.input.length)
    rule.input.slice(1).forEach(p => w.u16(p.glyphs[0]!))
    w.u16(rule.lookahead.length)
    rule.lookahead.forEach(p => w.u16(p.glyphs[0]!))
    w.u16(records.length)
    records.forEach(([i, l]) => w.u16(i).u16(l))
    return w.finish()
  })))))
}

/** A rule over glyph classes (format 3). */
function chainClassSubtable(rule: ChainRule, index: (name: string) => number): Uint8Array {
  const w = new Writer().u16(3)
  const slots: number[] = []
  const parts = [rule.backtrack.toReversed(), rule.input, rule.lookahead]
  for (const part of parts) {
    w.u16(part.length)
    part.forEach(() => slots.push(w.slot16()))
  }
  const records = lookupRecords(rule, index)
  w.u16(records.length)
  records.forEach(([i, l]) => w.u16(i).u16(l))
  return w.children(slots, parts.flat().map(p => coverage([...new Set(p.glyphs)].sort((a, b) => a - b)))).finish()
}

interface CompiledLookup {
  type: number
  flag: number
  markFilteringSet?: number
  /** Subtables to write, or positions of the base GSUB's own, which is copied after them. */
  subtables: (Uint8Array | number)[]
}

function compileLookups(lookups: Lookup[], index: (name: string) => number): CompiledLookup[] {
  return lookups.map((lookup) => {
    let subtables: Uint8Array[]
    if (lookup.kind === 'chain') {
      subtables = lookup.segments.flatMap(rules => rules.every(r => [...r.backtrack, ...r.input, ...r.lookahead].every(p => !p.isClass))
        ? chainGlyphSubtables(rules, index)
        : rules.map(r => chainClassSubtable(r, index)))
    }
    else if (lookup.kind === 'ligature') {
      subtables = lookup.segments.flatMap(ligatureSubtables)
    }
    else {
      const build = lookup.kind === 'single' ? singleSubtables : multipleSubtables
      subtables = lookup.segments.flatMap(s => build(s, lookup.name))
    }
    return { type: LOOKUP_TYPE[lookup.kind], flag: 0, subtables }
  })
}

interface LangSys {
  tag?: string
  required: number
  features: number[]
}

interface Script {
  tag: string
  default?: LangSys
  langs: (LangSys & { tag: string })[]
}

interface Feature {
  tag: string
  params?: Uint8Array
  lookups: number[]
}

/** Feature parameters are not self-sizing: their length follows from the tag. */
function featureParams(gsub: Uint8Array, tag: string, at: number): Uint8Array {
  if (tag === 'size')
    return gsub.slice(at, at + 10)
  if (/^ss\d\d$/.test(tag))
    return gsub.slice(at, at + 4)
  if (/^cv\d\d$/.test(tag))
    return gsub.slice(at, at + 14 + 3 * view(gsub).getUint16(at + 12))
  throw new Error(`the base font's ${tag} feature has parameters Furifont cannot copy`)
}

interface BaseGsub {
  scripts: Script[]
  features: Feature[]
  lookups: CompiledLookup[]
}

function readGsub(gsub: Uint8Array): BaseGsub {
  const d = view(gsub)
  if (d.getUint16(0) !== 1 || (d.getUint16(2) === 1 && d.getUint32(10)))
    throw new Error('the base font\'s GSUB has feature variations, which only variable fonts need')
  const scriptList = d.getUint16(4)
  const featureList = d.getUint16(6)
  const lookupList = d.getUint16(8)
  const langSys = (at: number): LangSys => ({
    required: d.getUint16(at + 2),
    features: Array.from({ length: d.getUint16(at + 4) }, (_, k) => d.getUint16(at + 6 + k * 2)),
  })
  const scripts = Array.from({ length: d.getUint16(scriptList) }, (_, i): Script => {
    const record = scriptList + 2 + i * 6
    const script = scriptList + d.getUint16(record + 4)
    const defaultOffset = d.getUint16(script)
    return {
      tag: tagAt(gsub, record),
      default: defaultOffset ? langSys(script + defaultOffset) : undefined,
      langs: Array.from({ length: d.getUint16(script + 2) }, (_, k) => {
        const lang = script + 4 + k * 6
        return { tag: tagAt(gsub, lang), ...langSys(script + d.getUint16(lang + 4)) }
      }),
    }
  })
  const features = Array.from({ length: d.getUint16(featureList) }, (_, i): Feature => {
    const record = featureList + 2 + i * 6
    const tag = tagAt(gsub, record)
    const feature = featureList + d.getUint16(record + 4)
    const params = d.getUint16(feature)
    return {
      tag,
      params: params ? featureParams(gsub, tag, feature + params) : undefined,
      lookups: Array.from({ length: d.getUint16(feature + 2) }, (_, k) => d.getUint16(feature + 4 + k * 2)),
    }
  })
  const lookups = Array.from({ length: d.getUint16(lookupList) }, (_, i): CompiledLookup => {
    const lookup = lookupList + d.getUint16(lookupList + 2 + i * 2)
    const flag = d.getUint16(lookup + 2)
    const count = d.getUint16(lookup + 4)
    let subtables = Array.from({ length: count }, (_, k) => lookup + d.getUint16(lookup + 6 + k * 2))
    let type = d.getUint16(lookup)
    if (type === EXTENSION && subtables.length) {
      type = d.getUint16(subtables[0]! + 2)
      subtables = subtables.map(at => at + d.getUint32(at + 4))
    }
    return { type, flag, markFilteringSet: flag & 0x10 ? d.getUint16(lookup + 6 + count * 2) : undefined, subtables }
  })
  return { scripts, features, lookups }
}

function writeLangSys(ls: LangSys): Uint8Array {
  const w = new Writer().u16(0).u16(ls.required).u16(ls.features.length)
  ls.features.forEach(f => w.u16(f))
  return w.finish()
}

function writeScriptList(scripts: Script[]): Uint8Array {
  const w = new Writer().u16(scripts.length)
  const slots = scripts.map(s => w.tag(s.tag).slot16())
  return w.children(slots, scripts.map((script) => {
    const s = new Writer()
    const defaultSlot = s.slot16()
    s.u16(script.langs.length)
    const langSlots = script.langs.map(l => s.tag(l.tag).slot16())
    s.children(langSlots, script.langs.map(writeLangSys))
    if (script.default) {
      s.link16(defaultSlot)
      s.bytes(writeLangSys(script.default))
    }
    return s.finish()
  })).finish()
}

function writeFeatureList(features: Feature[]): Uint8Array {
  const w = new Writer().u16(features.length)
  const slots = features.map(f => w.tag(f.tag).slot16())
  return w.children(slots, features.map((feature) => {
    const f = new Writer()
    const params = f.slot16()
    f.u16(feature.lookups.length)
    feature.lookups.forEach(l => f.u16(l))
    if (feature.params) {
      f.link16(params)
      f.bytes(feature.params)
    }
    return f.finish()
  })).finish()
}

/**
 * Compiles the feature file and merges it into the base font's GSUB. Lookups
 * are appended; a feature the base font has is extended, since a language
 * system uses one record per tag; new features join every language system.
 * Every lookup is written as an Extension lookup, the base font's pointing
 * into its original subtables, copied unchanged after ours.
 */
export function buildGsub(fea: string, base: Uint8Array | undefined, resolve: Resolve): Uint8Array {
  const ours = parseFeatures(fea, resolve)
  const { scripts, features, lookups } = base
    ? readGsub(base)
    : { scripts: [{ tag: 'DFLT', default: { required: 0xFFFF, features: [] }, langs: [] }], features: [], lookups: [] }
  // Our lookups follow the base font's.
  const indices = new Map(ours.lookups.map((l, i) => [l.name, lookups.length + i]))
  const index = (name: string): number => indices.get(name) ?? fail(`unknown lookup ${name}`)
  const added: Feature[] = []
  for (const { tag, lookups: listed } of ours.features) {
    const featureLookups = listed.map(index)
    const existing = features.filter(f => f.tag === tag)
    for (const f of existing)
      f.lookups = [...f.lookups, ...featureLookups].sort((a, b) => a - b)
    if (!existing.length) {
      const feature = { tag, lookups: featureLookups }
      features.push(feature)
      added.push(feature)
    }
  }
  // Feature records stay sorted by tag; every language system follows the new order.
  const order = features.map((_, i) => i).sort((a, b) => features[a]!.tag < features[b]!.tag ? -1 : features[a]!.tag > features[b]!.tag ? 1 : a - b)
  const remap = new Map(order.map((old, i) => [old, i]))
  const addedIndices = added.map(f => remap.get(features.indexOf(f))!)
  for (const ls of scripts.flatMap(s => [s.default, ...s.langs]).filter(ls => ls !== undefined)) {
    ls.features = [...new Set([...ls.features.map(i => remap.get(i)!), ...addedIndices])].sort((a, b) => a - b)
    if (ls.required !== 0xFFFF)
      ls.required = remap.get(ls.required)!
  }
  const all = [...lookups, ...compileLookups(ours.lookups, index)]

  const w = new Writer().u16(1).u16(0)
  const scriptSlot = w.slot16()
  const featureSlot = w.slot16()
  const lookupSlot = w.slot16()
  w.link16(scriptSlot)
  w.bytes(writeScriptList(scripts))
  w.link16(featureSlot)
  w.bytes(writeFeatureList(order.map(i => features[i]!)))
  const lookupList = w.length
  w.link16(lookupSlot)
  w.u16(all.length)
  const lookupSlots = all.map(() => w.slot16())
  const extensions: { lookup: number, slot: number, type: number, subtable: Uint8Array | number }[] = []
  for (const [i, lookup] of all.entries()) {
    const at = w.length
    w.link16(lookupSlots[i]!, lookupList)
    w.u16(EXTENSION).u16(lookup.flag).u16(lookup.subtables.length)
    for (const subtable of lookup.subtables)
      extensions.push({ lookup: at, slot: w.slot16(), type: lookup.type, subtable })
    if (lookup.markFilteringSet !== undefined)
      w.u16(lookup.markFilteringSet)
  }
  const targets = extensions.map((e) => {
    w.link16(e.slot, e.lookup)
    const at = w.length
    w.u16(1).u16(e.type)
    return { at, slot: w.slot32() }
  })
  extensions.forEach((e, i) => {
    if (typeof e.subtable === 'number')
      return
    w.link32(targets[i]!.slot, targets[i]!.at)
    w.bytes(e.subtable)
  })
  const copied = w.length
  extensions.forEach((e, i) => {
    if (typeof e.subtable === 'number')
      w.set32(targets[i]!.slot, copied + e.subtable - targets[i]!.at)
  })
  if (base)
    w.bytes(base)
  return w.finish()
}
