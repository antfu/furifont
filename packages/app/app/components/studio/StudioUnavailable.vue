<script setup lang="ts">
const { copied, copy } = useCopy()
const steps = [
  { label: 'studio.offline.install', command: 'python3 -m pip install fonttools uharfbuzz brotli' },
  { label: 'studio.offline.run', command: 'npx furifont dev' },
] as const
</script>

<template>
  <div class="grid gap-8 px-6 py-16 lg:grid-cols-2">
    <div class="flex flex-col gap-4">
      <span class="label">{{ $t('studio.offline.eyebrow') }}</span>
      <h1 class="display text-4xl font-semibold">
        {{ $t('studio.offline.title') }}
      </h1>
      <i18n-t keypath="studio.offline.body" tag="p" class="max-w-[52ch] text-[15px] leading-relaxed color-muted">
        <template #folder>
          <code class="font-mono">./fonts</code>
        </template>
      </i18n-t>
    </div>
    <div class="flex flex-col justify-center gap-5">
      <p class="text-xs color-muted">
        {{ $t('studio.offline.needs') }}
      </p>
      <div v-for="step in steps" :key="step.command" class="flex flex-col gap-2">
        <span class="label">{{ $t(step.label) }}</span>
        <button type="button" class="focus-ring flex items-center justify-between gap-3 border border-strong px-4 py-3 text-left font-mono text-sm" @click="copy(step.command)">
          <span class="break-all">$ {{ step.command }}</span>
          <span :class="copied === step.command ? 'i-ph-check' : 'i-ph-copy'" class="shrink-0 color-muted" />
        </button>
      </div>
      <p class="text-xs color-muted">
        {{ $t('studio.offline.venv') }}
      </p>
    </div>
  </div>
</template>
