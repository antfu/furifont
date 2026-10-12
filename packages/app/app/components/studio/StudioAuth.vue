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
    <span class="label">{{ $t('studio.auth.eyebrow') }}</span>
    <h1 class="text-2xl font-semibold tracking-tight">
      {{ $t('studio.auth.title') }}
    </h1>
    <i18n-t keypath="studio.auth.body" tag="p" class="text-sm color-muted">
      <template #command>
        <code class="font-mono">furifont dev</code>
      </template>
    </i18n-t>
    <input v-model="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" :aria-label="$t('studio.auth.code')" class="input text-center font-mono text-xl tracking-[0.5em]">
    <p v-if="failed" class="text-sm">
      {{ $t('studio.auth.failed') }}
    </p>
    <button type="submit" class="btn-solid focus-ring" :disabled="busy || code.trim().length !== 6">
      {{ $t('studio.auth.unlock') }}
    </button>
  </form>
</template>
