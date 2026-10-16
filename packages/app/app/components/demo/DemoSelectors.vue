<script setup lang="ts">
const VS = (n: number): string => String.fromCodePoint(0xE01E0 + n)

const examples = [
  { label: 'selectors.default', text: '市場', code: '市場' },
  { label: 'selectors.reading2', text: `市${VS(2)}場`, code: '市\\u{E01E2}場' },
  { label: 'selectors.default', text: '今日', code: '今日' },
  { label: 'selectors.reading2', text: `今${VS(2)}日`, code: '今\\u{E01E2}日' },
  { label: 'selectors.none', text: `今${VS(0)}日`, code: '今\\u{E01E0}日' },
] as const
const { copied, copy } = useCopy()
const { family, ruby } = useFontSettings()
</script>

<template>
  <div class="grid sm:grid-cols-[1fr_2fr] overflow-hidden">
    <div class="flex flex-col gap-4 border-b border-base p-6 sm:border-b-0 sm:border-r">
      <p class="text-sm lh-1.625 color-muted">
        {{ $t('selectors.body') }}
      </p>
      <UiButton to="/reference" icon="i-ph-list-magnifying-glass" class="self-start">
        {{ $t('selectors.lookUp') }}
      </UiButton>
    </div>
    <ul class="grid grid-cols-2 lg:grid-cols-5 -mb-px -mr-px">
      <li v-for="example in examples" :key="example.code" class="flex flex-col gap-2 border-b border-r border-base p-4 last:border-r-0">
        <FuriText :text="example.text" :family="family.family" :ruby :size="36" />
        <span class="label">{{ $t(example.label) }}</span>
        <button type="button" class="focus-ring self-start font-mono text-xs color-muted hover:color-base" @click="copy(example.text)">
          {{ copied === example.text ? $t('copied') : example.code }}
        </button>
      </li>
    </ul>
  </div>
</template>
