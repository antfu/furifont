<script setup lang="ts">
const { config, toggleWord } = useStudio()
const notation = ref('')

const lists = computed(() => [
  { key: 'add' as const, label: 'Added', items: config.value.words?.add ?? [] },
  { key: 'pin' as const, label: 'Pinned', items: config.value.words?.pin ?? [] },
  { key: 'remove' as const, label: 'Never annotated', items: config.value.words?.remove ?? [] },
])

function add(): void {
  if (!/\[[^\]]+\]/.test(notation.value))
    return
  toggleWord('add', notation.value.trim())
  notation.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-4 p-6">
    <form class="flex gap-2" @submit.prevent="add">
      <input v-model="notation" lang="ja" placeholder="日[に]本[ほん] or 今日[きょう]" aria-label="Word to add" class="input font-mono">
      <button type="submit" class="btn-outline focus-ring shrink-0">
        Add word
      </button>
    </form>
    <div v-for="list in lists" :key="list.key" class="flex flex-col gap-2">
      <span class="label">{{ list.label }} / {{ list.items.length }}</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="item in list.items"
          :key="item"
          type="button"
          lang="ja"
          class="focus-ring group flex items-center gap-1.5 border border-base px-2 py-0.5 text-sm hover:border-strong"
          :aria-label="`Take ${item} out`"
          @click="toggleWord(list.key, item)"
        >
          {{ item }}
          <span class="i-ph-x text-xs color-muted group-hover:color-base" />
        </button>
        <span v-if="!list.items.length" class="text-xs color-muted">None</span>
      </div>
    </div>
  </div>
</template>
