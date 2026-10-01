/**
 * Wave 3 runtime regressions (see docs/qa/code-lab-core/CONFORMANCE-AUDIT.md,
 * "Runtime behavior likely wrong"). Each test drives the real runtime through the harness.
 */
import { describe, expect, it } from 'vitest'
import { WARP_OP_LIMIT } from '../contracts'
import type { Procedure } from '../contracts'
import {
  broadcastScript,
  flagScript,
  greaterThanScript,
  keyScript,
  lit,
  makeHarnessRuntime,
  stmt,
} from './harness'

const add = (item: string, list = 'log') => stmt('data_addtolist', { ITEM: lit(item) }, { LIST: list })
const logList = [{ id: 'log', name: 'log', value: [] as string[] }]

describe('wave 3 runtime regressions', () => {
  it('R1a · a warp render loop does not starve a sibling thread (audit example)', () => {
    const render: Procedure = {
      proccode: 'render',
      argumentNames: [],
      warp: true,
      body: [stmt('control_repeat', { TIMES: lit(25_000) }, {}, [[stmt('motion_changexby', { DX: lit(0) })]])],
    }
    const rt = makeHarnessRuntime({
      lists: logList,
      procedures: [render],
      scripts: [
        flagScript([stmt('control_forever', {}, {}, [[stmt('procedures_call', {}, {}, undefined, { proccode: 'render' })]])], 'A'),
        flagScript([stmt('control_forever', {}, {}, [[add('B'), stmt('control_wait', { DURATION: lit(0) })]])], 'B'),
      ],
    })
    rt.greenFlag()
    for (let i = 0; i < 10; i++) rt.step()
    expect(rt.world.targets[0].lists.log.length).toBe(10)
  })

  it('R1b · a warp forever loop does not starve a sibling thread', () => {
    const spin: Procedure = {
      proccode: 'spin',
      argumentNames: [],
      warp: true,
      body: [stmt('control_forever', {}, {}, [[stmt('motion_changexby', { DX: lit(0) })]])],
    }
    const rt = makeHarnessRuntime({
      lists: logList,
      procedures: [spin],
      scripts: [
        flagScript([stmt('procedures_call', {}, {}, undefined, { proccode: 'spin' })], 'A'),
        flagScript([stmt('control_forever', {}, {}, [[add('B'), stmt('control_wait', { DURATION: lit(0) })]])], 'B'),
      ],
    })
    rt.greenFlag()
    for (let i = 0; i < 6; i++) rt.step()
    expect(rt.world.targets[0].lists.log.length).toBe(6)
  })

  it('R1c · a warp thread still yields at WARP_OP_LIMIT', () => {
    const long: Procedure = {
      proccode: 'long',
      argumentNames: [],
      warp: true,
      body: [stmt('control_repeat', { TIMES: lit(WARP_OP_LIMIT * 2) }, {}, [[stmt('motion_changexby', { DX: lit(0) })]])],
    }
    const rt = makeHarnessRuntime({
      lists: logList,
      procedures: [long],
      scripts: [flagScript([stmt('procedures_call', {}, {}, undefined, { proccode: 'long' }), add('done')], 'A')],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.log).toEqual([])
  })

  it('R2 · a restarted broadcast thread keeps its place in the thread order (H05/F14)', () => {
    const rt = makeHarnessRuntime({
      lists: logList,
      scripts: [
        broadcastScript('go', [stmt('control_forever', {}, {}, [[add('R'), stmt('control_wait', { DURATION: lit(0) })]])], 'R'),
        keyScript('k', [stmt('control_forever', {}, {}, [[add('K'), stmt('control_wait', { DURATION: lit(0) })]])], 'K'),
      ],
    })
    rt.broadcast('go')
    rt.pressKey('k')
    rt.step()
    expect(rt.world.targets[0].lists.log).toEqual(['R', 'K'])
    rt.world.targets[0].lists.log.length = 0
    rt.broadcast('go')
    rt.step()
    expect(rt.world.targets[0].lists.log).toEqual(['R', 'K'])
  })

  it('R3a · wait 0 inside a warp procedure does not yield to the next tick (F08)', () => {
    const p: Procedure = {
      proccode: 'p',
      argumentNames: [],
      warp: true,
      body: [add('A'), stmt('control_wait', { DURATION: lit(0) }), add('B')],
    }
    const rt = makeHarnessRuntime({
      lists: logList,
      procedures: [p],
      scripts: [
        flagScript([stmt('procedures_call', {}, {}, undefined, { proccode: 'p' })], 'main'),
        flagScript([add('X')], 'sibling'),
      ],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.log).toEqual(['A', 'B', 'X'])
  })

  it('R3b · KNOWN-DIFF: a positive wait inside warp yields (sim clock is frozen within a tick)', () => {
    const p: Procedure = {
      proccode: 'p',
      argumentNames: [],
      warp: true,
      body: [add('A'), stmt('control_wait', { DURATION: lit(1) }), add('B')],
    }
    const rt = makeHarnessRuntime({
      lists: logList,
      procedures: [p],
      scripts: [flagScript([stmt('procedures_call', {}, {}, undefined, { proccode: 'p' })], 'main')],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.log).toEqual(['A'])
    for (let i = 0; i < 40; i++) rt.step()
    expect(rt.world.targets[0].lists.log).toEqual(['A', 'B'])
  })

  it('R3c · edge hat state is frozen while its handler runs (H08)', () => {
    // Handler: log, reset timer, wait 1s. Scratch does not evaluate the hat while the handler
    // is alive, so the stale "true" is kept and the later rise above 1 is not a new edge.
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'log', name: 'log', value: [] }],
      stageScripts: [
        greaterThanScript('TIMER', lit(1), [add('T'), stmt('sensing_resettimer'), stmt('control_wait', { DURATION: lit(1) })]),
      ],
    })
    rt.greenFlag()
    for (let i = 0; i < 100; i++) rt.step()
    expect(rt.world.stage.lists.log).toEqual(['T'])
  })

  it('R3d · edge hat retriggers after the timer is observed below threshold again (H08)', () => {
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'log', name: 'log', value: [] }],
      stageScripts: [
        greaterThanScript('TIMER', lit(1), [add('T')], 'gt'),
        flagScript([stmt('control_wait', { DURATION: lit(1.5) }), stmt('sensing_resettimer')], 'resetter'),
      ],
    })
    rt.greenFlag()
    for (let i = 0; i < 100; i++) rt.step()
    expect(rt.world.stage.lists.log).toEqual(['T', 'T'])
  })
})
