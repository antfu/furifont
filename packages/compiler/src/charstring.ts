import type { Outline } from './outline'
import { Writer } from './binary'

/** The widths a Private DICT encodes charstring advances against. */
export interface Widths {
  defaultWidthX: number
  nominalWidthX: number
}

const MAX_STACK = 48
const op = { rmoveto: 21, hmoveto: 22, vmoveto: 4, rlineto: 5, hlineto: 6, vlineto: 7, rrcurveto: 8, hhcurveto: 27, vvcurveto: 26, hvcurveto: 31, vhcurveto: 30, rcurveline: 24, rlinecurve: 25, endchar: 14 }

type Axis = 'h' | 'v'
/** A move, a line along an axis or not (`r`), or a curve (`C`), in relative coordinates. */
type Command = ['M' | 'r' | 'C', number[]] | [Axis, [number]]

interface Run {
  operator: number
  args: number[]
  count: number
}

const other = (axis: Axis): Axis => axis === 'h' ? 'v' : 'h'

type Curve = [dx1: number, dy1: number, dx2: number, dy2: number, dx3: number, dy3: number]

/** hvcurveto or vhcurveto: curves turning between the axes, the last one free to end off its axis. */
function alternating(curves: number[][], first: Axis): Run {
  const args: number[] = []
  let axis = first
  let count = 0
  for (const [dx1, dy1, dx2, dy2, dx3, dy3] of curves as Curve[]) {
    // An h curve starts horizontal and ends vertical; a v curve the other way round.
    const [offStart, offEnd, start, end] = axis === 'h' ? [dy1, dx3, dx1, dy3] : [dx1, dy3, dy1, dx3]
    if (offStart !== 0 || args.length + 5 > MAX_STACK)
      break
    args.push(start, dx2, dy2, end)
    count++
    if (offEnd !== 0) {
      args.push(offEnd)
      break
    }
    axis = other(axis)
  }
  return { operator: first === 'h' ? op.hvcurveto : op.vhcurveto, args, count }
}

/** hhcurveto or vvcurveto: curves along one axis, the first one free to start off it. */
function parallel(curves: number[][], axis: Axis): Run {
  const args: number[] = []
  let count = 0
  for (const [dx1, dy1, dx2, dy2, dx3, dy3] of curves as Curve[]) {
    const [start, offStart, offEnd, end] = axis === 'h' ? [dx1, dy1, dy3, dx3] : [dy1, dx1, dx3, dy3]
    if (offEnd !== 0 || (count && offStart !== 0) || args.length + 5 > MAX_STACK)
      break
    if (offStart !== 0)
      args.push(offStart)
    args.push(start, dx2, dy2, end)
    count++
  }
  return { operator: axis === 'h' ? op.hhcurveto : op.vvcurveto, args, count }
}

function general(curves: number[][]): Run {
  const taken = curves.slice(0, MAX_STACK / 6)
  return { operator: op.rrcurveto, args: taken.flat(), count: taken.length }
}

const RUNS = [(c: number[][]) => alternating(c, 'h'), (c: number[][]) => alternating(c, 'v'), (c: number[][]) => parallel(c, 'h'), (c: number[][]) => parallel(c, 'v'), general]

/** Splits consecutive curves into the runs that need the fewest arguments and operators. */
function curveRuns(curves: number[][]): Run[] {
  const best: { cost: number, run?: Run }[] = []
  best[curves.length] = { cost: 0 }
  for (let k = curves.length - 1; k >= 0; k--) {
    const rest = curves.slice(k)
    best[k] = { cost: Infinity }
    for (const make of RUNS) {
      for (let j = 1; j <= make(rest).count; j++) {
        const run = make(rest.slice(0, j))
        const cost = run.args.length + 1 + best[k + j]!.cost
        if (cost < best[k]!.cost)
          best[k] = { cost, run }
      }
    }
  }
  const runs: Run[] = []
  for (let k = 0; k < curves.length; k += runs.at(-1)!.count)
    runs.push(best[k]!.run!)
  return runs
}

/** Appends a line, dropped when empty and merged into a collinear h/v line before it, as fontTools' specializer does. */
function pushLine(commands: Command[], dx: number, dy: number): void {
  if (!dx && !dy)
    return
  const axis = dy === 0 ? 'h' : dx === 0 ? 'v' : undefined
  const previous = commands.at(-1)
  if (!axis)
    commands.push(['r', [dx, dy]])
  else if (previous?.[0] === axis)
    previous[1][0]! += axis === 'h' ? dx : dy
  else
    commands.push([axis, [axis === 'h' ? dx : dy]])
}

