<template>
  <div>
    <div class="flex flex-col gap-4 px-6 py-12">
      <span class="label">Reference</span>
      <h1 class="text-4xl font-semibold tracking-[-0.03em]">
        Pick a reading
      </h1>
      <p class="max-w-[60ch] text-[15px] leading-relaxed color-muted">
        Furifont shows the most common reading of a word. To show another, write a variation selector
        right after the word's first kanji: VS226 is reading 1, VS227 reading 2, and so on. After a single
        kanji, it picks that kanji's reading; VS225 shows the kanji without ruby.
      </p>
    </div>
    <UiSection>
      <ReferenceSearch />
    </UiSection>
  </div>
</template>
