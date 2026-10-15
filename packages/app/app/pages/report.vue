<template>
  <div>
    <div class="flex flex-col gap-4 px-6 py-12">
      <span class="label">{{ $t('report.eyebrow') }}</span>
      <h1 class="display text-4xl font-semibold">
        {{ $t('report.title') }}
      </h1>
      <p class="max-w-[60ch] text-[15px] leading-relaxed color-muted">
        {{ $t('report.body') }}
      </p>
    </div>
    <ReportForm />
  </div>
</template>
