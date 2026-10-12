<script setup lang="ts">
const { report, build, state, savedTo, runBuild, save } = useStudio()

const stats = computed(() => {
  const s = report.value?.stats
  return s
    ? [
        { label: 'Words', value: s.patterns },
        { label: 'Several readings', value: s.ambiguous },
        { label: 'Lone kanji', value: s.isolated },
        { label: 'Protected', value: s.protectedAnnotated + s.protectedBare },
        { label: 'Ruby glyphs', value: s.glyphs },
        { label: 'Rules', value: s.rules },
      ]
    : []
})
const progress = computed(() => build.total ? `${build.step} ${build.done}/${build.total}` : build.step)
</script>

<template>
  <div>
    <div class="grid grid-cols-3 border-b border-base lg:grid-cols-6">
      <UiStat v-for="s in stats" :key="s.label" v-bind="s" class="border-r border-base last:border-r-0" />
      <span v-if="!stats.length" class="label col-span-full px-6 py-4">Planning</span>
    </div>
    <div class="flex flex-wrap items-center gap-3 px-6 py-4">
      <button type="button" class="btn-solid focus-ring" :disabled="build.running || !state?.python.ok" @click="runBuild">
        <span :class="build.running ? 'i-ph-circle-notch animate-spin' : 'i-ph-hammer'" />
        {{ build.running ? progress : 'Build font' }}
      </button>
      <button type="button" class="btn-outline focus-ring" @click="save">
        <span class="i-ph-floppy-disk" />
        Save config
      </button>
      <span v-if="savedTo" class="font-mono text-xs color-muted">{{ savedTo }}</span>
    </div>
    <p v-if="state && !state.python.ok" class="border-t border-base px-6 py-3 font-mono text-xs">
      {{ state.python.message }}
    </p>
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
