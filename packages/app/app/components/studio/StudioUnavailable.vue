<script setup lang="ts">
const { copied, copy } = useCopy()
const command = 'npx furifont dev'
</script>

<template>
  <div class="grid gap-8 px-6 py-16 lg:grid-cols-2">
    <div class="flex flex-col gap-4">
      <span class="label">Studio / offline</span>
      <h1 class="text-4xl font-semibold tracking-[-0.03em]">
        Build your own Furifont
      </h1>
      <p class="max-w-[52ch] text-[15px] leading-relaxed color-muted">
        The studio runs on your machine: it compiles fonts with Python and fontTools, which a static
        site cannot do. Start it in any folder and this page opens connected, with a live preview,
        the dictionary, and a build button. Builds land in <code class="font-mono">./fonts</code>.
      </p>
    </div>
    <div class="flex flex-col justify-center gap-3">
      <button type="button" class="focus-ring flex items-center justify-between border border-strong px-4 py-3 text-left font-mono text-sm" @click="copy(command)">
        <span>$ {{ command }}</span>
        <span :class="copied ? 'i-ph-check' : 'i-ph-copy'" class="color-muted" />
      </button>
      <p class="text-xs color-muted">
        Needs Node 22+ and Python 3.10+ with <code class="font-mono">pip install fonttools uharfbuzz brotli</code>.
      </p>
    </div>
  </div>
</template>
