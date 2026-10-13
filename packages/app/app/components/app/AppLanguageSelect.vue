<script setup lang="ts">
const language = useLanguage()
</script>

<template>
  <label class="relative flex items-center">
    <span class="i-ph-translate pointer-events-none absolute left-2 text-sm color-muted" />
    <select
      v-model="language"
      :aria-label="$t('nav.language')"
      class="focus-ring no-ruby h-8 appearance-none rounded-none border border-base bg-base pl-7 pr-2 text-xs color-base transition-colors hover:border-strong"
    >
      <option v-for="l in LOCALES" :key="l.code" :value="l.code" :lang="l.code">
        {{ l.name }}
      </option>
    </select>
  </label>
</template>
