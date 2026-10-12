<template>
  <footer class="border-t border-base">
    <div class="relative mx-auto grid max-w-6xl gap-6 border-x border-base px-6 py-8 text-xs color-muted sm:grid-cols-3">
      <UiCross class="-left-[6px] -top-[6px]" />
      <UiCross class="-right-[6px] -top-[6px]" />
      <i18n-t keypath="footer.fonts" tag="p">
        <template #license>
          <a class="underline underline-offset-3 hover:color-base" href="https://openfontlicense.org" target="_blank" rel="noopener">SIL Open Font License</a>
        </template>
      </i18n-t>
      <p>{{ $t('footer.data') }}</p>
      <i18n-t keypath="footer.code" tag="p" class="sm:text-right">
        <template #source>
          <a class="underline underline-offset-3 hover:color-base" :href="REPOSITORY" target="_blank" rel="noopener">{{ $t('footer.source') }}</a>
        </template>
      </i18n-t>
    </div>
  </footer>
</template>
