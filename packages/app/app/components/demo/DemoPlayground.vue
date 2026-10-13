<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const text = ref('今日は日本語の勉強をします。\n明日は東京の大学へ行きます。\n私は毎朝新聞を読みます。桜が咲きました。')
const face = ref<Family['face']>('sans')
const script = ref<Family['script']>('hiragana')
// Every face comes in every script.
const family = computed(() => FAMILIES.find(f => f.face === face.value && f.script === script.value)!.family)
const ruby = ref(true)
const size = ref(30)
const { copied, copy } = useCopy()
const { reference } = useReadingReference()
const { annotate, loading } = useAnnotator(reference)

async function addSelectors(): Promise<void> {
  text.value = await annotate(text.value)
}

const faces = computed(() => (['sans', 'serif'] as const).map(value => ({ value, label: t(`faces.${value}`) })))
const scripts = computed(() => (['hiragana', 'hepburn'] as const).map(value => ({ value, label: t(`scripts.${value}`) })))
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
        <input v-model.number="size" type="range" min="16" max="64" class="accent-[var(--ff-fg)]">
      </UiField>
      <UiToggle v-model="ruby">
        {{ $t('playground.ruby') }} <span class="font-mono text-xs color-muted">{{ $t('playground.rubyNote') }}</span>
      </UiToggle>
      <p class="text-xs color-muted">
        {{ $t('playground.textHint') }}
      </p>
      <div class="flex flex-col gap-2 border-t border-base pt-5">
        <UiButton icon="i-ph-magic-wand" class="self-start" :disabled="loading || !reference" @click="addSelectors">
          {{ loading ? $t('playground.annotating') : $t('playground.annotate') }}
        </UiButton>
        <p class="text-xs leading-relaxed color-muted">
          {{ $t('playground.annotateHint') }}
        </p>
      </div>
    </div>
    <div class="flex min-w-0 flex-col">
      <div class="min-h-72 flex-1 px-6 py-8">
        <FuriText v-model:text="text" :family :ruby :size />
      </div>
      <div class="flex items-center gap-3 border-t border-base px-6 py-3">
        <UiButton variant="ghost" :icon="copied ? 'i-ph-check' : 'i-ph-copy'" @click="copy(text)">
          {{ copied ? $t('copied') : $t('playground.copy') }}
        </UiButton>
        <span class="text-xs color-muted">{{ $t('playground.pasteNote') }}</span>
      </div>
    </div>
  </div>
</template>
