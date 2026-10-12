<script setup lang="ts">
const VS = (n: number): string => String.fromCodePoint(0xE01E0 + n)

const examples = [
  { label: 'Default', text: '市場', code: '市場' },
  { label: 'Reading 2 (VS227)', text: `市${VS(2)}場`, code: '市\\u{E01E2}場' },
  { label: 'Default', text: '今日', code: '今日' },
  { label: 'Reading 2 (VS227)', text: `今${VS(2)}日`, code: '今\\u{E01E2}日' },
  { label: 'No ruby (VS225)', text: `今${VS(0)}日`, code: '今\\u{E01E0}日' },
]
const { copied, copy } = useCopy()
</script>

<template>
  <div class="grid sm:grid-cols-[1fr_2fr]">
    <div class="flex flex-col gap-4 border-b border-base p-6 sm:border-b-0 sm:border-r">
      <p class="text-sm leading-relaxed color-muted">
        Some words have several common readings. Furifont shows the most common one, and a variation
        selector right after the first kanji picks another: VS226 for reading 1, VS227 for reading 2, and so on.
        VS225 drops the ruby.
      </p>
      <UiButton to="/reference" icon="i-ph-list-magnifying-glass" class="self-start">
        Look up readings
      </UiButton>
    </div>
    <ul class="grid grid-cols-2 lg:grid-cols-5">
      <li v-for="example in examples" :key="example.code" class="flex flex-col gap-2 border-b border-r border-base p-4 last:border-r-0">
        <FuriText :text="example.text" :size="36" />
        <span class="label">{{ example.label }}</span>
        <button type="button" class="focus-ring self-start font-mono text-xs color-muted hover:color-base" @click="copy(example.text)">
          {{ copied === example.text ? 'copied' : example.code }}
        </button>
      </li>
    </ul>
  </div>
</template>
