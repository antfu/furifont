<template>
  <div>
    <div class="flex flex-col gap-4 px-6 py-12">
      <span class="label">{{ $t('reference.eyebrow') }}</span>
      <h1 class="display text-4xl font-semibold">
        {{ $t('reference.title') }}
      </h1>
      <p class="max-w-[60ch] text-[15px] lh-1.625 color-muted">
        {{ $t('reference.body') }}
      </p>
    </div>
    <UiSection>
      <ReferenceSearch />
    </UiSection>
  </div>
</template>
