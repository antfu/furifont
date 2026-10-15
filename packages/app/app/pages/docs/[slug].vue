<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { NuxtLink } from '#components'
import DocsExample from '~/components/docs/DocsExample.vue'

definePageMeta({ validate: route => DOCS.some(doc => doc === route.params.slug) })

const route = useRoute()
const { t, locale } = useI18n()
const doc = computed(() => DOCS.find(doc => doc === route.params.slug)!)
const { data: source } = await useAsyncData(() => `docs:${locale.value}:${doc.value}`, () => loadDoc(doc.value, locale.value))
useHead({ title: () => `${t(`docs.${doc.value}`)} - Furifont` })

// Links between pages stay in the app.
const components = { a: NuxtLink, DocsExample }
</script>

<template>
  <article class="prose min-w-0 px-6 py-12">
    <Markdown v-if="source" :value="source" :components />
  </article>
</template>
