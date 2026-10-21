<script setup lang="ts">
import type { OkuriganaReader } from '@furifont/helper-web'

const { family = FAMILIES[0]!.family, ruby = true, size = 32, weight = 400, okurigana, editable = true } = defineProps<{
  family?: string
  /** Off turns on `ss01`, the font's own switch back to plain glyphs. */
  ruby?: boolean
  size?: number
  /** Between the variable font's lightest and heaviest. */
  weight?: number
  /** Reads kanji by the okurigana after them: a span with `salt` where the font cannot see it. */
  okurigana?: OkuriganaReader
  /** Off draws the text as a preview: nobody types in it. */
  editable?: boolean
}>()
/** Editable in place: bound, edits flow back; unbound, they stay local. */
const text = defineModel<string>('text', { required: true })

const style = computed(() => ({
  fontFamily: `"${family}", sans-serif`,
  fontSize: `${size}px`,
  fontWeight: weight,
  lineHeight: LINE_HEIGHT,
  fontFeatureSettings: ruby ? 'normal' : '"ss01"',
}))

interface Drawn {
  at: number
  length: number
  salt: number
}

/** The spans in `node`, by where they stand in its text. */
function spansIn(node: HTMLElement): Drawn[] {
  const spans: Drawn[] = []
  let at = 0
  for (const child of node.childNodes) {
    const length = child.textContent!.length
    if (child instanceof HTMLElement)
      spans.push({ at, length, salt: Number(child.dataset.salt) })
    at += length
  }
  return spans
}

/** Characters from the start of `node` to the caret, when the caret is in it and nothing is selected. */
function caretIn(node: HTMLElement): number | undefined {
  const selection = getSelection()
  if (!selection?.rangeCount || !selection.isCollapsed || !node.contains(selection.anchorNode))
    return undefined
  const range = document.createRange()
  range.selectNodeContents(node)
  range.setEnd(selection.anchorNode!, selection.anchorOffset)
  return range.toString().length
}

function placeCaret(node: HTMLElement, offset: number): void {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  let rest = offset
  for (let part = walker.nextNode(); part; part = walker.nextNode()) {
    const length = part.nodeValue!.length
    if (rest <= length) {
      const range = document.createRange()
      range.setStart(part, rest)
      range.collapse(true)
      getSelection()!.removeAllRanges()
      getSelection()!.addRange(range)
      return
    }
    rest -= length
  }
}

// The element owns its text while it is edited: only text from outside is written
// into it, since rewriting what the visitor just typed would reset the caret.
const el = useTemplateRef<HTMLElement>('el')
let typed: string | undefined
let composing = false
let timer: ReturnType<typeof setTimeout> | undefined

/**
 * Draws `value`, with a span around each run of kanji the okurigana read: the
 * font sees one script at a time, so only markup can say 来 is こ in 来ない. A
 * draw that would change nothing is skipped, which keeps the visitor's undo.
 */
function draw(node: HTMLElement, value: string, force = false): void {
  const matches = ruby && okurigana ? okurigana.find(value) : []
  if (!force && node.textContent === value && JSON.stringify(spansIn(node)) === JSON.stringify(matches.map(({ at, length, salt }) => ({ at, length, salt }))))
    return
  const caret = caretIn(node)
  const parts: (string | HTMLElement)[] = []
  let at = 0
  for (const match of matches) {
    parts.push(value.slice(at, match.at))
    const span = document.createElement('span')
    span.textContent = value.slice(match.at, match.at + match.length)
    span.dataset.salt = String(match.salt)
    span.style.fontFeatureSettings = `"salt" ${match.salt}`
    parts.push(span)
    at = match.at + match.length
  }
  parts.push(value.slice(at))
  node.replaceChildren(...parts.filter(part => part !== ''))
  if (caret !== undefined)
    placeCaret(node, caret)
}

watch([el, text], ([node, value]) => {
  if (node && value !== typed)
    draw(node, value, true)
}, { immediate: true })
// The reader arrives after the text, and the visitor can turn ruby or it off.
watch([() => okurigana, () => ruby], () => {
  if (el.value)
    draw(el.value, typed ?? text.value)
})

function onCompositionStart(): void {
  composing = true
}

function onCompositionEnd(): void {
  composing = false
  onInput()
}

function onInput(): void {
  typed = el.value!.innerText
  text.value = typed
  // After a pause, so typing is not interrupted: the runs of kanji the okurigana read may have changed.
  clearTimeout(timer)
  timer = setTimeout(() => !composing && el.value && draw(el.value, typed!), 300)
}

onBeforeUnmount(() => clearTimeout(timer))
</script>

<template>
  <p
    ref="el"
    lang="ja"
    :contenteditable="editable ? 'plaintext-only' : undefined"
    spellcheck="false"
    :role="editable ? 'textbox' : undefined"
    :aria-multiline="editable ? 'true' : undefined"
    :aria-label="editable ? $t('editable') : undefined"
    class="whitespace-pre-wrap break-words"
    :class="editable && 'cursor-text outline-1 outline-transparent outline-offset-4 transition-[outline-color] hover:outline-dashed hover:outline-[var(--ff-line)] focus:outline-dashed focus:outline-[var(--ff-fg)]'"
    :style="style"
    @input="onInput"
    @compositionstart="onCompositionStart"
    @compositionend="onCompositionEnd"
  />
</template>
