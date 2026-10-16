<script setup lang="ts">
const text = ref('今日は日本語の勉強をします。\n明日は東京の大学へ行きます。\n私は毎朝新聞を読みます。桜が咲きました。')
const { face, script, ruby, okurigana, family, faces, scripts } = useFontSettings()
const { reader } = useOkurigana(family)
const size = ref(30)
const weight = ref(400)
const { copied, copy } = useCopy()
</script>

<template>
  <div class="grid lg:grid-cols-[340px_1fr]">
    <div class="flex flex-col gap-5 border-b border-base p-6 lg:border-b-0 lg:border-r">
      <UiField :label="$t('playground.script')">
        <UiSegmented v-model="script" :label="$t('playground.script')" :options="scripts" />
      </UiField>
      <UiField :label="$t('playground.face')">
        <UiSegmented v-model="face" :label="$t('playground.face')" :options="faces" />
      </UiField>
      <UiField :label="$t('playground.size', { size })">
        <UiSlider v-model="size" :min="16" :max="64" />
      </UiField>
      <UiField :label="$t('playground.weight', { weight })">
        <UiSlider v-model="weight" :min="MIN_WEIGHT" :max="MAX_WEIGHT" :step="10" />
      </UiField>
      <UiToggle v-model="ruby">
        {{ $t('playground.ruby') }}
      </UiToggle>
      <div class="flex flex-col gap-1.5">
        <UiToggle v-model="okurigana">
          {{ $t('playground.okurigana') }}
        </UiToggle>
        <p class="text-xs lh-1.625 color-muted">
          {{ $t('playground.okuriganaHint') }}
        </p>
      </div>
    </div>
    <div class="flex min-w-0 flex-col">
      <div class="min-h-72 flex-1 px-6 py-8">
        <FuriText v-model:text="text" :family="family.family" :ruby :size :weight :okurigana="okurigana ? reader : undefined" />
      </div>
      <div class="flex items-center gap-3 border-t border-base px-6 py-3">
        <div class="text-xs color-muted">
          {{ $t('playground.textHint') }}
        </div>
        <div class="flex-auto" />
        <UiButton variant="ghost" :icon="copied ? 'i-ph-check' : 'i-ph-copy'" @click="copy(text)">
          {{ copied ? $t('copied') : $t('playground.copy') }}
        </UiButton>
      </div>
    </div>
  </div>
</template>
