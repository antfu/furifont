import { describe, expect, it } from 'vitest'
import { DEFAULTS, PREBUILT, resolveOptions } from '../src'

describe('defaults', () => {
  it('are what a plan resolves to when a config says nothing', () => {
    expect(resolveOptions()).toMatchObject({ ...DEFAULTS.plan, selectTags: [...DEFAULTS.plan.selectTags] })
  })

  it('do not share one array between plans', () => {
    expect(resolveOptions().selectTags).not.toBe(resolveOptions().selectTags)
  })

  it('make the first prebuilt font the default one', () => {
    const [first] = PREBUILT.fonts
    expect(first).toMatchObject({ family: DEFAULTS.plan.family, rubyScript: DEFAULTS.plan.rubyScript })
    expect(DEFAULTS.build.base).toBe(`${first.base} ${PREBUILT.weights[0].style}`)
  })

  it('name each prebuilt family once, and write its site styles among the weights', () => {
    expect(new Set(PREBUILT.fonts.map(f => f.family)).size).toBe(PREBUILT.fonts.length)
    const styles: string[] = PREBUILT.weights.map(w => w.style)
    expect(PREBUILT.site.styles.every(style => styles.includes(style))).toBe(true)
  })
})
