import { describe, expect, it } from 'vitest'
import { YIELD } from './contracts'
import type { BrickDef, Primitive, Sound, Target, Value } from './contracts'
import {
  clampPan,
  clampPitch,
  clampVolume,
  clearSoundEffects,
  onGreenFlagSound,
  onStopAllSound,
  resolveSound,
  soundPrimitives,
} from './sound'
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

function makeBrickWithSounds(id: string, name: string, sounds: Sound[]): BrickDef {
  return {
    id,
    name,
    costumes: [{ name: 'c1', width: 20, height: 20, rotationCenterX: 10, rotationCenterY: 10 }],
    sounds,
    program: { scripts: [], procedures: [], variables: [], lists: [] },
  }
}

describe('sound', () => {
  it('sound resolution by name, 1-based number, wrap, and non-numeric strings', () => {
    const sounds: Sound[] = [
      { name: '2', durationMs: 500 },
      { name: 'meow', durationMs: 1200 },
    ]
    const brick = makeBrickWithSounds('b1', 'Cat', sounds)
    const target = makeTarget({ brickId: 'b1' })
    const world = makeWorld({ bricks: [brick], targets: [target] })

    // String "2" matches sound named "2" at index 0
    expect(resolveSound(world, target, '2')?.name).toBe('2')

    // Numeric 2 matches 1-based 2nd sound ('meow')
    expect(resolveSound(world, target, 2)?.name).toBe('meow')

    // Numeric wrapping: 0 wraps to last sound ('meow'), 3 wraps to 1st sound ('2')
    expect(resolveSound(world, target, 0)?.name).toBe('meow')
    expect(resolveSound(world, target, 3)?.name).toBe('2')

    // String name "meow"
    expect(resolveSound(world, target, 'meow')?.name).toBe('meow')

    // Nonexistent name
    expect(resolveSound(world, target, 'bark')).toBeUndefined()

    // Whitespace string does not convert to index
    expect(resolveSound(world, target, '   ')).toBeUndefined()
  })

  it('sound_play emits sound note with volume and effects and does not yield or redraw', () => {
    const sounds: Sound[] = [{ name: 'pop', durationMs: 300 }]
    const brick = makeBrickWithSounds('b1', 'Button', sounds)
    const target = makeTarget({
      id: 'sprite1',
      brickId: 'b1',
      volume: 85,
      soundEffects: { pitch: 10, pan: -20 },
    })
    const world = makeWorld({ bricks: [brick], targets: [target] })
    const rt = fakeRuntime(world)

    const redrawsBefore = rt.redraws
    const res = run(soundPrimitives.sound_play, rt, target, { SOUND_MENU: 'pop' })
    expect(res.ticks).toBe(0)
    expect(res.result).toBeUndefined()
    expect(rt.redraws).toBe(redrawsBefore) // audio does not trigger redraw
    expect(rt.notes).toContainEqual({
      kind: 'sound',
      targetId: 'sprite1',
      sound: 'pop',
      volume: 85,
      pitch: 10,
      pan: -20,
    })
  })

  it('sound_playuntildone yields until durationMs passes', () => {
    const sounds: Sound[] = [{ name: 'song', durationMs: 1000 }]
    const brick = makeBrickWithSounds('b1', 'Player', sounds)
    const target = makeTarget({ id: 'player', brickId: 'b1' })
    const world = makeWorld({ bricks: [brick], targets: [target] })
    const rt = fakeRuntime(world)

    const res = run(soundPrimitives.sound_playuntildone, rt, target, { SOUND_MENU: 'song' })
    expect(res.ticks).toBe(30)
    expect(res.result).toBeUndefined()
    expect(rt.notes).toContainEqual({
      kind: 'sound',
      targetId: 'player',
      sound: 'song',
      volume: 100,
      pitch: 0,
      pan: 0,
    })

    // 0ms duration sound yields at least 1 tick
    const instantSound: Sound[] = [{ name: 'click', durationMs: 0 }]
    const instantBrick = makeBrickWithSounds('b2', 'Clicker', instantSound)
    const instantTarget = makeTarget({ id: 'clicker', brickId: 'b2' })
    world.bricks.b2 = instantBrick
    world.targets.push(instantTarget)

    const instantRes = run(soundPrimitives.sound_playuntildone, rt, instantTarget, { SOUND_MENU: 'click' })
    expect(instantRes.ticks).toBe(1)
    expect(instantRes.result).toBeUndefined()

    // Missing sound does not yield
    const missingRes = run(soundPrimitives.sound_playuntildone, rt, target, { SOUND_MENU: 'missing' })
    expect(missingRes.ticks).toBe(0)
  })

  it('sound_stopallsounds emits stopSounds note', () => {
    const target = makeTarget()
    const world = makeWorld({ targets: [target] })
    const rt = fakeRuntime(world)

    run(soundPrimitives.sound_stopallsounds, rt, target)
    expect(rt.notes).toContainEqual({ kind: 'stopSounds' })
  })

  it('sound effects set, change, clamp, and clear', () => {
    const target = makeTarget()
    const world = makeWorld({ targets: [target] })
    const rt = fakeRuntime(world)

    // Pitch clamped to [-360, 360]
    run(soundPrimitives.sound_seteffectto, rt, target, { VALUE: 400 }, { EFFECT: 'PITCH' })
    expect(target.soundEffects.pitch).toBe(360)
    run(soundPrimitives.sound_changeeffectby, rt, target, { VALUE: -800 }, { EFFECT: 'pitch' })
    expect(target.soundEffects.pitch).toBe(-360)

    // Pan clamped to [-100, 100]
    run(soundPrimitives.sound_seteffectto, rt, target, { VALUE: 150 }, { EFFECT: 'pan' })
    expect(target.soundEffects.pan).toBe(100)
    run(soundPrimitives.sound_changeeffectby, rt, target, { VALUE: -50 }, { EFFECT: 'PAN' })
    expect(target.soundEffects.pan).toBe(50)

    // Unknown effect ignored
    run(soundPrimitives.sound_seteffectto, rt, target, { VALUE: 10 }, { EFFECT: 'echo' })
    expect((target.soundEffects as Record<string, number>).echo).toBeUndefined()

    // Clear sound effects
    run(soundPrimitives.sound_cleareffects, rt, target)
    expect(target.soundEffects.pitch).toBe(0)
    expect(target.soundEffects.pan).toBe(0)
  })

  it('volume set, change, clamp, and reporter', () => {
    const target = makeTarget({ volume: 100 })
    const world = makeWorld({ targets: [target] })
    const rt = fakeRuntime(world)

    run(soundPrimitives.sound_setvolumeto, rt, target, { VOLUME: 75.4 })
    expect(target.volume).toBe(75.4)
    expect(run(soundPrimitives.sound_volume, rt, target).result).toBe(75)

    // Change volume clamped to 0..100
    run(soundPrimitives.sound_changevolumeby, rt, target, { VOLUME: 50 })
    expect(target.volume).toBe(100)

    run(soundPrimitives.sound_changevolumeby, rt, target, { VOLUME: -150 })
    expect(target.volume).toBe(0)
  })

  it('stage target supports sounds and sound volume/effects', () => {
    const sounds: Sound[] = [{ name: 'bgm', durationMs: 5000 }]
    const stageBrick: BrickDef = {
      id: 'stage',
      name: 'Stage',
      isStage: true,
      costumes: [{ name: 'backdrop1', width: 480, height: 360, rotationCenterX: 240, rotationCenterY: 180 }],
      sounds,
      program: { scripts: [], procedures: [], variables: [], lists: [] },
    }
    const world = makeWorld({ bricks: [] })
    world.bricks.stage = stageBrick
    world.stage.brickId = 'stage'
    world.stage.volume = 50
    const rt = fakeRuntime(world)

    run(soundPrimitives.sound_play, rt, world.stage, { SOUND_MENU: 'bgm' })
    expect(rt.notes).toContainEqual({
      kind: 'sound',
      targetId: 'stage',
      sound: 'bgm',
      volume: 50,
      pitch: 0,
      pan: 0,
    })
  })

  it('lifecycle hooks onGreenFlagSound and onStopAllSound', () => {
    const target = makeTarget({ soundEffects: { pitch: 50, pan: -20 } })
    const world = makeWorld({ targets: [target] })
    world.stage.soundEffects.pitch = 30
    const rt = fakeRuntime(world)

    onGreenFlagSound(rt)
    expect(target.soundEffects.pitch).toBe(0)
    expect(target.soundEffects.pan).toBe(0)
    expect(world.stage.soundEffects.pitch).toBe(0)

    target.soundEffects.pan = 40
    onStopAllSound(rt)
    expect(target.soundEffects.pan).toBe(0)
    expect(rt.notes).toContainEqual({ kind: 'stopSounds' })
  })

  it('clamp helper functions', () => {
    expect(clampPitch(500)).toBe(360)
    expect(clampPitch(-500)).toBe(-360)
    expect(clampPitch(120)).toBe(120)

    expect(clampPan(200)).toBe(100)
    expect(clampPan(-200)).toBe(-100)
    expect(clampPan(0)).toBe(0)

    expect(clampVolume(150)).toBe(100)
    expect(clampVolume(-50)).toBe(0)
    expect(clampVolume(75)).toBe(75)
  })
})
