import { describe, expect, it } from 'vitest'
import { DEFAULTS, PREBUILT, resolveOptions, WORD_SOURCES } from '../src'

describe('defaults', () => {
  it('are what a plan resolves to when a config says nothing', () => {
    expect(resolveOptions()).toMatchObject({ ...DEFAULTS.plan, sources: [...WORD_SOURCES] })
  })

  it('do not share one array between plans', () => {
    expect(resolveOptions().sources).not.toBe(resolveOptions().sources)
  })

  it('make the first prebuilt font, in its variable form, the default one', () => {
    const [first] = PREBUILT.fonts
    expect(first).toMatchObject({ family: DEFAULTS.plan.family, furiganaScript: DEFAULTS.plan.furiganaScript })
    expect(DEFAULTS.build.base).toBe(`${first.base} ${PREBUILT.variable.style}`)
  })

  it('name each prebuilt family once', () => {
    expect(new Set(PREBUILT.fonts.map(f => f.family)).size).toBe(PREBUILT.fonts.length)
  })
})
