<script setup lang="ts">
import type { WordMatch } from 'furifont'

const { config, report, search, toggleWord } = useCustomize()
const query = ref('')
const results = shallowRef<WordMatch[]>([])

watch(query, async (q) => {
  const trimmed = q.trim()
  const matches = trimmed ? await search(trimmed).catch(() => []) : []
  if (q === query.value)
    results.value = matches
})

const pinned = computed(() => new Set(config.value.words?.pin ?? []))
const removed = computed(() => new Set(config.value.words?.remove ?? []))
/** With no search, the words whose default reading is a judgment call. */
const shown = computed<WordMatch[]>(() => query.value.trim()
  ? results.value
  : Object.entries(report.value?.ivs.words ?? {}).map(([form, readings]) => ({ form, readings: readings.map(notation => ({ notation, score: 0, sources: [] })) })))
</script>

<template>
  <div>
    <div class="flex flex-col gap-2 border-b border-base p-6">
      <input v-model="query" type="search" lang="ja" :placeholder="$t('customize.dictionary.search')" :aria-label="$t('customize.dictionary.search')" class="input max-w-md">
      <p class="text-xs color-muted">
        {{ query.trim() ? $t('customize.dictionary.results', { count: results.length }) : $t('customize.dictionary.hint') }}
      </p>
    </div>
    <ul class="max-h-[32rem] overflow-y-auto">
      <li v-for="word in shown" :key="word.form" class="flex flex-wrap items-center gap-2 border-b border-base px-6 py-2" :class="removed.has(word.form) && 'opacity-40'">
        <span lang="ja" class="w-28 shrink-0 text-base">{{ word.form }}</span>
        <button
          v-for="r in word.readings"
          :key="r.notation"
          type="button"
          lang="ja"
          class="focus-ring border px-2 py-0.5 text-sm transition-colors"
          :class="pinned.has(r.notation) ? 'border-inverse bg-inverse color-inverse' : 'border-base hover:border-strong'"
          :aria-pressed="pinned.has(r.notation)"
          :title="r.sources.length ? `${r.score} · ${r.sources.join(' ')}` : $t('customize.dictionary.noTag')"
          @click="toggleWord('pin', r.notation)"
        >
          {{ r.notation }}
        </button>
        <button type="button" class="btn-ghost focus-ring ml-auto h-7 px-2 text-xs" @click="toggleWord('remove', word.form)">
          {{ removed.has(word.form) ? $t('customize.dictionary.restore') : $t('customize.dictionary.remove') }}
        </button>
      </li>
    </ul>
  </div>
</template>
