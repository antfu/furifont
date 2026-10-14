<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { face, script, family, faces, scripts } = useFamilyPicker()
const okurigana = ref(true)
const bookmarklet = computed(() => {
  const toast = { message: t('anyPage.toast.message'), download: t('anyPage.toast.download'), close: t('anyPage.toast.close') } satisfies Toast
  // The page fetches the files itself, so the bookmarklet carries only where they are, and the code that reads them.
  const readings = okurigana.value ? `{readings:${JSON.stringify(siteReadingsUrl(family.value))},pairs:${JSON.stringify(SITE_PAIRS_URL)},reader:${createOkuriganaReader}}` : 'void 0'
  return `javascript:${encodeURIComponent(`void (${toggleFurifont})(${JSON.stringify(family.value)},${JSON.stringify(siteFontUrl(family.value))},${JSON.stringify(toast)},void 0,${readings})`)}`
})
const userscript = `${useRuntimeConfig().app.baseURL}furifont.user.js`
</script>

<template>
  <div class="grid lg:grid-cols-[340px_1fr]">
    <div class="flex flex-col gap-5 border-b border-base p-6 lg:border-b-0 lg:border-r">
      <p class="text-sm leading-relaxed color-muted">
        {{ $t('anyPage.body') }}
      </p>
      <UiField :label="$t('playground.script')">
        <UiSegmented v-model="script" :label="$t('playground.script')" :options="scripts" />
      </UiField>
      <UiField :label="$t('playground.face')">
        <UiSegmented v-model="face" :label="$t('playground.face')" :options="faces" />
      </UiField>
      <div class="flex flex-col gap-1.5">
        <UiToggle v-model="okurigana">
          {{ $t('anyPage.okurigana') }}
        </UiToggle>
        <p class="text-xs leading-relaxed color-muted">
          {{ $t('anyPage.okuriganaHint') }}
        </p>
      </div>
    </div>
    <div class="grid sm:grid-cols-2">
      <div class="flex flex-col gap-3 border-b border-base p-6 sm:border-b-0 sm:border-r">
        <span class="label">{{ $t('anyPage.bookmarklet') }}</span>
        <a :href="bookmarklet" class="btn-solid focus-ring self-start">
          <span class="i-ph-bookmark-simple" />
          {{ family.family }}
        </a>
        <p class="text-sm leading-relaxed color-muted">
          {{ $t('anyPage.bookmarkletHint') }}
        </p>
      </div>
      <div class="flex flex-col gap-3 p-6">
        <span class="label">{{ $t('anyPage.userscript') }}</span>
        <UiButton :href="userscript" icon="i-ph-puzzle-piece" class="self-start">
          {{ $t('anyPage.install') }}
        </UiButton>
        <p class="text-sm leading-relaxed color-muted">
          {{ $t('anyPage.userscriptHint') }}
        </p>
      </div>
    </div>
  </div>
</template>
