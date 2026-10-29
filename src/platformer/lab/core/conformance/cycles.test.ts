/**
 * Scripts that keep starting each other (two receivers that broadcast to each other, a clone that replaces itself)
 * must still hand control back at the end of every tick, so the page stays usable and Stop works.
 *
 * Every test installs a per-tick guard that throws long before a runaway sweep could hang the test run, so a
 * regression fails fast instead of freezing the worker.
 */
import { describe, expect, it } from 'vitest'
import type { Procedure } from '../contracts'
import type { Runtime } from '../index'
import {
  broadcastScript,
  cloneScript,
  extraBrick,
  flagScript,
  lit,
  makeHarnessRuntime,
  stmt,
  stepN,
} from './harness'

const bc = (msg: string) => stmt('event_broadcast', {}, { BROADCAST_OPTION: msg })
const add = (item: string, list = 'log') => stmt('data_addtolist', { ITEM: lit(item) }, { LIST: list })
const logList = [{ id: 'log', name: 'log', value: [] as string[] }]

/** Counts broadcasts per tick and throws once one tick sends more than `limit`. */
function guardBroadcasts(rt: Runtime, limit: number): Map<number, number> {
  const perTick = new Map<number, number>()
  rt.onBroadcast(() => {
    const tick = rt.world.tick
    const n = (perTick.get(tick) ?? 0) + 1
    perTick.set(tick, n)
    if (n > limit) throw new Error(`runaway: ${n} broadcasts in tick ${tick}`)
  })
  return perTick
}

/** Sprite1's flag script does 50 ops of warp work, then broadcasts `go` to Sprite1 and Sprite2 (Stage list `log`). */
function budgetFixture(): Runtime {
  const busy: Procedure = {
    proccode: 'busy',
    argumentNames: [],
    warp: true,
    body: [stmt('control_repeat', { TIMES: lit(50) }, {}, [[stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'v' })]])],
  }
  return makeHarnessRuntime({
    stageLists: logList,
    variables: [{ id: 'v', name: 'v', value: 0 }],
    procedures: [busy],
    scripts: [
      flagScript([stmt('procedures_call', {}, {}, undefined, { proccode: 'busy' }), bc('go'), add('S')], 'sender'),
      broadcastScript('go', [add('R1')], 'r1'),
    ],
    extraBricks: [extraBrick('sprite2', 'Sprite2', [broadcastScript('go', [add('R2')], 'r2')])],
    extraCopies: [{ id: 'copy2', brickId: 'sprite2', x: 10, y: 10 }],
  })
}

describe('cyclic scripts hand control back every tick', () => {
  it('a ping-pong between two receivers on one sprite ends each tick within the budget', () => {
    const rt = makeHarnessRuntime({
      scripts: [flagScript([bc('a')]), broadcastScript('a', [bc('b')]), broadcastScript('b', [bc('a')])],
    })
    rt.opBudget = 200
    const perTick = guardBroadcasts(rt, 2_000)
    rt.greenFlag()
    stepN(rt, 3)

    expect(rt.world.tick).toBe(3)
    for (let tick = 0; tick < 3; tick++) {
      // Still ping-ponging (like Scratch), but each tick stops at the budget.
      expect(perTick.get(tick)).toBeGreaterThan(10)
      expect(perTick.get(tick)).toBeLessThanOrEqual(rt.opBudget + 2)
    }
    // Restarted receivers reuse their slots instead of piling up.
    expect(rt.threads().length).toBeLessThanOrEqual(2)
  })

  it('a ping-pong between two sprites and the Stage ends each tick within the budget', () => {
    const rt = makeHarnessRuntime({
      scripts: [flagScript([bc('a')]), broadcastScript('a', [bc('b')])],
      extraBricks: [extraBrick('sprite2', 'Sprite2', [broadcastScript('b', [bc('c')])])],
      extraCopies: [{ id: 'copy2', brickId: 'sprite2', x: 10, y: 10 }],
      stageScripts: [broadcastScript('c', [bc('a')])],
    })
    rt.opBudget = 300
    const perTick = guardBroadcasts(rt, 3_000)
    rt.greenFlag()
    stepN(rt, 3)

    expect(rt.world.tick).toBe(3)
    expect(perTick.get(2)).toBeLessThanOrEqual(rt.opBudget + 3)
    expect(rt.threads().length).toBeLessThanOrEqual(3)
  })

  it('with the normal budget a ping-pong still ends the tick', () => {
    const rt = makeHarnessRuntime({
      scripts: [flagScript([bc('a')]), broadcastScript('a', [bc('b')]), broadcastScript('b', [bc('a')])],
    })
    const perTick = guardBroadcasts(rt, rt.opBudget * 3)
    rt.greenFlag()
    stepN(rt, 2)
    expect(rt.world.tick).toBe(2)
    expect(perTick.get(1)).toBeLessThanOrEqual(rt.opBudget + 2)
  })

  it('Stop ends a ping-pong: nothing runs in the next tick', () => {
    const rt = makeHarnessRuntime({
      scripts: [flagScript([bc('a')]), broadcastScript('a', [bc('b')]), broadcastScript('b', [bc('a')])],
    })
    rt.opBudget = 200
    const perTick = guardBroadcasts(rt, 2_000)
    rt.greenFlag()
    stepN(rt, 2)
    rt.stopAll()
    rt.step()
    expect(perTick.get(2)).toBeUndefined()
    expect(rt.threads()).toHaveLength(0)
  })

  it('a clone that makes a new clone and deletes itself ends each tick within the budget', () => {
    const rt = makeHarnessRuntime({
      scripts: [
        flagScript([stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' })]),
        cloneScript([stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }), stmt('control_delete_this_clone')]),
      ],
    })
    rt.opBudget = 200
    let madeThisTick = 0
    const addClone = rt.addClone.bind(rt)
    rt.addClone = (clone, source) => {
      if (++madeThisTick > 2_000) throw new Error('runaway: clone chain never ended the tick')
      return addClone(clone, source)
    }
    rt.greenFlag()
    for (let tick = 0; tick < 3; tick++) {
      madeThisTick = 0
      rt.step()
      expect(madeThisTick).toBeGreaterThan(10)
      expect(madeThisTick).toBeLessThanOrEqual(rt.opBudget)
    }
    expect(rt.world.cloneCount).toBeLessThanOrEqual(1)
  })
})

