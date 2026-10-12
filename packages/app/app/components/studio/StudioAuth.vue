<script setup lang="ts">
const { unlock } = useStudio()
const code = ref('')
const failed = ref(false)
const busy = ref(false)

async function submit(): Promise<void> {
  busy.value = true
  failed.value = !await unlock(code.value.trim())
  busy.value = false
}
</script>

<template>
  <form class="mx-auto flex max-w-sm flex-col gap-4 px-6 py-24" @submit.prevent="submit">
    <span class="label">Studio / locked</span>
    <h1 class="text-2xl font-semibold tracking-tight">
      Enter the code from your terminal
    </h1>
    <p class="text-sm color-muted">
      <code class="font-mono">furifont dev</code> printed a six-digit code in its terminal.
    </p>
    <input v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" aria-label="Code" class="input text-center font-mono text-xl tracking-[0.5em]">
    <p v-if="failed" class="text-sm">
      That code did not work. Check the terminal and try again.
    </p>
    <button type="submit" class="btn-solid focus-ring" :disabled="busy || code.trim().length !== 6">
      Unlock
    </button>
  </form>
</template>
