<script setup lang="ts">
const { copied, copy } = useCopy()
const command = 'npx furifont dev'
</script>

<template>
  <div class="grid gap-8 px-6 py-16 lg:grid-cols-2">
    <div class="flex flex-col gap-4">
      <span class="label">{{ $t('customize.offline.eyebrow') }}</span>
      <h1 class="display text-4xl font-semibold">
        {{ $t('customize.offline.title') }}
      </h1>
      <i18n-t keypath="customize.offline.body" tag="p" class="max-w-[52ch] text-[15px] lh-1.625 color-muted">
        <template #folder>
          <code class="font-mono">./fonts</code>
        </template>
      </i18n-t>
    </div>
    <div class="flex flex-col justify-center gap-5">
      <p class="text-xs color-muted">
        {{ $t('customize.offline.needs') }}
      </p>
      <div class="flex flex-col gap-2">
        <span class="label">{{ $t('customize.offline.run') }}</span>
        <button type="button" class="focus-ring flex items-center justify-between gap-3 border border-strong px-4 py-3 text-left font-mono text-sm" @click="copy(command)">
          <span class="break-all">$ {{ command }}</span>
          <span :class="copied === command ? 'i-ph-check' : 'i-ph-copy'" class="shrink-0 color-muted" />
        </button>
      </div>
    </div>
  </div>
</template>
