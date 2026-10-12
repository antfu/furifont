<script setup lang="ts">
function scrollToDownloads(): void {
  document.getElementById('downloads')?.scrollIntoView({ behavior: 'smooth' })
}
</script>

<template>
  <div>
    <DemoHero @download="scrollToDownloads" />
    <UiSection index="01" title="Try it">
      <DemoPlayground />
    </UiSection>
    <UiSection index="02" title="How it works">
      <DemoHowItWorks />
    </UiSection>
    <UiSection index="03" title="Choosing a reading">
      <DemoSelectors />
    </UiSection>
    <UiSection id="downloads" index="04" title="Download">
      <DemoDownloads />
    </UiSection>
  </div>
</template>
