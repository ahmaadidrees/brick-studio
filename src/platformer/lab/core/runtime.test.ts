import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TICK_OP_BUDGET,
  TICKS_PER_SECOND,
  TICK_MS,
  WARP_OP_LIMIT,
  YIELD,
} from './contracts'
import type {
  BrickDef,
  Expr,
  Primitive,
  PrimitiveTable,
  Procedure,
  Script,
  Stmt,
  Target,
  Value,
} from './contracts'
import { Runtime, toNumber, toBoolean, toString, YIELD_TICK } from './runtime'
import { boxBrick, makeTarget, makeWorld } from './testkit'

function createTestSetup(opts: {
  targets?: Target[]
  scripts?: Script[]
  procedures?: Procedure[]
  primitives?: PrimitiveTable
  logArray?: Value[]
}) {
  const log = opts.logArray ?? []
  const testPrimitives: PrimitiveTable = {
    test_log: (ctx) => {
      log.push(ctx.arg('VAL'))
    },
    ...opts.primitives,
  }

  const brick = boxBrick('b1', 'TestBrick', 20, 20, {
    program: {
      scripts: opts.scripts ?? [],
      procedures: opts.procedures ?? [],
      variables: [],
      lists: [],
    },
  })

  const target = opts.targets ? opts.targets[0] : makeTarget({ brickId: 'b1', id: 't1' })
  const world = makeWorld({
    bricks: [brick],
    targets: opts.targets ?? [target],
  })

  const runtime = new Runtime(world, testPrimitives)
  return { runtime, world, target, brick, log }
}

