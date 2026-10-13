import { resolveOptions } from '@furifont/core'

const { rubyScale, rubyGap } = resolveOptions().metrics

/** Line height of the previews: below about 1.6 the ruby starts to clip. */
export const LINE_HEIGHT = 1.75

// Furifont Sans, in em: Source Han Sans JP's ideographic em box (BASE `ideo`)
// and descent, with the ascent the compiler raises to the top of the ruby.
const EM_TOP = 0.88
const EM_BOTTOM = 0.12
const DESCENT = 0.288
const ASCENT = EM_TOP + rubyGap + rubyScale
const BASELINE = (LINE_HEIGHT - ASCENT - DESCENT) / 2 + ASCENT

/** Where each line's guides fall below the top of its line box, in em. */
export const LINE_GUIDES = {
  rubyTop: BASELINE - ASCENT,
  emTop: BASELINE - EM_TOP,
  baseline: BASELINE,
  emBottom: BASELINE + EM_BOTTOM,
}
