<script setup lang="ts">
const { config, toggleWord } = useCustomize()
const notation = ref('')

const lists = computed(() => [
  { key: 'add' as const, label: 'customize.custom.added' as const, items: config.value.words?.add ?? [] },
  { key: 'pin' as const, label: 'customize.custom.pinned' as const, items: config.value.words?.pin ?? [] },
  { key: 'remove' as const, label: 'customize.custom.removed' as const, items: config.value.words?.remove ?? [] },
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
      <input v-model="notation" lang="ja" :placeholder="$t('customize.custom.placeholder')" :aria-label="$t('customize.custom.label')" class="input font-mono">
      <button type="submit" class="btn-outline focus-ring shrink-0">
        {{ $t('customize.custom.add') }}
      </button>
    </form>
    <div v-for="list in lists" :key="list.key" class="flex flex-col gap-2 no-ruby">
      <span class="label">{{ $t(list.label, { count: list.items.length }) }}</span>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="item in list.items"
          :key="item"
          type="button"
          lang="ja"
          class="focus-ring group flex items-center gap-1.5 border border-base px-2 py-0.5 text-sm hover:border-strong"
          :aria-label="$t('customize.custom.takeOut', { item })"
          @click="toggleWord(list.key, item)"
        >
          {{ item }}
          <span class="i-ph-x text-xs color-muted group-hover:color-base" />
        </button>
        <span v-if="!list.items.length" class="text-xs color-muted">{{ $t('customize.custom.none') }}</span>
      </div>
    </div>
  </div>
</template>
