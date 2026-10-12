<script setup lang="ts">
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
</script>

<template>
  <div class="min-h-screen bg-base font-sans color-base">
    <AppHeader />
    <main class="mx-auto max-w-6xl border-x border-base">
      <NuxtPage />
    </main>
    <AppFooter />
  </div>
</template>
