import { describe, expect, it } from 'vitest'
import { YIELD } from './contracts'
import type { Primitive, Value } from './contracts'
import { fakeRuntime, makeWorld } from './testkit'
import { callPrimitive } from './testkit'
import { operatorPrimitives } from './operators'

const OPCODES = [
  'operator_add',
  'operator_subtract',
  'operator_multiply',
  'operator_divide',
  'operator_random',
  'operator_gt',
  'operator_lt',
  'operator_equals',
  'operator_and',
  'operator_or',
  'operator_not',
  'operator_join',
  'operator_letter_of',
  'operator_length',
  'operator_contains',
  'operator_mod',
  'operator_round',
  'operator_mathop',
] as const

function prim(opcode: string): Primitive {
  const fn = operatorPrimitives[opcode]
  if (!fn) throw new Error(`missing ${opcode}`)
  return fn
}

function run(opcode: string, args: Record<string, Value> = {}, fields: Record<string, string> = {}, random?: () => number): Value | undefined {
  const world = makeWorld()
  const rt = fakeRuntime(world)
  if (random) rt.random = random
  const out = callPrimitive(prim(opcode), { runtime: rt, args, fields })
  if (out.result === YIELD) throw new Error(`${opcode} yielded`)
  expect(out.ticks).toBe(0)
  return out.result as Value | undefined
}

function math(operator: string, n: Value): Value | undefined {
  return run('operator_mathop', { NUM: n }, { OPERATOR: operator })
}

