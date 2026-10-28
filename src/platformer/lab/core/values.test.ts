import { describe, expect, it } from 'vitest'
import { LIST_ALL, LIST_INVALID, compare, isInt, isWhiteSpace, toBoolean, toListIndex, toNumber, toString } from './values'

const noDraw = (): number => {
  throw new Error('list index drew a random number')
}

describe('values', () => {
  it('O01 · numeric cast', () => {
    expect(toNumber('cat')).toBe(0)
    expect(toNumber('  ')).toBe(0)
    expect(toNumber('3')).toBe(3)
    expect(toNumber(NaN)).toBe(0)
    expect(toNumber(Infinity)).toBe(Infinity)
    expect(toNumber(-Infinity)).toBe(-Infinity)
    // The fixture's additions: a number block casts, then adds.
    expect(toNumber('cat') + toNumber(1)).toBe(1)
    expect(toNumber('  ') + toNumber(1)).toBe(1)
    expect(toNumber('3') + toNumber(1)).toBe(4)
    expect(toNumber(NaN) + toNumber(1)).toBe(1)
    expect(toNumber(Infinity) + toNumber(1)).toBe(Infinity)

    expect(toNumber(true)).toBe(1)
    expect(toNumber(false)).toBe(0)
    expect(toNumber('')).toBe(0)
    expect(toNumber('  12 ')).toBe(12)
    expect(toNumber('Infinity')).toBe(Infinity)
    expect(toNumber('-Infinity')).toBe(-Infinity)
    expect(toNumber('0x10')).toBe(16)
    expect(toNumber('\n')).toBe(0)
  })

  it('O02 · boolean cast', () => {
    expect(toBoolean('false')).toBe(false)
    expect(toBoolean('FALSE')).toBe(false)
    expect(toBoolean('False')).toBe(false)
    expect(toBoolean('0.0')).toBe(true)
    expect(toBoolean(' false ')).toBe(true)
    expect(toBoolean(' ')).toBe(true)
    expect(toBoolean('')).toBe(false)
    expect(toBoolean('0')).toBe(false)
    expect(toBoolean('00')).toBe(true)
    expect(toBoolean('false ')).toBe(true)
    expect(toBoolean(0)).toBe(false)
    expect(toBoolean(-0)).toBe(false)
    expect(toBoolean(NaN)).toBe(false)
    expect(toBoolean(1)).toBe(true)
    expect(toBoolean(-2)).toBe(true)
    expect(toBoolean(Infinity)).toBe(true)
    expect(toBoolean(true)).toBe(true)
    expect(toBoolean(false)).toBe(false)
    // not of those strings, which is what the fixture lists.
    expect(!toBoolean('false')).toBe(true)
    expect(!toBoolean('FALSE')).toBe(true)
    expect(!toBoolean('0.0')).toBe(false)
    expect(!toBoolean(' false ')).toBe(false)
    expect(!toBoolean(' ')).toBe(false)
  })

  it('O03 · numeric comparison', () => {
    expect(compare('02', 2)).toBe(0)
    expect(compare('Apple', 'apple')).toBe(0)
    expect(compare('10', '2')).toBeGreaterThan(0)
    expect(compare('', 0)).not.toBe(0)
    expect(compare(' ', 0)).not.toBe(0)
    expect(compare('  ', '')).not.toBe(0)
    expect(compare(false, 0)).toBe(0)
    expect(compare('0', false)).toBe(0)
    expect(compare('0.0', 0)).toBe(0)
    expect(compare('false', false)).toBe(0)
    expect(compare('FALSE', 0)).not.toBe(0)
    expect(compare('cat', 0)).not.toBe(0)
    expect(compare('10a', '2')).toBe(-1)
    expect(compare('apple', 'banana')).toBe(-1)
    expect(compare('B', 'a')).toBeGreaterThan(0)
    expect(compare(5, 2)).toBe(3)
    expect(compare(NaN, NaN)).toBe(0)
    expect(compare(NaN, 'NaN')).toBe(0)
    expect(compare(NaN, 0)).not.toBe(0)
    expect(compare(Infinity, Infinity)).toBe(0)
    expect(compare(-Infinity, -Infinity)).toBe(0)
    expect(compare(Infinity, -Infinity)).toBeGreaterThan(0)
    expect(compare(true, '1')).toBe(0)
    expect(compare(true, true)).toBe(0)
  })

  it('treats whitespace as text in compare and nowhere else', () => {
    expect(isWhiteSpace(null)).toBe(true)
    expect(isWhiteSpace('')).toBe(true)
    expect(isWhiteSpace(' \t\n ')).toBe(true)
    expect(isWhiteSpace(' 0 ')).toBe(false)
    expect(isWhiteSpace(0)).toBe(false)
    expect(isWhiteSpace(false)).toBe(false)
    expect(toString(true)).toBe('true')
    expect(toString(false)).toBe('false')
    expect(toString(10)).toBe('10')
    expect(toString(-0)).toBe('0')
    expect(toString(Infinity)).toBe('Infinity')
    expect(toString(NaN)).toBe('NaN')
  })

  it('isInt follows the written form', () => {
    expect(isInt(2)).toBe(true)
    expect(isInt(2.0)).toBe(true)
    expect(isInt(-0)).toBe(true)
    expect(isInt(2.5)).toBe(false)
    expect(isInt(NaN)).toBe(true)
    expect(isInt(Infinity)).toBe(false)
    expect(isInt(-Infinity)).toBe(false)
    expect(isInt(1e21)).toBe(false)
    expect(isInt(true)).toBe(true)
    expect(isInt(false)).toBe(true)
    expect(isInt('2')).toBe(true)
    expect(isInt('2.0')).toBe(false)
    expect(isInt('1.0')).toBe(false)
    expect(isInt('.5')).toBe(false)
    expect(isInt('2.')).toBe(false)
    expect(isInt('')).toBe(true)
    expect(isInt('cat')).toBe(true)
    expect(isInt('1e2')).toBe(true)
    expect(isInt('1e-2')).toBe(true)
    expect(isInt(' 2 ')).toBe(true)
    expect(isInt('-3')).toBe(true)
    expect(isInt('+3')).toBe(true)
  })

  it('parses list indexes as 1-based positions', () => {
    expect(toListIndex(1.9, 3, false, noDraw)).toBe(1)
    expect(toListIndex('1.9', 3, false, noDraw)).toBe(1)
    expect(toListIndex(' 2 ', 3, false, noDraw)).toBe(2)
    expect(toListIndex(0, 3, false, noDraw)).toBe(LIST_INVALID)
    expect(toListIndex(4, 3, false, noDraw)).toBe(LIST_INVALID)
    expect(toListIndex(-1, 3, false, noDraw)).toBe(LIST_INVALID)
    expect(toListIndex(Infinity, 3, false, noDraw)).toBe(LIST_INVALID)
    expect(toListIndex(NaN, 3, false, noDraw)).toBe(LIST_INVALID)
    expect(toListIndex(true, 3, false, noDraw)).toBe(1)
    expect(toListIndex(false, 3, false, noDraw)).toBe(LIST_INVALID)
    expect(toListIndex('last', 2, false, noDraw)).toBe(2)
    expect(toListIndex('LAST', 2, false, noDraw)).toBe(LIST_INVALID)
    expect(toListIndex('Last', 2, false, noDraw)).toBe(LIST_INVALID)
    expect(toListIndex(' last', 2, false, noDraw)).toBe(LIST_INVALID)
    expect(toListIndex('all', 3, true, noDraw)).toBe(LIST_ALL)
    expect(toListIndex('all', 0, true, noDraw)).toBe(LIST_ALL)
    expect(toListIndex('all', 3, false, noDraw)).toBe(LIST_INVALID)
    expect(toListIndex('last', 0, false, noDraw)).toBe(LIST_INVALID)
    // Insert asks with length + 1, so "last" on an empty list is position 1.
    expect(toListIndex('last', 1, false, noDraw)).toBe(1)
  })

  it('draws a list index only for random and any on a non-empty list', () => {
    let draws = 0
    const draw = () => {
      draws++
      return 0
    }
    expect(toListIndex('random', 5, false, draw)).toBe(1)
    expect(toListIndex('any', 5, false, () => 0.999999)).toBe(5)
    expect(draws).toBe(1)
    const before = draws
    expect(toListIndex('random', 0, false, draw)).toBe(LIST_INVALID)
    expect(toListIndex('any', 0, false, draw)).toBe(LIST_INVALID)
    expect(toListIndex('last', 4, false, draw)).toBe(4)
    expect(draws).toBe(before)
    let once = 0
    expect(toListIndex('random', 1, false, () => {
      once++
      return 0.2
    })).toBe(1)
    expect(once).toBe(1)
  })
})
