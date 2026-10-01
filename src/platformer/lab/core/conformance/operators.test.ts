import { describe, expect, it } from 'vitest'
import {
  block,
  flagScript,
  lit,
  makeHarnessRuntime,
  stmt,
} from './harness'

describe('§1.7 Operators, coercion, string behavior, and random', () => {
  it('O01 · Numeric cast', () => {
    // "cat" + 1 -> 1; " " + 1 -> 1; "3" + 1 -> 4; Infinity + 1 -> Infinity
    const testCases = [
      { op1: 'cat', op2: 1, expected: 1 },
      { op1: '   ', op2: 1, expected: 1 },
      { op1: '3', op2: 1, expected: 4 },
      { op1: Infinity, op2: 1, expected: Infinity },
    ]

    for (const tc of testCases) {
      const rt = makeHarnessRuntime({
        variables: [{ id: 'res', name: 'res', value: 0 }],
        scripts: [
          flagScript([
            stmt('data_setvariableto', {
              VALUE: block('operator_add', { NUM1: lit(tc.op1), NUM2: lit(tc.op2) }),
            }, { VARIABLE: 'res' }),
          ]),
        ],
      })
      rt.greenFlag()
      rt.step()
      expect(rt.world.targets[0].variables.res).toBe(tc.expected)
    }
  })

  it('O02 · Boolean cast', () => {
    // Only '', '0', case-insensitive 'false' are false; all other strings are true
    const testCases = [
      { input: 'false', expected: true }, // not 'false' -> true
      { input: 'FALSE', expected: true }, // not 'FALSE' -> true
      { input: '0.0', expected: false }, // not '0.0' -> false ('0.0' is truthy string)
      { input: ' false ', expected: false }, // not ' false ' -> false (truthy string)
      { input: ' ', expected: false }, // not ' ' -> false (truthy string)
      { input: '0', expected: true }, // not '0' -> true ('0' is falsy)
      { input: '', expected: true }, // not '' -> true ('' is falsy)
    ]

    for (const tc of testCases) {
      const rt = makeHarnessRuntime({
        variables: [{ id: 'res', name: 'res', value: false }],
        scripts: [
          flagScript([
            stmt('data_setvariableto', {
              VALUE: block('operator_not', { OPERAND: lit(tc.input) }),
            }, { VARIABLE: 'res' }),
          ]),
        ],
      })
      rt.greenFlag()
      rt.step()
      expect(rt.world.targets[0].variables.res).toBe(tc.expected)
    }
  })

  it('O03 · Numeric comparison', () => {
    // Numeric when both are numbers, otherwise case-insensitive lexicographic
    const testCases = [
      { op1: '02', op2: 2, opcode: 'operator_equals', expected: true },
      { op1: 'Apple', op2: 'apple', opcode: 'operator_equals', expected: true },
      { op1: '10', op2: '2', opcode: 'operator_lt', expected: false }, // 10 < 2 is false numerically
      { op1: '', op2: 0, opcode: 'operator_equals', expected: false }, // '' = 0 is false
    ]

    for (const tc of testCases) {
      const rt = makeHarnessRuntime({
        variables: [{ id: 'res', name: 'res', value: false }],
        scripts: [
          flagScript([
            stmt('data_setvariableto', {
              VALUE: block(tc.opcode, { OPERAND1: lit(tc.op1), OPERAND2: lit(tc.op2) }),
            }, { VARIABLE: 'res' }),
          ]),
        ],
      })
      rt.greenFlag()
      rt.step()
      expect(rt.world.targets[0].variables.res).toBe(tc.expected)
    }
  })

  it('O04 · Infinity/NaN', () => {
    // 1/0 -> Infinity, 0/0 -> NaN, (0/0) + 1 -> 1
    const rt = makeHarnessRuntime({
      variables: [
        { id: 'divInf', name: 'divInf', value: 0 },
        { id: 'divNaN', name: 'divNaN', value: 0 },
        { id: 'addNaN', name: 'addNaN', value: 0 },
      ],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('operator_divide', { NUM1: lit(1), NUM2: lit(0) }),
          }, { VARIABLE: 'divInf' }),
          stmt('data_setvariableto', {
            VALUE: block('operator_divide', { NUM1: lit(0), NUM2: lit(0) }),
          }, { VARIABLE: 'divNaN' }),
          stmt('data_setvariableto', {
            VALUE: block('operator_add', {
              NUM1: block('operator_divide', { NUM1: lit(0), NUM2: lit(0) }),
              NUM2: lit(1),
            }),
          }, { VARIABLE: 'addNaN' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].variables.divInf).toBe(Infinity)
    expect(Number.isNaN(rt.world.targets[0].variables.divNaN)).toBe(true)
    expect(rt.world.targets[0].variables.addNaN).toBe(1)
  })

  it('O05 · Negative mod', () => {
    // Floored division modulo
    const testCases = [
      { n: -5, d: 3, expected: 1 },
      { n: 5, d: -3, expected: -1 },
      { n: -5, d: -3, expected: -2 },
    ]

    for (const tc of testCases) {
      const rt = makeHarnessRuntime({
        variables: [{ id: 'res', name: 'res', value: 0 }],
        scripts: [
          flagScript([
            stmt('data_setvariableto', {
              VALUE: block('operator_mod', { NUM1: lit(tc.n), NUM2: lit(tc.d) }),
            }, { VARIABLE: 'res' }),
          ]),
        ],
      })
      rt.greenFlag()
      rt.step()
      expect(rt.world.targets[0].variables.res).toBe(tc.expected)
    }

    // 5 mod 0 -> NaN
    const rtZero = makeHarnessRuntime({
      variables: [{ id: 'res', name: 'res', value: 0 }],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('operator_mod', { NUM1: lit(5), NUM2: lit(0) }),
          }, { VARIABLE: 'res' }),
        ]),
      ],
    })
    rtZero.greenFlag()
    rtZero.step()
    expect(Number.isNaN(rtZero.world.targets[0].variables.res)).toBe(true)
  })

  it('O06 · Round', () => {
    // Math.round after cast: halfway values round toward +Infinity
    const testCases = [
      { input: 2.5, expected: 3 },
      { input: -2.5, expected: -2 },
      { input: 'cat', expected: 0 },
    ]

    for (const tc of testCases) {
      const rt = makeHarnessRuntime({
        variables: [{ id: 'res', name: 'res', value: 0 }],
        scripts: [
          flagScript([
            stmt('data_setvariableto', {
              VALUE: block('operator_round', { NUM: lit(tc.input) }),
            }, { VARIABLE: 'res' }),
          ]),
        ],
      })
      rt.greenFlag()
      rt.step()
      expect(rt.world.targets[0].variables.res).toBe(tc.expected)
    }
  })

  it('O07 · Random integer rule', () => {
    // Strings with decimal points count as floats even if mathematically whole
    // E.g., '1.0' to '2.0' returns floats; 1 to 2 returns integers
    const rt = makeHarnessRuntime({
      variables: [{ id: 'rInt', name: 'rInt', value: 0 }, { id: 'rFloat', name: 'rFloat', value: 0 }],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('operator_random', { FROM: lit(1), TO: lit(2) }),
          }, { VARIABLE: 'rInt' }),
          stmt('data_setvariableto', {
            VALUE: block('operator_random', { FROM: lit('1.0'), TO: lit('2.0') }),
          }, { VARIABLE: 'rFloat' }),
        ]),
      ],
    })

    rt.random = () => 0.5
    rt.greenFlag()
    rt.random = () => 0.5
    rt.step()

    // With random = 0.5:
    // Integer 1 to 2: low + Math.floor(0.5 * (2 - 1 + 1)) = 1 + 1 = 2
    expect(rt.world.targets[0].variables.rInt).toBe(2)
    // Float '1.0' to '2.0': low + 0.5 * (high - low) = 1.0 + 0.5 * 1.0 = 1.5
    expect(rt.world.targets[0].variables.rFloat).toBeCloseTo(1.5, 5)
  })

  it('O08 · Random bounds', () => {
    // Descending bounds are swapped; equal bounds return value directly
    const rt = makeHarnessRuntime({
      variables: [
        { id: 'swapped', name: 'swapped', value: 0 },
        { id: 'equal', name: 'equal', value: 0 },
      ],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('operator_random', { FROM: lit(3), TO: lit(1) }),
          }, { VARIABLE: 'swapped' }),
          stmt('data_setvariableto', {
            VALUE: block('operator_random', { FROM: lit(7), TO: lit(7) }),
          }, { VARIABLE: 'equal' }),
        ]),
      ],
    })

    rt.random = () => 0
    rt.greenFlag()
    rt.random = () => 0
    rt.step()

    // 3 to 1 swapped to 1 to 3 with rand = 0 -> 1
    expect(rt.world.targets[0].variables.swapped).toBe(1)
    // 7 to 7 -> 7 directly
    expect(rt.world.targets[0].variables.equal).toBe(7)
  })

  it('O09 · Join', () => {
    // Concatenates string representations without separator
    const rt = makeHarnessRuntime({
      variables: [{ id: 'res', name: 'res', value: '' }],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('operator_join', { STRING1: lit(1), STRING2: lit(2) }),
          }, { VARIABLE: 'res' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].variables.res).toBe('12')
  })

  it('O10 · Letter', () => {
    // 1-based index; invalid or out-of-range -> ''; fractional truncated
    const testCases = [
      { str: 'abc', idx: 1, expected: 'a' },
      { str: 'abc', idx: 0, expected: '' },
      { str: 'abc', idx: 4, expected: '' },
      { str: 'abc', idx: 1.8, expected: 'a' },
      { str: 'abc', idx: 0.8, expected: '' },
    ]

    for (const tc of testCases) {
      const rt = makeHarnessRuntime({
        variables: [{ id: 'res', name: 'res', value: 'x' }],
        scripts: [
          flagScript([
            stmt('data_setvariableto', {
              VALUE: block('operator_letter_of', { LETTER: lit(tc.idx), STRING: lit(tc.str) }),
            }, { VARIABLE: 'res' }),
          ]),
        ],
      })
      rt.greenFlag()
      rt.step()
      expect(rt.world.targets[0].variables.res).toBe(tc.expected)
    }
  })

  it('O11 · Length/Unicode', () => {
    // String length operates on UTF-16 code units
    const rt = makeHarnessRuntime({
      variables: [{ id: 'len', name: 'len', value: 0 }],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('operator_length', { STRING: lit('😀') }),
          }, { VARIABLE: 'len' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].variables.len).toBe(2)
  })

  it('O12 · Contains', () => {
    // Case-insensitive substring; empty string is contained
    const testCases = [
      { str1: 'Hello', str2: 'ELL', expected: true },
      { str1: 'a', str2: '', expected: true },
      { str1: 'Hello', str2: 'world', expected: false },
    ]

    for (const tc of testCases) {
      const rt = makeHarnessRuntime({
        variables: [{ id: 'res', name: 'res', value: false }],
        scripts: [
          flagScript([
            stmt('data_setvariableto', {
              VALUE: block('operator_contains', { STRING1: lit(tc.str1), STRING2: lit(tc.str2) }),
            }, { VARIABLE: 'res' }),
          ]),
        ],
      })
      rt.greenFlag()
      rt.step()
      expect(rt.world.targets[0].variables.res).toBe(tc.expected)
    }
  })

  it('O13 · Trig', () => {
    // sin(30) -> 0.5, cos(90) -> 0
    const rt = makeHarnessRuntime({
      variables: [
        { id: 's30', name: 's30', value: 0 },
        { id: 'c90', name: 'c90', value: 1 },
      ],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('operator_mathop', { NUM: lit(30) }, { OPERATOR: 'sin' }),
          }, { VARIABLE: 's30' }),
          stmt('data_setvariableto', {
            VALUE: block('operator_mathop', { NUM: lit(90) }, { OPERATOR: 'cos' }),
          }, { VARIABLE: 'c90' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].variables.s30).toBeCloseTo(0.5, 5)
    expect(rt.world.targets[0].variables.c90).toBeCloseTo(0, 5)
  })

  it('O14 · Math operations', () => {
    // sqrt(-1) -> NaN, ln(0) -> -Infinity; (sqrt(-1)) + 1 -> 1 via numeric cast
    const rt = makeHarnessRuntime({
      variables: [
        { id: 'sqrtNeg', name: 'sqrtNeg', value: 0 },
        { id: 'lnZero', name: 'lnZero', value: 0 },
        { id: 'addCast', name: 'addCast', value: 0 },
      ],
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('operator_mathop', { NUM: lit(-1) }, { OPERATOR: 'sqrt' }),
          }, { VARIABLE: 'sqrtNeg' }),
          stmt('data_setvariableto', {
            VALUE: block('operator_mathop', { NUM: lit(0) }, { OPERATOR: 'ln' }),
          }, { VARIABLE: 'lnZero' }),
          stmt('data_setvariableto', {
            VALUE: block('operator_add', {
              NUM1: block('operator_mathop', { NUM: lit(-1) }, { OPERATOR: 'sqrt' }),
              NUM2: lit(1),
            }),
          }, { VARIABLE: 'addCast' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(Number.isNaN(rt.world.targets[0].variables.sqrtNeg)).toBe(true)
    expect(rt.world.targets[0].variables.lnZero).toBe(-Infinity)
    expect(rt.world.targets[0].variables.addCast).toBe(1)
  })

  it('O01 · Numeric cast (a NaN reporter + 1)', () => {
    // 0/0 reports NaN; adding 1 casts the NaN to 0 first, giving 1.
    const rt = makeHarnessRuntime({
      variables: [{ id: 'nan', name: 'nan', value: 0 }, { id: 'res', name: 'res', value: 0 }],
      scripts: [
        flagScript([
          stmt('data_setvariableto', { VALUE: block('operator_divide', { NUM1: lit(0), NUM2: lit(0) }) }, { VARIABLE: 'nan' }),
          stmt('data_setvariableto', { VALUE: block('operator_add', { NUM1: block('data_variable', {}, { VARIABLE: 'nan' }), NUM2: lit(1) }) }, { VARIABLE: 'res' }),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].variables.nan).toBeNaN()
    expect(rt.world.targets[0].variables.res).toBe(1)
  })

  it('O06 · Round (round -0.5 is negative zero)', () => {
    const rt = makeHarnessRuntime({
      variables: [{ id: 'res', name: 'res', value: 1 }],
      scripts: [flagScript([stmt('data_setvariableto', { VALUE: block('operator_round', { NUM: lit(-0.5) }) }, { VARIABLE: 'res' })])],
    })
    rt.greenFlag()
    rt.step()
    expect(Object.is(rt.world.targets[0].variables.res, -0)).toBe(true)
  })

  it('O08 · Random bounds (RNG near 1 gives the inclusive upper integer)', () => {
    const rt = makeHarnessRuntime({
      variables: [{ id: 'res', name: 'res', value: 0 }],
      scripts: [flagScript([stmt('data_setvariableto', { VALUE: block('operator_random', { FROM: lit(1), TO: lit(3) }) }, { VARIABLE: 'res' })])],
    })
    rt.random = () => 0.999999
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].variables.res).toBe(3)
  })

  it('O09 · Join (a boolean joins as its text)', () => {
    const rt = makeHarnessRuntime({
      variables: [{ id: 'res', name: 'res', value: '' }],
      scripts: [flagScript([stmt('data_setvariableto', { VALUE: block('operator_join', { STRING1: lit(true), STRING2: lit('!') }) }, { VARIABLE: 'res' })])],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].variables.res).toBe('true!')
  })
})
