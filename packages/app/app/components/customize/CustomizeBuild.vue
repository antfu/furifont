<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { config, report, estimate, build, savedTo, runBuild, save } = useCustomize()

const megabytes = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(2)} MB`

type FontFormat = typeof FONT_FORMATS[number]
const formats = computed(() => config.value.formats ?? FONT_FORMATS)
/** A build writes at least one font: the last one left stays on. */
function toggleFormat(format: FontFormat): void {
  config.value.formats = FONT_FORMATS.filter(f => f === format ? !formats.value.includes(f) : formats.value.includes(f))
}
const sizes = computed(() => {
  const size = estimate.size
  return size && (['woff2', 'otf'] as const)
    .filter(f => formats.value.includes(f))
    .map(f => t(`customize.build.estimate.${f}`, { size: megabytes(size[f]) }))
    .join(' · ')
})

const stats = computed(() => {
  const s = report.value?.stats
  return s
    ? [
        { label: t('customize.build.words'), value: s.patterns - s.places },
        { label: t('customize.build.places'), value: s.places },
        { label: t('customize.build.ambiguous'), value: s.ambiguous },
        { label: t('customize.build.lone'), value: s.isolated },
        { label: t('customize.build.protected'), value: s.protectedAnnotated + s.protectedBare },
        { label: t('customize.build.glyphs'), value: s.glyphs },
        { label: t('customize.build.rules'), value: s.rules },
      ]
    : []
})
const progress = computed(() => build.total ? `${build.step} ${build.done}/${build.total}` : build.step)
</script>

<template>
  <div>
    <div class="grid grid-cols-3 border-b border-base lg:grid-cols-7">
      <UiStat v-for="s in stats" :key="s.label" v-bind="s" class="border-r border-base last:border-r-0" />
      <span v-if="!stats.length" class="label col-span-full px-6 py-4">{{ $t('customize.build.planning') }}</span>
    </div>
    <p v-if="sizes || estimate.loading" class="flex flex-wrap gap-3 px-6 pt-4 font-mono text-xs color-muted tabular-nums">
      <span v-if="sizes">{{ sizes }}</span>
      <span v-if="estimate.loading">{{ $t('customize.build.estimating') }}</span>
    </p>
    <div class="flex flex-wrap items-center gap-3 px-6 py-4">
      <div role="group" :aria-label="$t('customize.build.formats')" class="flex gap-2">
        <button
          v-for="format in FONT_FORMATS"
          :key="format"
          type="button"
          class="focus-ring border px-2 py-1 font-mono text-xs transition-colors disabled:cursor-not-allowed"
          :class="formats.includes(format) ? 'border-strong bg-inverse color-inverse' : 'border-base color-muted hover:border-strong'"
          :aria-pressed="formats.includes(format)"
          :disabled="build.running || (formats.length === 1 && formats.includes(format))"
          @click="toggleFormat(format)"
        >
          .{{ format }}
        </button>
      </div>
      <button type="button" class="btn-solid focus-ring" :disabled="build.running" @click="runBuild">
        <span :class="build.running ? 'i-ph-circle-notch animate-spin' : 'i-ph-hammer'" />
        {{ build.running ? progress : $t('customize.build.run') }}
      </button>
      <button type="button" class="btn-outline focus-ring" @click="save">
        <span class="i-ph-floppy-disk" />
        {{ $t('customize.build.save') }}
      </button>
      <span v-if="savedTo" class="font-mono text-xs color-muted">{{ savedTo }}</span>
    </div>
    <p v-if="build.error" class="border-t border-base px-6 py-3 font-mono text-xs">
      {{ build.error }}
    </p>
    <ul v-if="build.files.length" class="border-t border-base">
      <li v-for="file in build.files" :key="file.name" class="flex items-center gap-4 border-b border-base px-6 py-2 last:border-b-0">
        <a :href="file.url" download class="focus-ring font-mono text-sm underline underline-offset-3">{{ file.name }}</a>
        <span class="font-mono text-xs color-muted tabular-nums">{{ megabytes(file.bytes) }}</span>
      </li>
    </ul>
  </div>
</template>
