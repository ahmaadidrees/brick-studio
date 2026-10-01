import { describe, expect, it } from 'vitest'
import { CLONE_LIMIT } from './contracts'
import type { Target } from './contracts'
import { clonePrimitives, makeClone } from './clones'
import { boxBrick, callPrimitive, fakeRuntime, makeTarget, makeWorld, zeroEffects } from './testkit'

function effects(ghost: number) {
  return { ...zeroEffects(), ghost }
}

describe('clones', () => {
  it('C01 · state snapshot', () => {
    const source = makeTarget({
      id: 'src',
      copyId: 'copy-1',
      x: 12,
      y: -4,
      direction: -90,
      draggable: true,
      visible: false,
      size: 75,
      costumeIndex: 1,
      rotationStyle: 'left-right',
      effects: effects(20),
      variables: { hp: 3 },
      edgeHatState: { timer: true },
      volume: 40,
      bubble: { kind: 'say', text: 'hi' },
    })
    const world = makeWorld({ targets: [source] })
    const clone = makeClone(world, source)
    expect(clone).not.toBe(source)
    expect(clone.isClone).toBe(true)
    expect(clone.brickId).toBe(source.brickId)
    expect(clone.copyId).toBe('copy-1')
    expect(clone.x).toBe(12)
    expect(clone.y).toBe(-4)
    expect(clone.direction).toBe(-90)
    expect(clone.draggable).toBe(true)
    expect(clone.visible).toBe(false)
    expect(clone.size).toBe(75)
    expect(clone.costumeIndex).toBe(1)
    expect(clone.rotationStyle).toBe('left-right')
    expect(clone.effects.ghost).toBe(20)
    expect(clone.effects).not.toBe(source.effects)
    expect(clone.variables).toEqual({ hp: 3 })
    expect(clone.variables).not.toBe(source.variables)
    expect(clone.edgeHatState).toEqual({ timer: true })
    expect(clone.edgeHatState).not.toBe(source.edgeHatState)
    clone.variables.hp = 9
    clone.effects.ghost = 0
    clone.edgeHatState.timer = false
    expect(source.variables.hp).toBe(3)
    expect(source.effects.ghost).toBe(20)
    expect(source.edgeHatState.timer).toBe(true)
  })

  it('C02 · clone does not copy a bubble or a running stack', () => {
    const source = makeTarget({ id: 'src', bubble: { kind: 'think', text: 'mid-loop' }, x: 3 })
    const world = makeWorld({ targets: [source] })
    const rt = fakeRuntime(world)
    callPrimitive(clonePrimitives.control_create_clone_of, {
      runtime: rt,
      target: source,
      fields: { CLONE_OPTION: '_myself_' },
    })
    const clone = world.targets.find((target) => target.isClone)
    expect(clone).toBeDefined()
    expect(clone?.bubble).toBeNull()
    expect(source.bubble).toEqual({ kind: 'think', text: 'mid-loop' })
    expect(source.x).toBe(3)
    expect(rt.hatsStarted).toEqual([{ opcode: 'control_start_as_clone', target: clone }])
  })

  it('C03 · create clone starts only the new clone hat', () => {
    const original = makeTarget({ id: 'orig' })
    const world = makeWorld({ targets: [original] })
    const rt = fakeRuntime(world)
    const create = clonePrimitives.control_create_clone_of
    callPrimitive(create, { runtime: rt, target: original, fields: { CLONE_OPTION: '_myself_' } })
    callPrimitive(create, { runtime: rt, target: original, fields: { CLONE_OPTION: '_myself_' } })
    const clones = world.targets.filter((target) => target.isClone)
    expect(clones).toHaveLength(2)
    expect(rt.hatsStarted.map((hat) => hat.opcode)).toEqual(['control_start_as_clone', 'control_start_as_clone'])
    expect(rt.hatsStarted.map((hat) => hat.target)).toEqual(clones)
    expect(world.targets).toContain(original)
  })

  it('C04 · layer', () => {
    const a = makeTarget({ id: 'A', brickId: 'a' })
    const b = makeTarget({ id: 'B', brickId: 'b' })
    const c = makeTarget({ id: 'C', brickId: 'c' })
    const world = makeWorld({
      bricks: [boxBrick('a', 'A'), boxBrick('b', 'B'), boxBrick('c', 'C')],
      targets: [a, b, c],
    })
    const rt = fakeRuntime(world)
    callPrimitive(clonePrimitives.control_create_clone_of, {
      runtime: rt,
      target: b,
      fields: { CLONE_OPTION: '_myself_' },
    })
    expect(world.targets.map((target) => target.id)).toEqual(['A', '100', 'B', 'C'])
    expect(world.targets[1]?.isClone).toBe(true)
  })

  it('C05 · global limit', () => {
    const a = makeTarget({ id: 'A', brickId: 'a' })
    const b = makeTarget({ id: 'B', brickId: 'b' })
    const world = makeWorld({
      bricks: [boxBrick('a', 'A'), boxBrick('b', 'B')],
      targets: [a, b],
    })
    const rt = fakeRuntime(world)
    const create = clonePrimitives.control_create_clone_of
    for (let i = 0; i < 200; i++) {
      callPrimitive(create, { runtime: rt, target: a, fields: { CLONE_OPTION: '_myself_' } })
    }
    for (let i = 0; i < 100; i++) {
      callPrimitive(create, { runtime: rt, target: b, fields: { CLONE_OPTION: '_myself_' } })
    }
    expect(world.cloneCount).toBe(CLONE_LIMIT)
    const before = world.targets.length
    callPrimitive(create, { runtime: rt, target: a, fields: { CLONE_OPTION: '_myself_' } })
    expect(world.cloneCount).toBe(CLONE_LIMIT)
    expect(world.targets).toHaveLength(before)
    const doomed = world.targets.find((target) => target.isClone && target.brickId === 'b')
    expect(doomed).toBeDefined()
    callPrimitive(clonePrimitives.control_delete_this_clone, { runtime: rt, target: doomed })
    expect(world.cloneCount).toBe(CLONE_LIMIT - 1)
    callPrimitive(create, { runtime: rt, target: a, fields: { CLONE_OPTION: '_myself_' } })
    expect(world.cloneCount).toBe(CLONE_LIMIT)
  })

  it('C06 · delete original', () => {
    const original = makeTarget({ id: 'orig' })
    const world = makeWorld({ targets: [original] })
    const rt = fakeRuntime(world)
    const result = callPrimitive(clonePrimitives.control_delete_this_clone, { runtime: rt, target: original })
    expect(result.result).toBeUndefined()
    expect(world.targets).toContain(original)
    expect(world.cloneCount).toBe(0)
  })

  it('C07 · delete runtime clone', () => {
    const original = makeTarget({ id: 'orig' })
    const world = makeWorld({ targets: [original] })
    const rt = fakeRuntime(world)
    const create = clonePrimitives.control_create_clone_of
    callPrimitive(create, { runtime: rt, target: original, fields: { CLONE_OPTION: '_myself_' } })
    callPrimitive(create, { runtime: rt, target: original, fields: { CLONE_OPTION: '_myself_' } })
    const [first, second] = world.targets.filter((target) => target.isClone) as [Target, Target]
    callPrimitive(clonePrimitives.control_delete_this_clone, { runtime: rt, target: first })
    expect(world.targets).not.toContain(first)
    expect(world.targets).toContain(second)
    expect(world.targets).toContain(original)
    expect(world.cloneCount).toBe(1)
  })

  it('C09 · clone of clone', () => {
    const brick = boxBrick('b', 'Cat', 20, 20, {
      program: { scripts: [], procedures: [], variables: [{ id: 'hp', name: 'hp', value: 0 }], lists: [] },
    })
    const original = makeTarget({ id: 'orig', brickId: 'b', variables: { hp: 10 } })
    const world = makeWorld({ bricks: [brick], targets: [original] })
    const rt = fakeRuntime(world)
    const parent = makeClone(world, original)
    parent.variables.hp = 3
    world.targets.unshift(parent)
    world.cloneCount = 1
    callPrimitive(clonePrimitives.control_create_clone_of, {
      runtime: rt,
      target: parent,
      fields: { CLONE_OPTION: '_myself_' },
    })
    const grandchild = world.targets.find((target) => target.isClone && target !== parent)
    expect(grandchild?.variables.hp).toBe(3)
    callPrimitive(clonePrimitives.control_create_clone_of, {
      runtime: rt,
      target: parent,
      fields: { CLONE_OPTION: 'Cat' },
    })
    const named = world.targets.find((target) => target.isClone && target !== parent && target !== grandchild)
    expect(named?.variables.hp).toBe(10)
    expect(original.variables.hp).toBe(10)
  })

  it('C11 · local lists', () => {
    const source = makeTarget({
      lists: { L: [1] },
    })
    const world = makeWorld({ targets: [source] })
    world.stage.lists = { G: [1] }
    const clone = makeClone(world, source)
    expect(clone.lists.L).toEqual([1])
    expect(clone.lists.L).not.toBe(source.lists.L)
    clone.lists.L?.push(2)
    expect(source.lists.L).toEqual([1])
    expect(clone.lists.G).toBeUndefined()
    world.stage.lists.G?.push(2)
    expect(world.stage.lists.G).toEqual([1, 2])
  })

  it('C12 · uninherited bubble, volume, and sound effects', () => {
    const source = makeTarget({
      bubble: { kind: 'say', text: 'asking' },
      volume: 40,
      soundEffects: { pitch: 5, pan: -20 },
      variables: { hp: 1 },
    })
    const world = makeWorld({ targets: [source] })
    const clone = makeClone(world, source)
    expect(clone.bubble).toBeNull()
    expect(clone.volume).toBe(100)
    expect(clone.soundEffects).toEqual({ pitch: 0, pan: 0 })
    expect(clone.variables.hp).toBe(1)
    expect(source.volume).toBe(40)
  })

  it('a missing menu clones myself, and the stage never clones', () => {
    const original = makeTarget({ id: 'orig', x: 4, variables: { hp: 2 } })
    const world = makeWorld({ targets: [original] })
    const rt = fakeRuntime(world)
    callPrimitive(clonePrimitives.control_create_clone_of, { runtime: rt, target: original })
    expect(world.cloneCount).toBe(1)
    expect(world.targets.find((target) => target.isClone)?.variables.hp).toBe(2)
    callPrimitive(clonePrimitives.control_create_clone_of, {
      runtime: rt,
      target: world.stage,
      fields: { CLONE_OPTION: '_myself_' },
    })
    expect(world.cloneCount).toBe(1)
    callPrimitive(clonePrimitives.control_create_clone_of, {
      runtime: rt,
      target: original,
      fields: { CLONE_OPTION: 'Nope' },
    })
    expect(world.cloneCount).toBe(1)
  })

  it('a brick with no painted copy starts at the level origin', () => {
    const ghost = boxBrick('g', 'Ghost', 20, 20, {
      program: {
        scripts: [],
        procedures: [],
        variables: [{ id: 'hp', name: 'hp', value: 4 }],
        lists: [{ id: 'L', name: 'L', value: ['a'] }],
      },
    })
    const world = makeWorld({
      bricks: [boxBrick('b1', 'Brick'), ghost],
      bounds: { left: 5, right: 100, bottom: 8, top: 90 },
    })
    const rt = fakeRuntime(world)
    callPrimitive(clonePrimitives.control_create_clone_of, {
      runtime: rt,
      target: world.targets[0],
      fields: { CLONE_OPTION: 'Ghost' },
    })
    const clone = world.targets.find((target) => target.isClone)
    expect(clone).toMatchObject({
      brickId: 'g',
      isClone: true,
      x: 5,
      y: 8,
      direction: 90,
      size: 100,
      visible: true,
      costumeIndex: 0,
      rotationStyle: 'all around',
    })
    expect(clone?.variables).toEqual({ hp: 4 })
    expect(clone?.lists.L).toEqual(['a'])
    expect(clone?.lists.L).not.toBe(ghost.program.lists[0]?.value)
    expect(world.targets[0]).toBe(clone)
    expect(rt.redraws).toBe(1)
    expect(rt.hatsStarted[0]?.opcode).toBe('control_start_as_clone')
  })

  it('a hidden clone is created without a redraw', () => {
    const source = makeTarget({ visible: false })
    const world = makeWorld({ targets: [source] })
    const rt = fakeRuntime(world)
    callPrimitive(clonePrimitives.control_create_clone_of, {
      runtime: rt,
      target: source,
      fields: { CLONE_OPTION: '_myself_' },
    })
    expect(world.cloneCount).toBe(1)
    expect(world.targets.find((target) => target.isClone)?.visible).toBe(false)
    expect(rt.redraws).toBe(0)
    expect(rt.hatsStarted).toHaveLength(1)
  })
})
