<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { config, state } = useStudio()

const scripts = computed(() => (['hiragana', 'katakanaOn', 'hepburn'] as const).map(value => ({ value, label: t(`studio.options.${value}`) })))
const tags = ['spec1', 'ichi1', 'news1', 'gai1'] as const

// The server sends a complete config, metrics included.
const metrics = computed(() => config.value.metrics ?? {})
const places = computed({
  get: () => config.value.places ?? true,
  set: value => config.value.places = value,
})
const rubyScript = computed({
  get: () => config.value.rubyScript ?? 'hiragana',
  set: value => config.value.rubyScript = value,
})

function toggleTag(tag: typeof tags[number]): void {
  const current = config.value.selectTags ?? ['spec1']
  config.value.selectTags = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
}
</script>

<template>
  <form class="flex flex-col gap-5 p-6" @submit.prevent>
    <UiField :label="$t('studio.options.family')">
      <input v-model="config.family" class="input" placeholder="Furifont Sans JP">
    </UiField>
    <UiField :label="$t('studio.options.base')" :hint="$t('studio.options.baseHint')">
      <input v-model="config.base" class="input" list="studio-weights" placeholder="Regular">
      <datalist id="studio-weights">
        <option v-for="w in state?.weights" :key="w" :value="w" />
      </datalist>
    </UiField>
    <UiField :label="$t('studio.options.script')">
      <UiSegmented v-model="rubyScript" :label="$t('studio.options.script')" :options="scripts" />
    </UiField>
    <div class="h-px bg-[var(--ff-line)]" />
    <UiField :label="$t('studio.options.nfMax')" :hint="$t('studio.options.nfMaxHint')">
      <input v-model.number="config.nfMax" type="number" min="1" max="48" class="input font-mono" placeholder="10">
    </UiField>
    <fieldset class="flex flex-col gap-2">
      <legend class="label mb-1.5">
        {{ $t('studio.options.tags') }}
      </legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="tag in tags"
          :key="tag"
          type="button"
          class="focus-ring border px-2 py-1 font-mono text-xs transition-colors"
          :class="(config.selectTags ?? ['spec1']).includes(tag) ? 'border-strong bg-inverse color-inverse' : 'border-base color-muted hover:border-strong'"
          :aria-pressed="(config.selectTags ?? ['spec1']).includes(tag)"
          @click="toggleTag(tag)"
        >
          {{ tag }}
        </button>
      </div>
    </fieldset>
    <UiToggle v-model="places">
      {{ $t('studio.options.places') }}
    </UiToggle>
    <UiField :label="$t('studio.options.share')" :hint="$t('studio.options.shareHint')">
      <input v-model.number="config.isolatedMinShare" type="number" min="0.5" max="1" step="0.05" class="input font-mono" placeholder="0.8">
    </UiField>
    <div class="h-px bg-[var(--ff-line)]" />
    <div class="grid grid-cols-2 gap-4">
      <UiField :label="$t('studio.options.rubyScale')">
        <input v-model.number="metrics.rubyScale" type="number" min="0.2" max="0.8" step="0.05" class="input font-mono" placeholder="0.4">
      </UiField>
      <UiField :label="$t('studio.options.rubyGap')">
        <input v-model.number="metrics.rubyGap" type="number" min="0" max="0.5" step="0.01" class="input font-mono" placeholder="0.05">
      </UiField>
      <UiField :label="$t('studio.options.squeeze')">
        <input v-model.number="metrics.compressionFloor" type="number" min="0.3" max="1" step="0.05" class="input font-mono" placeholder="0.6">
      </UiField>
      <UiField :label="$t('studio.options.maxWidth')">
        <input v-model.number="metrics.maxRubyWidth" type="number" min="1" max="3" step="0.1" class="input font-mono" placeholder="1.6">
      </UiField>
    </div>
  </form>
</template>
