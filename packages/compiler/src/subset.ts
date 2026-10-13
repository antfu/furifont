import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

/** The parts of harfbuzzjs' hb-subset build used here; harfbuzzjs ships the module without bindings. */
interface SubsetModule {
  memory: WebAssembly.Memory
  _initialize: () => void
  malloc: (size: number) => number
  free: (pointer: number) => void
  hb_blob_create: (data: number, length: number, mode: number, user: number, destroy: number) => number
  hb_blob_destroy: (blob: number) => void
  hb_blob_get_data: (blob: number, length: number) => number
  hb_blob_get_length: (blob: number) => number
  hb_face_create: (blob: number, index: number) => number
  hb_face_destroy: (face: number) => void
  hb_face_reference_blob: (face: number) => number
  hb_set_add: (set: number, value: number) => void
  hb_set_clear: (set: number) => void
  hb_set_invert: (set: number) => void
  hb_subset_input_create_or_fail: () => number
  hb_subset_input_destroy: (input: number) => void
  hb_subset_input_unicode_set: (input: number) => number
  hb_subset_input_set: (input: number, which: number) => number
  hb_subset_input_get_flags: (input: number) => number
  hb_subset_input_set_flags: (input: number, flags: number) => void
  hb_subset_or_fail: (face: number, input: number) => number
}

const HB_MEMORY_MODE_READONLY = 1
const HB_SUBSET_SETS_NAME_ID = 4
const HB_SUBSET_SETS_NAME_LANG_ID = 5
const HB_SUBSET_SETS_LAYOUT_FEATURE_TAG = 6
const HB_SUBSET_FLAGS_NOTDEF_OUTLINE = 0x40

let loading: Promise<SubsetModule> | undefined

async function load(): Promise<SubsetModule> {
  const path = createRequire(import.meta.url).resolve('harfbuzzjs/dist/harfbuzz-subset.wasm')
  const { instance } = await WebAssembly.instantiate(await readFile(path))
  // A WebAssembly module's exports are untyped; SubsetModule lists the C functions it was built with.
  const hb: SubsetModule = instance.exports as WebAssembly.Exports & SubsetModule
  hb._initialize()
  return hb
}

/** Keeps only what `codepoints` need, with every layout feature and name. */
export async function subsetFont(font: Uint8Array, codepoints: number[]): Promise<Uint8Array> {
  const hb = await (loading ??= load())
  const data = hb.malloc(font.length)
  new Uint8Array(hb.memory.buffer).set(font, data)
  const blob = hb.hb_blob_create(data, font.length, HB_MEMORY_MODE_READONLY, 0, 0)
  const face = hb.hb_face_create(blob, 0)
  hb.hb_blob_destroy(blob)
  const input = hb.hb_subset_input_create_or_fail()
  try {
    const unicodes = hb.hb_subset_input_unicode_set(input)
    for (const cp of codepoints)
      hb.hb_set_add(unicodes, cp)
    for (const which of [HB_SUBSET_SETS_LAYOUT_FEATURE_TAG, HB_SUBSET_SETS_NAME_ID, HB_SUBSET_SETS_NAME_LANG_ID]) {
      const set = hb.hb_subset_input_set(input, which)
      hb.hb_set_clear(set)
      hb.hb_set_invert(set)
    }
    hb.hb_subset_input_set_flags(input, hb.hb_subset_input_get_flags(input) | HB_SUBSET_FLAGS_NOTDEF_OUTLINE)
    const subset = hb.hb_subset_or_fail(face, input)
    if (!subset)
      throw new Error('subsetting the base font failed')
    const result = hb.hb_face_reference_blob(subset)
    const at = hb.hb_blob_get_data(result, 0)
    const bytes = new Uint8Array(hb.memory.buffer).slice(at, at + hb.hb_blob_get_length(result))
    hb.hb_blob_destroy(result)
    hb.hb_face_destroy(subset)
    return bytes
  }
  finally {
    hb.hb_subset_input_destroy(input)
    hb.hb_face_destroy(face)
    hb.free(data)
  }
}
