<script setup lang="ts">
const emit = defineEmits<{ download: [] }>()
const text = ref(SAMPLES[0]!)
const size = 44
</script>

<template>
  <div class="grid lg:grid-cols-2">
    <div class="flex flex-col gap-8 border-base px-6 py-16 lg:border-r lg:py-24">
      <span class="label">振り仮名 / furigana</span>
      <h1 class="display hero-title font-semibold">
        {{ $t('hero.title1') }}<br>{{ $t('hero.title2') }}
      </h1>
      <p class="max-w-[46ch] text-[15px] leading-relaxed color-muted">
        {{ $t('hero.body') }}
      </p>
      <div class="flex flex-wrap gap-3">
        <UiButton variant="solid" icon="i-ph-download-simple" @click="emit('download')">
          {{ $t('hero.download') }}
        </UiButton>
        <UiButton to="/studio" icon="i-ph-sliders-horizontal">
          {{ $t('hero.build') }}
        </UiButton>
      </div>
    </div>
    <div class="relative isolate flex flex-col justify-center gap-4 overflow-hidden border-t border-base px-6 py-12 lg:border-t-0">
      <UiButton icon="i-ph-shuffle" class="absolute right-3 top-3 w-9 bg-base px-0" :aria-label="$t('shuffle')" :title="$t('shuffle')" @click="text = otherSample(text)" />
      <div class="relative">
        <UiTypeGrid :size />
        <FuriText v-model:text="text" :size />
      </div>
      <span class="label absolute bottom-3 left-3 border border-base bg-base px-2 py-1">Furifont Sans JP Regular / {{ size }}px</span>
    </div>
  </div>
</template>
