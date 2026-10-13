import type { Rule } from './planner'

interface Substitution {
  input: string
  output: string
}

export interface FeaInput {
  /** Every Han glyph a run can contain, ruby and variant glyphs included: what makes a kanji not alone. */
  hanClass: string[]
  singles: (Substitution & { lookup: string })[]
  ligatures: { lookup: string, glyph: string, components: string[] }[]
  isolated: Substitution[]
  rules: Rule[]
  /** Variant glyphs no rule claimed, to the kanji's own reading. */
  variantReadings: Substitution[]
  /** Variant glyphs back to their kanji: the default when no rule picked a reading, or ruby is off. */
  variantsOff: Substitution[]
  rubyOff: { glyph: string, bases: string[] }[]
}

/**
 * Rules per subtable of the main lookup. Breaking it up lets the compiler pack
 * each part as one glyph-keyed format 1 subtable under the 16-bit offset limit,
 * instead of thousands of format 3 subtables; order is kept across the breaks.
 */
const RULES_PER_SUBTABLE = 600

function block(keyword: 'lookup' | 'feature', name: string, body: string[]): string {
  // Extension lookups take 32-bit offsets: ours can be large, and sit after the base font's.
  const flags = keyword === 'lookup' ? ' useExtension' : ''
  return `${keyword} ${name}${flags} {\n${body.map(l => `  ${l}`).join('\n')}\n} ${name};\n`
}

function chainRule(rule: Rule): string {
  if (rule.ignore)
    return `ignore sub ${rule.input.map(g => `${g}'`).join(' ')};`
  return `sub ${rule.input.map((g, i) => `${g}'${rule.lookups[i] ? ` lookup ${rule.lookups[i]}` : ''}`).join(' ')};`
}

/** The chain rules, longest first, then the lone-kanji class rules. */
function mainRules(input: FeaInput): string[] {
  const words = input.rules.flatMap((rule, i) => i && i % RULES_PER_SUBTABLE === 0 ? ['subtable;', chainRule(rule)] : [chainRule(rule)])
  if (!input.isolated.length)
    return words
  const kanji = `[${input.isolated.map(i => i.input).join(' ')}]`
  return [
    ...words,
    // Class-based rules get a subtable of their own, or none of the above could be
    // glyph-keyed; a break before the first rule would only open an empty one.
    ...words.length ? ['subtable;'] : [],
    `ignore sub @han ${kanji}';`,
    `ignore sub ${kanji}' @han;`,
    `sub ${kanji}' lookup isolated;`,
  ]
}

/**
 * Writes the feature file. Nested lookups come first so the main one can call
 * them; the fallbacks come after it, in lookup order, so they only see what it
 * left: `ccmp` turns unclaimed variant glyphs back into kanji, `ss01` undoes ruby.
 */
export function emitFea(input: FeaInput): string {
  const out = ['languagesystem DFLT dflt;\n']
  if (input.hanClass.length)
    out.push(`@han = [${input.hanClass.join(' ')}];\n`)

  const bySlot = Map.groupBy(input.singles, s => s.lookup)
  for (const [lookup, singles] of [...bySlot].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })))
    out.push(block('lookup', lookup, singles.map(s => `sub ${s.input} by ${s.output};`)))
  const byLigatureSlot = Map.groupBy(input.ligatures, l => l.lookup)
  for (const [lookup, ligatures] of [...byLigatureSlot].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })))
    out.push(block('lookup', lookup, ligatures.map(l => `sub ${l.components.join(' ')} by ${l.glyph};`)))
  if (input.isolated.length)
    out.push(block('lookup', 'isolated', input.isolated.map(i => `sub ${i.input} by ${i.output};`)))

  const main = mainRules(input)
  if (main.length)
    out.push(block('lookup', 'furigana', main))
  if (input.variantReadings.length)
    out.push(block('lookup', 'variant_readings', input.variantReadings.map(v => `sub ${v.input} by ${v.output};`)))
  if (input.variantsOff.length)
    out.push(block('lookup', 'variants_off', input.variantsOff.map(v => `sub ${v.input} by ${v.output};`)))

  const singles = input.rubyOff.filter(r => r.bases.length === 1)
  const ligatures = input.rubyOff.filter(r => r.bases.length > 1)
  const off: string[] = []
  if (singles.length) {
    out.push(block('lookup', 'ruby_off', singles.map(r => `sub ${r.glyph} by ${r.bases[0]};`)))
    off.push('lookup ruby_off;')
  }
  if (ligatures.length) {
    out.push(block('lookup', 'ruby_off_ligatures', ligatures.map(r => `sub ${r.glyph} by ${r.bases.join(' ')};`)))
    off.push('lookup ruby_off_ligatures;')
  }
  const rclt = [main.length && 'lookup furigana;', input.variantReadings.length && 'lookup variant_readings;'].filter(l => typeof l === 'string')
  if (rclt.length)
    out.push(block('feature', 'rclt', rclt))
  if (input.variantsOff.length)
    out.push(block('feature', 'ccmp', ['lookup variants_off;']))
  if (off.length)
    out.push(block('feature', 'ss01', off))
  return out.join('\n')
}