describe('operators', () => {
  it('registers every operator opcode', () => {
    for (const opcode of OPCODES) expect(typeof operatorPrimitives[opcode]).toBe('function')
  })

  it('O01 · numeric cast', () => {
    expect(run('operator_add', { NUM1: 'cat', NUM2: 1 })).toBe(1)
    expect(run('operator_add', { NUM1: '  ', NUM2: 1 })).toBe(1)
    expect(run('operator_add', { NUM1: '3', NUM2: 1 })).toBe(4)
    expect(run('operator_add', { NUM1: NaN, NUM2: 1 })).toBe(1)
    expect(run('operator_add', { NUM1: Infinity, NUM2: 1 })).toBe(Infinity)
    expect(run('operator_add', { NUM1: '\n', NUM2: 1 })).toBe(1)
    expect(run('operator_subtract', { NUM1: '10', NUM2: '3' })).toBe(7)
    expect(run('operator_multiply', { NUM1: '1.5', NUM2: '4' })).toBe(6)
    expect(run('operator_divide', { NUM1: '5', NUM2: '2' })).toBe(2.5)
    expect(run('operator_add', { NUM1: true, NUM2: false })).toBe(1)
    // A missing input reads as '', which is 0.
    expect(run('operator_add', { NUM1: 4 })).toBe(4)
  })

  it('O02 · boolean cast', () => {
    expect(run('operator_not', { OPERAND: 'false' })).toBe(true)
    expect(run('operator_not', { OPERAND: 'FALSE' })).toBe(true)
    expect(run('operator_not', { OPERAND: '0.0' })).toBe(false)
    expect(run('operator_not', { OPERAND: ' false ' })).toBe(false)
    expect(run('operator_not', { OPERAND: ' ' })).toBe(false)
    expect(run('operator_not', { OPERAND: '' })).toBe(true)
    expect(run('operator_not', { OPERAND: '0' })).toBe(true)
    expect(run('operator_not', { OPERAND: 0 })).toBe(true)
    expect(run('operator_not', { OPERAND: 1 })).toBe(false)
    expect(run('operator_and', { OPERAND1: '0.0', OPERAND2: 'false' })).toBe(false)
    expect(run('operator_and', { OPERAND1: '0.0', OPERAND2: 1 })).toBe(true)
    expect(run('operator_or', { OPERAND1: '0', OPERAND2: ' ' })).toBe(true)
    expect(run('operator_or', { OPERAND1: '', OPERAND2: 'false' })).toBe(false)
    expect(run('operator_and', { OPERAND1: 0, OPERAND2: 'no-short-circuit' })).toBe(false)
  })

  it('O03 · numeric comparison', () => {
    expect(run('operator_equals', { OPERAND1: '02', OPERAND2: 2 })).toBe(true)
    expect(run('operator_equals', { OPERAND1: 'Apple', OPERAND2: 'apple' })).toBe(true)
    expect(run('operator_lt', { OPERAND1: '10', OPERAND2: '2' })).toBe(false)
    expect(run('operator_gt', { OPERAND1: '10', OPERAND2: '2' })).toBe(true)
    expect(run('operator_lt', { OPERAND1: '2', OPERAND2: '10' })).toBe(true)
    expect(run('operator_equals', { OPERAND1: '', OPERAND2: 0 })).toBe(false)
    expect(run('operator_equals', { OPERAND1: ' ', OPERAND2: 0 })).toBe(false)
    expect(run('operator_equals', { OPERAND1: false, OPERAND2: 0 })).toBe(true)
    expect(run('operator_equals', { OPERAND1: '0.0', OPERAND2: 0 })).toBe(true)
    expect(run('operator_equals', { OPERAND1: 'false', OPERAND2: false })).toBe(true)
    expect(run('operator_lt', { OPERAND1: 'apple', OPERAND2: 'banana' })).toBe(true)
    expect(run('operator_gt', { OPERAND1: 'b', OPERAND2: 'a' })).toBe(true)
  })

  it('O04 · Infinity/NaN', () => {
    expect(run('operator_divide', { NUM1: 1, NUM2: 0 })).toBe(Infinity)
    expect(run('operator_divide', { NUM1: -1, NUM2: 0 })).toBe(-Infinity)
    const nan = run('operator_divide', { NUM1: 0, NUM2: 0 })
    expect(Number.isNaN(nan)).toBe(true)
    // The reporter keeps NaN. The next numeric block casts it to 0, so NaN + 1 is 1.
    expect(run('operator_add', { NUM1: nan as number, NUM2: 1 })).toBe(1)
    expect(run('operator_equals', { OPERAND1: Infinity, OPERAND2: Infinity })).toBe(true)
    expect(run('operator_equals', { OPERAND1: -Infinity, OPERAND2: -Infinity })).toBe(true)
    expect(run('operator_equals', { OPERAND1: Infinity, OPERAND2: -Infinity })).toBe(false)
    expect(run('operator_gt', { OPERAND1: Infinity, OPERAND2: 5 })).toBe(true)
    expect(run('operator_equals', { OPERAND1: NaN, OPERAND2: NaN })).toBe(true)
  })

  it('O05 · negative mod', () => {
    expect(run('operator_mod', { NUM1: -5, NUM2: 3 })).toBe(1)
    expect(run('operator_mod', { NUM1: 5, NUM2: -3 })).toBe(-1)
    expect(run('operator_mod', { NUM1: -5, NUM2: -3 })).toBe(-2)
    expect(Number.isNaN(run('operator_mod', { NUM1: 5, NUM2: 0 }))).toBe(true)
    expect(run('operator_mod', { NUM1: '-5', NUM2: '3' })).toBe(1)
    expect(run('operator_mod', { NUM1: 7.5, NUM2: 2 })).toBe(1.5)
    expect(run('operator_mod', { NUM1: -7.5, NUM2: 2 })).toBe(0.5)
    expect(run('operator_mod', { NUM1: 5.5, NUM2: -2 })).toBe(-0.5)
    expect(Object.is(run('operator_mod', { NUM1: 4, NUM2: 2 }), 0)).toBe(true)
    expect(Object.is(run('operator_mod', { NUM1: 4, NUM2: -2 }), 0)).toBe(true)
    expect(Object.is(run('operator_mod', { NUM1: -4, NUM2: 2 }), -0)).toBe(true)
    expect(Object.is(run('operator_mod', { NUM1: -4, NUM2: -2 }), -0)).toBe(true)
    expect(Number.isNaN(run('operator_mod', { NUM1: 'cat', NUM2: 0 }))).toBe(true)
  })

  it('O06 · round', () => {
    expect(run('operator_round', { NUM: 2.5 })).toBe(3)
    expect(run('operator_round', { NUM: -2.5 })).toBe(-2)
    expect(run('operator_round', { NUM: 'cat' })).toBe(0)
    expect(Object.is(run('operator_round', { NUM: -0.5 }), -0)).toBe(true)
    expect(run('operator_round', { NUM: 0.5 })).toBe(1)
    expect(run('operator_round', { NUM: -1.5 })).toBe(-1)
    expect(run('operator_round', { NUM: '-2.5' })).toBe(-2)
    expect(run('operator_round', { NUM: true })).toBe(1)
    expect(Object.is(run('operator_round', { NUM: -0 }), -0)).toBe(true)
  })

  it('O07 · random integer rule', () => {
    expect(run('operator_random', { FROM: 1, TO: 2 }, {}, () => 0.5)).toBe(2)
    expect(run('operator_random', { FROM: '1.0', TO: '2.0' }, {}, () => 0.5)).toBe(1.5)
    // Numeric 2.0 is an integer, so the same draw lands on 2, not 1.5.
    expect(run('operator_random', { FROM: 1, TO: 2.0 }, {}, () => 0.5)).toBe(2)
    // One decimal-point string forces the real range.
    expect(run('operator_random', { FROM: 1, TO: '2.0' }, {}, () => 0.5)).toBe(1.5)
    // Booleans count as integers: false is 0, true is 1.
    expect(run('operator_random', { FROM: false, TO: true }, {}, () => 0.5)).toBe(1)
    // Strings without a decimal point count as integers even when they are not numeric.
    expect(run('operator_random', { FROM: '1', TO: 'cat' }, {}, () => 0)).toBe(0)
  })

  it('O08 · random bounds', () => {
    const world = makeWorld({ seed: 1 })
    const rt = fakeRuntime(world)
    let draws = 0
    rt.random = () => {
      draws++
      return 0
    }
    const same = callPrimitive(prim('operator_random'), { runtime: rt, args: { FROM: 7, TO: 7 } })
    expect(same.result).toBe(7)
    expect(draws).toBe(0)
    const state = world.rngState
    expect(callPrimitive(prim('operator_random'), { runtime: rt, args: { FROM: '7', TO: '7' } }).result).toBe(7)
    expect(draws).toBe(0)
    expect(world.rngState).toBe(state)

    expect(run('operator_random', { FROM: 3, TO: 1 }, {}, () => 0)).toBe(1)
    expect(run('operator_random', { FROM: 1, TO: 3 }, {}, () => 0.999999999999)).toBe(3)
    expect(run('operator_random', { FROM: '2.0', TO: '1.0' }, {}, () => 0)).toBe(1)
    // A draw of 0 on a real range is the lower end and does not reach the upper end.
    expect(run('operator_random', { FROM: 1.25, TO: 1.75 }, {}, () => 0)).toBe(1.25)
  })

  it('O09 · join', () => {
    expect(run('operator_join', { STRING1: 1, STRING2: 2 })).toBe('12')
    expect(run('operator_join', { STRING1: true, STRING2: '!' })).toBe('true!')
    expect(run('operator_join', { STRING1: false, STRING2: 0 })).toBe('false0')
    expect(run('operator_join', { STRING1: '', STRING2: '' })).toBe('')
    expect(run('operator_join', { STRING1: Infinity, STRING2: '' })).toBe('Infinity')
  })

  it('O10 · letter', () => {
    expect(run('operator_letter_of', { LETTER: 1, STRING: 'abc' })).toBe('a')
    expect(run('operator_letter_of', { LETTER: 0, STRING: 'abc' })).toBe('')
    expect(run('operator_letter_of', { LETTER: 4, STRING: 'abc' })).toBe('')
    expect(run('operator_letter_of', { LETTER: 1.8, STRING: 'abc' })).toBe('a')
    expect(run('operator_letter_of', { LETTER: 0.8, STRING: 'abc' })).toBe('')
    expect(run('operator_letter_of', { LETTER: 2.2, STRING: 'abc' })).toBe('b')
    expect(run('operator_letter_of', { LETTER: '2', STRING: 'abc' })).toBe('b')
    expect(run('operator_letter_of', { LETTER: 1, STRING: -12 })).toBe('-')
    expect(run('operator_letter_of', { LETTER: 'cat', STRING: 'abc' })).toBe('')
  })

  it('O11 · length/Unicode', () => {
    const emoji = '😀'
    expect(emoji.length).toBe(2)
    expect(run('operator_length', { STRING: emoji })).toBe(2)
    const first = run('operator_letter_of', { LETTER: 1, STRING: emoji })
    const second = run('operator_letter_of', { LETTER: 2, STRING: emoji })
    expect(first).not.toBe(emoji)
    expect(second).not.toBe(emoji)
    expect(String(first).length).toBe(1)
    expect(String(first) + String(second)).toBe(emoji)
    expect(run('operator_length', { STRING: 100 })).toBe(3)
    expect(run('operator_length', { STRING: true })).toBe(4)
    expect(run('operator_length', { STRING: '' })).toBe(0)
    // A single BMP character is one code unit. The emoji is not.
    expect(run('operator_length', { STRING: 'é' })).toBe(1)
  })

  it('O12 · contains', () => {
    expect(run('operator_contains', { STRING1: 'Hello', STRING2: 'ELL' })).toBe(true)
    expect(run('operator_contains', { STRING1: 'a', STRING2: '' })).toBe(true)
    expect(run('operator_contains', { STRING1: '', STRING2: '' })).toBe(true)
    expect(run('operator_contains', { STRING1: 'Hello', STRING2: 'hello' })).toBe(true)
    expect(run('operator_contains', { STRING1: 'abc', STRING2: 'z' })).toBe(false)
    expect(run('operator_contains', { STRING1: 12, STRING2: 1 })).toBe(true)
  })

  it('O13 · trig', () => {
    expect(math('sin', 30)).toBe(0.5)
    expect(math('sin', -30)).toBe(-0.5)
    expect(math('cos', 90)).toBe(0)
    expect(math('cos', 0)).toBe(1)
    expect(math('sin', 90)).toBe(1)
    expect(math('sin', 180)).toBe(0)
    expect(math('cos', 180)).toBe(-1)
    expect(math('tan', 90)).toBe(Infinity)
    expect(math('tan', 270)).toBe(-Infinity)
    expect(math('tan', -90)).toBe(-Infinity)
    expect(math('tan', 450)).toBe(Infinity)
    expect(math('tan', 45)).toBe(1)
    expect(math('tan', 0)).toBe(0)
    const sin1 = math('sin', 1) as number
    expect(sin1).toBe(Number.parseFloat(sin1.toFixed(10)))
    expect(Math.abs(sin1 - Math.sin(Math.PI / 180))).toBeLessThan(5e-11)
    expect(math('asin', 1)).toBe(90)
    expect(math('asin', 0)).toBe(0)
    expect(math('acos', 1)).toBe(0)
    expect(math('acos', 0)).toBe(90)
    expect(math('atan', 0)).toBe(0)
    expect(math('atan', Infinity)).toBeCloseTo(90, 9)
    // Inverse trig is not forced through the 10-decimal rounding.
    const asinHalf = math('asin', 0.5) as number
    expect(asinHalf).toBeCloseTo(30, 6)
  })

  it('O14 · math operations', () => {
    const sqrtNeg = math('sqrt', -1)
    expect(Number.isNaN(sqrtNeg)).toBe(true)
    expect(math('ln', 0)).toBe(-Infinity)
    expect(run('operator_add', { NUM1: sqrtNeg as number, NUM2: 1 })).toBe(1)
    expect(math('sqrt', 4)).toBe(2)
    expect(math('sqrt', 0)).toBe(0)
    expect(Number.isNaN(math('ln', -1))).toBe(true)
    expect(Number.isNaN(math('log', -1))).toBe(true)
    expect(math('ln', 1)).toBe(0)
    expect(math('log', 1)).toBe(0)
    expect(math('log', 10)).toBe(1)
    expect(math('log', 100)).toBe(2)
    expect(math('log', 1000)).toBe(3)
    expect(math('log', 0.1)).toBe(-1)
    expect(math('log', 0.01)).toBe(-2)
    expect(math('log', 50)).toBeCloseTo(1.69897, 4)
    expect(math('e ^', 0)).toBe(1)
    expect(math('10 ^', 0)).toBe(1)
    expect(math('10 ^', 1)).toBe(10)
    expect(math('10 ^', 2)).toBe(100)
    expect(math('10 ^', 3)).toBe(1000)
    expect(math('10 ^', -1)).toBe(0.1)
    expect(math('10 ^', -2)).toBe(0.01)
    expect(math('10 ^', 0.5)).toBeCloseTo(3.162277, 5)
    expect(math('abs', -4)).toBe(4)
    expect(math('abs', 'cat')).toBe(0)
    expect(math('floor', 1.9)).toBe(1)
    expect(math('floor', -1.1)).toBe(-2)
    expect(math('ceiling', 1.1)).toBe(2)
    expect(math('ceiling', -1.1)).toBe(-1)
    expect(math('ABS', -3)).toBe(3)
    expect(math('E ^', 0)).toBe(1)
    expect(math('nope', 5)).toBe(0)
    expect(math('', 5)).toBe(0)
    expect(Number.isNaN(math('asin', 2))).toBe(true)
    expect(Number.isNaN(math('acos', -2))).toBe(true)
  })

  it('does not ask for a redraw', () => {
    const world = makeWorld()
    const rt = fakeRuntime(world)
    callPrimitive(prim('operator_add'), { runtime: rt, args: { NUM1: 1, NUM2: 1 } })
    expect(rt.redraws).toBe(0)
  })
})
