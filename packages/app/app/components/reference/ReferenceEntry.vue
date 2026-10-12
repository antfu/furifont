<script setup lang="ts">
const { text, wordDefault = false } = defineProps<{
  text: string
  readings: string[]
  /** The first reading is what the font shows by default, as it is for words. */
  wordDefault?: boolean
}>()
const { copied, copy } = useCopy()
</script>

<template>
  <article class="border-b border-base">
    <h3 class="px-6 pt-4 font-mono text-xs color-muted">
      {{ text }}
    </h3>
    <ul class="flex flex-wrap">
      <li v-for="(reading, i) in readings" :key="reading">
        <button
          type="button"
          class="focus-ring flex flex-col items-start gap-1 px-6 py-3 text-left transition-colors hover:bg-hover"
          :title="$t('reference.copyWith', { text, selector: selectorName(i) })"
          @click="copy(withReading(text, i))"
        >
          <FuriText :text="withReading(text, i)" :size="30" />
          <span class="font-mono text-[11px] color-muted">
            {{ copied === withReading(text, i) ? $t('copied') : `${selectorName(i)} ${reading}${wordDefault && i === 0 ? ` / ${$t('reference.default')}` : ''}` }}
          </span>
        </button>
      </li>
    </ul>
  </article>
</template>
