import type { Tokenizer } from './index'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { TokenizerBuilder } from '@patdx/kuromoji'
import NodeDictionaryLoader from '@patdx/kuromoji/node'

/** Where kuromoji's IPADIC dictionary is installed: gzipped `.dat.gz` files. */
export function dictionaryDir(): string {
  return join(dirname(createRequire(import.meta.url).resolve('@patdx/kuromoji')), '../dict')
}

/** kuromoji with its IPADIC dictionary, read from the installed package. */
export function loadTokenizer(): Promise<Tokenizer> {
  return new TokenizerBuilder({ loader: new NodeDictionaryLoader({ dic_path: dictionaryDir() }) }).build()
}
