<script setup lang="ts">
const link = 'underline underline-offset-3 hover:color-base'
const sources = {
  jmdict: ['JMdict', 'https://www.edrdg.org/jmdict/j_jmdict.html'],
  jmnedict: ['JMnedict', 'https://www.edrdg.org/enamdict/enamdict_doc.html'],
  kanjidic: ['KANJIDIC2', 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project'],
  furigana: ['JmdictFurigana', 'https://github.com/Doublevil/JmdictFurigana'],
  japanpost: ['Japan Post', 'https://www.post.japanpost.jp/zipcode/download.html'],
  desktoptetsu: ['Desktop Tetsu', 'https://www.desktoptetsu.com/quiz/jr-stations.htm'],
} as const
</script>

<template>
  <footer class="border-t border-base text-xs color-muted">
    <div class="relative mx-auto max-w-6xl border-x border-base">
      <UiCross class="-left-[6px] -top-[6px]" />
      <UiCross class="-right-[6px] -top-[6px]" />
      <div class="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-5">
        <p class="flex flex-wrap items-center gap-x-2">
          <i18n-t keypath="footer.made" tag="span">
            <template #author>
              <a :class="link" href="https://github.com/antfu" target="_blank" rel="noopener">@antfu</a>
            </template>
          </i18n-t>
          <span aria-hidden="true">·</span>
          <i18n-t keypath="footer.supported" tag="span">
            <template #vercel>
              <a :class="link" href="https://vercel.com" target="_blank" rel="noopener">▲ Vercel</a>
            </template>
            <template #sponsors>
              <a :class="link" href="https://github.com/sponsors/antfu" target="_blank" rel="noopener">{{ $t('footer.sponsors') }}</a>
            </template>
          </i18n-t>
        </p>
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
          <NuxtLink to="/report" class="inline-flex items-center gap-1.5 hover:color-base">
            <span class="i-ph-flag" />
            {{ $t('footer.report') }}
          </NuxtLink>
          <a class="inline-flex items-center gap-1.5 hover:color-base" :href="REPOSITORY" target="_blank" rel="noopener">
            <span class="i-ph-github-logo" />
            {{ $t('footer.source') }}
          </a>
        </div>
      </div>
      <div class="flex flex-col gap-3 border-t border-base px-6 py-5">
        <i18n-t keypath="footer.fonts" tag="p">
          <template #license>
            <a :class="link" href="https://openfontlicense.org" target="_blank" rel="noopener">SIL Open Font License</a>
          </template>
        </i18n-t>
        <i18n-t keypath="footer.data" tag="p">
          <template v-for="(source, name) in sources" :key="name" #[name]>
            <a :class="link" :href="source[1]" target="_blank" rel="noopener">{{ source[0] }}</a>
          </template>
        </i18n-t>
        <p>
          {{ $t('footer.code') }}
        </p>
      </div>
    </div>
  </footer>
</template>
