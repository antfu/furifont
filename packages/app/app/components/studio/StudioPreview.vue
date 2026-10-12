<script setup lang="ts">
const { text, preview } = useStudio()
const size = ref(32)
</script>

<template>
  <div>
    <div class="min-h-56 px-6 py-8" :class="preview.loading && 'opacity-60 transition-opacity'">
      <p v-if="preview.error" class="font-mono text-xs">
        {{ preview.error }}
      </p>
      <FuriText v-else-if="preview.family" :text :family="preview.family" :size />
      <p v-else class="label">
        Compiling a preview
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-4 border-t border-base px-6 py-3">
      <textarea v-model="text" rows="2" lang="ja" aria-label="Preview text" class="input min-w-64 flex-1 resize-y" />
      <input v-model.number="size" type="range" min="16" max="64" aria-label="Preview size" class="w-28 accent-[var(--ff-fg)]">
      <span class="font-mono text-xs color-muted tabular-nums">
        {{ preview.ms === undefined ? '' : `${preview.glyphs} glyphs / ${preview.ms} ms` }}
      </span>
    </div>
  </div>
</template>
