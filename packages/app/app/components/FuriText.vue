<script setup lang="ts">
const { family = FAMILIES[0]!.family, ruby = true, size = 32 } = defineProps<{
  family?: string
  /** Off turns on `ss01`, the font's own switch back to plain glyphs. */
  ruby?: boolean
  size?: number
}>()
/** Editable in place: bound, edits flow back; unbound, they stay local. */
const text = defineModel<string>('text', { required: true })

// Ruby sits above the em box: below ~1.6 lines start to clip it.
const style = computed(() => ({
  fontFamily: `"${family}", sans-serif`,
  fontSize: `${size}px`,
  lineHeight: 1.75,
  fontFeatureSettings: ruby ? 'normal' : '"ss01"',
}))

// The element owns its text while it is edited: only text from outside is written
// into it, since rewriting what the visitor just typed would reset the caret.
const el = useTemplateRef<HTMLElement>('el')
let typed: string | undefined
watch([el, text], ([node, value]) => {
  if (node && value !== typed)
    node.textContent = value
}, { immediate: true })

function onInput(): void {
  typed = el.value!.innerText
  text.value = typed
}
</script>

<template>
  <p
    ref="el"
    lang="ja"
    contenteditable="plaintext-only"
    spellcheck="false"
    role="textbox"
    aria-multiline="true"
    :aria-label="$t('editable')"
    class="cursor-text whitespace-pre-wrap break-words outline-1 outline-transparent outline-offset-4 transition-[outline-color] hover:outline-dashed hover:outline-[var(--ff-line)] focus:outline-dashed focus:outline-[var(--ff-fg)]"
    :style="style"
    @input="onInput"
  />
</template>
