import { describe, expect, it } from 'vitest'
import type { Script, Stmt } from '../contracts'
import {
  backdropScript,
  block,
  broadcastScript,
  clickScript,
  cloneScript,
  defaultCostume,
  flagScript,
  greaterThanScript,
  keyScript,
  lit,
  makeHarnessDesign,
  makeHarnessRuntime,
  stageClickScript,
  stmt,
} from './harness'

describe('§1.2 Hats, retriggers, and broadcasts', () => {
  it('H01 · Green flag', () => {
    const rt = makeHarnessRuntime({
      x: 12,
      variables: [{ id: 'v', name: 'v', value: 7 }],
      costumes: [defaultCostume('c1'), defaultCostume('c2')],
      costumeIndex: 1,
      scripts: [
        flagScript([
          stmt('data_changevariableby', { VALUE: lit(1) }, { VARIABLE: 'v' }),
        ]),
      ],
    })

    const target = rt.world.targets[0]
    target.effects.ghost = 50
    target.edgeHatState['some_hat'] = true

    // Add a clone
    const clone = { ...target, id: 'clone_1', isClone: true }
    rt.addClone(clone, target)
    expect(rt.world.targets.length).toBe(2)
    expect(rt.world.cloneCount).toBe(1)

    // Trigger green flag
    rt.greenFlag()

    // 1. Clones deleted
    expect(rt.world.targets.length).toBe(1)
    expect(rt.world.cloneCount).toBe(0)

    // 2. Graphic effects cleared
    expect(rt.world.targets[0].effects.ghost).toBe(0)

    // 3. Edge hat state cleared
    expect(rt.world.targets[0].edgeHatState).toEqual({})

    // 4. Variables and position retained from before greenFlag
    expect(rt.world.targets[0].x).toBe(12)
    expect(rt.world.targets[0].variables.v).toBe(7)

    // Step once to let flag script run
    rt.step()
    expect(rt.world.targets[0].variables.v).toBe(8)
  })

  it('H02 · Key pressed', () => {
    // restartExistingThreads = false: pressing a key while hat thread is running does not queue or restart
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        keyScript('a', [
          stmt('data_addtolist', { ITEM: lit('start') }, { LIST: 'trace' }),
          stmt('control_wait', { DURATION: lit(1) }),
          stmt('data_addtolist', { ITEM: lit('end') }, { LIST: 'trace' }),
        ]),
      ],
    })

    // Press 'a'
    rt.pressKey('a')
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['start'])

    // Press 'a' again while waiting
    rt.pressKey('a')
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['start']) // no second start!

    // Finish wait (1s at 30 TPS is 30 ticks)
    for (let i = 0; i < 35; i++) rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['start', 'end'])

    // Press again after completion -> new run starts
    rt.pressKey('a')
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['start', 'end', 'start'])
  })

  it('H03 · Sprite clicked', () => {
    // restartExistingThreads = true: clicking again restarts existing thread
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        clickScript([
          stmt('data_addtolist', { ITEM: lit('start') }, { LIST: 'trace' }),
          stmt('control_wait', { DURATION: lit(1) }),
          stmt('data_addtolist', { ITEM: lit('end') }, { LIST: 'trace' }),
        ]),
      ],
    })

    const target = rt.world.targets[0]
    rt.clickTarget(target)
    rt.step()
    expect(target.lists.trace).toEqual(['start'])

    // Click again while waiting -> thread is cancelled and restarted
    rt.clickTarget(target)
    rt.step()
    expect(target.lists.trace).toEqual(['start', 'start'])

    // Finish wait
    for (let i = 0; i < 35; i++) rt.step()
    // Old continuation must not produce its original end, so only one 'end' from second run
    expect(target.lists.trace).toEqual(['start', 'start', 'end'])
  })

  it('H04 · Stage clicked', () => {
    // Stage-click hats restart like sprite-click hats
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'trace', name: 'trace', value: [] }],
      stageScripts: [
        stageClickScript([
          stmt('data_addtolist', { ITEM: lit('start') }, { LIST: 'trace' }),
          stmt('control_wait', { DURATION: lit(1) }),
          stmt('data_addtolist', { ITEM: lit('end') }, { LIST: 'trace' }),
        ]),
      ],
    })

    rt.clickTarget(rt.world.stage)
    rt.step()
    expect(rt.world.stage.lists.trace).toEqual(['start'])

    rt.clickTarget(rt.world.stage)
    rt.step()
    expect(rt.world.stage.lists.trace).toEqual(['start', 'start'])

    for (let i = 0; i < 35; i++) rt.step()
    expect(rt.world.stage.lists.trace).toEqual(['start', 'start', 'end'])
  })

  it('H05 · Broadcast', () => {
    // Receivers restart existing matching hats; case-insensitive match
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        broadcastScript('MsgA', [
          stmt('data_addtolist', { ITEM: lit('start') }, { LIST: 'trace' }),
          stmt('control_wait', { DURATION: lit(1) }),
          stmt('data_addtolist', { ITEM: lit('end') }, { LIST: 'trace' }),
        ]),
      ],
    })

    // Broadcast lowercase 'msga'
    rt.broadcast('msga')
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['start'])

    // Broadcast uppercase 'MSGA' -> restarts
    rt.broadcast('MSGA')
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['start', 'start'])

    for (let i = 0; i < 35; i++) rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['start', 'start', 'end'])
  })

  it('H06 · Broadcast-and-wait', () => {
    // Waits on receivers; returns immediately if zero receivers
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        flagScript([
          stmt('data_addtolist', { ITEM: lit('sender_start') }, { LIST: 'trace' }),
          stmt('event_broadcastandwait', {}, { BROADCAST_OPTION: 'compute' }),
          stmt('data_addtolist', { ITEM: lit('sender_end') }, { LIST: 'trace' }),
        ], 'sSender'),
        broadcastScript('compute', [
          stmt('data_addtolist', { ITEM: lit('recv_start') }, { LIST: 'trace' }),
          stmt('control_wait', { DURATION: lit(0.1) }),
          stmt('data_addtolist', { ITEM: lit('recv_end') }, { LIST: 'trace' }),
        ], 'sRecv'),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['sender_start', 'recv_start'])

    // Advance 5 ticks
    for (let i = 0; i < 5; i++) rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['sender_start', 'recv_start', 'recv_end', 'sender_end'])

    // Broadcast-and-wait with zero receivers completes immediately
    const rtEmpty = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        flagScript([
          stmt('data_addtolist', { ITEM: lit('a') }, { LIST: 'trace' }),
          stmt('event_broadcastandwait', {}, { BROADCAST_OPTION: 'nobody' }),
          stmt('data_addtolist', { ITEM: lit('b') }, { LIST: 'trace' }),
        ]),
      ],
    })
    rtEmpty.greenFlag()
    rtEmpty.step()
    expect(rtEmpty.world.targets[0].lists.trace).toEqual(['a', 'b'])
  })

  it('H07 · Clone-start', () => {
    // control_start_as_clone has restartExistingThreads = false; runs clone startup script
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        flagScript([
          stmt('data_addtolist', { ITEM: lit('A') }, { LIST: 'trace' }),
          stmt('control_create_clone_of', {}, { CLONE_OPTION: '_myself_' }),
          stmt('data_addtolist', { ITEM: lit('B') }, { LIST: 'trace' }),
        ], 'sFlag'),
        cloneScript([
          stmt('data_addtolist', { ITEM: lit('C') }, { LIST: 'trace' }),
        ], 'sClone'),
      ],
    })

    rt.greenFlag()
    rt.step()

    // Creator logs A, creates clone, logs B; clone logs C
    expect(rt.world.stage.lists.trace).toEqual(['A', 'B', 'C'])
  })

  it('H08 · Timer/loudness threshold', () => {
    // Strictly >, edge-activated (only triggers when crossing from <= to >)
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'trace', name: 'trace', value: [] }],
      stageScripts: [
        greaterThanScript('TIMER', lit(0.5), [
          stmt('data_addtolist', { ITEM: lit('triggered') }, { LIST: 'trace' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    // Timer starts at 0 -> <= 0.5 -> not triggered
    expect(rt.world.stage.lists.trace).toEqual([])

    // Advance 10 ticks = ~0.33s -> still <= 0.5
    for (let i = 0; i < 10; i++) rt.step()
    expect(rt.world.stage.lists.trace).toEqual([])

    // Advance 10 more ticks = ~0.66s -> crossed > 0.5!
    for (let i = 0; i < 10; i++) rt.step()
    expect(rt.world.stage.lists.trace).toEqual(['triggered'])

    // Advance more ticks: persistently > 0.5 does NOT re-trigger every tick!
    for (let i = 0; i < 10; i++) rt.step()
    expect(rt.world.stage.lists.trace).toEqual(['triggered'])
  })

  it('H09 · Backdrop changes', () => {
    // Backdrop-switch hats restart; switching backdrop starts matching hats
    const rt = makeHarnessRuntime({
      stageCostumes: [defaultCostume('bg1', 480, 360), defaultCostume('bg2', 480, 360)],
      stageLists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        backdropScript('bg2', [
          stmt('data_addtolist', { ITEM: lit('backdrop_switched') }, { LIST: 'trace' }),
        ]),
      ],
    })

    rt.greenFlag()
    rt.step()
    expect(rt.world.stage.lists.trace).toEqual([])

    // Switch backdrop to bg2
    rt.world.stage.costumeIndex = 1
    rt.startHats('event_whenbackdropswitchesto', { fields: { BACKDROP: 'bg2' } })
    rt.step()
    expect(rt.world.stage.lists.trace).toEqual(['backdrop_switched'])
  })

  it('H10 · Stack clicks', () => {
    // Stack-click threads can coexist with hat threads without being stopped
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        flagScript([
          stmt('control_wait', { DURATION: lit(1) }),
          stmt('data_addtolist', { ITEM: lit('hat_done') }, { LIST: 'trace' }),
        ], 'sHat'),
      ],
    })

    const target = rt.world.targets[0]
    const script = rt.world.bricks['sprite1'].program.scripts[0]

    // Start stack manually
    rt.startStack(target, script)
    // Also start hat
    rt.startHats('event_whenflagclicked')

    // Both threads coexist
    const activeThreads = rt.threads().filter((t) => !t.done)
    expect(activeThreads.length).toBe(2)
  })
})
