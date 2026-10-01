/**
 * Operator blocks. Opcodes match Scratch's names so a block with that name keeps that behavior.
 * Trig, log, and exp go through detmath (decision 5). sin, cos, and tan are then rounded to 10 decimal places.
 * Inverse trig is left unrounded. pick random uses runtime.random() and does not draw when the ends are equal.
 */
import type { PrimitiveCtx, PrimitiveTable } from './contracts'
import { acosDeg, asinDeg, atanDeg, cosDeg, exp, ln, log10, pow10, sinDeg, tanDeg } from './detmath'
import { compare, isInt, toBoolean, toNumber, toString } from './values'

/** Powers of 10 for |n| <= 22 to avoid transcendental float noise on integer powers. */
const POWERS_OF_10: number[] = (() => {
  const table = [1]
  let p = 1
  for (let i = 1; i <= 22; i++) {
    p *= 10
    table.push(p)
  }
  return table
})()

function opPow10(n: number): number {
  if (Number.isInteger(n) && Math.abs(n) <= 22) {
    const pow = POWERS_OF_10[Math.abs(n)]
    return n >= 0 ? pow : 1 / pow
  }
  return pow10(n)
}

function opLog10(n: number): number {
  for (let i = 0; i <= 22; i++) {
    if (n === POWERS_OF_10[i]) return i
    if (i > 0 && n === 1 / POWERS_OF_10[i]) return -i
  }
  return log10(n)
}

function add(ctx: PrimitiveCtx): number {
  return toNumber(ctx.arg('NUM1')) + toNumber(ctx.arg('NUM2'))
}

function subtract(ctx: PrimitiveCtx): number {
  return toNumber(ctx.arg('NUM1')) - toNumber(ctx.arg('NUM2'))
}

function multiply(ctx: PrimitiveCtx): number {
  return toNumber(ctx.arg('NUM1')) * toNumber(ctx.arg('NUM2'))
}

function divide(ctx: PrimitiveCtx): number {
  return toNumber(ctx.arg('NUM1')) / toNumber(ctx.arg('NUM2'))
}

function lt(ctx: PrimitiveCtx): boolean {
  return compare(ctx.arg('OPERAND1'), ctx.arg('OPERAND2')) < 0
}

function equals(ctx: PrimitiveCtx): boolean {
  return compare(ctx.arg('OPERAND1'), ctx.arg('OPERAND2')) === 0
}

function gt(ctx: PrimitiveCtx): boolean {
  return compare(ctx.arg('OPERAND1'), ctx.arg('OPERAND2')) > 0
}

function and(ctx: PrimitiveCtx): boolean {
  return toBoolean(ctx.arg('OPERAND1')) && toBoolean(ctx.arg('OPERAND2'))
}

function or(ctx: PrimitiveCtx): boolean {
  return toBoolean(ctx.arg('OPERAND1')) || toBoolean(ctx.arg('OPERAND2'))
}

function not(ctx: PrimitiveCtx): boolean {
  return !toBoolean(ctx.arg('OPERAND'))
}

/**
 * Inclusive integer range when both inputs count as ints (see isInt). Otherwise a half-open real range:
 * low inclusive, high exclusive. Endpoints are ordered numerically. Equal endpoints return that number
 * and do not draw.
 */
function random(ctx: PrimitiveCtx): number {
  const from = ctx.arg('FROM')
  const to = ctx.arg('TO')
  const nFrom = toNumber(from)
  const nTo = toNumber(to)
  const low = nFrom <= nTo ? nFrom : nTo
  const high = nFrom <= nTo ? nTo : nFrom
  if (low === high) return low
  const draw = ctx.runtime.random()
  if (isInt(from) && isInt(to)) {
    return low + Math.floor(draw * (high - low + 1))
  }
  return low + draw * (high - low)
}

function join(ctx: PrimitiveCtx): string {
  return toString(ctx.arg('STRING1')) + toString(ctx.arg('STRING2'))
}

/** 1-based. The bounds check uses the fractional index; charAt then keeps the code unit at the truncated index. */
function letterOf(ctx: PrimitiveCtx): string {
  const index = toNumber(ctx.arg('LETTER')) - 1
  const text = toString(ctx.arg('STRING'))
  if (index < 0 || index >= text.length) return ''
  return text.charAt(index)
}

function length(ctx: PrimitiveCtx): number {
  return toString(ctx.arg('STRING')).length
}

function contains(ctx: PrimitiveCtx): boolean {
  const haystack = toString(ctx.arg('STRING1')).toLowerCase()
  const needle = toString(ctx.arg('STRING2')).toLowerCase()
  return haystack.includes(needle)
}

/** Floored remainder: the sign follows the divisor, except a zero remainder keeps the dividend's signed zero. */
function mod(ctx: PrimitiveCtx): number {
  const n = toNumber(ctx.arg('NUM1'))
  const modulus = toNumber(ctx.arg('NUM2'))
  let result = n % modulus
  if (result / modulus < 0) result += modulus
  return result
}

function round(ctx: PrimitiveCtx): number {
  return Math.round(toNumber(ctx.arg('NUM')))
}

/** Round a trig reporter the way the operator block does (10 decimal places, then drop trailing zeros). */
function roundTrig(n: number): number {
  return Number.parseFloat(n.toFixed(10))
}

function mathop(ctx: PrimitiveCtx): number {
  const operator = toString(ctx.field('OPERATOR')).toLowerCase()
  const n = toNumber(ctx.arg('NUM'))
  switch (operator) {
    case 'abs':
      return Math.abs(n)
    case 'floor':
      return Math.floor(n)
    case 'ceiling':
      return Math.ceil(n)
    case 'sqrt':
      return Math.sqrt(n)
    case 'sin':
      return roundTrig(sinDeg(n))
    case 'cos':
      return roundTrig(cosDeg(n))
    case 'tan':
      return roundTrig(tanDeg(n))
    case 'asin':
      return asinDeg(n)
    case 'acos':
      return acosDeg(n)
    case 'atan':
      return atanDeg(n)
    case 'ln':
      return ln(n)
    case 'log':
      return opLog10(n)
    case 'e ^':
      return exp(n)
    case '10 ^':
      return opPow10(n)
    default:
      return 0
  }
}

export const operatorPrimitives: PrimitiveTable = {
  operator_add: add,
  operator_subtract: subtract,
  operator_multiply: multiply,
  operator_divide: divide,
  operator_lt: lt,
  operator_equals: equals,
  operator_gt: gt,
  operator_and: and,
  operator_or: or,
  operator_not: not,
  operator_random: random,
  operator_join: join,
  operator_letter_of: letterOf,
  operator_length: length,
  operator_contains: contains,
  operator_mod: mod,
  operator_round: round,
  operator_mathop: mathop,
}
