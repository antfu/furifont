<script setup lang="ts">
const link = 'underline underline-offset-3 hover:color-base'
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
        <a class="inline-flex items-center gap-1.5 hover:color-base" :href="REPOSITORY" target="_blank" rel="noopener">
          <span class="i-ph-github-logo" />
          {{ $t('footer.source') }}
        </a>
      </div>
      <div class="flex flex-col gap-3 border-t border-base px-6 py-5">
        <i18n-t keypath="footer.fonts" tag="p">
          <template #license>
            <a :class="link" href="https://openfontlicense.org" target="_blank" rel="noopener">SIL Open Font License</a>
          </template>
        </i18n-t>
        <p>{{ $t('footer.data') }}</p>
        <p>
          {{ $t('footer.code') }}
        </p>
      </div>
    </div>
  </footer>
</template>
