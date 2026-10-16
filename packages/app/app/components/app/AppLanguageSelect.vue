<script setup lang="ts">
const language = useLanguage()
</script>

<template>
  <!-- An icon button; the native select over it, invisible, opens the list of languages. -->
  <label class="btn-ghost relative w-9 cursor-pointer px-0 focus-within:outline-2 focus-within:outline-[var(--ff-fg)] focus-within:outline-offset-2" :title="$t('nav.language')">
    <span class="i-ph-translate pointer-events-none" />
    <select
      v-model="language"
      :aria-label="$t('nav.language')"
      class="no-ruby absolute inset-0 size-full cursor-pointer appearance-none rounded-none opacity-0 outline-none"
    >
      <option v-for="l in LOCALES" :key="l.code" :value="l.code" :lang="l.code">
        {{ l.name }}
      </option>
    </select>
  </label>
</template>
