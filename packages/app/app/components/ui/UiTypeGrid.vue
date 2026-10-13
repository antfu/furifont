<script setup lang="ts">
/**
 * Guide lines on the font's own metrics, behind text set at `size` px from the
 * parent's top left: a column per em, and per line the ruby band, the em box
 * and the baseline. It spills past the parent, which its container clips.
 */
const { size } = defineProps<{ size: number }>()

const style = computed(() => {
  // Browsers set the baseline on a whole pixel and draw the glyphs from it.
  const baselinePx = Math.round(LINE_GUIDES.baseline * size)
  const px = (em: number): string => `${Math.round(baselinePx + (em - LINE_GUIDES.baseline) * size)}px`
  const rule = (em: number): string => `transparent ${px(em)}, var(--ff-line) ${px(em)} calc(${px(em)} + 1px), transparent calc(${px(em)} + 1px)`
  const { rubyTop, rubyBottom, emTop, baseline, emBottom } = LINE_GUIDES
  const line = `100% ${size * LINE_HEIGHT}px`
  return {
    backgroundImage: [
      `linear-gradient(transparent ${px(rubyTop)}, var(--ff-hover) ${px(rubyTop)} ${px(rubyBottom)}, transparent ${px(rubyBottom)})`,
      `linear-gradient(${[emTop, baseline, emBottom].map(rule).join(', ')})`,
      'linear-gradient(90deg, var(--ff-line) 1px, transparent 1px)',
    ].join(', '),
    backgroundSize: `${line}, ${line}, ${size}px 100%`,
    backgroundPosition: '100vmax 100vmax',
  }
})
</script>

<template>
  <div aria-hidden="true" class="pointer-events-none absolute -inset-[100vmax] -z-1" :style="style" />
</template>
