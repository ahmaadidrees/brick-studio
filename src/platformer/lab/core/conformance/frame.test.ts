import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TICK_OP_BUDGET,
  TICKS_PER_SECOND,
  TICK_MS,
  WARP_OP_LIMIT,
  YIELD,
  YIELD_TICK,
} from '../contracts'
import type { Procedure } from '../contracts'
import { submitAnswer } from '../sensing'
import {
  broadcastScript,
  block,
  clickScript,
  extraBrick,
  flagScript,
  keyScript,
  lit,
  makeHarnessRuntime,
  stepN,
  stmt,
} from './harness'

/** A warp procedure that burns `ops` loop iterations (each iteration is a few ops). */
function warpProc(proccode: string, iterations: number): Procedure {
  return {
    proccode,
    argumentNames: [],
    warp: true,
    body: [stmt('control_repeat', { TIMES: lit(iterations) }, {}, [[stmt('motion_changexby', { DX: lit(0) })]])],
  }
}
const callProc = (proccode: string) => stmt('procedures_call', {}, {}, undefined, { proccode })
const addLog = (item: string, list = 'trace') => stmt('data_addtolist', { ITEM: lit(item) }, { LIST: list })

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

  it('F02 · Work budget (KNOWN-DIFF: an op-count budget, not 75% of step time)', () => {
    // Code Lab budgets operations in a tick (opBudget), not wall-clock time.
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

    // The loop did not finish all 1000 iterations in one tick because the op budget ran out.
    const target = rt.world.targets[0]
    expect(target.variables.v1).toBeLessThan(1000)
    expect(target.variables.v1).toBeGreaterThan(0)
  })

  // FAILS-PENDING-FIX (runtime-fixes bug 1, warp starvation): the budget is checked mid-sweep, so a
  // thread that overruns it keeps the later threads from taking their turn in that sweep. Scratch
  // checks the budget only between sweeps: "a slow primitive can overrun the budget" and everyone
  // still gets a turn.
  it.fails('F02 · an overrun thread does not starve later threads in the same sweep', () => {
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      procedures: [warpProc('render', 25_000)], // far more than DEFAULT_TICK_OP_BUDGET
      scripts: [flagScript([callProc('render')], 'heavy'), flagScript([addLog('B')], 'sibling')],
    })
    expect(DEFAULT_TICK_OP_BUDGET).toBeLessThan(25_000)
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['B'])
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
    // A requests a redraw (a visible move). B still gets its turn in the same sweep, and there is no
    // second sweep in normal mode. Each forever iteration yields, so one sweep = one iteration each.
    const rt = makeHarnessRuntime({
      variables: [
        { id: 'va', name: 'va', value: 0 },
        { id: 'vb', name: 'vb', value: 0 },
      ],
      scripts: [
        flagScript(
          [stmt('control_forever', {}, {}, [[stmt('motion_movesteps', { STEPS: lit(1) }), stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'va' })]])],
          'scriptA',
        ),
        flagScript(
          [stmt('control_forever', {}, {}, [[stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'vb' })]])],
          'scriptB',
        ),
      ],
    })
    rt.greenFlag()
    rt.step()
    const target = rt.world.targets[0]
    expect(target.variables.va).toBe(1)
    expect(target.variables.vb).toBe(1) // B took its turn in the sweep in which A redrew
    rt.step()
    expect(target.variables.va).toBe(2) // exactly one sweep per tick: no second sweep
    expect(target.variables.vb).toBe(2)
  })

  // FAILS-PENDING-FIX (runtime-fixes bug 1, warp starvation): A redraws (visible move) and burns the
  // whole tick budget in a warp call; B must still get its turn in that sweep.
  it.fails('F05 · a heavy redrawing thread still lets the next thread take its turn', () => {
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      procedures: [warpProc('render', 25_000)],
      scripts: [flagScript([stmt('motion_movesteps', { STEPS: lit(1) }), callProc('render')], 'A'), flagScript([addLog('B')], 'B')],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['B'])
  })

  it('F06 · Hidden motion', () => {
    // Hidden targets do not request a redraw from a move, so a hidden mover gets many sweeps in one
    // tick; a visible mover requests a redraw every move, so it gets one sweep (one move) per tick.
    const build = (visible: boolean) =>
      makeHarnessRuntime({
        visible,
        variables: [{ id: 'count', name: 'count', value: 0 }],
        scripts: [
          flagScript([
            stmt('control_repeat', { TIMES: lit(5) }, {}, [
              [stmt('motion_changexby', { DX: lit(10) }), stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'count' })],
            ]),
          ]),
        ],
      })
    const hidden = build(false)
    hidden.greenFlag()
    hidden.step()
    expect(hidden.world.targets[0].variables.count).toBe(5)
    expect(hidden.world.targets[0].x).toBe(50)

    const shown = build(true)
    shown.greenFlag()
    shown.step()
    expect(shown.world.targets[0].variables.count).toBe(1)
    expect(shown.world.targets[0].x).toBe(10)
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

  // FAILS-PENDING-FIX / KNOWN-DIFF (audit item 4): inside a warp procedure Scratch revisits an
  // ordinary yield (wait 0) at once, within the same step; Code Lab's wait always yields to the next
  // tick. The runtime-fixes lane either fixes it (flip this test) or records it as a known difference.
  it.fails('F08 · wait zero inside a warp procedure is revisited in the same tick', () => {
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      procedures: [{ proccode: 'w', argumentNames: [], warp: true, body: [addLog('A1'), stmt('control_wait', { DURATION: lit(0) }), addLog('A2')] }],
      scripts: [flagScript([callProc('w')], 'sA')],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['A1', 'A2'])
  })

  it('F08 · wait zero inside a warp procedure still completes, in order, within two ticks', () => {
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      procedures: [{ proccode: 'w', argumentNames: [], warp: true, body: [addLog('A1'), stmt('control_wait', { DURATION: lit(0) }), addLog('A2')] }],
      scripts: [flagScript([callProc('w')], 'sA')],
    })
    rt.greenFlag()
    stepN(rt, 2)
    expect(rt.world.targets[0].lists.trace).toEqual(['A1', 'A2'])
  })

  it('F09 · Wait-until', () => {
    // wait until true: continues in the current turn. wait until false: later blocks do not run until
    // the condition changes.
    const rtTrue = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [flagScript([stmt('control_wait_until', { CONDITION: lit(true) }), addLog('A')])],
    })
    rtTrue.greenFlag()
    rtTrue.step()
    expect(rtTrue.world.targets[0].lists.trace).toEqual(['A'])

    const rt = makeHarnessRuntime({
      variables: [{ id: 'cond', name: 'cond', value: false }],
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        flagScript([
          stmt('control_wait_until', {
            CONDITION: block('data_variable', {}, { VARIABLE: 'cond' }),
          }),
          addLog('unblocked'),
        ]),
      ],
    })
    rt.greenFlag()
    stepN(rt, 3)
    expect(rt.world.targets[0].lists.trace).toEqual([])
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

  it('F10 · Warp ask-and-wait stays suspended until an answer', () => {
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      procedures: [{ proccode: 'w', argumentNames: [], warp: true, body: [stmt('sensing_askandwait', { QUESTION: lit('q?') }), addLog('after')] }],
      scripts: [flagScript([callProc('w')])],
    })
    rt.greenFlag()
    stepN(rt, 5)
    expect(rt.world.targets[0].lists.trace).toEqual([])
    expect(rt.world.askQueue.length).toBe(1)
    submitAnswer(rt, 'x')
    stepN(rt, 2)
    expect(rt.world.targets[0].lists.trace).toEqual(['after'])
  })

  it('F11 · Warp safety (KNOWN-DIFF: an op limit, not 500 ms)', () => {
    // Before the cutoff a warp loop keeps going (F10: 100 iterations in one tick). At the cutoff
    // (WARP_OP_LIMIT ops) the thread yields instead of running on to the end, and it later resumes
    // and finishes.
    const rt = makeHarnessRuntime({
      procedures: [warpProc('longLoop', WARP_OP_LIMIT + 50)],
      scripts: [flagScript([callProc('longLoop'), stmt('data_setvariableto', { VALUE: lit('done') }, { VARIABLE: 'status' })])],
      variables: [{ id: 'status', name: 'status', value: 'running' }],
    })
    rt.opBudget = 10 * WARP_OP_LIMIT // isolate the warp cutoff from the tick budget
    rt.greenFlag()
    rt.step()
    const thread = rt.threads().find((t) => !t.done)
    expect(thread).toBeDefined() // still alive after one tick: it yielded at the cutoff
    expect(rt.world.targets[0].variables.status).toBe('running')
    stepN(rt, 10)
    expect(rt.world.targets[0].variables.status).toBe('done')
  })

  // FAILS-PENDING-FIX (runtime-fixes bug 1, warp starvation): the audit's example. A render loop
  // that calls a 25,000-op warp procedure every iteration must not starve a sibling script.
  it.fails('F11 · a heavy warp render loop does not starve a sibling script', () => {
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      procedures: [warpProc('render', 25_000)],
      scripts: [
        flagScript([stmt('control_forever', {}, {}, [[callProc('render')]])], 'renderLoop'),
        flagScript([stmt('control_forever', {}, {}, [[addLog('B'), stmt('control_wait', { DURATION: lit(0) })]])], 'sibling'),
      ],
    })
    rt.greenFlag()
    stepN(rt, 10)
    // The sibling logs once per two ticks at most (wait 0 spans two ticks); starved it logs once.
    expect(rt.world.targets[0].lists.trace.length).toBeGreaterThanOrEqual(4)
  })

  it('F12 · Turbo', () => {
    // Turbo bypasses the redraw condition: a visible movement loop gets extra sweeps in one step.
    // Without turbo the same loop gets one sweep (one move) per step. An unresolved ask still suspends.
    const build = (turbo: boolean) => {
      const rt = makeHarnessRuntime({
        x: 0,
        scripts: [flagScript([stmt('control_repeat', { TIMES: lit(5) }, {}, [[stmt('motion_movesteps', { STEPS: lit(10) })]])])],
      })
      rt.turbo = turbo
      rt.greenFlag()
      rt.step()
      return rt
    }
    expect(build(false).world.targets[0].x).toBe(10)
    expect(build(true).world.targets[0].x).toBe(50)

    const ask = makeHarnessRuntime({
      variables: [{ id: 'done', name: 'done', value: false }],
      scripts: [flagScript([stmt('sensing_askandwait', { QUESTION: lit('q?') }), stmt('data_setvariableto', { VALUE: lit(true) }, { VARIABLE: 'done' })])],
    })
    ask.turbo = true
    ask.greenFlag()
    stepN(ask, 5)
    expect(ask.world.targets[0].variables.done).toBe(false)
    expect(ask.world.askQueue.length).toBe(1)
  })

  it('F13 · Hat launch order', () => {
    // Layer order [Stage, A, B] with the same hat on each: hats start B, A, Stage. Reversing a
    // target's script array reverses that target's own start order.
    const flagLog = (name: string, id: string) => flagScript([addLog(name, 'order')], id)
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'order', name: 'order', value: [] }],
      scripts: [flagLog('A1', 'a1'), flagLog('A2', 'a2')],
      stageScripts: [flagLog('Stage', 'stage1')],
      extraBricks: [extraBrick('b', 'B', [flagLog('B', 'b1')])],
      extraCopies: [{ id: 'copyB', brickId: 'b', x: 0, y: 0 }],
    })
    expect(rt.world.targets.map((t) => t.brickId)).toEqual(['sprite1', 'b']) // back -> front: A, B
    rt.greenFlag()
    rt.step()
    expect(rt.world.stage.lists.order).toEqual(['B', 'A1', 'A2', 'Stage'])

    // Reverse A's script array: A's two hats start in the opposite order.
    rt.world.bricks['sprite1'].program.scripts.reverse()
    rt.world.stage.lists.order = []
    rt.greenFlag()
    rt.step()
    expect(rt.world.stage.lists.order).toEqual(['B', 'A2', 'A1', 'Stage'])
  })

  it('F14 · Running thread order', () => {
    // A (back) and B (front) both running. Moving B to the back without restarting any hat leaves the
    // existing thread queue alone (B's thread still runs first); fresh hats follow the new layer order.
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        flagScript([stmt('control_wait', { DURATION: lit(0) }), addLog('flagA', 'trace')], 'flagA'),
        broadcastScript('go', [addLog('freshA', 'trace')], 'goA'),
      ],
      extraBricks: [
        extraBrick('b', 'B', [
          flagScript([stmt('control_wait', { DURATION: lit(0) }), addLog('flagB', 'trace')], 'flagB'),
          broadcastScript('go', [addLog('freshB', 'trace')], 'goB'),
        ]),
      ],
      extraCopies: [{ id: 'copyB', brickId: 'b', x: 0, y: 0 }],
    })
    rt.greenFlag()
    rt.step() // both at wait 0; thread queue is [B, A] (front-most target starts first)
    const targetB = rt.world.targets.find((t) => t.brickId === 'b')!
    rt.startStack(targetB, { id: 'toBack', hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} }, body: [stmt('looks_gotofrontback', {}, { FRONT_BACK: 'back' })] })
    rt.step() // the layer change happens; existing threads resume in queue order: flagB, flagA
    expect(rt.world.targets.map((t) => t.brickId)).toEqual(['b', 'sprite1']) // B is now at the back
    expect(rt.world.stage.lists.trace).toEqual(['flagB', 'flagA'])
    rt.world.stage.lists.trace = []
    rt.broadcast('go') // fresh hats use the new order: front-most (A) first
    rt.step()
    expect(rt.world.stage.lists.trace).toEqual(['freshA', 'freshB'])
  })

  // FAILS-PENDING-FIX (runtime-fixes bug 2, H05/F14): restarting a hat (here a sprite click) removes
  // the old thread and pushes the new one at the END of the queue. Scratch's _restartThread replaces
  // it at the same index, so the order stays [click, key].
  it.fails('F14 · a restarted hat thread keeps its place in the queue', () => {
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        clickScript([addLog('C1'), stmt('control_wait', { DURATION: lit(0) }), addLog('C2')], 'click'),
        keyScript('k', [addLog('K1'), stmt('control_wait', { DURATION: lit(0) }), addLog('K2')], 'key'),
      ],
    })
    const target = rt.world.targets[0]
    rt.clickTarget(target)
    rt.pressKey('k')
    rt.step() // C1, K1
    rt.clickTarget(target) // restart the click thread
    rt.step() // Scratch: C1 (restarted, first in queue), K2
    expect(target.lists.trace).toEqual(['C1', 'K1', 'C1', 'K2'])
  })

  it('F15 · Same-frame new work', () => {
    // A broadcasts during its turn: the receiver is appended to the live thread list and runs in the
    // same tick (not obligatorily the next one).
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        flagScript([addLog('start'), stmt('event_broadcast', {}, { BROADCAST_OPTION: 'ping' }), addLog('end')]),
        broadcastScript('ping', [addLog('received')]),
      ],
    })
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
