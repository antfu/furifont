<script setup lang="ts">
import type { WordSamples } from 'furifont'
import { parseNotation } from '@furifont/core'

const { report, sample } = useCustomize()
const samples = shallowRef<WordSamples>()
let loads = 0

async function load(): Promise<void> {
  const id = ++loads
  const next = await sample().catch(() => undefined)
  if (id === loads && next)
    samples.value = next
}

// A new plan moves the buckets: sample them again.
// Shown only while open, so it loads when it first appears.
watch(report, load, { immediate: true })

/** Skipped words and those left bare get no ruby from the font. */
const buckets = [{ key: 'skip', bare: true }, { key: 'take', bare: false }, { key: 'rest', bare: true }] as const

/** A word's notation as the pieces of a `<ruby>` tag: base text, with its reading when it has one. */
function pieces(notation: string): { base: string, ruby?: string }[] {
  const { form, spans } = parseNotation(notation)
  const chars = [...form]
  const out: { base: string, ruby?: string }[] = []
  let at = 0
  for (const span of spans) {
    if (span.start > at)
      out.push({ base: chars.slice(at, span.start).join('') })
    out.push({ base: chars.slice(span.start, span.end).join(''), ruby: span.ruby })
    at = span.end
  }
  if (at < chars.length)
    out.push({ base: chars.slice(at).join('') })
  return out
}
</script>

<template>
  <div>
    <div class="flex items-center gap-2 border-b border-base px-6 py-3">
      <p class="text-xs color-muted">
        {{ $t('customize.overview.hint') }}
      </p>
      <button type="button" class="btn-outline focus-ring ml-auto h-7 px-2 text-xs" @click="load">
        {{ $t('customize.overview.randomize') }}
      </button>
    </div>
    <div class="grid lg:grid-cols-3">
      <div v-for="{ key, bare } in buckets" :key="key" class="min-w-0 border-b border-base lg:border-b-0 lg:border-r lg:last:border-r-0">
        <div class="flex items-baseline justify-between border-b border-base px-6 py-2">
          <h3 class="label color-base">
            {{ $t(`customize.overview.${key}`) }}
          </h3>
          <span v-if="samples" class="font-mono text-[11px] color-muted tabular-nums">{{ $t('customize.overview.count', { count: samples[key].size }) }}</span>
        </div>
        <div v-if="samples?.[key].words.length" lang="ja" class="no-ruby flex flex-wrap gap-x-4 gap-y-2 px-6 py-3 text-base" :class="bare && 'line-through color-muted'">
          <span v-for="word in samples[key].words" :key="word.rank" :title="`${word.rank}`">
            <ruby v-for="(piece, i) in pieces(word.notation)" :key="i">{{ piece.base }}<rt v-if="piece.ruby">{{ piece.ruby }}</rt></ruby>
          </span>
        </div>
        <p v-else-if="samples" class="px-6 py-3 text-xs color-muted">
          {{ $t('customize.overview.empty') }}
        </p>
      </div>
    </div>
  </div>
</template>
