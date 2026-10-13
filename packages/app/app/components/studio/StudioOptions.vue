<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { config, state } = useStudio()

const scripts = computed(() => (['hiragana', 'katakanaOn', 'hepburn'] as const).map(value => ({ value, label: t(`studio.options.${value}`) })))
// JMdict priority tags, plus the JMnedict place names: each is a source of words.
const sources = ['spec1', 'ichi1', 'news1', 'gai1', 'places'] as const
type Source = typeof sources[number]

// The server sends a complete config, metrics included.
const metrics = computed(() => config.value.metrics ?? {})
const rubyScript = computed({
  get: () => config.value.rubyScript ?? 'hiragana',
  set: value => config.value.rubyScript = value,
})

function isOn(source: Source): boolean {
  return source === 'places' ? config.value.places ?? true : (config.value.selectTags ?? ['spec1']).includes(source)
}

function toggle(source: Source): void {
  if (source === 'places') {
    config.value.places = !isOn(source)
    return
  }
  const current = config.value.selectTags ?? ['spec1']
  config.value.selectTags = current.includes(source) ? current.filter(t => t !== source) : [...current, source]
}
</script>

<template>
  <form class="flex flex-col gap-5 p-6" @submit.prevent>
    <UiField :label="$t('studio.options.family')">
      <input v-model="config.family" class="input" placeholder="Furifont Sans JP">
    </UiField>
    <UiField :label="$t('studio.options.base')" :hint="$t('studio.options.baseHint')">
      <input v-model="config.base" class="input" list="studio-base-fonts" placeholder="Source Han Sans JP Regular">
      <datalist id="studio-base-fonts">
        <option v-for="name in state?.baseFonts" :key="name" :value="name" />
      </datalist>
    </UiField>
    <UiField :label="$t('studio.options.script')">
      <UiSegmented v-model="rubyScript" :label="$t('studio.options.script')" :options="scripts" />
    </UiField>
    <div class="h-px bg-[var(--ff-line)]" />
    <UiField :label="$t('studio.options.nfMax')" :hint="$t('studio.options.nfMaxHint')">
      <input v-model.number="config.nfMax" type="number" min="1" max="48" class="input font-mono" placeholder="30">
    </UiField>
    <fieldset class="flex flex-col gap-2">
      <legend class="label mb-1.5">
        {{ $t('studio.options.sources') }}
      </legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="source in sources"
          :key="source"
          type="button"
          class="focus-ring border px-2 py-1 text-xs transition-colors"
          :class="isOn(source) ? 'border-strong bg-inverse color-inverse' : 'border-base color-muted hover:border-strong'"
          :title="$t(`studio.options.source.${source}.hint`)"
          :aria-pressed="isOn(source)"
          @click="toggle(source)"
        >
          {{ $t(`studio.options.source.${source}.name`) }}
        </button>
      </div>
    </fieldset>
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
