<script setup lang="ts">
import { useI18n } from 'vue-i18n'

/** `nuxt dev` serves its own endpoint; built, the app posts to the site's, also from `furifont dev`, which serves none. */
const REPORT_URL = import.meta.dev ? '/api/report' : `${SITE}/api/report`

const { t, locale } = useI18n()
// What the visitor sees now: the typeface and ruby they chose on the site.
const { family: shownFamily, ruby } = useFontSettings()
const previewStyle = computed(() => ({
  fontFamily: `"${shownFamily.value.family}", sans-serif`,
  lineHeight: LINE_HEIGHT,
  fontFeatureSettings: ruby.value ? 'normal' : '"ss01"',
}))

const blankWord = () => ({ word: '', expected: '', shown: '', context: '' })
const words = ref([blankWord()])
const environment = reactive({ type: 'playground' as typeof REPORT_ENVIRONMENTS[number], url: '', app: '', os: '' })
const family = ref('')
const note = ref('')
// Kept for the next report.
const name = ref('')
const nickname = ref('')
const status = ref<'idle' | 'sending' | 'sent' | 'failed' | 'limited'>('idle')

const environments = computed(() => REPORT_ENVIRONMENTS.map(value => ({ value, label: t(`report.environments.${value}`) })))

/** The fields the form requires; the button stays clickable so the browser can point at what is missing. */
const ready = computed(() => words.value.every(w => w.word.trim() && w.expected.trim()))

async function send(): Promise<void> {
  status.value = 'sending'
  const body = {
    words: words.value,
    environment,
    family: family.value,
    version: VERSION,
    locale: locale.value,
    note: note.value,
    name: name.value,
    nickname: nickname.value,
  } satisfies ReportInput
  try {
    await $fetch(REPORT_URL, { method: 'POST', body })
    status.value = 'sent'
  }
  catch (error) {
    status.value = error instanceof Error && 'statusCode' in error && error.statusCode === 429 ? 'limited' : 'failed'
  }
}

function again(): void {
  words.value = [blankWord()]
  note.value = ''
  status.value = 'idle'
}
</script>

<template>
  <UiSection v-if="status === 'sent'">
    <div role="status" class="flex flex-col items-center gap-6 px-6 py-24 text-center">
      <span class="i-ph-check-circle-light text-7xl" aria-hidden="true" />
      <p class="display text-2xl font-semibold">
        {{ $t('report.sent') }}
      </p>
      <UiButton icon="i-ph-plus" @click="again">
        {{ $t('report.again') }}
      </UiButton>
    </div>
  </UiSection>
  <form v-else @submit.prevent="send">
    <UiSection index="01" :title="$t('report.sections.words', { count: words.length })">
      <div v-for="(item, i) in words" :key="i" class="grid border-b border-base sm:grid-cols-[1fr_16rem]">
        <div class="grid gap-4 p-6 sm:grid-cols-3">
          <UiField :label="$t('report.word')">
            <input v-model="item.word" required maxlength="32" lang="ja" placeholder="市場" class="input">
          </UiField>
          <UiField :label="$t('report.expected')">
            <input v-model="item.expected" required maxlength="64" lang="ja" placeholder="いちば" class="input">
          </UiField>
          <UiField :label="$t('report.shown')">
            <input v-model="item.shown" maxlength="64" lang="ja" placeholder="しじょう" class="input">
          </UiField>
          <div class="flex items-end gap-2 sm:col-span-3">
            <UiField :label="$t('report.context')" class="flex-1">
              <input v-model="item.context" maxlength="200" lang="ja" placeholder="駅前の市場で魚を買った。" class="input">
            </UiField>
            <button
              v-if="words.length > 1"
              type="button"
              class="btn-ghost focus-ring w-9 shrink-0 px-0"
              :aria-label="$t('report.remove', { word: item.word || i + 1 })"
              @click="words.splice(i, 1)"
            >
              <span class="i-ph-trash" />
            </button>
          </div>
        </div>
        <div class="flex flex-col gap-2 border-t border-base p-6 sm:border-l sm:border-t-0">
          <span class="label">{{ $t('report.preview') }}</span>
          <p lang="ja" class="break-words text-3xl" :style="previewStyle" aria-live="polite">
            {{ item.word || '市場' }}
          </p>
          <p v-if="item.context" lang="ja" class="break-words text-base" :style="previewStyle">
            {{ item.context }}
          </p>
        </div>
      </div>
      <div class="px-6 py-3">
        <UiButton variant="ghost" icon="i-ph-plus" :disabled="words.length >= MAX_REPORT_WORDS" @click="words.push(blankWord())">
          {{ $t('report.add') }}
        </UiButton>
      </div>
    </UiSection>
    <UiSection index="02" :title="$t('report.sections.environment')">
      <div class="grid gap-4 p-6 sm:grid-cols-2">
        <UiField :label="$t('report.environment')">
          <select v-model="environment.type" class="input">
            <option v-for="option in environments" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </UiField>
        <UiField :label="$t('report.family')">
          <select v-model="family" class="input">
            <option value="">
              {{ $t('report.familyAny') }}
            </option>
            <template v-for="f in FAMILIES" :key="f.family">
              <option v-for="build in ['Regular', 'VF']" :key="build" :value="`${f.family} ${build}`">
                {{ f.family }} {{ build }}
              </option>
            </template>
          </select>
        </UiField>
        <UiField v-if="environment.type === 'website'" :label="$t('report.url')">
          <input v-model="environment.url" type="url" maxlength="500" placeholder="https://" class="input">
        </UiField>
        <UiField v-if="environment.type === 'desktop' || environment.type === 'mobile'" :label="$t('report.app')">
          <input v-model="environment.app" maxlength="100" :placeholder="$t(`report.appPlaceholder.${environment.type}`)" class="input">
        </UiField>
        <UiField :label="$t('report.os')">
          <input v-model="environment.os" maxlength="100" placeholder="macOS 26, Windows 11, iOS 26" class="input">
        </UiField>
      </div>
    </UiSection>
    <UiSection index="03" :title="$t('report.sections.note')">
      <div class="flex flex-col gap-4 p-6">
        <textarea v-model="note" maxlength="2000" rows="4" :placeholder="$t('report.notePlaceholder')" :aria-label="$t('report.sections.note')" class="input resize-y" />
        <UiField :label="$t('report.name')" :hint="$t('report.nameHint')">
          <input v-model="name" maxlength="100" autocomplete="nickname" class="input">
        </UiField>
        <input v-model="nickname" name="nickname" tabindex="-1" autocomplete="off" aria-hidden="true" class="sr-only">
        <div class="flex flex-wrap items-center gap-4">
          <button type="submit" class="focus-ring" :class="ready ? 'btn-solid' : 'btn-outline'" :disabled="status === 'sending'">
            <span class="i-ph-paper-plane-tilt" />
            {{ status === 'sending' ? $t('report.sending') : $t('report.send') }}
          </button>
          <p v-if="status === 'failed' || status === 'limited'" role="alert" class="text-xs color-muted">
            {{ $t(`report.${status}`) }}
          </p>
          <p class="text-xs color-muted">
            {{ $t('report.privacy') }}
          </p>
        </div>
      </div>
    </UiSection>
  </form>
</template>
