<template>
  <footer class="border-t border-base">
    <div class="relative mx-auto grid max-w-6xl gap-6 border-x border-base px-6 py-8 text-xs color-muted sm:grid-cols-3">
      <UiCross class="-left-[6px] -top-[6px]" />
      <UiCross class="-right-[6px] -top-[6px]" />
      <p>
        Fonts under the <a class="underline underline-offset-3 hover:color-base" href="https://openfontlicense.org" target="_blank" rel="noopener">SIL Open Font License</a>,
        derived from Source Han Sans by Adobe.
      </p>
      <p>
        Readings from JMdict and KANJIDIC2 (EDRDG) and JmdictFurigana, under CC BY-SA 4.0.
      </p>
      <p class="sm:text-right">
        Tooling under MIT. <a class="underline underline-offset-3 hover:color-base" :href="REPOSITORY" target="_blank" rel="noopener">Source on GitHub</a>.
      </p>
    </div>
  </footer>
</template>
