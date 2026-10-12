<script setup lang="ts">
const emit = defineEmits<{ download: [] }>()
</script>

<template>
  <div class="grid lg:grid-cols-2">
    <div class="flex flex-col gap-8 border-base px-6 py-16 lg:border-r lg:py-24">
      <span class="label">振り仮名 / furigana</span>
      <h1 class="text-[clamp(2.75rem,6vw,4.75rem)] font-semibold leading-[0.92] tracking-[-0.045em]">
        Furigana,<br>set by the font.
      </h1>
      <p class="max-w-[46ch] text-[15px] leading-relaxed color-muted">
        Furifont looks every word up in its dictionary and draws the reading above the kanji.
        The text itself stays plain: copy, search and screen readers see exactly what you wrote.
      </p>
      <div class="flex flex-wrap gap-3">
        <UiButton variant="solid" icon="i-ph-download-simple" @click="emit('download')">
          Download the fonts
        </UiButton>
        <UiButton to="/studio" icon="i-ph-sliders-horizontal">
          Build your own
        </UiButton>
      </div>
    </div>
    <div class="relative flex flex-col justify-center gap-4 border-t border-base bg-grid px-6 py-12 lg:border-t-0">
      <FuriText text="今日は&#10;日本語の勉強を&#10;します。" :size="44" />
      <span class="label">Furifont Sans JP Regular / 44px</span>
    </div>
  </div>
</template>
