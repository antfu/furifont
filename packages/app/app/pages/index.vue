<script setup lang="ts">
function scrollToDownloads(): void {
  document.getElementById('downloads')?.scrollIntoView({ behavior: 'smooth' })
}

// The bookmarklet's and the userscript's toasts link here; the page renders after the browser looks for the hash.
const route = useRoute()
onMounted(() => {
  if (route.hash)
    document.getElementById(route.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
})
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
    <p class="flex items-center gap-2 border-t border-base px-6 py-3 text-center text-xs color-muted bg-amber:5">
      <span class="i-ph-warning shrink-0 text-base text-amber" aria-hidden="true" />
      {{ $t('notice') }}
    </p>
    <UiSection id="downloads" index="04" :title="$t('sections.download')">
      <DemoDownloads />
    </UiSection>
    <UiSection id="any-page" index="05" :title="$t('sections.anyPage')">
      <DemoAnyPage />
    </UiSection>
  </div>
</template>
