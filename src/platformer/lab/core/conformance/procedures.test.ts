import { describe, expect, it } from 'vitest'
import type { Procedure } from '../contracts'
import {
  block,
  flagScript,
  lit,
  makeHarnessRuntime,
  param,
  stmt,
} from './harness'

describe('§1.9 My Blocks, parameter scope, recursion, and stop', () => {
  it('P01 · Arguments', () => {
    // Parameters are value snapshots, not variable aliases
    const procF: Procedure = {
      proccode: 'f %s',
      argumentNames: ['arg1'],
      warp: false,
      body: [
        stmt('data_setvariableto', { VALUE: lit(9) }, { VARIABLE: 'v' }),
        stmt('data_addtolist', { ITEM: param('arg1') }, { LIST: 'log' }),
      ],
    }

    const rt = makeHarnessRuntime({
      variables: [{ id: 'v', name: 'v', value: 5 }],
      lists: [{ id: 'log', name: 'log', value: [] }],
      procedures: [procF],
      scripts: [
        flagScript([
          stmt('procedures_call', {
            arg1: block('data_variable', {}, { VARIABLE: 'v' }),
          }, {}, undefined, { proccode: 'f %s' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    // Variable v was set to 9, but parameter arg1 retained snapshot value 5
    expect(rt.world.targets[0].variables.v).toBe(9)
    expect(rt.world.targets[0].lists.log).toEqual([5])
  })

  it('P02 · Nearest call only', () => {
    // getParam searches only the nearest call frame; absent name in nearest returns 0
    const procG: Procedure = {
      proccode: 'g',
      argumentNames: [], // does not declare x
      warp: false,
      body: [
        stmt('data_addtolist', { ITEM: param('x') }, { LIST: 'log' }),
      ],
    }

    const procF: Procedure = {
      proccode: 'f %s',
      argumentNames: ['x'],
      warp: false,
      body: [
        stmt('procedures_call', {}, {}, undefined, { proccode: 'g' }),
      ],
    }

    const rt = makeHarnessRuntime({
      lists: [{ id: 'log', name: 'log', value: [] }],
      procedures: [procF, procG],
      scripts: [
        flagScript([
          stmt('procedures_call', { x: lit(7) }, {}, undefined, { proccode: 'f %s' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    // In g, x reporter does not capture outer f's x, reports 0
    expect(rt.world.targets[0].lists.log).toEqual([0])
  })

  it('P03 · Defaults/missing define', () => {
    // Calling a nonexistent procedure definition is a safe no-op
    const rt = makeHarnessRuntime({
      lists: [{ id: 'log', name: 'log', value: [] }],
      scripts: [
        flagScript([
          stmt('procedures_call', {}, {}, undefined, { proccode: 'nonexistent' }),
          stmt('data_addtolist', { ITEM: lit('survived') }, { LIST: 'log' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].lists.log).toEqual(['survived'])
  })

  it('P04 · Recursion', () => {
    // Recursive procedure execution with parameter isolation across stack frames
    const countdownProc: Procedure = {
      proccode: 'countdown %n',
      argumentNames: ['n'],
      warp: false,
      body: [
        stmt('data_addtolist', { ITEM: param('n') }, { LIST: 'log' }),
        stmt('control_if', {
          CONDITION: block('operator_gt', {
            OPERAND1: param('n'),
            OPERAND2: lit(1),
          }),
        }, {}, [
          [
            stmt('procedures_call', {
              n: block('operator_subtract', {
                NUM1: param('n'),
                NUM2: lit(1),
              }),
            }, {}, undefined, { proccode: 'countdown %n' }),
          ],
        ]),
      ],
    }

    const rt = makeHarnessRuntime({
      lists: [{ id: 'log', name: 'log', value: [] }],
      procedures: [countdownProc],
      scripts: [
        flagScript([
          stmt('procedures_call', { n: lit(3) }, {}, undefined, { proccode: 'countdown %n' }),
        ]),
      ],
    })

    rt.greenFlag()
    // Steps to allow recursive calls to run
    for (let i = 0; i < 5; i++) rt.step()

    expect(rt.world.targets[0].lists.log).toEqual([3, 2, 1])
  })

  it('P05 · Warp inheritance', () => {
    // Warp mode propagates through nested procedure calls
    const innerProc: Procedure = {
      proccode: 'inner',
      argumentNames: [],
      warp: false, // declared non-warp, but inherits caller warp
      body: [
        stmt('control_repeat', { TIMES: lit(50) }, {}, [
          [stmt('motion_changexby', { DX: lit(1) })],
        ]),
      ],
    }

    const outerProc: Procedure = {
      proccode: 'outer',
      argumentNames: [],
      warp: true, // warp enabled
      body: [
        stmt('procedures_call', {}, {}, undefined, { proccode: 'inner' }),
      ],
    }

    const rt = makeHarnessRuntime({
      procedures: [outerProc, innerProc],
      scripts: [
        flagScript([
          stmt('procedures_call', {}, {}, undefined, { proccode: 'outer' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    // Completed all 50 iterations in single tick because inner inherited outer's warp
    expect(rt.world.targets[0].x).toBe(50)
  })

  it('P06 · Stop inside define', () => {
    // 'stop this script' inside a custom block acts as return to caller
    const procF: Procedure = {
      proccode: 'procF',
      argumentNames: [],
      warp: false,
      body: [
        stmt('data_addtolist', { ITEM: lit('inside') }, { LIST: 'log' }),
        stmt('control_stop', {}, { STOP_OPTION: 'this script' }),
        stmt('data_addtolist', { ITEM: lit('never') }, { LIST: 'log' }),
      ],
    }

    const rt = makeHarnessRuntime({
      lists: [{ id: 'log', name: 'log', value: [] }],
      procedures: [procF],
      scripts: [
        flagScript([
          stmt('procedures_call', {}, {}, undefined, { proccode: 'procF' }),
          stmt('data_addtolist', { ITEM: lit('after') }, { LIST: 'log' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    // Logs 'inside', then returns to caller and logs 'after'; 'never' is skipped
    expect(rt.world.targets[0].lists.log).toEqual(['inside', 'after'])
  })

  it('P07 · Stop at top level', () => {
    // 'stop this script' at top level terminates the thread
    const rt = makeHarnessRuntime({
      lists: [{ id: 'log', name: 'log', value: [] }],
      scripts: [
        flagScript([
          stmt('data_addtolist', { ITEM: lit('A') }, { LIST: 'log' }),
          stmt('control_stop', {}, { STOP_OPTION: 'this script' }),
          stmt('data_addtolist', { ITEM: lit('B') }, { LIST: 'log' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].lists.log).toEqual(['A'])
  })
})
