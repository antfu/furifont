<script setup lang="ts">
const { text, css = '' } = defineProps<{
  /** Japanese sample, where `\u{…}` stands for an invisible character such as a variation selector. */
  text: string
  /** CSS declarations on the sample, as the snippet next to it writes them. */
  css?: string
}>()

const { family } = useFontSettings()
const shown = computed(() => text.replace(/\\u\{([\da-f]+)\}/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16))))
const style = computed(() => [{ fontFamily: `"${family.value.family}", sans-serif`, lineHeight: LINE_HEIGHT, fontFeatureSettings: 'normal' }, css])
</script>

<template>
  <figure class="my-4 flex flex-col gap-2 border border-base px-4 py-3">
    <div lang="ja" class="text-3xl" :style>
      {{ shown }}
    </div>
    <figcaption class="font-mono text-xs color-muted">
      {{ css || text }}
    </figcaption>
  </figure>
</template>
