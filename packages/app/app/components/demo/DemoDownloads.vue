<template>
  <div class="grid lg:grid-cols-[5fr_4fr]">
    <table class="w-full border-b border-base text-sm lg:border-b-0 lg:border-r">
      <thead>
        <tr class="border-b border-base text-left">
          <th class="label px-6 py-3 font-normal">
            {{ $t('downloads.family') }}
          </th>
          <th class="label px-3 py-3 font-normal">
            {{ $t('downloads.ruby') }}
          </th>
          <th class="label px-3 py-3 font-normal">
            {{ $t('downloads.variable') }}
          </th>
          <th v-for="w in WEIGHTS" :key="w.style" class="label px-3 py-3 font-normal">
            {{ w.style }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="f in FAMILIES" :key="f.stem" class="border-b border-base last:border-b-0">
          <td class="px-6 py-3 font-medium">
            {{ f.family }}
          </td>
          <td class="px-3 py-3 color-muted">
            {{ $t(`scripts.${f.script}`) }}
          </td>
          <td class="px-3 py-3">
            <span class="flex gap-3 font-mono text-xs">
              <a v-for="ext in ['ttf', 'woff2']" :key="ext" :href="releaseUrl(`${f.stem}VF.${ext}`)" class="focus-ring underline underline-offset-3 hover:color-muted">{{ ext }}</a>
            </span>
          </td>
          <td v-for="w in WEIGHTS" :key="w.style" class="px-3 py-3">
            <span class="flex gap-3 font-mono text-xs">
              <a v-for="ext in ['otf', 'woff2']" :key="ext" :href="releaseUrl(`${f.stem}-${w.style}.${ext}`)" class="focus-ring underline underline-offset-3 hover:color-muted">{{ ext }}</a>
            </span>
          </td>
        </tr>
      </tbody>
    </table>
    <div class="flex flex-col gap-4 p-6">
      <p class="text-sm color-muted lh-1.625">
        {{ $t('downloads.formats') }}
      </p>
      <UiButton :href="releaseUrl('Furifont.zip')" icon="i-ph-download-simple" class="self-start">
        {{ $t('downloads.all') }}
      </UiButton>
      <p class="text-sm color-muted lh-1.625">
        {{ $t('downloads.buildOwn') }}
      </p>
      <UiButton to="/customize" icon="i-ph-sliders-horizontal" class="self-start">
        {{ $t('nav.customize') }}
      </UiButton>
    </div>
  </div>
</template>
