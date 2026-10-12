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
      <input v-model="query" type="search" lang="ja" placeholder="Search a word or kanji: 市場, 今日, 生" class="input max-w-md text-base" aria-label="Search readings">
      <p class="text-xs color-muted">
        Click a reading to copy the word with its selector.
      </p>
    </div>
    <p v-if="error" class="p-6 text-sm color-muted">
      The reference ships with the prebuilt fonts and could not be loaded here ({{ error }}).
      Build fonts with <code class="font-mono">pnpm fonts</code> or open the studio.
    </p>
    <p v-else-if="!reference" class="label p-6">
      Loading
    </p>
    <div v-else class="grid lg:grid-cols-2">
      <section class="border-base lg:border-r">
        <h2 class="label border-b border-base px-6 py-3">
          Words with several readings / {{ words.length }}
        </h2>
        <ReferenceEntry v-for="[word, readings] in words" :key="word" :text="word" :readings word-default />
      </section>
      <section>
        <h2 class="label border-b border-base px-6 py-3">
          Kanji / {{ kanji.length }}
        </h2>
        <ReferenceEntry v-for="[k, readings] in kanji" :key="k" :text="k" :readings />
      </section>
    </div>
  </div>
</template>
