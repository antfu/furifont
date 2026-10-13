<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { report, build, savedTo, runBuild, save } = useStudio()

const stats = computed(() => {
  const s = report.value?.stats
  return s
    ? [
        { label: t('studio.build.words'), value: s.patterns - s.places },
        { label: t('studio.build.places'), value: s.places },
        { label: t('studio.build.ambiguous'), value: s.ambiguous },
        { label: t('studio.build.lone'), value: s.isolated },
        { label: t('studio.build.protected'), value: s.protectedAnnotated + s.protectedBare },
        { label: t('studio.build.glyphs'), value: s.glyphs },
        { label: t('studio.build.rules'), value: s.rules },
      ]
    : []
})
const progress = computed(() => build.total ? `${build.step} ${build.done}/${build.total}` : build.step)
</script>

<template>
  <div>
    <div class="grid grid-cols-3 border-b border-base lg:grid-cols-7">
      <UiStat v-for="s in stats" :key="s.label" v-bind="s" class="border-r border-base last:border-r-0" />
      <span v-if="!stats.length" class="label col-span-full px-6 py-4">{{ $t('studio.build.planning') }}</span>
    </div>
    <div class="flex flex-wrap items-center gap-3 px-6 py-4">
      <button type="button" class="btn-solid focus-ring" :disabled="build.running" @click="runBuild">
        <span :class="build.running ? 'i-ph-circle-notch animate-spin' : 'i-ph-hammer'" />
        {{ build.running ? progress : $t('studio.build.run') }}
      </button>
      <button type="button" class="btn-outline focus-ring" @click="save">
        <span class="i-ph-floppy-disk" />
        {{ $t('studio.build.save') }}
      </button>
      <span v-if="savedTo" class="font-mono text-xs color-muted">{{ savedTo }}</span>
    </div>
    <p v-if="build.error" class="border-t border-base px-6 py-3 font-mono text-xs">
      {{ build.error }}
    </p>
    <ul v-if="build.files.length" class="border-t border-base">
      <li v-for="file in build.files" :key="file.name" class="flex items-center gap-4 border-b border-base px-6 py-2 last:border-b-0">
        <a :href="file.url" download class="focus-ring font-mono text-sm underline underline-offset-3">{{ file.name }}</a>
        <span class="font-mono text-xs color-muted tabular-nums">{{ (file.bytes / 1024 / 1024).toFixed(2) }} MB</span>
      </li>
    </ul>
  </div>
</template>
