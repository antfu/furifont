<script setup lang="ts">
const steps = [
  {
    title: 'One run of kanji at a time',
    body: 'Browsers shape Japanese one script at a time, so a font never sees the kana next to a kanji. Furifont reads each run of kanji as a whole.',
  },
  {
    title: 'Longest word first',
    body: 'Every run is matched against a few thousand common words, longest first: 日本語 before 日本, 今日 as one word, read きょう.',
  },
  {
    title: 'Bare when unsure',
    body: 'A kanji alone gets ruby only when one reading clearly dominates. 大人気 could be だいにんき or おとなげ, so it stays bare.',
  },
  {
    title: 'Readings you can pick',
    body: 'Write a variation selector after a word to choose another reading, or to drop the ruby. Invisible, and it survives copy and paste.',
  },
]
</script>

<template>
  <ol class="grid sm:grid-cols-2 lg:grid-cols-4">
    <li
      v-for="(step, i) in steps"
      :key="step.title"
      class="flex flex-col gap-3 border-base p-6 [&:not(:last-child)]:border-b sm:[&:nth-child(odd)]:border-r lg:border-b-0 lg:[&:not(:last-child)]:border-r"
    >
      <span class="font-mono text-xs color-muted">{{ String(i + 1).padStart(2, '0') }}</span>
      <h3 class="text-[15px] font-semibold tracking-tight">
        {{ step.title }}
      </h3>
      <p class="text-sm leading-relaxed color-muted">
        {{ step.body }}
      </p>
    </li>
  </ol>
</template>
