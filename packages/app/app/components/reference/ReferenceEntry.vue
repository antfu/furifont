<script setup lang="ts">
const { text, wordDefault = false } = defineProps<{
  text: string
  readings: string[]
  /** The first reading is what the font shows by default, as it is for words. */
  wordDefault?: boolean
}>()
const { copied, copy } = useCopy()
const { family } = useFontSettings()
</script>

<template>
  <article class="border-b border-base">
    <h3 class="px-6 pt-4 font-mono text-xs color-muted">
      {{ text }}
    </h3>
    <ul class="flex flex-wrap">
      <li v-for="(reading, i) in readings" :key="reading" class="flex flex-col items-start gap-1 px-6 py-3">
        <!-- Ruby stays on whatever the setting: the readings are what this page shows. -->
        <FuriText :text="withReading(text, i)" :family="family.family" :size="30" />
        <button
          type="button"
          class="focus-ring font-mono text-[11px] color-muted transition-colors hover:color-base"
          :title="$t('reference.copyWith', { text, selector: selectorName(i) })"
          @click="copy(withReading(text, i))"
        >
          {{ copied === withReading(text, i) ? $t('copied') : `${selectorName(i)} ${reading}${wordDefault && i === 0 ? ` / ${$t('reference.default')}` : ''}` }}
        </button>
      </li>
    </ul>
  </article>
</template>
