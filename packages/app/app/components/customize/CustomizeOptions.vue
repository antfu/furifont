<script setup lang="ts">
import type { WordSource } from '@furifont/core'
import { DEFAULTS, JLPT_LEVELS, WORD_SOURCES } from '@furifont/core'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { config, state, report, reset } = useCustomize()

// Words by score, 1,000 a step, up to the words the sources offer; past the last step of `take`, every word.
const STEP = 1000
const ceil = (count: number): number => Math.ceil(count / STEP) * STEP
const maxWords = computed(() => ceil(report.value?.stats.candidates ?? 0) || 30_000)
const skip = computed({
  get: () => config.value.skip ?? DEFAULTS.plan.skip,
  set: value => config.value.skip = value,
})
const words = computed({
  get: () => typeof config.value.take === 'number' ? config.value.take : maxWords.value + STEP,
  set: value => config.value.take = value > maxWords.value ? undefined : value,
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
const kanaRomaji = computed({
  get: () => config.value.kanaRomaji ?? DEFAULTS.plan.kanaRomaji,
  set: value => config.value.kanaRomaji = value,
})
const share = computed({
  get: () => config.value.isolatedMinShare ?? DEFAULTS.plan.isolatedMinShare,
  set: value => config.value.isolatedMinShare = value,
})

const scripts = computed(() => (['hiragana', 'katakanaOn', 'hepburn'] as const).map(value => ({ value, label: t(`customize.options.${value}`) })))

// The server sends a complete config, metrics included.
const metrics = computed(() => config.value.metrics ?? {})
// Bounds match `RubyMetricsSchema` in @furifont/core.
const metricRanges = [
  { key: 'rubyScale', label: 'rubyScale', min: 0.2, max: 0.8, step: 0.05, digits: 2 },
  { key: 'rubyGap', label: 'rubyGap', min: 0, max: 0.5, step: 0.01, digits: 2 },
  { key: 'compressionFloor', label: 'squeeze', min: 0.3, max: 1, step: 0.05, digits: 2 },
  { key: 'maxRubyWidth', label: 'maxWidth', min: 1, max: 3, step: 0.1, digits: 1 },
] as const
const furiganaScript = computed({
  get: () => config.value.furiganaScript ?? 'hiragana',
  set: value => config.value.furiganaScript = value,
})

const isOn = (source: WordSource): boolean => (config.value.sources ?? WORD_SOURCES).includes(source)

function toggle(source: WordSource): void {
  const current = config.value.sources ?? [...WORD_SOURCES]
  config.value.sources = current.includes(source) ? current.filter(name => name !== source) : [...current, source]
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
      <UiSegmented v-model="furiganaScript" :label="$t('customize.options.script')" :options="scripts" />
    </UiField>
    <UiToggle v-if="furiganaScript === 'hepburn'" v-model="kanaRomaji">
      {{ $t('customize.options.kanaRomaji') }}
    </UiToggle>
    <div class="h-px bg-[var(--ff-line)]" />
    <!-- In the planner's order: the sources' words, those filtered out, then skip and take by score. -->
    <fieldset class="flex flex-col gap-2">
      <legend class="label mb-1.5">
        {{ $t('customize.options.sources') }}
      </legend>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="source in WORD_SOURCES"
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
    <UiRange
      v-model="jlpt"
      :label="$t('customize.options.jlpt')"
      :display="jlptLevels ?? $t('customize.options.none')"
      :hint="$t('customize.options.jlptHint')"
      :min="0"
      :max="JLPT_LEVELS.length"
    />
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
      v-model="skip"
      :label="$t('customize.options.skip')"
      :display="skip ? skip.toLocaleString('en') : $t('customize.options.none')"
      :hint="$t('customize.options.skipHint')"
      :min="0"
      :max="maxWords"
      :step="STEP"
    />
    <UiRange
      v-model="words"
      :label="$t('customize.options.words')"
      :display="words > maxWords ? $t('customize.options.all') : words.toLocaleString('en')"
      :hint="annotated === undefined ? undefined : $t('customize.options.wordsHint', { count: annotated.toLocaleString('en') })"
      :min="STEP"
      :max="maxWords + STEP"
      :step="STEP"
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
