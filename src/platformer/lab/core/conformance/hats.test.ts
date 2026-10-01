import { describe, expect, it } from 'vitest'
import { pickTarget } from '../../studio/stage/picking'
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
  extraBrick,
  makeHarnessRuntime,
  stageClickScript,
  stepN,
  stmt,
} from './harness'

const addLog = (item: string, list = 'trace') => stmt('data_addtolist', { ITEM: lit(item) }, { LIST: list })

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

    // 5. Timer restarted by a later flag; the value (not reset by the flag) carries on: 8 -> 9.
    stepN(rt, 5)
    expect(rt.world.timerStartTick).not.toBe(rt.world.tick)
    rt.greenFlag()
    expect(rt.world.timerStartTick).toBe(rt.world.tick)
    rt.step()
    expect(rt.world.targets[0].variables.v).toBe(9)
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

  it('H04 · Stage clicked (hat restart)', () => {
    // Stage-click hats restart like sprite-click hats; a click that hits no sprite clicks the Stage.
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'trace', name: 'trace', value: [] }],
      stageScripts: [stageClickScript([addLog('start'), stmt('control_wait', { DURATION: lit(1) }), addLog('end')])],
    })
    // Sprite1 sits at (0,0), 32x32; (200,100) is empty stage.
    expect(pickTarget(rt.world, 200, 100)).toBe(rt.world.stage)
    rt.clickTarget(pickTarget(rt.world, 200, 100))
    rt.step()
    expect(rt.world.stage.lists.trace).toEqual(['start'])

    rt.clickTarget(rt.world.stage)
    rt.step()
    expect(rt.world.stage.lists.trace).toEqual(['start', 'start'])

    stepN(rt, 35)
    expect(rt.world.stage.lists.trace).toEqual(['start', 'start', 'end'])
  })

  function pickingRuntime() {
    // B (back, sprite1) and A (front, brick 'a') overlap at the origin; both opaque 32x32.
    return makeHarnessRuntime({
      extraBricks: [extraBrick('a', 'A')],
      extraCopies: [{ id: 'copyA', brickId: 'a', x: 0, y: 0 }],
    })
  }

  it('H04 · picking: the front-most opaque sprite is picked, and only it', () => {
    const rt = pickingRuntime()
    const [back, front] = rt.world.targets
    expect(front.brickId).toBe('a')
    expect(pickTarget(rt.world, 0, 0)).toBe(front)
    expect(pickTarget(rt.world, 0, 0)).not.toBe(back)
    // Click-through onto the Stage where nothing overlaps.
    expect(pickTarget(rt.world, 100, 100)).toBe(rt.world.stage)
  })

  it('H04 · picking: a hidden front sprite is not picked', () => {
    const rt = pickingRuntime()
    const [back, front] = rt.world.targets
    front.visible = false
    expect(pickTarget(rt.world, 0, 0)).toBe(back)
  })

  // FAILS-PENDING-FIX (runtime-fixes bug 3 / stage-camera lane, H04/L06): studio/stage/picking.ts
  // skips only hidden targets, so a fully ghosted sprite (ghost = 100) is still picked. Scratch
  // does not let you click a fully transparent sprite.
  it.fails('H04 · picking: a fully ghosted front sprite is not picked', () => {
    const rt = pickingRuntime()
    const [back, front] = rt.world.targets
    front.effects.ghost = 100
    expect(pickTarget(rt.world, 0, 0)).toBe(back)
  })

  it('H05 · Broadcast', () => {
    // Receivers restart existing matching hats; matching is case-insensitive. The sender continues
    // immediately after an ordinary broadcast.
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        broadcastScript('MsgA', [addLog('start'), stmt('control_wait', { DURATION: lit(1) }), addLog('end')]),
        flagScript([stmt('event_broadcast', {}, { BROADCAST_OPTION: 'msga' }), addLog('sender-continued')], 'sender'),
      ],
    })

    // The sender continues in the same turn, before the receiver's wait could possibly finish.
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['sender-continued', 'start'])

    // Broadcast uppercase 'MSGA' -> the receiver restarts.
    rt.broadcast('MSGA')
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['sender-continued', 'start', 'start'])

    stepN(rt, 35)
    expect(rt.world.targets[0].lists.trace).toEqual(['sender-continued', 'start', 'start', 'end'])
  })

  // FAILS-PENDING-FIX (runtime-fixes bug 2, H05/F14): a restarted receiver is removed and pushed to
  // the END of the thread queue. Scratch's _restartThread replaces it at the same index, so the
  // restarted receiver still runs before the key thread that was started after it.
  it.fails('H05 · a restarted receiver keeps its place in the thread order', () => {
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        broadcastScript('M', [addLog('R1'), stmt('control_wait', { DURATION: lit(0) }), addLog('R2')], 'recv'),
        keyScript('k', [addLog('K1'), stmt('control_wait', { DURATION: lit(0) }), addLog('K2')], 'key'),
      ],
    })
    rt.broadcast('M')
    rt.pressKey('k')
    rt.step() // R1, K1
    rt.broadcast('M') // restart the receiver
    rt.step() // Scratch: R1 (restarted thread keeps index 0), then K2
    expect(rt.world.targets[0].lists.trace).toEqual(['R1', 'K1', 'R1', 'K2'])
  })

  it('H06 · Broadcast-and-wait', () => {
    // Receivers waiting 0.2 s and 0.4 s: the sender continues only after both have finished.
    // 0.2 s = 6 ticks, 0.4 s = 12 ticks at 30 TPS.
    const rt = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        flagScript([addLog('sender_start'), stmt('event_broadcastandwait', {}, { BROADCAST_OPTION: 'compute' }), addLog('sender_end')], 'sSender'),
        broadcastScript('compute', [stmt('control_wait', { DURATION: lit(0.2) }), addLog('recv_fast')], 'fast'),
        broadcastScript('compute', [stmt('control_wait', { DURATION: lit(0.4) }), addLog('recv_slow')], 'slow'),
      ],
    })
    rt.greenFlag()
    rt.step()
    expect(rt.world.targets[0].lists.trace).toEqual(['sender_start'])
    stepN(rt, 8) // past 0.2 s, before 0.4 s
    expect(rt.world.targets[0].lists.trace).toEqual(['sender_start', 'recv_fast'])
    stepN(rt, 12) // past 0.4 s
    expect(rt.world.targets[0].lists.trace).toEqual(['sender_start', 'recv_fast', 'recv_slow', 'sender_end'])

    // Broadcast-and-wait with zero receivers completes immediately
    const rtEmpty = makeHarnessRuntime({
      lists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [flagScript([addLog('a'), stmt('event_broadcastandwait', {}, { BROADCAST_OPTION: 'nobody' }), addLog('b')])],
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
    // Threshold 1: timer samples 0.9, 1.0, 1.1, 1.2 -> the first trigger is only at 1.1 (strictly >).
    // Persistently true does not run again each tick. Drop below, then cross again after the first
    // handler finished -> a second trigger.
    const rt = makeHarnessRuntime({
      stageLists: [{ id: 'trace', name: 'trace', value: [] }],
      stageScripts: [greaterThanScript('TIMER', lit(1), [addLog('triggered', 'trace')])],
    })
    rt.greenFlag()
    const sampleAt = (seconds: number) => {
      rt.world.tick = Math.round(seconds * 30) + rt.world.timerStartTick // timer = (tick - start) / 30
      rt.step()
      return rt.world.stage.lists.trace.length
    }
    expect(sampleAt(0.9)).toBe(0)
    expect(sampleAt(1.0)).toBe(0) // equality must not fire
    expect(sampleAt(1.1)).toBe(1)
    expect(sampleAt(1.2)).toBe(1) // still true: no re-trigger
    expect(sampleAt(0.5)).toBe(1) // re-arm: below the threshold
    expect(sampleAt(1.5)).toBe(2) // crossing again
  })

  it('H09 · Backdrop changes', () => {
    // Switching the Stage backdrop (through the real block) starts the matching backdrop hats,
    // including switching to the backdrop that is already current. Switching a sprite costume starts none.
    const rt = makeHarnessRuntime({
      stageCostumes: [defaultCostume('bg1', 480, 360), defaultCostume('bg2', 480, 360)],
      costumes: [defaultCostume('c1'), defaultCostume('c2')],
      stageLists: [{ id: 'trace', name: 'trace', value: [] }],
      scripts: [
        backdropScript('bg2', [addLog('bg2-hat')], 'hat_bg2'),
        broadcastScript('sprite-costume', [stmt('looks_switchcostumeto', { COSTUME: lit('c2') })], 'costumeSwitch'),
      ],
      stageScripts: [
        broadcastScript('to-bg2', [stmt('looks_switchbackdropto', { BACKDROP: lit('bg2') })], 'stageSwitch'),
      ],
    })
    rt.greenFlag()
    stepN(rt, 2)
    expect(rt.world.stage.lists.trace).toEqual([])

    rt.broadcast('to-bg2')
    stepN(rt, 2)
    expect(rt.world.stage.costumeIndex).toBe(1)
    expect(rt.world.stage.lists.trace).toEqual(['bg2-hat'])

    // Already on bg2: switching to it again still fires the hat.
    rt.broadcast('to-bg2')
    stepN(rt, 2)
    expect(rt.world.stage.lists.trace).toEqual(['bg2-hat', 'bg2-hat'])

    // A sprite costume switch is not a backdrop switch.
    rt.broadcast('sprite-costume')
    stepN(rt, 2)
    expect(rt.world.targets[0].costumeIndex).toBe(1)
    expect(rt.world.stage.lists.trace).toEqual(['bg2-hat', 'bg2-hat'])
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
