<script setup lang="ts">
const { family = FAMILIES[0]!.family, weight = 400, ruby = true, size = 32 } = defineProps<{
  text: string
  family?: string
  weight?: number
  /** Off turns on `ss01`, the font's own switch back to plain glyphs. */
  ruby?: boolean
  size?: number
}>()

// Ruby sits above the em box: below ~1.7 lines start to clip it.
const style = computed(() => ({
  fontFamily: `"${family}", sans-serif`,
  fontWeight: weight,
  fontSize: `${size}px`,
  lineHeight: 1.9,
  fontFeatureSettings: ruby ? 'normal' : '"ss01"',
}))
</script>

<template>
  <p lang="ja" class="whitespace-pre-wrap break-words" :style="style">
    {{ text }}
  </p>
</template>
