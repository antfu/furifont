import type { Rule } from './planner'

export interface FeaInput {
  /** Every Han glyph a run can contain, ruby glyphs included: what makes a kanji not alone. */
  hanClass: string[]
  suppressSelector?: string
  singles: { lookup: string, base: string, glyph: string }[]
  ligatures: { lookup: string, glyph: string, components: string[] }[]
  isolated: { base: string, glyph: string }[]
  rules: Rule[]
  rubyOff: { glyph: string, bases: string[] }[]
}

function block(keyword: 'lookup' | 'feature', name: string, body: string[]): string {
  return `${keyword} ${name} {\n${body.map(l => `  ${l}`).join('\n')}\n} ${name};\n`
}

function chainRule(rule: Rule): string {
  if (rule.ignore)
    return `ignore sub ${rule.input.map(g => `${g}'`).join(' ')};`
  return `sub ${rule.input.map((g, i) => `${g}'${rule.lookups[i] ? ` lookup ${rule.lookups[i]}` : ''}`).join(' ')};`
}

/**
 * Writes the feature file. Nested lookups come first so the main one can call
 * them; ruby-off lookups come last so `ss01` undoes what `rclt` did.
 */
export function emitFea(input: FeaInput): string {
  const out = ['languagesystem DFLT dflt;\n']
  if (input.hanClass.length)
    out.push(`@han = [${input.hanClass.join(' ')}];\n`)

  const bySlot = Map.groupBy(input.singles, s => s.lookup)
  for (const [lookup, singles] of [...bySlot].sort((a, b) => a[0].localeCompare(b[0], 'en', { numeric: true })))
    out.push(block('lookup', lookup, singles.map(s => `sub ${s.base} by ${s.glyph};`)))
  for (const l of input.ligatures)
    out.push(block('lookup', l.lookup, [`sub ${l.components.join(' ')} by ${l.glyph};`]))
  if (input.isolated.length)
    out.push(block('lookup', 'isolated', input.isolated.map(i => `sub ${i.base} by ${i.glyph};`)))

  const main = input.rules.map(chainRule)
  if (input.suppressSelector && input.hanClass.length)
    main.unshift(`ignore sub @han' ${input.suppressSelector};`)
  if (input.isolated.length) {
    const kanji = `[${input.isolated.map(i => i.base).join(' ')}]`
    main.push(
      `ignore sub @han ${kanji}';`,
      `ignore sub ${kanji}' @han;`,
      `sub ${kanji}' lookup isolated;`,
    )
  }
  if (!main.length)
    return out.join('\n')
  out.push(block('lookup', 'furigana', main))

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
  out.push(block('feature', 'rclt', ['lookup furigana;']))
  if (off.length)
    out.push(block('feature', 'ss01', off))
  return out.join('\n')
}
