import type { Plan, PlanOptionsInput } from '../src'
import { describe, expect, it } from 'vitest'
import { createFontPlanner, resolveOptions } from '../src'
import { coverage, dictionary } from './fixture'

const planFont = createFontPlanner(dictionary)
const plan = (options: PlanOptionsInput = {}, text?: string) => planFont(resolveOptions(options), coverage, text)

/** What each glyph draws, as `bases:ruby`. */
function drawn(p: Plan): string[] {
  return p.glyphs.map(g => `${String.fromCodePoint(...g.bases)}:${g.ruby.map(r => r.text).join('|')}`)
}

function ruleIndex(p: Plan, pattern: RegExp): number {
  return p.fea.split('\n').findIndex(line => pattern.test(line))
}

describe('planner', () => {
  it('annotates common words and keeps uncommon readings out', () => {
    const { plan: p, report } = plan()
    expect(drawn(p)).toEqual(expect.arrayContaining(['日:に', '本:ほん', '今日:きょう', '今:こん', '日:にち']))
    expect(drawn(p)).not.toContain('日:じつ')
    expect(report.ivs.words['今日']).toEqual(['今日[きょう]', '今[こん]日[にち]'])
  })

  it('protects a longer word from a shorter match that would misread it', () => {
    const { plan: p, report } = plan()
    expect(report.stats.protectedAnnotated).toBe(1)
    const longer = ruleIndex(p, /^\s*sub uni5927' lookup rb_\d+ uni4EBA' lookup rb_\d+ uni6C17' lookup rb_\d+;/)
    const shorter = ruleIndex(p, /^\s*sub uni5927' lookup lig_\d+ uni4EBA';/)
    expect(longer).toBeGreaterThan(-1)
    expect(longer).toBeLessThan(shorter)
  })

  it('annotates a lone kanji only when one reading dominates', () => {
    const { plan: p, report } = plan()
    expect(p.fea).toMatch(/lookup isolated \{\n {2}sub uni685C by uni685C\.rb\.1;\n\}/)
    expect(p.fea).not.toMatch(/sub uni66F8 by .* # isolated/)
    expect(report.ivs.kanji['書']).toEqual(['か', 'しょ'])
    expect(report.ivs.kanji['来']).toHaveLength(3)
    expect(report.stats.isolated).toBe(1)
  })

  it('applies pins and removals', () => {
    const pinned = plan({ words: { pin: ['今[こん]日[にち]', '書[か]'] } }).report
    expect(pinned.ivs.words['今日']![0]).toBe('今[こん]日[にち]')
    expect(pinned.stats.isolated).toBe(2)

    const { plan: p } = plan({ words: { remove: ['日本'] } })
    expect(drawn(p)).not.toContain('本:ほん')
    expect(p.fea).toContain('ignore sub uni65E5\' uni672C\';')
  })

  it('renders ruby in the chosen script', () => {
    expect(drawn(plan({ rubyScript: 'hepburn' }).plan)).toEqual(expect.arrayContaining(['学:gak', '校:kō', '今日:kyō']))
    expect(drawn(plan({ rubyScript: 'katakanaOn' }).plan)).toEqual(expect.arrayContaining(['本:ホン', '日:に', '学:ガッ', '今日:きょう']))
  })

  it('plans a preview with only what the sample text needs', () => {
    const { plan: p } = plan({}, '日本')
    expect(drawn(p).every(d => /^[日本]:/.test(d))).toBe(true)
    expect(p.subset).toEqual([...'にほん日本'].map(c => c.codePointAt(0)).sort((a, b) => a! - b!))
    expect(p.smoke).toEqual([])
  })

  it('names the glyphs its smoke checks expect', () => {
    const { plan: p } = plan()
    const names = new Set(p.glyphs.map(g => g.name))
    expect(p.smoke.length).toBeGreaterThan(2)
    expect(p.smoke.flatMap(s => s.glyphs).every(n => names.has(n))).toBe(true)
  })

  it('rejects the base font\'s reserved name', () => {
    expect(() => resolveOptions({ family: 'Source Furigana' })).toThrow(/reserved/)
  })

  it('writes a stable feature file', () => {
    expect(plan().plan.fea).toMatchSnapshot()
  })
})
