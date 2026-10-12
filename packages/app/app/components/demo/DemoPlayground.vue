<script setup lang="ts">
const text = ref('今日は日本語の勉強をします。\n明日は東京の大学へ行きます。\n私は毎朝新聞を読みます。桜が咲きました。')
const family = ref(FAMILIES[0]!.family)
const weight = ref<number>(400)
const ruby = ref(true)
const size = ref(30)
const { copied, copy } = useCopy()

const families = FAMILIES.map(f => ({ value: f.family, label: f.script }))
const weights = WEIGHTS.map(w => ({ value: w.weight, label: w.style }))
</script>

<template>
  <div class="grid lg:grid-cols-[340px_1fr]">
    <div class="flex flex-col gap-5 border-b border-base p-6 lg:border-b-0 lg:border-r">
      <UiField label="Ruby script">
        <UiSegmented v-model="family" label="Ruby script" :options="families" />
      </UiField>
      <UiField label="Weight">
        <UiSegmented v-model="weight" label="Weight" :options="weights" />
      </UiField>
      <UiField :label="`Size / ${size}px`">
        <input v-model.number="size" type="range" min="16" max="64" class="accent-[var(--ff-fg)]">
      </UiField>
      <UiToggle v-model="ruby">
        Ruby <span class="font-mono text-xs color-muted">(ss01 when off)</span>
      </UiToggle>
      <UiField label="Text" hint="Type any Japanese. Ruby comes from the font alone.">
        <textarea v-model="text" rows="6" lang="ja" class="input resize-y font-sans" />
      </UiField>
    </div>
    <div class="flex min-w-0 flex-col">
      <div class="min-h-72 flex-1 px-6 py-8">
        <FuriText :text :family :weight :ruby :size />
      </div>
      <div class="flex items-center gap-3 border-t border-base px-6 py-3">
        <UiButton variant="ghost" :icon="copied ? 'i-ph-check' : 'i-ph-copy'" @click="copy(text)">
          {{ copied ? 'Copied' : 'Copy the text' }}
        </UiButton>
        <span class="text-xs color-muted">Paste it anywhere: no ruby characters come along.</span>
      </div>
    </div>
  </div>
</template>