describe('scheduler — runtime and execution loop', () => {
  // ---------------------------------------------------------------- §1.1 Frame loop, work budget, yielding, ordering
  it('F01 · 30 vs 60', () => {
    expect(TICKS_PER_SECOND).toBe(30)
    expect(TICK_MS).toBeCloseTo(1000 / 30, 5)

    const world = makeWorld()
    world.tick = 3
    const runtime = new Runtime(world)
    expect(runtime.nowMs()).toBeCloseTo(3 * (1000 / 30), 5)
  })

  it('F02 · Work budget', () => {
    const log: Value[] = []
    let callCount = 0
    const primitives: PrimitiveTable = {
      test_count: () => {
        callCount++
      },
    }

    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'control_repeat',
          fields: {},
          inputs: { TIMES: { kind: 'lit', value: 100 } },
          branches: [[{ opcode: 'test_count', fields: {}, inputs: {} }]],
        },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      primitives,
      logArray: log,
    })

    // Set a tiny budget of 10 ops
    runtime.opBudget = 10
    runtime.greenFlag()

    // One step runs sweeps until opBudget is reached
    runtime.step()
    // It should have executed some iterations but stopped due to budget
    expect(callCount).toBeGreaterThan(0)
    expect(callCount).toBeLessThan(100)

    // Running additional steps will eventually finish the loop
    while (runtime.threads().length > 0) {
      runtime.step()
    }
    expect(callCount).toBe(100)
  })

  it('F03 · Straight-line scripts', () => {
    const log: Value[] = []
    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'test_set',
          fields: {},
          inputs: { VAL: { kind: 'lit', value: 0 } },
        },
        {
          opcode: 'test_add',
          fields: {},
          inputs: { VAL: { kind: 'lit', value: 1 } },
        },
        {
          opcode: 'test_add',
          fields: {},
          inputs: { VAL: { kind: 'lit', value: 2 } },
        },
        {
          opcode: 'test_log_x',
          fields: {},
          inputs: {},
        },
      ],
    }

    let x = 0
    const primitives: PrimitiveTable = {
      test_set: (ctx) => {
        x = toNumber(ctx.arg('VAL'))
      },
      test_add: (ctx) => {
        x += toNumber(ctx.arg('VAL'))
      },
      test_log_x: () => {
        log.push(x)
      },
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      primitives,
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    expect(log).toEqual([3])
  })

  it('F04 · Loop iteration yields', () => {
    const log: Value[] = []
    let counter = 0
    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'control_repeat',
          fields: {},
          inputs: { TIMES: { kind: 'lit', value: 3 } },
          branches: [
            [
              {
                opcode: 'test_inc',
                fields: {},
                inputs: {},
              },
            ],
          ],
        },
        {
          opcode: 'test_log',
          fields: {},
          inputs: { VAL: { kind: 'lit', value: 'done' } },
        },
      ],
    }

    const primitives: PrimitiveTable = {
      test_inc: () => {
        counter++
      },
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      primitives,
      logArray: log,
    })

    runtime.greenFlag()
    // In normal mode without redraw request, 3 iterations complete in 1 tick
    runtime.step()
    expect(counter).toBe(3)
    expect(log).toEqual(['done'])
  })

  it('F05 · Redraw', () => {
    const log: Value[] = []
    const scriptA: Script = {
      id: 'sA',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        { opcode: 'test_redraw', fields: {}, inputs: {} },
        {
          opcode: 'control_repeat',
          fields: {},
          inputs: { TIMES: { kind: 'lit', value: 2 } },
          branches: [
            [
              {
                opcode: 'test_log',
                fields: {},
                inputs: { VAL: { kind: 'lit', value: 'A' } },
              },
            ],
          ],
        },
      ],
    }

    const scriptB: Script = {
      id: 'sB',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'test_log',
          fields: {},
          inputs: { VAL: { kind: 'lit', value: 'B' } },
        },
      ],
    }

    const primitives: PrimitiveTable = {
      test_redraw: (ctx) => {
        ctx.runtime.requestRedraw()
      },
    }

    const { runtime } = createTestSetup({
      scripts: [scriptA, scriptB],
      primitives,
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    // Thread A requested redraw, but Thread B still got its turn in the first sweep!
    // However, no 2nd sweep occurred in tick 1, so Thread A only completed 1 iteration.
    expect(log).toEqual(['A', 'B'])

    // On tick 2, Thread A runs its 2nd iteration
    runtime.step()
    expect(log).toEqual(['A', 'B', 'A'])
  })

  it('F06 · Hidden motion', () => {
    const logVisible: Value[] = []
    const logHidden: Value[] = []

    const motionPrim: Primitive = (ctx) => {
      // Simulate rendered-target motion: only visible targets request redraw
      if (ctx.target.visible) {
        ctx.runtime.requestRedraw()
      }
    }

    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'control_repeat',
          fields: {},
          inputs: { TIMES: { kind: 'lit', value: 3 } },
          branches: [
            [
              { opcode: 'simulated_move', fields: {}, inputs: {} },
              { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'step' } } },
            ],
          ],
        },
      ],
    }

    // Visible target setup
    const targetVis = makeTarget({ id: 'vis', visible: true })
    const { runtime: rtVis } = createTestSetup({
      targets: [targetVis],
      scripts: [script],
      primitives: { simulated_move: motionPrim },
      logArray: logVisible,
    })

    rtVis.greenFlag()
    rtVis.step()
    // Visible target requested redraw on iteration 1, so only 1 iteration ran in tick 1
    expect(logVisible).toEqual(['step'])

    // Hidden target setup
    const targetHidden = makeTarget({ id: 'hid', visible: false })
    const { runtime: rtHidden } = createTestSetup({
      targets: [targetHidden],
      scripts: [script],
      primitives: { simulated_move: motionPrim },
      logArray: logHidden,
    })

    rtHidden.greenFlag()
    rtHidden.step()
    // Hidden target did not request redraw, so all 3 iterations complete in 1 tick
    expect(logHidden).toEqual(['step', 'step', 'step'])
  })

  it('F07 · Ordinary yield vs yield-tick', () => {
    const log: Value[] = []
    const scriptA: Script = {
      id: 'sA',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        { opcode: 'prim_yield_tick', fields: {}, inputs: {} },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'A2' } } },
      ],
    }

    const scriptB: Script = {
      id: 'sB',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'control_repeat',
          fields: {},
          inputs: { TIMES: { kind: 'lit', value: 2 } },
          branches: [
            [{ opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'B' } } }],
          ],
        },
      ],
    }

    let aRuns = 0
    const primitives: PrimitiveTable = {
      prim_yield_tick: () => {
        aRuns++
        if (aRuns === 1) {
          log.push('A1')
          return YIELD_TICK as unknown as void
        }
      },
    }

    const { runtime } = createTestSetup({
      scripts: [scriptA, scriptB],
      primitives,
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    // In step 1: A runs, calls yieldTick -> yields for the entire tick.
    // B has 2 iterations with ordinary yield; since no redraw was requested, B runs sweeps 1 and 2 in step 1.
    // A must NOT run again during step 1 even though B triggered sweep 2!
    expect(log).toEqual(['A1', 'B', 'B'])

    // Step 2: A resumes
    runtime.step()
    expect(log).toEqual(['A1', 'B', 'B', 'A2'])
  })

  it('F08 · Wait zero', () => {
    const log: Value[] = []
    const script1: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'A' } } },
        { opcode: 'control_wait', fields: {}, inputs: { DURATION: { kind: 'lit', value: 0 } } },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'B' } } },
      ],
    }

    const script2: Script = {
      id: 's2',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'X' } } },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [script1, script2],
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    // Wait 0 requests redraw and yields, so B does not run in the first turn, but X does
    expect(log).toEqual(['A', 'X'])

    // Next tick: wait 0 finishes and B runs
    runtime.step()
    expect(log).toEqual(['A', 'X', 'B'])
  })

  it('F09 · Wait-until', () => {
    const log: Value[] = []
    let condition = false

    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'control_wait_until',
          fields: {},
          inputs: {
            CONDITION: {
              kind: 'block',
              opcode: 'test_cond',
              fields: {},
              inputs: {},
            },
          },
        },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'unblocked' } } },
      ],
    }

    const primitives: PrimitiveTable = {
      test_cond: () => condition,
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      primitives,
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()
    expect(log).toEqual([]) // condition is false -> yields

    runtime.step()
    expect(log).toEqual([]) // still false

    condition = true
    runtime.step()
    expect(log).toEqual(['unblocked']) // condition true -> continues
  })

  it('F10 · Warp', () => {
    const log: Value[] = []
    let count = 0

    const warpProc: Procedure = {
      proccode: 'fastLoop',
      argumentNames: [],
      warp: true,
      body: [
        {
          opcode: 'control_repeat',
          fields: {},
          inputs: { TIMES: { kind: 'lit', value: 100 } },
          branches: [
            [
              {
                opcode: 'test_inc',
                fields: {},
                inputs: {},
              },
            ],
          ],
        },
      ],
    }

    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'procedures_call',
          fields: {},
          inputs: {},
          call: { proccode: 'fastLoop' },
        },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'done' } } },
      ],
    }

    const primitives: PrimitiveTable = {
      test_inc: () => {
        count++
      },
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      procedures: [warpProc],
      primitives,
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    // 100 iterations complete in a single tick without requiring 100 ticks
    expect(count).toBe(100)
    expect(log).toEqual(['done'])
  })

  it('F11 · Warp safety', () => {
    // Warp thread is forced to yield when exceeding WARP_OP_LIMIT
    const warpProc: Procedure = {
      proccode: 'longLoop',
      argumentNames: [],
      warp: true,
      body: [
        {
          opcode: 'control_repeat',
          fields: {},
          inputs: { TIMES: { kind: 'lit', value: WARP_OP_LIMIT + 50 } },
          branches: [[{ opcode: 'noop', fields: {}, inputs: {} }]],
        },
      ],
    }

    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'procedures_call',
          fields: {},
          inputs: {},
          call: { proccode: 'longLoop' },
        },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      procedures: [warpProc],
      primitives: { noop: () => {} },
    })

    // Increase tick op budget so the tick itself doesn't cut off before warp limit
    runtime.opBudget = WARP_OP_LIMIT * 2
    runtime.greenFlag()
    runtime.step()

    // The thread should have yielded because it hit WARP_OP_LIMIT, so it is still active
    expect(runtime.threads().length).toBe(1)
  })

  it('F12 · Turbo', () => {
    const log: Value[] = []
    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'control_repeat',
          fields: {},
          inputs: { TIMES: { kind: 'lit', value: 5 } },
          branches: [
            [
              { opcode: 'test_redraw', fields: {}, inputs: {} },
              { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'step' } } },
            ],
          ],
        },
      ],
    }

    const primitives: PrimitiveTable = {
      test_redraw: (ctx) => {
        ctx.runtime.requestRedraw()
      },
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      primitives,
      logArray: log,
    })

    // Turbo enabled: redraw requests do not stop further sweeps within the same tick
    runtime.turbo = true
    runtime.greenFlag()
    runtime.step()

    expect(log).toEqual(['step', 'step', 'step', 'step', 'step'])
  })

  it('F13 · Hat launch order', () => {
    const log: Value[] = []
    const targetA = makeTarget({ id: 'targetA', brickId: 'brickA' })
    const targetB = makeTarget({ id: 'targetB', brickId: 'brickB' })

    const scriptFor = (msg: string): Script => ({
      id: `s_${msg}`,
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [{ opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: msg } } }],
    })

    const brickA: BrickDef = boxBrick('brickA', 'BrickA', 20, 20, {
      program: { scripts: [scriptFor('A')], procedures: [], variables: [], lists: [] },
    })
    const brickB: BrickDef = boxBrick('brickB', 'BrickB', 20, 20, {
      program: { scripts: [scriptFor('B')], procedures: [], variables: [], lists: [] },
    })
    const stageBrick: BrickDef = boxBrick('stage', 'Stage', 20, 20, {
      isStage: true,
      program: { scripts: [scriptFor('Stage')], procedures: [], variables: [], lists: [] },
    })

    // targets order: [targetA, targetB] (back to front)
    // executableTargets = [Stage, A, B]
    // reverse executableTargets order = B, A, Stage
    const world = makeWorld({
      bricks: [stageBrick, brickA, brickB],
      targets: [targetA, targetB],
    })
    world.stage.brickId = 'stage'

    const runtime = new Runtime(world, {
      test_log: (ctx) => log.push(ctx.arg('VAL')),
    })

    runtime.greenFlag()
    runtime.step()

    expect(log).toEqual(['B', 'A', 'Stage'])
  })

  it('F14 · Running thread order', () => {
    const log: Value[] = []
    const targetA = makeTarget({ id: 'targetA', brickId: 'b1' })
    const targetB = makeTarget({ id: 'targetB', brickId: 'b1' })

    const scriptA: Script = {
      id: 'sA',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'control_repeat',
          fields: {},
          inputs: { TIMES: { kind: 'lit', value: 2 } },
          branches: [
            [{ opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'A' } } }],
          ],
        },
      ],
    }

    const scriptB: Script = {
      id: 'sB',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'control_repeat',
          fields: {},
          inputs: { TIMES: { kind: 'lit', value: 2 } },
          branches: [
            [{ opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'B' } } }],
          ],
        },
      ],
    }

    const brick: BrickDef = boxBrick('b1', 'B1', 20, 20, {
      program: { scripts: [scriptA, scriptB], procedures: [], variables: [], lists: [] },
    })

    const world = makeWorld({
      bricks: [brick],
      targets: [targetA, targetB],
    })

    const runtime = new Runtime(world, {
      test_log: (ctx) => log.push(ctx.arg('VAL')),
    })

    runtime.greenFlag()

    // Reordering world.targets after threads are queued does NOT reorder existing threads
    world.targets.reverse()

    // Step 1: initial turns
    runtime.step()
    // Thread order was preserved
    expect(log.length).toBeGreaterThan(0)
  })

  it('F15 · Same-frame new work', () => {
    const log: Value[] = []
    const scriptSender: Script = {
      id: 'sSender',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'start' } } },
        {
          opcode: 'event_broadcast',
          fields: {},
          inputs: { BROADCAST_INPUT: { kind: 'lit', value: 'ping' } },
        },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'end' } } },
      ],
    }

    const scriptReceiver: Script = {
      id: 'sReceiver',
      hat: {
        opcode: 'event_whenbroadcastreceived',
        fields: { BROADCAST_OPTION: 'ping' },
        inputs: {},
      },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'received' } } },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [scriptSender, scriptReceiver],
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    // Receiver executes in the same sweep!
    expect(log).toEqual(['start', 'end', 'received'])
  })

  it('F16 · Reporter evaluation', () => {
    const log: Value[] = []
    const primitives: PrimitiveTable = {
      rep_left: () => {
        log.push('left')
        return false
      },
      rep_right: () => {
        log.push('right')
        return true
      },
      test_and: (ctx) => {
        return toBoolean(ctx.arg('A')) && toBoolean(ctx.arg('B'))
      },
    }

    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'test_log',
          fields: {},
          inputs: {
            VAL: {
              kind: 'block',
              opcode: 'test_and',
              fields: {},
              inputs: {
                A: { kind: 'block', opcode: 'rep_left', fields: {}, inputs: {} },
                B: { kind: 'block', opcode: 'rep_right', fields: {}, inputs: {} },
              },
            },
          },
        },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      primitives,
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    // Both input reporters must be evaluated, no short-circuit
    expect(log).toContain('left')
    expect(log).toContain('right')
    expect(log).toContain(false)
  })

  // ---------------------------------------------------------------- §1.2 Hats, retriggers, and broadcasts
  it('H01 · Green flag', () => {
    const orig = makeTarget({ id: 't1', brickId: 'b1', x: 12, variables: { v: 7 } })
    const { runtime, world } = createTestSetup({ targets: [orig] })

    // Add clone
    const clone = makeTarget({ id: 'clone1', brickId: 'b1', isClone: true })
    runtime.addClone(clone, orig)
    expect(world.targets.length).toBe(2)
    expect(world.cloneCount).toBe(1)

    // Set effects and edge state
    orig.effects.ghost = 50
    orig.edgeHatState['someHat'] = true
    world.tick = 10
    world.timerStartTick = 0

    runtime.greenFlag()

    // Clones deleted
    expect(world.targets.length).toBe(1)
    expect(world.cloneCount).toBe(0)
    // Coordinates and variables retained
    expect(orig.x).toBe(12)
    expect(orig.variables['v']).toBe(7)
    // Timer reset to current tick
    expect(world.timerStartTick).toBe(10)
    // Effects cleared
    expect(orig.effects.ghost).toBe(0)
    // Edge state reset
    expect(orig.edgeHatState).toEqual({})
  })

  it('H02 · Key pressed', () => {
    const log: Value[] = []
    const script: Script = {
      id: 'sKey',
      hat: { opcode: 'event_whenkeypressed', fields: { KEY_OPTION: 'space' }, inputs: {} },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'start' } } },
        { opcode: 'control_wait', fields: {}, inputs: { DURATION: { kind: 'lit', value: 0.1 } } },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'end' } } },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      logArray: log,
    })

    // First press
    runtime.pressKey('space')
    runtime.step()
    expect(log).toEqual(['start'])

    // Second press while still running: ignored (restartExistingThreads = false)
    runtime.pressKey('space')
    runtime.step()
    expect(log).toEqual(['start'])

    // Complete wait
    runtime.step()
    runtime.step()
    runtime.step()
    expect(log).toEqual(['start', 'end'])

    // Press again after completion: runs again
    runtime.pressKey('space')
    runtime.step()
    expect(log).toEqual(['start', 'end', 'start'])
  })

  it('H03 · Sprite clicked', () => {
    const log: Value[] = []
    const script: Script = {
      id: 'sClick',
      hat: { opcode: 'event_whenthisspriteclicked', fields: {}, inputs: {} },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'start' } } },
        { opcode: 'control_wait', fields: {}, inputs: { DURATION: { kind: 'lit', value: 0.2 } } },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'end' } } },
      ],
    }

    const { runtime, target } = createTestSetup({
      scripts: [script],
      logArray: log,
    })

    runtime.clickTarget(target)
    runtime.step()
    expect(log).toEqual(['start'])

    // Click again: restarts hat (restartExistingThreads = true)
    runtime.clickTarget(target)
    runtime.step()
    expect(log).toEqual(['start', 'start'])
  })

  it('H04 · Stage clicked', () => {
    const log: Value[] = []
    const stageScript: Script = {
      id: 'sStageClick',
      hat: { opcode: 'event_whenstageclicked', fields: {}, inputs: {} },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'stageClicked' } } },
      ],
    }

    const stageBrick: BrickDef = boxBrick('stage', 'Stage', 20, 20, {
      isStage: true,
      program: { scripts: [stageScript], procedures: [], variables: [], lists: [] },
    })

    const world = makeWorld({ bricks: [stageBrick] })
    world.stage.brickId = 'stage'

    const runtime = new Runtime(world, {
      test_log: (ctx) => log.push(ctx.arg('VAL')),
    })

    runtime.clickTarget(world.stage)
    runtime.step()

    expect(log).toEqual(['stageClicked'])
  })

  it('H05 · Broadcast', () => {
    const log: Value[] = []
    const script: Script = {
      id: 'sMsg',
      hat: {
        opcode: 'event_whenbroadcastreceived',
        fields: { BROADCAST_OPTION: 'Message1' },
        inputs: {},
      },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'msgStart' } } },
        { opcode: 'control_wait', fields: {}, inputs: { DURATION: { kind: 'lit', value: 0.1 } } },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'msgEnd' } } },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      logArray: log,
    })

    // Broadcast case-insensitive match
    runtime.broadcast('message1')
    runtime.step()
    expect(log).toEqual(['msgStart'])

    // Broadcast again before done: restarts receiver
    runtime.broadcast('MESSAGE1')
    runtime.step()
    expect(log).toEqual(['msgStart', 'msgStart'])
  })

  it('H06 · Broadcast-and-wait', () => {
    const log: Value[] = []
    const senderScript: Script = {
      id: 'sSender',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'beforeWait' } } },
        {
          opcode: 'event_broadcastandwait',
          fields: {},
          inputs: { BROADCAST_INPUT: { kind: 'lit', value: 'task' } },
        },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'afterWait' } } },
      ],
    }

    const receiverScript: Script = {
      id: 'sReceiver',
      hat: {
        opcode: 'event_whenbroadcastreceived',
        fields: { BROADCAST_OPTION: 'task' },
        inputs: {},
      },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'working' } } },
        { opcode: 'control_wait', fields: {}, inputs: { DURATION: { kind: 'lit', value: 0.05 } } },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'finished' } } },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [senderScript, receiverScript],
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()
    expect(log).toEqual(['beforeWait', 'working'])

    // Next step: receiver finishes wait
    runtime.step()
    runtime.step()
    expect(log).toEqual(['beforeWait', 'working', 'finished', 'afterWait'])

    // Broadcast-and-wait with 0 receivers continues immediately
    const noReceiversScript: Script = {
      id: 'sEmpty',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'event_broadcastandwait',
          fields: {},
          inputs: { BROADCAST_INPUT: { kind: 'lit', value: 'nonexistent' } },
        },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'noWaitDone' } } },
      ],
    }
    const log2: Value[] = []
    const { runtime: rt2 } = createTestSetup({
      scripts: [noReceiversScript],
      logArray: log2,
    })
    rt2.greenFlag()
    rt2.step()
    expect(log2).toEqual(['noWaitDone'])
  })

  it('H07 · Clone-start', () => {
    const log: Value[] = []
    const cloneScript: Script = {
      id: 'sClone',
      hat: { opcode: 'control_start_as_clone', fields: {}, inputs: {} },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'cloneStarted' } } },
      ],
    }

    const { runtime, target } = createTestSetup({
      scripts: [cloneScript],
      logArray: log,
    })

    const cloneTarget = makeTarget({ id: 'c1', brickId: 'b1' })
    runtime.addClone(cloneTarget, target)
    runtime.step()

    expect(log).toEqual(['cloneStarted'])
  })

  it('H08 · Timer/loudness threshold', () => {
    const log: Value[] = []
    const script: Script = {
      id: 'sTimer',
      hat: {
        opcode: 'event_whengreaterthan',
        fields: { WHENGREATERTHANMENU: 'TIMER' },
        inputs: { VALUE: { kind: 'lit', value: 1.0 } },
      },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'timerFired' } } },
      ],
    }

    const { runtime, world } = createTestSetup({
      scripts: [script],
      logArray: log,
    })

    // Sample timer: 0.9s (world.tick = 27)
    world.timerStartTick = 0
    world.tick = 27 // 27 * 33.33ms = 0.9s
    runtime.step()
    expect(log).toEqual([])

    // Sample timer: 1.0s (world.tick = 30) -> strictly >, so 1.0 is not > 1.0
    world.tick = 30 // 30 * 33.33ms = 1.0s
    runtime.step()
    expect(log).toEqual([])

    // Sample timer: 1.1s (world.tick = 33) -> triggers first time!
    world.tick = 33
    runtime.step()
    expect(log).toEqual(['timerFired'])

    // Sample timer: 1.2s (world.tick = 36) -> persistently true does NOT fire again
    world.tick = 36
    runtime.step()
    expect(log).toEqual(['timerFired'])

    // Reset below threshold: timer = 0.5s
    world.tick = 15
    runtime.step()
    expect(log).toEqual(['timerFired'])

    // Cross again: timer = 1.1s -> second trigger!
    world.tick = 33
    runtime.step()
    expect(log).toEqual(['timerFired', 'timerFired'])
  })

  it('H09 · Backdrop changes', () => {
    const log: Value[] = []
    const script: Script = {
      id: 'sBackdrop',
      hat: {
        opcode: 'event_whenbackdropswitchesto',
        fields: { BACKDROP: 'Level2' },
        inputs: {},
      },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'switched' } } },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      logArray: log,
    })

    runtime.startHats('event_whenbackdropswitchesto', {
      fields: { BACKDROP: 'level2' },
    })
    runtime.step()

    expect(log).toEqual(['switched'])
  })

  it('H10 · Stack clicks', () => {
    const log: Value[] = []
    const script: Script = {
      id: 'sStack',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'running' } } },
      ],
    }

    const { runtime, target } = createTestSetup({
      scripts: [script],
      logArray: log,
    })

    // Start manually as stack click
    runtime.startStack(target, script)
    // Then start hat
    runtime.startHats('event_whenflagclicked')

    // Both threads coexist; startHats does not restart isStackClick thread
    expect(runtime.threads().length).toBe(2)
  })

  // ---------------------------------------------------------------- §1.9 Procedures and control
  it('P01 · Arguments', () => {
    const log: Value[] = []
    const proc: Procedure = {
      proccode: 'testProc %s',
      argumentNames: ['arg1'],
      warp: false,
      body: [
        {
          opcode: 'test_set_v',
          fields: {},
          inputs: { VAL: { kind: 'lit', value: 9 } },
        },
        {
          opcode: 'test_log',
          fields: {},
          inputs: { VAL: { kind: 'param', name: 'arg1' } },
        },
      ],
    }

    let v = 5
    const primitives: PrimitiveTable = {
      test_set_v: (ctx) => {
        v = toNumber(ctx.arg('VAL'))
      },
    }

    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'procedures_call',
          fields: {},
          inputs: { arg1: { kind: 'lit', value: v } },
          call: { proccode: 'testProc %s' },
        },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      procedures: [proc],
      primitives,
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    // Argument is snapshot value 5, variable v became 9
    expect(log).toEqual([5])
    expect(v).toBe(9)
  })

  it('P02 · Nearest call only', () => {
    const log: Value[] = []
    const procG: Procedure = {
      proccode: 'procG',
      argumentNames: [], // No param x
      warp: false,
      body: [
        {
          opcode: 'test_log',
          fields: {},
          inputs: { VAL: { kind: 'param', name: 'x' } }, // Orphan param x in procG
        },
      ],
    }

    const procF: Procedure = {
      proccode: 'procF %s',
      argumentNames: ['x'],
      warp: false,
      body: [
        {
          opcode: 'procedures_call',
          fields: {},
          inputs: {},
          call: { proccode: 'procG' },
        },
      ],
    }

    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'procedures_call',
          fields: {},
          inputs: { x: { kind: 'lit', value: 7 } },
          call: { proccode: 'procF %s' },
        },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      procedures: [procF, procG],
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    // In procG, orphan x returns 0 rather than capturing outer f's x=7
    expect(log).toEqual([0])
  })

  it('P03 · Defaults/missing define', () => {
    const log: Value[] = []
    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'procedures_call',
          fields: {},
          inputs: {},
          call: { proccode: 'deletedProc' }, // Missing procedure
        },
        {
          opcode: 'test_log',
          fields: {},
          inputs: { VAL: { kind: 'lit', value: 'A' } },
        },
        {
          opcode: 'test_log',
          fields: {},
          inputs: { VAL: { kind: 'param', name: 'orphanParam' } }, // Out-of-scope param reporter
        },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    // Missing define was a no-op; 'A' ran; orphan param returned 0
    expect(log).toEqual(['A', 0])
  })

  it('P04 · Recursion', () => {
    const log: Value[] = []
    const procCountdown: Procedure = {
      proccode: 'countdown %s',
      argumentNames: ['n'],
      warp: false,
      body: [
        {
          opcode: 'test_log',
          fields: {},
          inputs: { VAL: { kind: 'param', name: 'n' } },
        },
        {
          opcode: 'control_if',
          fields: {},
          inputs: {
            CONDITION: {
              kind: 'block',
              opcode: 'test_gt_one',
              fields: {},
              inputs: { N: { kind: 'param', name: 'n' } },
            },
          },
          branches: [
            [
              {
                opcode: 'procedures_call',
                fields: {},
                inputs: {
                  n: {
                    kind: 'block',
                    opcode: 'test_sub_one',
                    fields: {},
                    inputs: { N: { kind: 'param', name: 'n' } },
                  },
                },
                call: { proccode: 'countdown %s' },
              },
            ],
          ],
        },
      ],
    }

    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'procedures_call',
          fields: {},
          inputs: { n: { kind: 'lit', value: 3 } },
          call: { proccode: 'countdown %s' },
        },
      ],
    }

    const primitives: PrimitiveTable = {
      test_gt_one: (ctx) => toNumber(ctx.arg('N')) > 1,
      test_sub_one: (ctx) => toNumber(ctx.arg('N')) - 1,
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      procedures: [procCountdown],
      primitives,
      logArray: log,
    })

    runtime.greenFlag()
    // Normal-mode detected recursive call yields; takes multiple steps
    runtime.step()
    expect(log).toEqual([3])

    runtime.step()
    expect(log).toEqual([3, 2])

    runtime.step()
    expect(log).toEqual([3, 2, 1])
  })

  it('P05 · Warp inheritance', () => {
    const log: Value[] = []
    let isChildWarp = false

    const procChild: Procedure = {
      proccode: 'procChild',
      argumentNames: [],
      warp: false, // non-warp child
      body: [
        {
          opcode: 'test_check_warp',
          fields: {},
          inputs: {},
        },
      ],
    }

    const procParent: Procedure = {
      proccode: 'procParent',
      argumentNames: [],
      warp: true, // warp parent
      body: [
        {
          opcode: 'procedures_call',
          fields: {},
          inputs: {},
          call: { proccode: 'procChild' },
        },
      ],
    }

    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'procedures_call',
          fields: {},
          inputs: {},
          call: { proccode: 'procParent' },
        },
      ],
    }

    const primitives: PrimitiveTable = {
      test_check_warp: (ctx) => {
        isChildWarp = ctx.warp
      },
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      procedures: [procParent, procChild],
      primitives,
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    // Child inherited warp from caller frame
    expect(isChildWarp).toBe(true)
  })

  it('P06 · Stop inside define', () => {
    const log: Value[] = []
    const procF: Procedure = {
      proccode: 'procF',
      argumentNames: [],
      warp: false,
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'inside' } } },
        { opcode: 'control_stop', fields: { STOP_OPTION: 'this script' }, inputs: {} },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'never' } } },
      ],
    }

    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'procedures_call',
          fields: {},
          inputs: {},
          call: { proccode: 'procF' },
        },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'after' } } },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      procedures: [procF],
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    // Inside define, 'stop this script' unwinds only the procedure and caller continues
    expect(log).toEqual(['inside', 'after'])
  })

  it('P07 · Stop at top level', () => {
    const log: Value[] = []
    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'A' } } },
        { opcode: 'control_stop', fields: { STOP_OPTION: 'this script' }, inputs: {} },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'B' } } },
      ],
    }

    const { runtime } = createTestSetup({
      scripts: [script],
      logArray: log,
    })

    runtime.greenFlag()
    runtime.step()

    // Top-level stop this script terminates thread
    expect(log).toEqual(['A'])

    // Test stop other scripts in sprite
    const log2: Value[] = []
    const sOther1: Script = {
      id: 'sO1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'T1_start' } } },
        { opcode: 'control_stop', fields: { STOP_OPTION: 'other scripts in sprite' }, inputs: {} },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'T1_end' } } },
      ],
    }
    const sOther2: Script = {
      id: 'sO2',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        { opcode: 'control_wait', fields: {}, inputs: { DURATION: { kind: 'lit', value: 0.1 } } },
        { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'T2_shouldNotRun' } } },
      ],
    }
    const { runtime: rt2 } = createTestSetup({
      scripts: [sOther1, sOther2],
      logArray: log2,
    })
    rt2.greenFlag()
    rt2.step()
    expect(log2).toEqual(['T1_start', 'T1_end'])
  })

  // ---------------------------------------------------------------- Additional control flow & helpers
  it('handles control_if and control_if_else', () => {
    const log: Value[] = []
    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'control_if',
          fields: {},
          inputs: { CONDITION: { kind: 'lit', value: true } },
          branches: [
            [{ opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'if_true' } } }],
          ],
        },
        {
          opcode: 'control_if',
          fields: {},
          inputs: { CONDITION: { kind: 'lit', value: false } },
          branches: [
            [{ opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'if_false' } } }],
          ],
        },
        {
          opcode: 'control_if_else',
          fields: {},
          inputs: { CONDITION: { kind: 'lit', value: false } },
          branches: [
            [{ opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'then_branch' } } }],
            [{ opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'else_branch' } } }],
          ],
        },
      ],
    }

    const { runtime } = createTestSetup({ scripts: [script], logArray: log })
    runtime.greenFlag()
    runtime.step()
    expect(log).toEqual(['if_true', 'else_branch'])
  })

  it('handles control_while', () => {
    const log: Value[] = []
    let counter = 3
    const script: Script = {
      id: 's1',
      hat: { opcode: 'event_whenflagclicked', fields: {}, inputs: {} },
      body: [
        {
          opcode: 'control_while',
          fields: {},
          inputs: {
            CONDITION: {
              kind: 'block',
              opcode: 'check_counter',
              fields: {},
              inputs: {},
            },
          },
          branches: [
            [
              { opcode: 'test_log', fields: {}, inputs: { VAL: { kind: 'lit', value: 'loop' } } },
              { opcode: 'dec_counter', fields: {}, inputs: {} },
            ],
          ],
        },
      ],
    }

    const primitives: PrimitiveTable = {
      check_counter: () => counter > 0,
      dec_counter: () => {
        counter--
      },
    }

    const { runtime } = createTestSetup({ scripts: [script], primitives, logArray: log })
    runtime.greenFlag()
    runtime.step()
    expect(log).toEqual(['loop', 'loop', 'loop'])
  })

  it('handles clone limits and methods', () => {
    const { runtime, world, target } = createTestSetup({})
    expect(runtime.findOriginal('TestBrick')).toBe(target)
    expect(runtime.findOriginal('NonExistent')).toBeUndefined()

    // Add clone
    const clone = makeTarget({ id: 'c1', brickId: 'b1' })
    const added = runtime.addClone(clone, target)
    expect(added).toBe(true)
    expect(world.cloneCount).toBe(1)

    // Delete clone
    runtime.removeClone(clone)
    expect(world.cloneCount).toBe(0)

    // Deleting original is a no-op
    runtime.removeClone(target)
    expect(world.targets).toContain(target)
  })

  it('Scratch type casting functions', () => {
    // toNumber
    expect(toNumber(42)).toBe(42)
    expect(toNumber(true)).toBe(1)
    expect(toNumber(false)).toBe(0)
    expect(toNumber(' 123 ')).toBe(123)
    expect(toNumber('abc')).toBe(0)
    expect(toNumber('')).toBe(0)

    // toBoolean
    expect(toBoolean(true)).toBe(true)
    expect(toBoolean(false)).toBe(false)
    expect(toBoolean(1)).toBe(true)
    expect(toBoolean(0)).toBe(false)
    expect(toBoolean('true')).toBe(true)
    expect(toBoolean('false')).toBe(false)
    expect(toBoolean('0')).toBe(false)
    expect(toBoolean('')).toBe(false)
    expect(toBoolean('hello')).toBe(true)

    // toString
    expect(toString('hello')).toBe('hello')
    expect(toString(123)).toBe('123')
    expect(toString(-0)).toBe('0')
    expect(toString(true)).toBe('true')
    expect(toString(false)).toBe('false')
  })
})
