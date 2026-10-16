import type { DevframeRpcClient, DevframeScopedClientRpc } from 'devframe/client'
import type { BuildEvent, FurifontConfigInput, PlanReport, SizeEstimate, STUDIO_ID as StudioId, StudioState, WordMatch, WordSamples } from 'furifont'
import type { InjectionKey } from 'vue'
import { PlanOptionsSchema } from '@furifont/core'
import * as v from 'valibot'

const STUDIO_ID: typeof StudioId = 'furifont'
const DEBOUNCE = 350
/** Followed by the project's config path: each project keeps its own changes. */
const STORAGE_KEY = 'furifont:customize:'

type CustomizeStatus = 'connecting' | 'unavailable' | 'locked' | 'ready'

interface BuildProgress {
  running: boolean
  step?: string
  done?: number | null
  total?: number | null
  files: Extract<BuildEvent, { type: 'done' }>['files']
  error?: string
}

interface PreviewState {
  /** Family name of the latest preview font loaded into the page. */
  family?: string
  ms?: number
  glyphs?: number
  /** Whether the preview font has every weight. */
  variable?: boolean
  loading: boolean
  error?: string
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined
  return () => {
    clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }
}

interface EstimateState {
  size?: SizeEstimate
  loading: boolean
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

type Json = string | number | boolean | null | undefined | Json[] | { [key: string]: Json }
interface JsonObject { [key: string]: Json }

const isObject = (value: Json): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)

/** What `config` changes from `base`, nested objects key by key; null where it drops a key. */
function changes(config: JsonObject, base: JsonObject): JsonObject {
  const out: JsonObject = {}
  for (const key of new Set([...Object.keys(config), ...Object.keys(base)])) {
    const [value, original] = [config[key], base[key]]
    if (isObject(value) && isObject(original)) {
      const inner = changes(value, original)
      if (Object.keys(inner).length)
        out[key] = inner
    }
    else if (JSON.stringify(value) !== JSON.stringify(original)) {
      out[key] = value ?? null
    }
  }
  return out
}

function applyChanges(base: JsonObject, changed: JsonObject): JsonObject {
  const out = { ...base }
  for (const [key, value] of Object.entries(changed)) {
    const original = out[key]
    if (value === null)
      delete out[key]
    else
      out[key] = isObject(value) && isObject(original) ? applyChanges(original, value) : value
  }
  return out
}

type FontFormat = NonNullable<FurifontConfigInput['formats']>[number]

/** The fonts a build can write, in the order it writes them. */
export const FONT_FORMATS = ['otf', 'woff2'] as const satisfies readonly FontFormat[]

// The server's config schema again: the app cannot bundle the CLI's, which reads files.
const SavedSchema = v.object({
  ...PlanOptionsSchema.entries,
  base: v.pipe(v.string(), v.nonEmpty()),
  formats: v.pipe(v.array(v.picklist(FONT_FORMATS)), v.minLength(1)),
})

/** The loaded config with the changes saved for it; all of them dropped when any no longer applies. */
function restore(key: string, base: FurifontConfigInput): FurifontConfigInput {
  let result: v.SafeParseResult<typeof SavedSchema> | undefined
  try {
    result = v.safeParse(SavedSchema, applyChanges(base, JSON.parse(localStorage.getItem(key) ?? '{}')))
  }
  catch {
    // Not a JSON object: dropped like any stale entry.
  }
  if (result?.success)
    return result.output
  localStorage.removeItem(key)
  return structuredClone(base)
}

/**
 * Customize, connected to the `furifont dev` server it was served by. On the
 * static demo site there is no server, and `status` settles on `unavailable`.
 */
