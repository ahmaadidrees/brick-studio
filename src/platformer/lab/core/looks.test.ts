import { describe, expect, it } from 'vitest'
import { TICK_MS, YIELD } from './contracts'
import type { BrickDef, Costume, Primitive, Target, Value } from './contracts'
import {
  clampSize,
  clearGraphicEffects,
  formatBubble,
  looksPrimitives,
  onGreenFlagLooks,
  onStopAllLooks,
  shiftLayer,
  wrapCostumeIndex,
} from './looks'
import { boxBrick, callPrimitive, fakeRuntime, makeTarget, makeWorld } from './testkit'
import type { FakeRuntime } from './testkit'

function run(
  prim: Primitive,
  rt: FakeRuntime,
  target: Target,
  args: Record<string, Value> = {},
  fields: Record<string, string> = {},
) {
  return callPrimitive(prim, { runtime: rt, target, args, fields })
}

function makeBrickWithCostumes(id: string, name: string, costumes: Costume[]): BrickDef {
  return {
    id,
    name,
    costumes,
    sounds: [],
    program: { scripts: [], procedures: [], variables: [], lists: [] },
  }
}

describe('looks', () => {
  it('L01 · costume names, numbers, and fallback resolution', () => {
    // Costume named "2" at index 0 (position 1), costume named "c2" at index 1 (position 2)
    const costumes: Costume[] = [
      { name: '2', width: 20, height: 20, rotationCenterX: 10, rotationCenterY: 10 },
      { name: 'c2', width: 20, height: 20, rotationCenterX: 10, rotationCenterY: 10 },
      { name: 'c3', width: 20, height: 20, rotationCenterX: 10, rotationCenterY: 10 },
    ]
    const brick = makeBrickWithCostumes('b1', 'TestBrick', costumes)
    const target = makeTarget({ costumeIndex: 1 })
    const world = makeWorld({ bricks: [brick], targets: [target] })
    const rt = fakeRuntime(world)

    // String "2" matches costume named "2" at position 1 (costumeIndex 0)
    run(looksPrimitives.looks_switchcostumeto, rt, target, { COSTUME: '2' })
    expect(target.costumeIndex).toBe(0)

    // Numeric 2 matches 1-based position 2 (costumeIndex 1)
    run(looksPrimitives.looks_switchcostumeto, rt, target, { COSTUME: 2 })
    expect(target.costumeIndex).toBe(1)

    // Missing costume name leaves costume unchanged
    run(looksPrimitives.looks_switchcostumeto, rt, target, { COSTUME: 'nonexistent' })
    expect(target.costumeIndex).toBe(1)

    // Numeric string that does NOT match any name converts to 1-based index
    // e.g. "3" -> position 3 (costumeIndex 2)
    run(looksPrimitives.looks_switchcostumeto, rt, target, { COSTUME: '3' })
    expect(target.costumeIndex).toBe(2)

    // Whitespace string is not converted to a number and doesn't match
    run(looksPrimitives.looks_switchcostumeto, rt, target, { COSTUME: '   ' })
    expect(target.costumeIndex).toBe(2)

    // Stage ignores switch costume to and next costume (B6)
    world.stage.costumeIndex = 0
    run(looksPrimitives.looks_switchcostumeto, rt, world.stage, { COSTUME: 2 })
    expect(world.stage.costumeIndex).toBe(0)
    run(looksPrimitives.looks_nextcostume, rt, world.stage)
    expect(world.stage.costumeIndex).toBe(0)
  })

  it('L02 · costume wrap for next, zero, out of range, fractional, and nonfinite', () => {
    const costumes: Costume[] = [
      { name: 'a', width: 20, height: 20, rotationCenterX: 10, rotationCenterY: 10 },
      { name: 'b', width: 20, height: 20, rotationCenterX: 10, rotationCenterY: 10 },
      { name: 'c', width: 20, height: 20, rotationCenterX: 10, rotationCenterY: 10 },
    ]
    const brick = makeBrickWithCostumes('b1', 'TestBrick', costumes)
    const target = makeTarget({ costumeIndex: 2 }) // current is 3rd costume ('c')
    const world = makeWorld({ bricks: [brick], targets: [target] })
    const rt = fakeRuntime(world)

    // next costume on index 2 wraps to 0
    run(looksPrimitives.looks_nextcostume, rt, target)
    expect(target.costumeIndex).toBe(0)

    // switch numeric 0 wraps to 3 (costumeIndex 2)
    run(looksPrimitives.looks_switchcostumeto, rt, target, { COSTUME: 0 })
    expect(target.costumeIndex).toBe(2)

    // switch numeric 4 wraps to 1 (costumeIndex 0)
    run(looksPrimitives.looks_switchcostumeto, rt, target, { COSTUME: 4 })
    expect(target.costumeIndex).toBe(0)

    // fractional inputs: 2.4 rounds to 2 (costumeIndex 1), 2.6 rounds to 3 (costumeIndex 2)
    run(looksPrimitives.looks_switchcostumeto, rt, target, { COSTUME: 2.4 })
    expect(target.costumeIndex).toBe(1)
    run(looksPrimitives.looks_switchcostumeto, rt, target, { COSTUME: 2.6 })
    expect(target.costumeIndex).toBe(2)

    // nonfinite inputs wrapCostumeIndex: reset to 0
    expect(wrapCostumeIndex(NaN, 3)).toBe(0)
    expect(wrapCostumeIndex(Infinity, 3)).toBe(0)
    expect(wrapCostumeIndex(-Infinity, 3)).toBe(0)
    run(looksPrimitives.looks_switchcostumeto, rt, target, { COSTUME: NaN })
    expect(target.costumeIndex).toBe(0)

    // costume number and name reporters
    expect(run(looksPrimitives.looks_costumenumbername, rt, target, {}, { NUMBER_NAME: 'number' }).result).toBe(1)
    expect(run(looksPrimitives.looks_costumenumbername, rt, target, {}, { NUMBER_NAME: 'name' }).result).toBe('a')
  })

  it('L03 · rotation center switch never alters target coordinates', () => {
    // Two costumes with different rotation centers and dimensions
    const costumes: Costume[] = [
      { name: 'c1', width: 20, height: 20, rotationCenterX: 10, rotationCenterY: 10 },
      { name: 'c2', width: 100, height: 50, rotationCenterX: 20, rotationCenterY: 45 },
    ]
    const brick = makeBrickWithCostumes('b1', 'AsymBrick', costumes)
    const target = makeTarget({ costumeIndex: 0, x: 42, y: 84 })
    const world = makeWorld({ bricks: [brick], targets: [target] })
    const rt = fakeRuntime(world)

    run(looksPrimitives.looks_switchcostumeto, rt, target, { COSTUME: 'c2' })
    expect(target.costumeIndex).toBe(1)
    expect(target.x).toBe(42)
    expect(target.y).toBe(84)
  })

  it('L04 · size clamping against costume dimensions and stage bounds', () => {
    const brick100 = boxBrick('b1', 'Cat', 100, 100)
    const target = makeTarget({ brickId: 'b1', size: 100 })
    const world = makeWorld({
      bounds: { left: -240, right: 240, bottom: -180, top: 180 }, // 480x360
      bricks: [brick100],
      targets: [target],
    })
    const rt = fakeRuntime(world)

    // 100x100 on 480x360:
    // minScale = min(1, max(5/100, 5/100)) = 0.05 -> 5%
    // maxScale = min((1.5*480)/100, (1.5*360)/100) = min(7.2, 5.4) = 5.4 -> 540%
    run(looksPrimitives.looks_setsizeto, rt, target, { SIZE: 0 })
    expect(target.size).toBe(5)
    expect(run(looksPrimitives.looks_size, rt, target).result).toBe(5)

    run(looksPrimitives.looks_setsizeto, rt, target, { SIZE: 10000 })
    expect(target.size).toBe(540)
    expect(run(looksPrimitives.looks_size, rt, target).result).toBe(540)

    run(looksPrimitives.looks_changesizeby, rt, target, { CHANGE: -100 })
    expect(target.size).toBe(440)

    // Tiny skin: 2x2
    const tinyBrick = boxBrick('bTiny', 'Tiny', 2, 2)
    const tinyTarget = makeTarget({ brickId: 'bTiny', size: 100 })
    const tinyWorld = makeWorld({
      bounds: { left: -240, right: 240, bottom: -180, top: 180 },
      bricks: [tinyBrick],
      targets: [tinyTarget],
    })
    // minScale = min(1, max(5/2, 5/2)) = 1 (100%)
    // maxScale = min(720/2, 540/2) = 270 (27000%)
    expect(clampSize(tinyWorld, tinyTarget, 10)).toBe(100)
    expect(clampSize(tinyWorld, tinyTarget, 50000)).toBe(27000)

    // Wide skin: 1000x10
    const wideBrick = boxBrick('bWide', 'Wide', 1000, 10)
    const wideTarget = makeTarget({ brickId: 'bWide', size: 100 })
    const wideWorld = makeWorld({
      bounds: { left: -240, right: 240, bottom: -180, top: 180 },
      bricks: [wideBrick],
      targets: [wideTarget],
    })
    // minScale = min(1, max(5/1000, 5/10)) = 0.5 (50%)
    // maxScale = min(720/1000, 540/10) = min(0.72, 54) = 0.72 (72%)
    expect(clampSize(wideWorld, wideTarget, 10)).toBe(50)
    expect(clampSize(wideWorld, wideTarget, 200)).toBe(72)

    // Empty skin: width=0, height=0
    const emptyCostume: Costume = { name: 'empty', width: 0, height: 0, rotationCenterX: 0, rotationCenterY: 0 }
    const emptyBrick = makeBrickWithCostumes('bEmpty', 'Empty', [emptyCostume])
    const emptyTarget = makeTarget({ brickId: 'bEmpty', size: 100 })
    const emptyWorld = makeWorld({ bricks: [emptyBrick], targets: [emptyTarget] })
    expect(clampSize(emptyWorld, emptyTarget, 120)).toBe(120)

    // Stage ignores size blocks
    run(looksPrimitives.looks_setsizeto, rt, world.stage, { SIZE: 200 })
    expect(world.stage.size).toBe(100)
    run(looksPrimitives.looks_changesizeby, rt, world.stage, { CHANGE: 10 })
    expect(world.stage.size).toBe(100)
  })

  it('L05 · graphic effects clamps, lowercase normalization, and unknown effects', () => {
    const { target, rt } = makeTargetAndRuntime()

    // ghost clamped to 0..100
    run(looksPrimitives.looks_seteffectto, rt, target, { VALUE: 150 }, { EFFECT: 'GHOST' })
    expect(target.effects.ghost).toBe(100)
    run(looksPrimitives.looks_seteffectto, rt, target, { VALUE: -20 }, { EFFECT: 'ghost' })
    expect(target.effects.ghost).toBe(0)

    // brightness clamped to -100..100
    run(looksPrimitives.looks_seteffectto, rt, target, { VALUE: 200 }, { EFFECT: 'brightness' })
    expect(target.effects.brightness).toBe(100)
    run(looksPrimitives.looks_seteffectto, rt, target, { VALUE: -200 }, { EFFECT: 'BRIGHTNESS' })
    expect(target.effects.brightness).toBe(-100)

    // change effect by
    run(looksPrimitives.looks_changeeffectby, rt, target, { CHANGE: 50 }, { EFFECT: 'ghost' })
    expect(target.effects.ghost).toBe(50)
    run(looksPrimitives.looks_changeeffectby, rt, target, { CHANGE: 100 }, { EFFECT: 'ghost' })
    expect(target.effects.ghost).toBe(100)

    // unconstrained effects (color, fisheye, whirl, pixelate, mosaic)
    run(looksPrimitives.looks_seteffectto, rt, target, { VALUE: 250 }, { EFFECT: 'color' })
    expect(target.effects.color).toBe(250)

    // unknown effect is ignored
    run(looksPrimitives.looks_seteffectto, rt, target, { VALUE: 50 }, { EFFECT: 'transparency' })
    expect((target.effects as Record<string, number>).transparency).toBeUndefined()

    // clear graphic effects
    run(looksPrimitives.looks_cleargraphiceffects, rt, target)
    expect(target.effects.ghost).toBe(0)
    expect(target.effects.brightness).toBe(0)
    expect(target.effects.color).toBe(0)
  })

  it('L06 · ghost effect is stored in state (collision/picking owned by clones-sensing)', () => {
    const { target, rt } = makeTargetAndRuntime()
    run(looksPrimitives.looks_seteffectto, rt, target, { VALUE: 100 }, { EFFECT: 'ghost' })
    expect(target.effects.ghost).toBe(100)
    // As noted in L06, ghost transparency does not alter visibility or collision in core looks
    expect(target.visible).toBe(true)
  })

  it('L07 · show and hide visibility toggling and redraw gating', () => {
    const { target, rt, world } = makeTargetAndRuntime()
    expect(target.visible).toBe(true)

    // Hide sprite
    const redrawsBefore = rt.redraws
    run(looksPrimitives.looks_hide, rt, target)
    expect(target.visible).toBe(false)
    // Scratch hide does not request a redraw; only show does
    expect(rt.redraws).toBe(redrawsBefore)

    // Show sprite requests redraw
    run(looksPrimitives.looks_show, rt, target)
    expect(target.visible).toBe(true)
    expect(rt.redraws).toBe(redrawsBefore + 1)

    // Stage ignores show/hide
    world.stage.visible = true
    run(looksPrimitives.looks_hide, rt, world.stage)
    expect(world.stage.visible).toBe(true)
    run(looksPrimitives.looks_show, rt, world.stage)
    expect(world.stage.visible).toBe(true)
  })

  it('L08 · layer operations (front, back, forward, backward, clamping, truncation)', () => {
    const t1 = makeTarget({ id: 't1' })
    const t2 = makeTarget({ id: 't2' })
    const t3 = makeTarget({ id: 't3' })
    const t4 = makeTarget({ id: 't4' })
    const world = makeWorld({ targets: [t1, t2, t3, t4] })
    const rt = fakeRuntime(world)

    // Move t1 to front (end of array)
    run(looksPrimitives.looks_gotofrontback, rt, t1, {}, { FRONT_BACK: 'front' })
    expect(world.targets.map((t) => t.id)).toEqual(['t2', 't3', 't4', 't1'])

    // Move t1 to back (start of array)
    run(looksPrimitives.looks_gotofrontback, rt, t1, {}, { FRONT_BACK: 'back' })
    expect(world.targets.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4'])

    // Move t2 forward 1 layer
    run(looksPrimitives.looks_goforwardbackwardlayers, rt, t2, { NUM: 1 }, { FORWARD_BACKWARD: 'forward' })
    expect(world.targets.map((t) => t.id)).toEqual(['t1', 't3', 't2', 't4'])

    // Move t2 backward 2 layers
    run(looksPrimitives.looks_goforwardbackwardlayers, rt, t2, { NUM: 2 }, { FORWARD_BACKWARD: 'backward' })
    expect(world.targets.map((t) => t.id)).toEqual(['t2', 't1', 't3', 't4'])

    // Fractional layer input is truncated like Array.splice
    shiftLayer(world.targets, t2, 1.8)
    expect(world.targets.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4'])

    // Stage ignores layer shifts
    run(looksPrimitives.looks_gotofrontback, rt, world.stage, {}, { FRONT_BACK: 'front' })
    expect(world.targets.includes(world.stage)).toBe(false)
  })

  it('L09 · plain say and think formatting and empty string bubble clearing (B1)', () => {
    const { target, rt } = makeTargetAndRuntime()

    // B1: numeric formatting rounds to 2 decimals then displays as number
    run(looksPrimitives.looks_say, rt, target, { MESSAGE: 1.234 })
    expect(target.bubble).toEqual({ kind: 'say', text: '1.23' })

    run(looksPrimitives.looks_say, rt, target, { MESSAGE: 1.5 })
    expect(target.bubble).toEqual({ kind: 'say', text: '1.5' })

    run(looksPrimitives.looks_say, rt, target, { MESSAGE: 0.005 })
    expect(target.bubble).toEqual({ kind: 'say', text: '0.01' })

    run(looksPrimitives.looks_say, rt, target, { MESSAGE: 3 })
    expect(target.bubble).toEqual({ kind: 'say', text: '3' })

    // String input is preserved verbatim
    run(looksPrimitives.looks_say, rt, target, { MESSAGE: '1.234' })
    expect(target.bubble).toEqual({ kind: 'say', text: '1.234' })

    run(looksPrimitives.looks_think, rt, target, { MESSAGE: 'Thinking...' })
    expect(target.bubble).toEqual({ kind: 'think', text: 'Thinking...' })

    // Empty text clears bubble
    run(looksPrimitives.looks_say, rt, target, { MESSAGE: '' })
    expect(target.bubble).toBeNull()

    // formatBubble standalone verification
    expect(formatBubble('')).toBe('')
    expect(formatBubble(1.5)).toBe('1.5')
    expect(formatBubble(0.005)).toBe('0.01')
    expect(formatBubble(1.234)).toBe('1.23')
    expect(formatBubble(3)).toBe('3')
    expect(formatBubble('hello')).toBe('hello')
  })

  it('L10 · timed say and think yield until deadline', () => {
    const { target, rt } = makeTargetAndRuntime()

    // say 1 sec on 30 ticks/sec clock (1000ms)
    const result1 = run(looksPrimitives.looks_sayforsecs, rt, target, { MESSAGE: 'Hello', SECS: 1 })
    expect(result1.ticks).toBe(30)
    expect(result1.result).toBeUndefined()
    expect(target.bubble).toBeNull()

    // say 0 sec yields at least 1 tick before finishing
    const result0 = run(looksPrimitives.looks_sayforsecs, rt, target, { MESSAGE: 'Quick', SECS: 0 })
    expect(result0.ticks).toBe(1)
    expect(result0.result).toBeUndefined()
    expect(target.bubble).toBeNull()
  })

  it('L11 · bubble overwrite race: older timed bubble does not clear newer bubble', () => {
    const { target, rt } = makeTargetAndRuntime()

    // Thread 1 starts say 'old' for 1s
    const frame1: Record<string, unknown> = {}
    const ctx1 = {
      target,
      runtime: rt,
      thread: { id: 1, target, done: false },
      arg: (name: string) => (name === 'MESSAGE' ? 'old' : name === 'SECS' ? 1 : ''),
      field: () => '',
      frame: frame1,
      warp: false,
    }
    expect(looksPrimitives.looks_sayforsecs(ctx1)).toBe(YIELD)
    expect(target.bubble).toEqual({ kind: 'say', text: 'old' })

    // Thread 2 overwrites with plain say 'new'
    run(looksPrimitives.looks_say, rt, target, { MESSAGE: 'new' })
    expect(target.bubble).toEqual({ kind: 'say', text: 'new' })

    // Advance time past Thread 1's deadline (1000ms)
    rt.world.tick = 35 // 35 * (1000/30) = 1166ms > 1000ms
    expect(looksPrimitives.looks_sayforsecs(ctx1)).toBeUndefined()

    // Newer bubble was NOT cleared!
    expect(target.bubble).toEqual({ kind: 'say', text: 'new' })
  })

  it('L12 · green flag and stop-all graphic effects and bubble hooks', () => {
    const { target, rt, world } = makeTargetAndRuntime()
    target.effects.ghost = 50
    target.size = 80
    target.costumeIndex = 1
    target.x = 10
    target.bubble = { kind: 'say', text: 'Keep or clear' }

    // onGreenFlagLooks clears graphic effects only
    onGreenFlagLooks(rt)
    expect(target.effects.ghost).toBe(0)
    expect(target.size).toBe(80)
    expect(target.costumeIndex).toBe(1)
    expect(target.x).toBe(10)
    expect(target.bubble).toEqual({ kind: 'say', text: 'Keep or clear' })

    // onStopAllLooks clears graphic effects and bubbles
    target.effects.brightness = 40
    onStopAllLooks(rt)
    expect(target.effects.brightness).toBe(0)
    expect(target.bubble).toBeNull()
  })

  it('Backdrops · switch backdrop, name-first (B3), special strings, notes, and hats', () => {
    const stageBackdrops: Costume[] = [
      { name: 'backdrop1', width: 480, height: 360, rotationCenterX: 240, rotationCenterY: 180 },
      { name: 'backdrop2', width: 480, height: 360, rotationCenterX: 240, rotationCenterY: 180 },
      { name: 'random backdrop', width: 480, height: 360, rotationCenterX: 240, rotationCenterY: 180 },
    ]
    const stageBrick: BrickDef = {
      id: 'stage',
      name: 'Stage',
      isStage: true,
      costumes: stageBackdrops,
      sounds: [],
      program: { scripts: [], procedures: [], variables: [], lists: [] },
    }
    const world = makeWorld({ bricks: [] })
    world.bricks.stage = stageBrick
    world.stage.brickId = 'stage'
    world.stage.costumeIndex = 0
    const rt = fakeRuntime(world)

    // B3: exact name matches backdrop literally named "random backdrop" (index 2)
    run(looksPrimitives.looks_switchbackdropto, rt, world.stage, { BACKDROP: 'random backdrop' })
    expect(world.stage.costumeIndex).toBe(2)
    expect(rt.notes).toContainEqual({ kind: 'backdrop', name: 'random backdrop' })
    expect(rt.hatsStarted).toContainEqual({
      opcode: 'event_whenbackdropswitchesto',
      fields: { BACKDROP: 'random backdrop' },
    })

    // switch to next backdrop
    run(looksPrimitives.looks_nextbackdrop, rt, world.stage)
    expect(world.stage.costumeIndex).toBe(0) // wrapped 2 + 1 -> 0
    expect(rt.notes.at(-1)).toEqual({ kind: 'backdrop', name: 'backdrop1' })

    // switch by numeric index 2 -> backdrop2 (index 1)
    run(looksPrimitives.looks_switchbackdropto, rt, world.stage, { BACKDROP: 2 })
    expect(world.stage.costumeIndex).toBe(1)
    expect(rt.notes.at(-1)).toEqual({ kind: 'backdrop', name: 'backdrop2' })

    // backdrop number and name reporters
    expect(run(looksPrimitives.looks_backdropnumbername, rt, world.stage, {}, { NUMBER_NAME: 'number' }).result).toBe(2)
    expect(run(looksPrimitives.looks_backdropnumbername, rt, world.stage, {}, { NUMBER_NAME: 'name' }).result).toBe('backdrop2')

    // switch backdrop to and wait
    const frame: Record<string, unknown> = {}
    const doneThread = { id: 10, target: world.stage, done: false }
    rt.startHats = () => [doneThread]
    const ctx = {
      target: world.stage,
      runtime: rt,
      thread: { id: 1, target: world.stage, done: false },
      arg: (name: string) => (name === 'BACKDROP' ? 'backdrop1' : ''),
      field: () => '',
      frame,
      warp: false,
    }
    expect(looksPrimitives.looks_switchbackdroptoandwait(ctx)).toBe(YIELD)
    doneThread.done = true
    expect(looksPrimitives.looks_switchbackdroptoandwait(ctx)).toBeUndefined()
  })
})

function makeTargetAndRuntime() {
  const brick = boxBrick('b1', 'Brick', 20, 20)
  const target = makeTarget({ brickId: 'b1' })
  const world = makeWorld({ bricks: [brick], targets: [target] })
  const rt = fakeRuntime(world)
  return { target, rt, world }
}
