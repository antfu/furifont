<script setup lang="ts">
import { DEFAULTS, JLPT_LEVELS } from '@furifont/core'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { config, state, report, reset } = useCustomize()

// Newspaper frequency buckets of 500 words each, nf01 to nf48.
const BUCKET = 500
const BUCKETS = 48
const nfMin = computed(() => config.value.nfMin ?? DEFAULTS.plan.nfMin)
const nfMax = computed(() => config.value.nfMax ?? DEFAULTS.plan.nfMax)
/** Moving the skip slides the window of words; past the last bucket, the window shrinks. */
const skip = computed({
  get: () => (nfMin.value - 1) * BUCKET,
  set: (value) => {
    const width = nfMax.value - nfMin.value
    config.value.nfMin = value / BUCKET + 1
    config.value.nfMax = Math.min(BUCKETS, config.value.nfMin + width)
  },
})
const words = computed({
  get: () => (nfMax.value - nfMin.value + 1) * BUCKET,
  set: value => config.value.nfMax = nfMin.value + value / BUCKET - 1,
})
const annotated = computed(() => report.value && report.value.stats.patterns - report.value.stats.places)
const jlpt = computed({
  get: () => config.value.skipJlpt ? JLPT_LEVELS.indexOf(config.value.skipJlpt) + 1 : 0,
  set: (value) => {
    config.value.skipJlpt = JLPT_LEVELS[value - 1]
  },
})
const jlptLevels = computed(() => jlpt.value > 1 ? `N5–${JLPT_LEVELS[jlpt.value - 1]}` : JLPT_LEVELS[jlpt.value - 1])
const isolated = computed({
  get: () => config.value.isolated ?? DEFAULTS.plan.isolated,
  set: value => config.value.isolated = value,
})
const share = computed({
  get: () => config.value.isolatedMinShare ?? DEFAULTS.plan.isolatedMinShare,
  set: value => config.value.isolatedMinShare = value,
})

const scripts = computed(() => (['hiragana', 'katakanaOn', 'hepburn'] as const).map(value => ({ value, label: t(`customize.options.${value}`) })))
// JMdict priority tags, Tatoeba's sentences and the JMnedict place names: each is a source of words.
const sources = ['spec1', 'ichi1', 'news1', 'gai1', 'examples', 'places'] as const
type Source = typeof sources[number]

// The server sends a complete config, metrics included.
const metrics = computed(() => config.value.metrics ?? {})
// Bounds match `RubyMetricsSchema` in @furifont/core.
const metricRanges = [
  { key: 'rubyScale', label: 'rubyScale', min: 0.2, max: 0.8, step: 0.05, digits: 2 },
  { key: 'rubyGap', label: 'rubyGap', min: 0, max: 0.5, step: 0.01, digits: 2 },
  { key: 'compressionFloor', label: 'squeeze', min: 0.3, max: 1, step: 0.05, digits: 2 },
  { key: 'maxRubyWidth', label: 'maxWidth', min: 1, max: 3, step: 0.1, digits: 1 },
] as const
const rubyScript = computed({
  get: () => config.value.rubyScript ?? 'hiragana',
  set: value => config.value.rubyScript = value,
})

function isOn(source: Source): boolean {
  if (source === 'examples')
    return (config.value.minExamples ?? DEFAULTS.plan.minExamples) > 0
  return source === 'places' ? config.value.places ?? true : (config.value.selectTags ?? ['spec1']).includes(source)
}

function toggle(source: Source): void {
  if (source === 'examples') {
    config.value.minExamples = isOn(source) ? 0 : DEFAULTS.plan.minExamples
    return
  }
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
    <UiField :label="$t('customize.options.family')">
      <input v-model="config.family" class="input" :placeholder="DEFAULTS.plan.family">
    </UiField>
    <UiField :label="$t('customize.options.base')" :hint="$t('customize.options.baseHint')">
      <input v-model="config.base" class="input" list="customize-base-fonts" :placeholder="DEFAULTS.build.base">
      <datalist id="customize-base-fonts">
        <option v-for="name in state?.baseFonts" :key="name" :value="name" />
      </datalist>
    </UiField>
    <UiField :label="$t('customize.options.script')">
      <UiSegmented v-model="rubyScript" :label="$t('customize.options.script')" :options="scripts" />
    </UiField>
    <div class="h-px bg-[var(--ff-line)]" />
    <UiRange
      v-model="skip"
      :label="$t('customize.options.skip')"
      :display="skip ? skip.toLocaleString('en') : $t('customize.options.none')"
      :hint="$t('customize.options.skipHint')"
      :min="0"
      :max="(BUCKETS - 1) * BUCKET"
      :step="BUCKET"
    />
    <UiRange
      v-model="words"
      :label="$t('customize.options.words')"
      :display="words.toLocaleString('en')"
      :hint="annotated === undefined ? undefined : $t('customize.options.wordsHint', { count: annotated.toLocaleString('en') })"
      :min="BUCKET"
      :max="(BUCKETS - nfMin + 1) * BUCKET"
      :step="BUCKET"
    />
    <UiRange
      v-model="jlpt"
      :label="$t('customize.options.jlpt')"
      :display="jlptLevels ?? $t('customize.options.none')"
      :hint="$t('customize.options.jlptHint')"
      :min="0"
      :max="JLPT_LEVELS.length"
    />
    <fieldset class="flex flex-col gap-2">
      <legend class="label mb-1.5">
        {{ $t('customize.options.sources') }}
      </legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="source in sources"
          :key="source"
          type="button"
          class="focus-ring border px-2 py-1 text-xs transition-colors"
          :class="isOn(source) ? 'border-inverse bg-inverse color-inverse' : 'border-base color-muted hover:border-strong'"
          :title="$t(`customize.options.source.${source}.hint`)"
          :aria-pressed="isOn(source)"
          @click="toggle(source)"
        >
          {{ $t(`customize.options.source.${source}.name`) }}
        </button>
      </div>
    </fieldset>
    <UiToggle v-model="isolated">
      {{ $t('customize.options.isolated') }}
    </UiToggle>
    <UiRange
      v-model="share"
      :label="$t('customize.options.share')"
      :display="share.toFixed(2)"
      :hint="$t('customize.options.shareHint')"
      :min="0.5"
      :max="1"
      :step="0.05"
      :disabled="!isolated"
    />
    <div class="h-px bg-[var(--ff-line)]" />
    <UiRange
      v-for="range in metricRanges"
      :key="range.key"
      :model-value="metrics[range.key] ?? DEFAULTS.plan.metrics[range.key]"
      :label="$t(`customize.options.${range.label}`)"
      :display="(metrics[range.key] ?? DEFAULTS.plan.metrics[range.key]).toFixed(range.digits)"
      :min="range.min"
      :max="range.max"
      :step="range.step"
      @update:model-value="metrics[range.key] = $event"
    />
    <UiButton variant="ghost" icon="i-ph-arrow-counter-clockwise" class="self-start" :title="$t('customize.options.resetHint')" @click="reset">
      {{ $t('customize.options.reset') }}
    </UiButton>
  </form>
</template>
