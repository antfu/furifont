<script setup lang="ts">
const { copied, copy } = useCopy()
const command = 'npx furifont dev'
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
    <div class="flex flex-col justify-center gap-3">
      <button type="button" class="focus-ring flex items-center justify-between border border-strong px-4 py-3 text-left font-mono text-sm" @click="copy(command)">
        <span>$ {{ command }}</span>
        <span :class="copied ? 'i-ph-check' : 'i-ph-copy'" class="color-muted" />
      </button>
      <i18n-t keypath="studio.offline.needs" tag="p" class="text-xs color-muted">
        <template #command>
          <code class="font-mono">pip install fonttools uharfbuzz brotli</code>
        </template>
      </i18n-t>
    </div>
  </div>
</template>