function createCustomize() {
  const { devCustomizeBase } = useRuntimeConfig().public
  const status = ref<CustomizeStatus>('connecting')
  const state = shallowRef<StudioState>()
  const config = ref<FurifontConfigInput>({})
  const report = shallowRef<PlanReport>()
  const text = ref(SAMPLES[0]!.text)
  const preview = reactive<PreviewState>({ loading: false })
  const estimate = reactive<EstimateState>({ loading: false })
  const build = reactive<BuildProgress>({ running: false, files: [] })
  const savedTo = ref<string>()

  let client: DevframeRpcClient | undefined
  let rpc: DevframeScopedClientRpc<typeof STUDIO_ID> | undefined
  let face: FontFace | undefined
  let previews = 0
  let refreshes = 0
  let estimates = 0
  /** What the server loaded, or last saved: Customize stores only its changes to it. */
  let loaded: FurifontConfigInput = {}
  let storageKey = ''

  async function refreshReport(): Promise<void> {
    report.value = await rpc!.call('report', toRaw(config.value)).catch(() => report.value)
  }

  async function refreshEstimate(): Promise<void> {
    const id = ++estimates
    const size = await rpc!.call('estimate', toRaw(config.value)).catch(() => undefined)
    if (id === estimates)
      Object.assign(estimate, { size, loading: false })
  }

  async function refreshPreview(): Promise<void> {
    const id = ++previews
    preview.loading = true
    try {
      const result = await rpc!.call('preview', toRaw(config.value), text.value)
      if (id !== previews)
        return
      const bytes = Uint8Array.from(atob(result.font), c => c.charCodeAt(0))
      const next = new FontFace(`Furifont Preview ${id}`, bytes, { weight: `${MIN_WEIGHT} ${MAX_WEIGHT}` })
      await next.load()
      document.fonts.add(next)
      if (face)
        document.fonts.delete(face)
      face = next
      Object.assign(preview, { family: next.family, ms: result.ms, glyphs: result.stats.glyphs, variable: result.variable, error: undefined })
    }
    catch (error) {
      if (id === previews)
        preview.error = message(error)
    }
    finally {
      if (id === previews)
        preview.loading = false
    }
  }

  // The estimate compiles the whole font: it waits for the stats and the preview, which it would hold up.
  const refresh = debounce(async () => {
    const id = ++refreshes
    estimate.loading = true
    await Promise.all([refreshReport(), refreshPreview()])
    if (id === refreshes)
      refreshEstimate()
  }, DEBOUNCE)
  // The formats change only which files a build writes: not the plan, the preview or the estimate.
  watch(() => JSON.stringify({ ...config.value, formats: undefined }), refresh)
  watch(text, debounce(refreshPreview, DEBOUNCE))

  function persist(): void {
    const changed = changes(toRaw(config.value), loaded)
    if (Object.keys(changed).length)
      localStorage.setItem(storageKey, JSON.stringify(changed))
    else
      localStorage.removeItem(storageKey)
  }
  watch(config, persist, { deep: true })

  async function connect(): Promise<void> {
    try {
      const { connectDevframe } = await import('devframe/client')
      // Served by `furifont dev` Customize sits next to the app; under `nuxt dev`, on the bridge's mount.
      client = await connectDevframe(import.meta.dev ? { baseURL: devCustomizeBase } : undefined)
      rpc = client.scope(STUDIO_ID).rpc
    }
    catch {
      status.value = 'unavailable'
      return
    }
    if (await client.ensureTrusted(1500).catch(() => false))
      await start()
    else
      status.value = 'locked'
  }

  async function unlock(code: string): Promise<boolean> {
    if (!client || !await client.requestTrustWithCode(code))
      return false
    await start()
    return true
  }

  async function start(): Promise<void> {
    state.value = await rpc!.call('state')
    loaded = state.value.config
    storageKey = STORAGE_KEY + state.value.configPath
    config.value = restore(storageKey, loaded)
    status.value = 'ready'
    refresh()
  }

  /** Back to the loaded config, keeping the user's words. */
  function reset(): void {
    config.value = { ...structuredClone(loaded), words: toRaw(config.value.words) }
  }

  async function runBuild(): Promise<void> {
    Object.assign(build, { running: true, files: [], error: undefined, step: 'plan', done: null, total: null })
    try {
      const { streamId } = await rpc!.call('build', toRaw(config.value))
      for await (const event of client!.scope(STUDIO_ID).rpc.streaming.subscribe<BuildEvent>('build', streamId)) {
        if (event.type === 'progress')
          Object.assign(build, { step: event.step, done: event.done, total: event.total })
        else if (event.type === 'done')
          build.files = event.files
        else
          build.error = event.message
      }
    }
    catch (error) {
      build.error = message(error)
    }
    finally {
      build.running = false
    }
  }

  async function save(): Promise<void> {
    savedTo.value = await rpc!.call('save', toRaw(config.value))
    loaded = structuredClone(toRaw(config.value))
    persist()
  }

  function search(query: string): Promise<WordMatch[]> {
    return rpc!.call('search', query)
  }

  /** A fresh spread of the words the config skips, takes and leaves. */
  function sample(): Promise<WordSamples> {
    return rpc!.call('sample', toRaw(config.value))
  }

  /** Adds `notation` to one of the custom word lists, or takes it out again. */
  function toggleWord(list: 'add' | 'remove' | 'pin', notation: string): void {
    const words = config.value.words ??= {}
    const current = words[list] ?? []
    words[list] = current.includes(notation) ? current.filter(n => n !== notation) : [...current, notation]
  }

  onMounted(connect)
  onBeforeUnmount(() => {
    if (face)
      document.fonts.delete(face)
  })

  return { status, state, config, report, text, preview, estimate, build, savedTo, unlock, runBuild, save, reset, search, sample, toggleWord }
}

export type Customize = ReturnType<typeof createCustomize>

const CUSTOMIZE_KEY: InjectionKey<Customize> = Symbol('customize')

/** Creates Customize for the page and shares it with its sections. */
export function provideCustomize(): Customize {
  const customize = createCustomize()
  provide(CUSTOMIZE_KEY, customize)
  return customize
}

export function useCustomize(): Customize {
  const customize = inject(CUSTOMIZE_KEY)
  if (!customize)
    throw new Error('useCustomize() is only available inside the customize page')
  return customize
}
