<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const text = SAMPLES[0]!.text
const size = 64

const i18n = useI18n()
i18n.locale.value = 'en'
</script>

<template>
  <!-- Fixed 1200x630 (Open Graph size) so the story canvas can be screenshotted 1:1. -->
  <div id="og-image" class="relative shrink-0 overflow-hidden bg-base p-10 color-base" style="width: 1200px; height: 630px">
    <div class="relative grid grid-cols-[minmax(0,1fr)_38rem] h-full border border-base">
      <UiCross class="-left-[6px] -top-[6px]" />
      <UiCross class="-right-[6px] -top-[6px]" />
      <UiCross class="-bottom-[6px] -left-[6px]" />
      <UiCross class="-bottom-[6px] -right-[6px]" />
      <div class="flex flex-col justify-between border-r border-base p-10">
        <div class="flex items-center gap-3 font-mono text-xl font-medium">
          <img src="/logo.svg" alt="" class="size-9">
          furifont
        </div>
        <div class="flex flex-col gap-6">
          <span class="label text-sm">振り仮名 / furigana</span>
          <h1 class="display text-[64px] font-semibold">
            {{ $t('hero.title1') }}<br>{{ $t('hero.title2') }}
          </h1>
          <p class="max-w-[46ch] lh-1.625 color-muted">
            {{ $t('hero.body') }}
          </p>
        </div>
      </div>
      <div class="relative isolate flex flex-col justify-center overflow-hidden px-10">
        <div class="relative">
          <UiTypeGrid :size />
          <FuriText :text :size />
        </div>
        <span class="label absolute bottom-3 left-3 border border-base bg-base px-2 py-1">Furifont Sans Regular / {{ size }}px</span>
      </div>
    </div>
  </div>
</template>
