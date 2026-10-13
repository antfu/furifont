import { view, Writer } from './binary'
import { readSfnt } from './sfnt'

/** WOFF2's known table tags, in flag order. */
const KNOWN_TAGS = 'cmap,head,hhea,hmtx,maxp,name,OS/2,post,cvt ,fpgm,glyf,loca,prep,CFF ,VORG,EBDT,EBLC,gasp,hdmx,kern,LTSH,PCLT,VDMX,vhea,vmtx,BASE,GDEF,GPOS,GSUB,EBSC,JSTF,MATH,CBDT,CBLC,COLR,CPAL,SVG ,sbix,acnt,avar,bdat,bloc,bsln,cvar,fdsc,feat,fmtx,fvar,gvar,hsty,just,lcar,mort,morx,opbd,prop,trak,Zapf,Silf,Glat,Gloc,Feat,Sill'.split(',')
const ARBITRARY_TAG = 63
/** Transformation version 3 for glyf and loca: the tables go to Brotli as they are. */
const NULL_TRANSFORM = 0xC0

function base128(w: Writer, value: number): void {
  const bytes: number[] = []
  do {
    bytes.unshift(value & 0x7F)
    value = Math.floor(value / 128)
  } while (value)
  bytes.forEach((b, i) => w.u8(i < bytes.length - 1 ? b | 0x80 : b))
}

/**
 * Wraps an OpenType font as WOFF2, with no table transforms. `brotli` compresses
 * the tables; `@furifont/compiler/node` has one for Node.
 */
export async function toWoff2(sfnt: Uint8Array, brotli: (data: Uint8Array) => Promise<Uint8Array>): Promise<Uint8Array> {
  const { flavor, tables } = readSfnt(sfnt)
  const tags = [...tables.keys()].sort()
  const directory = new Writer()
  for (const tag of tags) {
    const known = KNOWN_TAGS.indexOf(tag)
    directory.u8(known < 0 ? ARBITRARY_TAG : known | (tag === 'glyf' || tag === 'loca' ? NULL_TRANSFORM : 0))
    if (known < 0)
      directory.tag(tag)
    base128(directory, tables.get(tag)!.length)
  }
  const stream = new Writer()
  tags.forEach(tag => stream.bytes(tables.get(tag)!))
  const compressed = await brotli(stream.finish())
  const header = 48
  const body = new Writer().bytes(directory.finish()).bytes(compressed)
  const length = (header + body.length + 3) & ~3
  const sfntSize = 12 + 16 * tags.length + tags.reduce((sum, tag) => sum + ((tables.get(tag)!.length + 3) & ~3), 0)
  const out = new Uint8Array(length)
  const d = view(out)
  d.setUint32(0, 0x774F4632)
  d.setUint32(4, flavor)
  d.setUint32(8, length)
  d.setUint16(12, tags.length)
  d.setUint32(16, sfntSize)
  d.setUint32(20, compressed.length)
  d.setUint16(24, 1)
  out.set(body.finish(), header)
  return out
}
