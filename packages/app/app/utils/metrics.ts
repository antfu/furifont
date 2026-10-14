import { resolveOptions } from '@furifont/core'

const { rubyScale, rubyGap } = resolveOptions().metrics

/** Line height of the previews: below about 1.6 the ruby starts to clip. */
export const LINE_HEIGHT = 1.75

// Furifont Sans, in em: Source Han Sans JP's ideographic em box (BASE `ideo`). The
// site's @font-face overrides (see the fonts plugin) set the ascent and descent to
// the box, so a line's baseline is the box centered in the line height.
const EM_TOP = 0.88
const EM_BOTTOM = 0.12
const RUBY_TOP = EM_TOP + rubyGap + rubyScale
const BASELINE = (LINE_HEIGHT - EM_TOP - EM_BOTTOM) / 2 + EM_TOP

/** Where each line's guides fall below the top of its line box, in em. */
export const LINE_GUIDES = {
  rubyTop: BASELINE - RUBY_TOP,
  emTop: BASELINE - EM_TOP,
  baseline: BASELINE,
  emBottom: BASELINE + EM_BOTTOM,
}
