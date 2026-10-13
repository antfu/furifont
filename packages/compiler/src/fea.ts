/** Glyph ID of a name in the feature file. */
export type Resolve = (name: string) => number

interface Position {
  glyphs: number[]
  isClass: boolean
  lookup?: string
}

export interface ChainRule {
  ignore: boolean
  backtrack: Position[]
  input: Position[]
  lookahead: Position[]
}

export interface Substitution {
  from: number[]
  to: number[]
}

export type Lookup
  = | { name: string, kind: 'chain', segments: ChainRule[][] }
    | { name: string, kind: 'single' | 'ligature' | 'multiple', segments: Substitution[][] }

export interface Features {
  lookups: Lookup[]
  features: { tag: string, lookups: string[] }[]
}

export function fail(message: string): never {
  throw new Error(`feature file: ${message}`)
}

interface OpenLookup {
  name: string
  kind?: Lookup['kind']
  segments: (ChainRule | Substitution)[][]
}

/**
 * Reads the feature file `@furifont/core` writes (see its `emitFea`): glyph
 * classes, extension lookups of substitutions or chain rules split by
 * `subtable;`, and features listing lookups. Anything else is an error.
 */
class FeatureFile {
  readonly lookups: Lookup[] = []
  readonly features: Features['features'] = []
  private readonly classes = new Map<string, number[]>()
  private lookup?: OpenLookup
  private feature?: Features['features'][number]
  private readonly statements: [RegExp, (match: RegExpExecArray) => void][] = [
    [/^languagesystem DFLT dflt;$/, () => {}],
    [/^(@\w+) = \[(.*)\];$/, m => this.classes.set(m[1]!, this.glyphs(m[2]!))],
    [/^lookup (\w+) useExtension \{$/, (m) => {
      this.lookup = { name: m[1]!, segments: [[]] }
    }],
    [/^feature (\w{4}) \{$/, (m) => {
      this.feature = { tag: m[1]!, lookups: [] }
    }],
    [/^\} (\w+);$/, m => this.close(m[1]!)],
    [/^lookup (\w+);$/, m => this.inFeature().lookups.push(m[1]!)],
    [/^subtable;$/, () => (this.lookup ?? fail('subtable outside a lookup')).segments.push([])],
    [/^(ignore )?sub ([^\n\r'\u2028\u2029]*'.*);$/, m => this.chainRule(Boolean(m[1]), m[2]!)],
    [/^sub (.+) by (.+);$/, m => this.substitution(this.glyphs(m[1]!), this.glyphs(m[2]!))],
  ]

  constructor(private readonly resolve: Resolve) {}

  read(line: string): void {
    if (!line)
      return
    for (const [pattern, handle] of this.statements) {
      const match = pattern.exec(line)
      if (match)
        return handle(match)
    }
    fail(`unexpected ${line}`)
  }

  private glyphs(list: string): number[] {
    return list.trim().split(/\s+/).map(this.resolve)
  }

  private inFeature(): Features['features'][number] {
    return this.feature ?? fail('a lookup reference outside a feature')
  }

  /** The open lookup, which must hold rules of `kind` only. */
  private inLookup(kind: Lookup['kind']): OpenLookup {
    const lookup = this.lookup ?? fail('a rule outside a lookup')
    if (lookup.kind && lookup.kind !== kind)
      fail(`lookup ${lookup.name} mixes rule types`)
    lookup.kind = kind
    return lookup
  }

  private close(name: string): void {
    if (this.lookup?.name === name) {
      const { kind = 'single', segments } = this.lookup
      // inLookup checked every statement against the lookup's kind.
      this.lookups.push({ name, kind, segments: segments.filter(s => s.length) } as Lookup)
      this.lookup = undefined
    }
    else if (this.feature?.tag === name) {
      this.features.push(this.feature)
      this.feature = undefined
    }
    else {
      fail(`unexpected end of ${name}`)
    }
  }

  private chainRule(ignore: boolean, body: string): void {
    const tokens = body.match(/\[[^\]]*\]'?|\S+/g) ?? []
    const positions: (Position & { marked: boolean })[] = []
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === 'lookup') {
        positions.at(-1)!.lookup = tokens[++i]
        continue
      }
      const marked = tokens[i]!.endsWith('\'')
      const token = marked ? tokens[i]!.slice(0, -1) : tokens[i]!
      const isClass = token.startsWith('[') || token.startsWith('@')
      const glyphs = token.startsWith('@') ? this.classes.get(token) ?? fail(`unknown class ${token}`) : isClass ? this.glyphs(token.slice(1, -1)) : [this.resolve(token)]
      positions.push({ marked, isClass, glyphs })
    }
    const first = positions.findIndex(p => p.marked)
    const last = positions.findLastIndex(p => p.marked)
    this.inLookup('chain').segments.at(-1)!.push({ ignore, backtrack: positions.slice(0, first), input: positions.slice(first, last + 1), lookahead: positions.slice(last + 1) })
  }

  private substitution(from: number[], to: number[]): void {
    this.inLookup(from.length > 1 ? 'ligature' : to.length > 1 ? 'multiple' : 'single').segments.at(-1)!.push({ from, to })
  }
}

export function parseFeatures(fea: string, resolve: Resolve): Features {
  const file = new FeatureFile(resolve)
  for (const line of fea.split('\n'))
    file.read(line.trim())
  return { lookups: file.lookups, features: file.features }
}
