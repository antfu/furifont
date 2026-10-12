<script setup lang="ts">
const { text } = defineProps<{
  text: string
  /** Readings, the first being what the font shows by default. */
  readings: string[]
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
          :title="`Copy ${text} with ${selectorName(i)}`"
          @click="copy(withReading(text, i))"
        >
          <FuriText :text="withReading(text, i)" :size="30" />
          <span class="font-mono text-[11px] color-muted">
            {{ copied === withReading(text, i) ? 'copied' : `${selectorName(i)} ${reading}${i === 0 ? ' / default' : ''}` }}
          </span>
        </button>
      </li>
    </ul>
  </article>
</template>
