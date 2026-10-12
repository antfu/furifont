/** Copies text, flagging `copied` for a moment so a button can say so. */
export function useCopy() {
  const copied = ref<string>()
  let timer: ReturnType<typeof setTimeout> | undefined
  async function copy(text: string): Promise<void> {
    await navigator.clipboard.writeText(text)
    copied.value = text
    clearTimeout(timer)
    timer = setTimeout(() => copied.value = undefined, 1200)
  }
  return { copied: readonly(copied), copy }
}
