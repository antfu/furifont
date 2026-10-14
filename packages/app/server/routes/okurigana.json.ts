/** The okurigana pairs, as `dict:update` packed them: the site serves that file as it is. Prerendered with the site. */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-type', 'application/json; charset=utf-8')
  return useStorage('assets:dictionary').getItemRaw('okurigana.json')
})
