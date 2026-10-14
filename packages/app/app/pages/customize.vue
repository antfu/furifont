<script setup lang="ts">
const { status, state } = provideCustomize()
</script>

<template>
  <div>
    <p v-if="status === 'connecting'" class="label px-6 py-24 text-center">
      {{ $t('customize.connecting') }}
    </p>
    <CustomizeUnavailable v-else-if="status === 'unavailable'" />
    <CustomizeAuth v-else-if="status === 'locked'" />
    <div v-else class="grid lg:grid-cols-[340px_1fr]">
      <aside class="border-b border-base lg:border-b-0 lg:border-r">
        <div class="flex items-baseline justify-between border-b border-base px-6 py-3">
          <h1 class="label color-base">
            {{ $t('customize.title') }}
          </h1>
          <span class="font-mono text-[11px] color-muted">{{ state?.sources.JMdict }}</span>
        </div>
        <CustomizeOptions />
      </aside>
      <div class="min-w-0">
        <UiSection index="01" :title="$t('customize.sections.preview')" class="border-t-0">
          <CustomizePreview />
        </UiSection>
        <UiSection index="02" :title="$t('customize.sections.build')">
          <CustomizeBuild />
        </UiSection>
        <UiSection index="03" :title="$t('customize.sections.dictionary')">
          <CustomizeWords />
        </UiSection>
        <UiSection index="04" :title="$t('customize.sections.words')">
          <CustomizeCustomWords />
        </UiSection>
      </div>
    </div>
  </div>
</template>
