import type { DevframeRpcClient, DevframeScopedClientRpc } from 'devframe/client'
import type { BuildEvent, FurifontConfigInput, PlanReport, STUDIO_ID as StudioId, StudioState, WordMatch } from 'furifont'
import type { InjectionKey } from 'vue'

const STUDIO_ID: typeof StudioId = 'furifont'
const DEBOUNCE = 350

export type StudioStatus = 'connecting' | 'unavailable' | 'locked' | 'ready'

export interface BuildProgress {
  running: boolean
  step?: string
  done?: number | null
  total?: number | null
  files: Extract<BuildEvent, { type: 'done' }>['files']
  error?: string
}

export interface PreviewState {
  /** Family name of the latest preview font loaded into the page. */
  family?: string
  ms?: number
  glyphs?: number
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

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The studio, connected to the `furifont dev` server it was served by. On the
 * static demo site there is no server, and `status` settles on `unavailable`.
 */
function createStudio() {
  const { devStudioBase } = useRuntimeConfig().public
  const status = ref<StudioStatus>('connecting')
  const state = shallowRef<StudioState>()
  const config = ref<FurifontConfigInput>({})
  const report = shallowRef<PlanReport>()
  const text = ref('今日は日本語の勉強をします。明日は東京の大学へ行きます。市場で魚を買った。')
  const preview = reactive<PreviewState>({ loading: false })
  const build = reactive<BuildProgress>({ running: false, files: [] })
  const savedTo = ref<string>()

  let client: DevframeRpcClient | undefined
  let rpc: DevframeScopedClientRpc<typeof STUDIO_ID> | undefined
  let face: FontFace | undefined
  let previews = 0

  async function refreshReport(): Promise<void> {
    report.value = await rpc!.call('report', toRaw(config.value)).catch(() => report.value)
  }

  async function refreshPreview(): Promise<void> {
    const id = ++previews
    preview.loading = true
    try {
      const result = await rpc!.call('preview', toRaw(config.value), text.value)
      if (id !== previews)
        return
      const bytes = Uint8Array.from(atob(result.font), c => c.charCodeAt(0))
      const next = new FontFace(`Furifont Preview ${id}`, bytes)
      await next.load()
      document.fonts.add(next)
      if (face)
        document.fonts.delete(face)
      face = next
      Object.assign(preview, { family: next.family, ms: result.ms, glyphs: result.stats.glyphs, error: undefined })
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

  const refresh = debounce(() => {
    refreshReport()
    refreshPreview()
  }, DEBOUNCE)
  watch(config, refresh, { deep: true })
  watch(text, debounce(refreshPreview, DEBOUNCE))

  async function connect(): Promise<void> {
    try {
      const { connectDevframe } = await import('devframe/client')
      // Served by `furifont dev` the studio sits next to the app; under `nuxt dev`, on the bridge's mount.
      client = await connectDevframe(import.meta.dev ? { baseURL: devStudioBase } : undefined)
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
    config.value = structuredClone(state.value.config)
    status.value = 'ready'
    refresh()
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
  }

  function search(query: string): Promise<WordMatch[]> {
    return rpc!.call('search', query)
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

  return { status, state, config, report, text, preview, build, savedTo, unlock, runBuild, save, search, toggleWord }
}

export type Studio = ReturnType<typeof createStudio>

const STUDIO_KEY: InjectionKey<Studio> = Symbol('studio')

/** Creates the studio for the page and shares it with its sections. */
export function provideStudio(): Studio {
  const studio = createStudio()
  provide(STUDIO_KEY, studio)
  return studio
}

export function useStudio(): Studio {
  const studio = inject(STUDIO_KEY)
  if (!studio)
    throw new Error('useStudio() is only available inside the studio page')
  return studio
}
