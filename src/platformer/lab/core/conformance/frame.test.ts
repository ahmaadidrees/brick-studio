import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TICK_OP_BUDGET,
  TICKS_PER_SECOND,
  TICK_MS,
  WARP_OP_LIMIT,
  YIELD,
  YIELD_TICK,
} from '../contracts'
import type { Procedure, Script, Stmt, Value } from '../contracts'
import {
  block,
  flagScript,
  lit,
  makeHarnessDesign,
  makeHarnessRuntime,
  stmt,
} from './harness'

describe('§1.1 Frame loop, work budget, yielding, and ordering', () => {
  it('F01 · 30 vs 60', () => {
    // Assert 30 TPS nominal step interval constants
    expect(TICKS_PER_SECOND).toBe(30)
    expect(TICK_MS).toBeCloseTo(1000 / 30, 5)

    const rt = makeHarnessRuntime()
    expect(rt.nowMs()).toBe(0)
    rt.step()
    expect(rt.nowMs()).toBeCloseTo(33.3333, 3)
  })

  it('F02 · Work budget', () => {
    // Operations in one tick are budgeted by opBudget
    const rt = makeHarnessRuntime({
      variables: [{ id: 'v1', name: 'v1', value: 0 }],
      scripts: [
        flagScript([
          stmt('control_repeat', { TIMES: lit(1000) }, {}, [
            [stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'v1' })],
          ]),
        ]),
      ],
    })
    rt.opBudget = 50 // artificially low budget
    rt.greenFlag()
    rt.step()

    // Loop did not finish all 1000 iterations in 1 tick due to op budget
    const target = rt.world.targets[0]
    expect(target.variables.v1).toBeLessThan(1000)
    expect(target.variables.v1).toBeGreaterThan(0)
  })

  it('F03 · Straight-line scripts', () => {
    // A thread executes successive blocks until it yields, waits, or completes
    const rt = makeHarnessRuntime({
      x: 0,
      scripts: [
        flagScript([
          stmt('motion_setx', { X: lit(0) }),
          stmt('motion_changexby', { DX: lit(1) }),
          stmt('motion_changexby', { DX: lit(2) }),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].x).toBe(3)
  })

  it('F04 · Loop iteration yields', () => {
    // A small repeat loop without redraw request finishes in one frame
    const rt = makeHarnessRuntime({
      variables: [{ id: 'v', name: 'v', value: 0 }],
      scripts: [
        flagScript([
          stmt('control_repeat', { TIMES: lit(3) }, {}, [
            [stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'v' })],
          ]),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step()

    expect(rt.world.targets[0].variables.v).toBe(3)
  })

  it('F05 · Redraw', () => {
    // Redraw prevents another outer sweep in normal mode, not the remainder of current sweep
    const rt = makeHarnessRuntime({
      variables: [
        { id: 'va', name: 'va', value: 0 },
        { id: 'vb', name: 'vb', value: 0 },
      ],
      scripts: [
        flagScript(
          [
            stmt('motion_movesteps', { STEPS: lit(10) }),
            stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'va' }),
          ],
          'scriptA',
        ),
        flagScript(
          [
            stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'vb' }),
          ],
          'scriptB',
        ),
      ],
    })
    rt.greenFlag()
    rt.step()

    // Both scripts executed in the first sweep
    const target = rt.world.targets[0]
    expect(target.variables.va).toBe(1)
    expect(target.variables.vb).toBe(1)
  })

  it('F06 · Hidden motion', () => {
    // Hidden targets do not request redraw on setXY
    const rt = makeHarnessRuntime({
      visible: false,
      variables: [{ id: 'count', name: 'count', value: 0 }],
      scripts: [
        flagScript([
          stmt('control_repeat', { TIMES: lit(5) }, {}, [
            [
              stmt('motion_changexby', { DX: lit(10) }),
              stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'count' }),
            ],
          ]),
        ]),
      ],
    })
    rt.greenFlag()
    rt.step()

    // Because hidden sprite move does not trigger redraw, all 5 iterations complete in 1 tick
    const target = rt.world.targets[0]
    expect(target.variables.count).toBe(5)
    expect(target.x).toBe(50)
  })

  it('F07 · Ordinary yield vs yield-tick', () => {
    let yieldedOnce = false

    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('test_custom_yield'),
          stmt('data_addtolist', { ITEM: lit('A_done') }, { LIST: 'log' }),
        ], 'sA'),
        flagScript([
          stmt('data_addtolist', { ITEM: lit('B_run') }, { LIST: 'log' }),
        ], 'sB'),
      ],
      lists: [{ id: 'log', name: 'log', value: [] }],
    })

    rt.primitives['test_custom_yield'] = () => {
      if (!yieldedOnce) {
        yieldedOnce = true
        return YIELD_TICK
      }
      return
    }

    rt.greenFlag()
    rt.step()
    // Thread A paused for the remainder of this tick; Thread B ran
    expect(rt.world.targets[0].lists.log).toEqual(['B_run'])

    rt.step()
    // Thread A resumed on next tick and finished
    expect(rt.world.targets[0].lists.log).toEqual(['B_run', 'A_done'])
  })

  it('F08 · Wait zero', () => {
    // wait 0 yields and requests redraw, letting other threads take a turn
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        flagScript([
          stmt('data_addtolist', { ITEM: lit('A1') }, { LIST: 'trace' }),
          stmt('control_wait', { DURATION: lit(0) }),
          stmt('data_addtolist', { ITEM: lit('A2') }, { LIST: 'trace' }),
        ], 'sA'),
        flagScript([
          stmt('data_addtolist', { ITEM: lit('B') }, { LIST: 'trace' }),
        ], 'sB'),
      ],
    })

    rt.greenFlag()
    rt.step()
    // In tick 1: A1 runs, wait(0) yields, B runs.
    expect(rt.world.targets[0].lists.trace).toEqual(['A1', 'B'])

    rt.step()
    // In tick 2: A2 completes
    expect(rt.world.targets[0].lists.trace).toEqual(['A1', 'B', 'A2'])
  })

  it('F09 · Wait-until', () => {
    const rt = makeHarnessRuntime({
      variables: [{ id: 'cond', name: 'cond', value: false }],
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        flagScript([
          stmt('control_wait_until', {
            CONDITION: block('data_variable', {}, { VARIABLE: 'cond' }),
          }),
          stmt('data_addtolist', { ITEM: lit('unblocked') }, { LIST: 'trace' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual([])

    // Set cond = true and step
    rt.world.targets[0].variables.cond = true
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['unblocked'])
  })

  it('F10 · Warp', () => {
    // Warp procedure executes without yielding for screen refresh
    const fastProc: Procedure = {
      proccode: 'fastLoop',
      argumentNames: [],
      warp: true,
      body: [
        stmt('control_repeat', { TIMES: lit(100) }, {}, [
          [stmt('motion_changexby', { DX: lit(1) })],
        ]),
      ],
    }

    const rt = makeHarnessRuntime({
      procedures: [fastProc],
      scripts: [
        flagScript([
          stmt('procedures_call', {}, {}, undefined, { proccode: 'fastLoop' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    // Completes 100 steps in 1 tick
    expect(rt.world.targets[0].x).toBe(100)
  })

  it('F11 · Warp safety', () => {
    // Warp procedure that exceeds WARP_OP_LIMIT is forced to yield
    const longProc: Procedure = {
      proccode: 'longLoop',
      argumentNames: [],
      warp: true,
      body: [
        stmt('control_repeat', { TIMES: lit(WARP_OP_LIMIT + 50) }, {}, [
          [stmt('motion_changexby', { DX: lit(0) })],
        ]),
      ],
    }

    const rt = makeHarnessRuntime({
      procedures: [longProc],
      scripts: [
        flagScript([
          stmt('procedures_call', {}, {}, undefined, { proccode: 'longLoop' }),
          stmt('data_setvariableto', { VALUE: lit('done') }, { VARIABLE: 'status' }),
        ]),
      ],
      variables: [{ id: 'status', name: 'status', value: 'running' }],
    })

    rt.greenFlag()
    rt.step()
    // It yielded before finishing all WARP_OP_LIMIT + 50 ops
    expect(rt.world.targets[0].variables.status).toBe('running')
  })

  it('F12 · Turbo', () => {
    // Turbo mode ignores redraw request and continues sweeping until op budget or no runnable
    const rt = makeHarnessRuntime({
      x: 0,
      scripts: [
        flagScript([
          stmt('control_repeat', { TIMES: lit(5) }, {}, [
            [stmt('motion_movesteps', { STEPS: lit(10) })],
          ]),
        ]),
      ],
    })
    rt.turbo = true
    rt.greenFlag()
    rt.step()

    // All 5 steps completed in single tick under turbo mode
    expect(rt.world.targets[0].x).toBe(50)
  })

  it('F13 · Hat launch order', () => {
    // Reverse executableTargets: Stage is at the bottom, Sprite1 is above Stage.
    // Hats start front-to-back: Sprite1 first, then Stage.
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'order', name: 'order', value: [] }],
      scripts: [
        flagScript([
          stmt('data_addtolist', { ITEM: lit('sprite') }, { LIST: 'order' }),
        ]),
      ],
      stageScripts: [
        flagScript([
          stmt('data_addtolist', { ITEM: lit('stage') }, { LIST: 'order' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()

    // Sprite runs before Stage
    expect(rt.world.stage.lists.order).toEqual(['sprite', 'stage'])
  })

  it('F14 · Running thread order', () => {
    // Threads array order is maintained; changing layer order does not re-sort existing thread queue
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        flagScript([
          stmt('control_wait', { DURATION: lit(0) }),
          stmt('data_addtolist', { ITEM: lit('A') }, { LIST: 'trace' }),
        ], 'sA'),
        flagScript([
          stmt('control_wait', { DURATION: lit(0) }),
          stmt('data_addtolist', { ITEM: lit('B') }, { LIST: 'trace' }),
        ], 'sB'),
      ],
    })

    rt.greenFlag()
    // Step 1: both reach wait(0)
    rt.step()
    // Step 2: resume in original thread order
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['A', 'B'])
  })

  it('F15 · Same-frame new work', () => {
    // Broadcast receivers can execute within the same tick sweep if reached
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        flagScript([
          stmt('data_addtolist', { ITEM: lit('start') }, { LIST: 'trace' }),
          stmt('event_broadcast', {}, { BROADCAST_OPTION: 'ping' }),
          stmt('data_addtolist', { ITEM: lit('end') }, { LIST: 'trace' }),
        ]),
        stmt('event_whenbroadcastreceived', {}, { BROADCAST_OPTION: 'ping' }) as unknown as Script,
      ],
    })
    // Replace script 2 properly with broadcast hat
    rt.world.bricks['sprite1'].program.scripts[1] = {
      id: 'recv',
      hat: { opcode: 'event_whenbroadcastreceived', fields: { BROADCAST_OPTION: 'ping' }, inputs: {} },
      body: [stmt('data_addtolist', { ITEM: lit('received') }, { LIST: 'trace' })],
    }

    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['start', 'end', 'received'])
  })

  it('F16 · Reporter evaluation', () => {
    // Both arguments of boolean operators are evaluated (no JS short-circuit)
    const evaluated: string[] = []
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([
          stmt('data_setvariableto', {
            VALUE: block('operator_and', {
              OPERAND1: block('rep1'),
              OPERAND2: block('rep2'),
            }),
          }, { VARIABLE: 'res' }),
        ]),
      ],
      variables: [{ id: 'res', name: 'res', value: '' }],
    })

    rt.primitives['rep1'] = () => {
      evaluated.push('rep1')
      return false
    }
    rt.primitives['rep2'] = () => {
      evaluated.push('rep2')
      return true
    }

    rt.greenFlag()
    rt.step()

    expect(evaluated).toEqual(['rep1', 'rep2'])
    expect(rt.world.targets[0].variables.res).toBe(false)
  })
})