describe('ordinary broadcasts keep Scratch order', () => {
  it('a chain of broadcasts runs in the same tick, sender first', () => {
    const rt = makeHarnessRuntime({
      lists: logList,
      scripts: [
        flagScript([add('S1'), bc('a'), add('S2')]),
        broadcastScript('a', [add('A'), bc('b')]),
        broadcastScript('b', [add('B')]),
      ],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.log).toEqual(['S1', 'S2', 'A', 'B'])
  })

  it('two broadcasts before the receiver runs restart one receiver thread', () => {
    const rt = makeHarnessRuntime({
      lists: logList,
      scripts: [flagScript([bc('m'), add('S1'), bc('m'), add('S2')], 'sender'), broadcastScript('m', [add('R')], 'recv')],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.log).toEqual(['S1', 'S2', 'R'])
  })

  it('a receiver that already finished is heard again when broadcast later in the same tick', () => {
    const rt = makeHarnessRuntime({
      lists: logList,
      scripts: [broadcastScript('m', [add('R')], 'recv'), broadcastScript('n', [add('N'), bc('m')], 'other')],
    })
    rt.broadcast('m')
    rt.broadcast('n')
    rt.step()
    expect(rt.world.targets[0].lists.log).toEqual(['R', 'N', 'R'])
  })

  it('Scratch _restartThread: a finished receiver restarts in its old slot, so after a redraw it runs next tick', () => {
    const rt = makeHarnessRuntime({
      lists: logList,
      scripts: [
        broadcastScript('m', [add('R')], 'recv'),
        broadcastScript('n', [add('N'), stmt('motion_changexby', { DX: lit(1) }), bc('m')], 'other'),
      ],
    })
    rt.broadcast('m')
    rt.broadcast('n')
    rt.step()
    expect(rt.world.targets[0].lists.log).toEqual(['R', 'N'])
    rt.step()
    expect(rt.world.targets[0].lists.log).toEqual(['R', 'N', 'R'])
  })

  it('with budget left, receivers on several sprites run in the same tick in Scratch order (F13)', () => {
    const rt = budgetFixture()
    rt.greenFlag()
    rt.step()
    expect(rt.world.stage.lists.log).toEqual(['S', 'R2', 'R1'])
  })

  // KNOWN-DIFF: Scratch would still run them in the same sweep, however long the frame took. Here a thread started
  // after the tick's op budget is spent waits for the next tick, in its place, so a runaway chain cannot freeze the page.
  it('KNOWN-DIFF · receivers started after the budget ran out keep their order and run first next tick', () => {
    const rt = budgetFixture()
    rt.opBudget = 20 // the warp procedure below spends far more than this before broadcasting
    rt.greenFlag()
    rt.step()
    expect(rt.world.stage.lists.log).toEqual(['S'])
    rt.step()
    expect(rt.world.stage.lists.log).toEqual(['S', 'R2', 'R1'])
  })
})
