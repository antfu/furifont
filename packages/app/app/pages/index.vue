<script setup lang="ts">
function scrollToDownloads(): void {
  document.getElementById('downloads')?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <div>
    <DemoHero @download="scrollToDownloads" />
    <UiSection index="01" :title="$t('sections.try')">
      <DemoPlayground />
    </UiSection>
    <UiSection index="02" :title="$t('sections.how')">
      <DemoHowItWorks />
    </UiSection>
    <UiSection index="03" :title="$t('sections.selectors')">
      <DemoSelectors />
    </UiSection>
    <UiSection id="downloads" index="04" :title="$t('sections.download')">
      <DemoDownloads />
    </UiSection>
    <UiSection index="05" :title="$t('sections.anyPage')">
      <DemoAnyPage />
    </UiSection>
  </div>
</template>
