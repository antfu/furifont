import type { Tokenizer } from './index'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { TokenizerBuilder } from '@patdx/kuromoji'
import NodeDictionaryLoader from '@patdx/kuromoji/node'

/** kuromoji with its IPADIC dictionary, read from the installed package. */
export function loadTokenizer(): Promise<Tokenizer> {
  const entry = createRequire(import.meta.url).resolve('@patdx/kuromoji')
  return new TokenizerBuilder({ loader: new NodeDictionaryLoader({ dic_path: join(dirname(entry), '../dict') }) }).build()
}
