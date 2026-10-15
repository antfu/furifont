<template>
  <div class="grid lg:grid-cols-[240px_1fr]">
    <nav class="border-b border-base lg:border-b-0 lg:border-r" :aria-label="$t('nav.docs')">
      <div class="flex flex-col gap-1 p-6 lg:sticky lg:top-14">
        <span class="label mb-2">{{ $t('nav.docs') }}</span>
        <NuxtLink
          v-for="doc in DOCS"
          :key="doc"
          :to="`/docs/${doc}`"
          class="focus-ring py-1 text-sm color-muted transition-colors hover:color-base"
          active-class="!color-base font-medium"
        >
          {{ $t(`docs.${doc}`) }}
        </NuxtLink>
      </div>
    </nav>
    <NuxtPage />
  </div>
</template>