function commandsOf(outline: Outline): Command[] {
  const commands: Command[] = []
  let x = 0
  let y = 0
  for (const { type, points } of outline.segments) {
    if (type === 'Q')
      throw new Error('quadratic curves in a CFF font')
    const deltas: number[] = []
    for (let i = 0; i < points.length; i += 2) {
      deltas.push(points[i]! - x, points[i + 1]! - y)
      x = points[i]!
      y = points[i + 1]!
    }
    if (type === 'L')
      pushLine(commands, deltas[0]!, deltas[1]!)
    else
      commands.push([type, deltas])
  }
  return commands
}

/** Each method writes the commands from `i` that one operator covers, and returns where the next one starts. */
class Encoder {
  readonly w = new Writer()

  constructor(private readonly commands: Command[]) {}

  private numbers(args: number[]): void {
    for (const v of args) {
      if (v >= -107 && v <= 107)
        this.w.u8(v + 139)
      else if (v >= 108 && v <= 1131)
        this.w.u8(((v - 108) >> 8) + 247).u8(v - 108)
      else if (v >= -1131 && v <= -108)
        this.w.u8(((-v - 108) >> 8) + 251).u8(-v - 108)
      else
        this.w.u8(28).u16(v)
    }
  }

  private emit(args: number[], operator: number): void {
    this.numbers(args)
    this.w.u8(operator)
  }

  private is(i: number, type: Command[0]): boolean {
    return this.commands[i]?.[0] === type
  }

  /** The advance, unless it is the default; it goes on the first operator's stack. */
  width(advance: number, widths: Widths): void {
    if (advance !== widths.defaultWidthX)
      this.numbers([advance - widths.nominalWidthX])
  }

  move(i: number): number {
    const [dx = 0, dy = 0] = this.commands[i]![1]
    if (dy === 0)
      this.emit([dx], op.hmoveto)
    else if (dx === 0)
      this.emit([dy], op.vmoveto)
    else
      this.emit([dx, dy], op.rmoveto)
    return i + 1
  }

  /** hlineto and vlineto alternate direction with each argument. */
  axisLines(i: number, first: Axis): number {
    const args: number[] = []
    for (let axis = first; this.is(i, axis) && args.length < MAX_STACK; axis = other(axis))
      args.push(this.commands[i++]![1][0]!)
    this.emit(args, first === 'h' ? op.hlineto : op.vlineto)
    return i
  }

  /** Lines, then a curve in the same operator when one follows. */
  lines(i: number): number {
    const args: number[] = []
    while (this.is(i, 'r') && args.length + 2 <= MAX_STACK - 6)
      args.push(...this.commands[i++]![1])
    if (!this.is(i, 'C')) {
      this.emit(args, op.rlineto)
      return i
    }
    this.emit([...args, ...this.commands[i]![1]], op.rlinecurve)
    return i + 1
  }

  /** Curves, then a line in the same operator when one follows a general run. */
  curves(i: number): number {
    const curves: number[][] = []
    while (this.is(i, 'C'))
      curves.push(this.commands[i++]![1])
    const runs = curveRuns(curves)
    const last = runs.pop()!
    runs.forEach(run => this.emit(run.args, run.operator))
    if (last.operator === op.rrcurveto && this.is(i, 'r') && last.args.length + 2 <= MAX_STACK) {
      this.emit([...last.args, ...this.commands[i]![1]], op.rcurveline)
      return i + 1
    }
    this.emit(last.args, last.operator)
    return i
  }
}

/** A Type 2 charstring, each line and curve written with the operator that needs the fewest arguments. */
export function charstring(outline: Outline, widths: Widths): Uint8Array {
  const commands = commandsOf(outline)
  const encoder = new Encoder(commands)
  encoder.width(outline.advance, widths)
  for (let i = 0; i < commands.length;) {
    const type = commands[i]![0]
    if (type === 'M')
      i = encoder.move(i)
    else if (type === 'h' || type === 'v')
      i = encoder.axisLines(i, type)
    else if (type === 'r')
      i = encoder.lines(i)
    else
      i = encoder.curves(i)
  }
  return encoder.w.u8(op.endchar).finish()
}
