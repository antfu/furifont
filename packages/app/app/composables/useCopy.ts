/** Copies text, flagging `copied` for a moment so a button can say so. */
export function useCopy() {
  const copied = ref<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  async function copy(text: string): Promise<void> {
    // The clipboard needs a secure context and permission: without them, say nothing.
    const done = await navigator.clipboard?.writeText(text).then(() => true, () => false)
    if (!done)
      return
    copied.value = text
    clearTimeout(timer)
    timer = setTimeout(() => copied.value = undefined, 1200)
  }
  return { copied: readonly(copied), copy }
}
