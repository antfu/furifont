<script setup lang="ts">
const { status, state } = provideStudio()
</script>

<template>
  <div>
    <p v-if="status === 'connecting'" class="label px-6 py-24 text-center">
      {{ $t('studio.connecting') }}
    </p>
    <StudioUnavailable v-else-if="status === 'unavailable'" />
    <StudioAuth v-else-if="status === 'locked'" />
    <div v-else class="grid lg:grid-cols-[340px_1fr]">
      <aside class="border-b border-base lg:border-b-0 lg:border-r">
        <div class="flex items-baseline justify-between border-b border-base px-6 py-3">
          <h1 class="label color-base">
            {{ $t('studio.title') }}
          </h1>
          <span class="font-mono text-[11px] color-muted">{{ state?.sources.JMdict }}</span>
        </div>
        <StudioOptions />
      </aside>
      <div class="min-w-0">
        <UiSection index="01" :title="$t('studio.sections.preview')" class="border-t-0">
          <StudioPreview />
        </UiSection>
        <UiSection index="02" :title="$t('studio.sections.build')">
          <StudioBuild />
        </UiSection>
        <UiSection index="03" :title="$t('studio.sections.dictionary')">
          <StudioWords />
        </UiSection>
        <UiSection index="04" :title="$t('studio.sections.words')">
          <StudioCustomWords />
        </UiSection>
      </div>
    </div>
  </div>
</template>
