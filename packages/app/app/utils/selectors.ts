/** VS242: the first reading. */
const FIRST_READING = 0xE01E1

/** `text` with the selector for reading `index` (0-based) after its first character. */
export function withReading(text: string, index: number): string {
  const [first = '', ...rest] = [...text]
  return first + String.fromCodePoint(FIRST_READING + index) + rest.join('')
}

export function selectorName(index: number): string {
  return `VS${242 + index}`
}
