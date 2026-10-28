/**
 * Scratch value rules (research §1.7–§1.8). Other lanes import these instead of reimplementing casts.
 *
 * A value keeps its runtime type until a block asks for a number, a boolean, or text. "02" and 2 are
 * different until something compares or adds them. Nothing here draws from Math.random; list indexes
 * that say "random" call the function the caller passes (the runtime's seeded generator).
 */
import type { Value } from './contracts'

/**
 * Number a block needs. NaN becomes 0. Infinity stays Infinity.
 * Boolean true is 1 and false is 0. Blank and non-numeric text are 0.
 */
export function toNumber(value: Value): number {
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value
  const n = Number(value)
  return Number.isNaN(n) ? 0 : n
}

/**
 * Boolean a block needs. The only false strings are "", "0", and "false" in any letter case.
 * "0.0", "false ", and " " are true. Numbers use ordinary truthiness, so 0 and NaN are false.
 */
export function toBoolean(value: Value): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    if (value === '' || value === '0' || value.toLowerCase() === 'false') return false
    return true
  }
  return Boolean(value)
}

/** Text a block needs. Joins and list reporters use this, so true becomes "true" and 10 becomes "10". */
export function toString(value: Value): string {
  return String(value)
}

/** True for null and for strings whose trim is empty. The number 0 is not whitespace. Used by compare, not by toBoolean. */
export function isWhiteSpace(value: Value | null): boolean {
  return value === null || (typeof value === 'string' && value.trim().length === 0)
}

/**
 * Whether pick-random should stay on whole numbers.
 * This is about the written form, not the numeric value: the number 2 is an integer, the string "2.0" is not
 * (it contains a decimal point). A string with no "." counts, even "cat". NaN counts. Infinity does not.
 */
export function isInt(value: Value): boolean {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return true
    return value === Number.parseInt(String(value), 10)
  }
  if (typeof value === 'boolean') return true
  return !value.includes('.')
}

/**
 * Ordering used by equals / less / greater and by list search.
 * Returns a negative number, zero, or a positive number. Callers must use the sign: a numeric result is the
 * difference, not always -1 or 1.
 *
 * Both sides are read with Number(), not toNumber(). "cat" stays NaN and is compared as text; toNumber("cat")
 * is 0, which would make "cat" equal 0. Whitespace that Number() turns into 0 is also compared as text, so
 * "" is not equal to 0. Same-sign infinities are equal (Infinity - Infinity would be NaN).
 */
export function compare(a: Value, b: Value): number {
  const n1 = numberForCompare(a)
  const n2 = numberForCompare(b)
  if (Number.isNaN(n1) || Number.isNaN(n2)) {
    const s1 = toString(a).toLowerCase()
    const s2 = toString(b).toLowerCase()
    if (s1 < s2) return -1
    if (s1 > s2) return 1
    return 0
  }
  if ((n1 === Infinity && n2 === Infinity) || (n1 === -Infinity && n2 === -Infinity)) return 0
  return n1 - n2
}

function numberForCompare(value: Value): number {
  const n = Number(value)
  if (n === 0 && isWhiteSpace(value)) return NaN
  return n
}

/** Every item. Only delete accepts this. */
export const LIST_ALL = 'LIST_ALL' as const
/** The index does not name an item. Reads become "" and writes do nothing. */
export const LIST_INVALID = 'LIST_INVALID' as const

export type ListIndex = number | typeof LIST_ALL | typeof LIST_INVALID

/**
 * 1-based list position.
 * Exact lowercase "last", "random", and "any" are special. "all" counts only when `acceptAll` is set.
 * "LAST" is not special. Everything else is floored after toNumber, then rejected when it is outside 1..length.
 * `draw` is called only for "random" / "any" when length is positive. It must return a float in [0, 1), like runtime.random().
 * Insert passes length + 1 so "last" on an empty list is position 1.
 */
export function toListIndex(index: Value, length: number, acceptAll: boolean, draw: () => number): ListIndex {
  if (typeof index !== 'number') {
    if (index === 'all') return acceptAll ? LIST_ALL : LIST_INVALID
    if (index === 'last') return length > 0 ? length : LIST_INVALID
    if (index === 'random' || index === 'any') {
      if (length > 0) return 1 + Math.floor(draw() * length)
      return LIST_INVALID
    }
  }
  const i = Math.floor(toNumber(index))
  if (i < 1 || i > length) return LIST_INVALID
  return i
}
