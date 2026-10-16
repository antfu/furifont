<script setup lang="ts">
const { status, state } = provideCustomize()
const overviewOpen = ref(true)
const dictionaryOpen = ref(true)
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
        <UiSection index="01" :title="$t('customize.sections.preview')" class="border-t-0 bg-base lg:sticky lg:top-14 lg:z-1 lg:border-b">
          <CustomizePreview />
        </UiSection>
        <UiSection index="02" :title="$t('customize.sections.build')" class="lg:border-t-0">
          <CustomizeBuild />
        </UiSection>
        <UiSection v-model:open="overviewOpen" expandable index="03" :title="$t('customize.sections.overview')">
          <CustomizeOverview />
        </UiSection>
        <UiSection v-model:open="dictionaryOpen" expandable index="04" :title="$t('customize.sections.dictionary')">
          <CustomizeWords class="no-ruby" />
        </UiSection>
        <UiSection index="05" :title="$t('customize.sections.words')">
          <CustomizeCustomWords />
        </UiSection>
      </div>
    </div>
  </div>
</template>
