<script setup lang="ts">
const { text, preview } = useCustomize()
const size = ref(32)
</script>

<template>
  <div>
    <div class="relative min-h-56 px-6 py-8">
      <UiButton variant="ghost" icon="i-ph-shuffle" class="absolute right-3 top-3 w-9 px-0" :aria-label="$t('shuffle')" :title="$t('shuffle')" @click="text = otherSample(text).text" />
      <!-- Until the first preview font loads, the text shows in the prebuilt one. -->
      <FuriText v-model:text="text" :family="preview.family" :size :class="preview.loading && 'opacity-60'" />
      <p v-if="preview.error" class="mt-4 font-mono text-xs">
        {{ preview.error }}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-4 border-t border-base px-6 py-3">
      <span class="text-xs color-muted">{{ preview.loading ? $t('customize.preview.compiling') : $t('playground.textHint') }}</span>
      <UiSlider v-model="size" :min="16" :max="64" :aria-label="$t('customize.preview.size')" class="ml-auto w-28" />
      <span class="font-mono text-xs color-muted tabular-nums">
        {{ preview.ms === undefined ? '' : $t('customize.preview.stats', { glyphs: preview.glyphs ?? 0, ms: preview.ms }) }}
      </span>
    </div>
  </div>
</template>
