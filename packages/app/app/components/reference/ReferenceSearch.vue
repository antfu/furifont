<script setup lang="ts">
const LIMIT = 60

const { reference, error } = useReadingReference()
const query = ref('')

const words = computed(() => {
  const all = Object.entries(reference.value?.words ?? {})
  const q = query.value.trim()
  return (q ? all.filter(([word]) => word.includes(q)) : all).slice(0, LIMIT)
})
const kanji = computed(() => {
  const all = Object.entries(reference.value?.kanji ?? {})
  const q = query.value.trim()
  return (q ? all.filter(([k]) => q.includes(k)) : all.filter(([, r]) => r.length > 2)).slice(0, LIMIT)
})
</script>

<template>
  <div>
    <div class="flex flex-col gap-2 border-b border-base p-6">
      <input v-model="query" type="search" lang="ja" :placeholder="$t('reference.search')" class="input max-w-md text-base" :aria-label="$t('reference.searchLabel')">
      <p class="text-xs color-muted">
        {{ $t('reference.hint') }}
      </p>
    </div>
    <i18n-t v-if="error" keypath="reference.unavailable" tag="p" class="p-6 text-sm color-muted">
      <template #error>
        {{ error }}
      </template>
      <template #command>
        <code class="font-mono">pnpm fonts</code>
      </template>
    </i18n-t>
    <p v-else-if="!reference" class="label p-6">
      {{ $t('reference.loading') }}
    </p>
    <div v-else class="grid lg:grid-cols-2">
      <section class="border-base lg:border-r">
        <h2 class="label border-b border-base px-6 py-3">
          {{ $t('reference.words', { count: words.length }) }}
        </h2>
        <ReferenceEntry v-for="[word, readings] in words" :key="word" :text="word" :readings word-default />
      </section>
      <section>
        <h2 class="label border-b border-base px-6 py-3">
          {{ $t('reference.kanji', { count: kanji.length }) }}
        </h2>
        <ReferenceEntry v-for="[k, readings] in kanji" :key="k" :text="k" :readings />
      </section>
    </div>
  </div>
</template>
