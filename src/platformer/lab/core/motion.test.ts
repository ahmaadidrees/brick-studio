import { describe, expect, it } from 'vitest'
import { TICK_MS, YIELD } from './contracts'
import type { Primitive, Target, Value } from './contracts'
import { sinCosDeg } from './detmath'
import { transformOf } from './geometry'
import { boxBrick, callPrimitive, fakeRuntime, makeTarget, makeWorld } from './testkit'
import type { FakeRuntime } from './testkit'
import {
  isDragging,
  isPastEdge,
  motionPrimitives,
  placeTarget,
  reportCoordinate,
  setDragging,
  wrapDirection,
} from './motion'

const stage = { left: -240, right: 240, bottom: -180, top: 180 }

function worldAt(w: number, h: number, at: Partial<Target> = {}) {
  const brick = boxBrick('b1', 'Brick', w, h)
  const target = makeTarget({ x: 0, y: 0, ...at })
  const world = makeWorld({ bounds: stage, bricks: [brick], targets: [target] })
  return { world, target, rt: fakeRuntime(world) }
}

function run(
  prim: Primitive,
  rt: FakeRuntime,
  target: Target,
  args: Record<string, Value> = {},
  fields: Record<string, string> = {},
) {
  return callPrimitive(prim, { runtime: rt, target, args, fields })
}

describe('motion', () => {
  it('M01 · coordinates and direction', () => {
    for (const [direction, x, y] of [
      [0, 0, 10],
      [90, 10, 0],
      [180, 0, -10],
      [-90, -10, 0],
    ] as const) {
      const { target, rt } = worldAt(20, 20, { direction })
      run(motionPrimitives.motion_movesteps, rt, target, { STEPS: 10 })
      expect(target.x).toBeCloseTo(x, 10)
      expect(target.y).toBeCloseTo(y, 10)
      expect(run(motionPrimitives.motion_direction, rt, target).result).toBe(direction)
    }
  })

  it('M01 · diagonal move uses unrounded degrees', () => {
    const { target, rt } = worldAt(20, 20, { direction: 45 })
    run(motionPrimitives.motion_movesteps, rt, target, { STEPS: 10 })
    const [sy, sx] = sinCosDeg(45)
    expect(target.x).toBeCloseTo(10 * sx, 12)
    expect(target.y).toBeCloseTo(10 * sy, 12)
  })

  it('M02 · negative and fractional steps, and non-numeric steps', () => {
    const { target, rt } = worldAt(20, 20)
    run(motionPrimitives.motion_movesteps, rt, target, { STEPS: -2.5 })
    expect(target.x).toBe(-2.5)
    expect(target.y).toBe(0)
    run(motionPrimitives.motion_movesteps, rt, target, { STEPS: 'cat' })
    expect(target.x).toBe(-2.5)
    expect(target.y).toBe(0)
  })

  it('M03 · direction wrapping', () => {
    const { target, rt } = worldAt(20, 20, { direction: 45 })
    run(motionPrimitives.motion_pointindirection, rt, target, { DIRECTION: 450 })
    expect(target.direction).toBe(90)
    run(motionPrimitives.motion_pointindirection, rt, target, { DIRECTION: -180 })
    expect(target.direction).toBe(180)
    run(motionPrimitives.motion_pointindirection, rt, target, { DIRECTION: Infinity })
    expect(target.direction).toBe(180)
    run(motionPrimitives.motion_pointindirection, rt, target, { DIRECTION: -Infinity })
    expect(target.direction).toBe(180)
    expect(wrapDirection(180)).toBe(180)
    expect(wrapDirection(-179)).toBe(-179)
    expect(wrapDirection(181)).toBe(-179)
    run(motionPrimitives.motion_turnright, rt, target, { DEGREES: 270 })
    expect(target.direction).toBe(90)
    run(motionPrimitives.motion_turnleft, rt, target, { DEGREES: 180 })
    expect(target.direction).toBe(-90)
  })

  it('M04 · position reporters snap near integers and leave storage raw', () => {
    const { target, rt } = worldAt(20, 20)
    target.x = 1 + 1e-10
    target.y = -2 - 1e-10
    expect(run(motionPrimitives.motion_xposition, rt, target).result).toBe(1)
    expect(run(motionPrimitives.motion_yposition, rt, target).result).toBe(-2)
    expect(target.x).toBe(1 + 1e-10)
    expect(target.y).toBe(-2 - 1e-10)
    target.x = 1 + 1e-9
    expect(reportCoordinate(target.x)).toBe(1 + 1e-9)
    expect(run(motionPrimitives.motion_xposition, rt, target).result).toBe(1 + 1e-9)
  })

  it('M05 · ordinary fencing', () => {
    const { target, rt } = worldAt(100, 100)
    run(motionPrimitives.motion_gotoxy, rt, target, { X: 1000, Y: 0 })
    expect(target.x).toBe(275)
    expect(target.y).toBe(0)
    run(motionPrimitives.motion_gotoxy, rt, target, { X: -1000, Y: 0 })
    expect(target.x).toBe(-275)
    run(motionPrimitives.motion_sety, rt, target, { Y: 1000 })
    expect(target.y).toBe(215)
    run(motionPrimitives.motion_sety, rt, target, { Y: -1000 })
    expect(target.y).toBe(-215)
  })

  it('M06 · small-costume fence and ceil/floor corrections', () => {
    const small = worldAt(20, 20)
    run(motionPrimitives.motion_setx, small.rt, small.target, { X: 1000 })
    expect(small.target.x).toBe(240)
    const large = worldAt(100, 100)
    run(motionPrimitives.motion_setx, large.rt, large.target, { X: 1000 })
    expect(large.target.x).toBe(275)

    const odd = worldAt(21, 21)
    run(motionPrimitives.motion_setx, odd.rt, odd.target, { X: 1000 })
    expect(odd.target.x).toBe(240)
    run(motionPrimitives.motion_setx, odd.rt, odd.target, { X: -1000 })
    expect(odd.target.x).toBe(-240)
  })

  it('M07 · dragging blocks block motion unless forced', () => {
    const { target, rt } = worldAt(20, 20, { x: 5, y: 5 })
    setDragging(target, true)
    expect(isDragging(target)).toBe(true)
    run(motionPrimitives.motion_gotoxy, rt, target, { X: 0, Y: 0 })
    expect(target.x).toBe(5)
    expect(target.y).toBe(5)
    expect(rt.redraws).toBe(0)
    placeTarget(rt, target, 0, 0, true)
    expect(target.x).toBe(0)
    expect(target.y).toBe(0)
    expect(rt.redraws).toBe(1)
    setDragging(target, false)
    run(motionPrimitives.motion_gotoxy, rt, target, { X: 3, Y: 4 })
    expect(target.x).toBe(3)
    expect(target.y).toBe(4)
  })

  it('M08 · go to mouse, original sprite, missing sprite, and random', () => {
    const brick = boxBrick('b', 'Bee', 20, 20)
    const original = makeTarget({ id: 'orig', brickId: 'b', x: 10, y: 10 })
    const clone = makeTarget({ id: 'clone', brickId: 'b', x: 99, y: 99, isClone: true })
    const mover = makeTarget({ id: 'mover', brickId: 'b1', x: 1, y: 1 })
    const world = makeWorld({
      bounds: stage,
      bricks: [boxBrick('b1', 'Mover', 20, 20), brick],
      targets: [original, clone, mover],
    })
    const rt = fakeRuntime(world)
    run(motionPrimitives.motion_goto, rt, mover, { TO: 'Bee' })
    expect(mover.x).toBe(10)
    expect(mover.y).toBe(10)

    const before = { x: mover.x, y: mover.y }
    run(motionPrimitives.motion_goto, rt, mover, { TO: 'Nobody' })
    expect(mover.x).toBe(before.x)
    expect(mover.y).toBe(before.y)

    world.mouse.x = 12
    world.mouse.y = -7
    run(motionPrimitives.motion_goto, rt, mover, { TO: '_mouse_' })
    expect(mover.x).toBe(12)
    expect(mover.y).toBe(-7)

    rt.random = () => 0.5
    run(motionPrimitives.motion_goto, rt, mover, { TO: '_random_' })
    expect(mover.x).toBe(0)
    expect(mover.y).toBe(0)
  })

  it('M08 · random position is inside a bottom-left level', () => {
    const brick = boxBrick('b1', 'Brick', 20, 20)
    const target = makeTarget({ x: 1, y: 1 })
    const world = makeWorld({
      bounds: { left: 0, right: 480, bottom: 0, top: 360 },
      bricks: [brick],
      targets: [target],
    })
    const rt = fakeRuntime(world)
    rt.random = () => 0.5
    run(motionPrimitives.motion_goto, rt, target, { TO: '_random_' })
    expect(target.x).toBe(240)
    expect(target.y).toBe(180)
  })

  it('M09 · point towards', () => {
    const { target, rt, world } = worldAt(20, 20)
    const other = makeTarget({ id: 'other', brickId: 'b2', x: 0, y: 10 })
    world.bricks.b2 = boxBrick('b2', 'Other')
    world.targets.push(other)

    other.x = 0
    other.y = 10
    run(motionPrimitives.motion_pointtowards, rt, target, { TOWARDS: 'Other' })
    expect(target.direction).toBe(0)

    other.x = 10
    other.y = 0
    run(motionPrimitives.motion_pointtowards, rt, target, { TOWARDS: 'Other' })
    expect(target.direction).toBe(90)

    other.x = 0
    other.y = 0
    run(motionPrimitives.motion_pointtowards, rt, target, { TOWARDS: 'Other' })
    expect(target.direction).toBe(90)

    target.direction = 10
    run(motionPrimitives.motion_pointtowards, rt, target, { TOWARDS: 'Missing' })
    expect(target.direction).toBe(10)

    world.mouse.x = 0
    world.mouse.y = 10
    target.x = 0
    target.y = 0
    run(motionPrimitives.motion_pointtowards, rt, target, { TOWARDS: '_mouse_' })
    expect(target.direction).toBe(0)

    rt.random = () => 0
    run(motionPrimitives.motion_pointtowards, rt, target, { TOWARDS: '_random_' })
    expect(target.direction).toBe(180)
  })

  it('M10 · glide snapshots the endpoint and interpolates', () => {
    const { target, rt } = worldAt(20, 20)
    const other = makeTarget({ id: 'other', brickId: 'b2', x: 100, y: 40 })
    rt.world.bricks.b2 = boxBrick('b2', 'Other')
    rt.world.targets.push(other)
    const frame: Record<string, unknown> = {}
    const ctx = {
      target,
      runtime: rt,
      thread: { id: 1, target, done: false },
      arg: (name: string) => (name === 'SECS' ? 1 : name === 'TO' ? 'Other' : ''),
      field: () => '',
      frame,
      warp: false,
    }
    expect(motionPrimitives.motion_glideto(ctx)).toBe(YIELD)
    expect(target.x).toBe(0)
    expect(target.y).toBe(0)
    other.x = 5
    other.y = 5
    rt.nowMs = () => 250
    expect(motionPrimitives.motion_glideto(ctx)).toBe(YIELD)
    expect(target.x).toBe(25)
    expect(target.y).toBe(10)
    rt.nowMs = () => 1000
    expect(motionPrimitives.motion_glideto(ctx)).toBeUndefined()
    expect(target.x).toBe(100)
    expect(target.y).toBe(40)
  })

  it('M10 · glide secs to x y reaches the end on the tick clock', () => {
    const { target, rt } = worldAt(20, 20)
    const result = run(motionPrimitives.motion_glidesecstoxy, rt, target, { SECS: 1, X: 100, Y: 0 })
    expect(result.ticks).toBe(30)
    expect(result.result).toBeUndefined()
    expect(target.x).toBe(100)
    expect(rt.world.tick * TICK_MS).toBeGreaterThanOrEqual(1000)
  })

  it('M11 · nonpositive glide jumps and fences in the same turn', () => {
    const { target, rt } = worldAt(100, 100)
    const result = run(motionPrimitives.motion_glidesecstoxy, rt, target, { SECS: 0, X: 1000, Y: 30 })
    expect(result.ticks).toBe(0)
    expect(target.x).toBe(275)
    expect(target.y).toBe(30)
    const negative = run(motionPrimitives.motion_glidesecstoxy, rt, target, { SECS: -2, X: 0, Y: 0 })
    expect(negative.ticks).toBe(0)
    expect(target.x).toBe(0)
    expect(target.y).toBe(0)
  })

  it('M12 · bounce reflects off the nearest edge', () => {
    const right = worldAt(20, 20, { x: 230, direction: 90 })
    run(motionPrimitives.motion_ifonedgebounce, right.rt, right.target)
    expect(right.target.direction).toBe(-90)
    expect(right.target.x).toBe(230)

    const corner = worldAt(20, 20, { x: -230, y: 170, direction: -90 })
    run(motionPrimitives.motion_ifonedgebounce, corner.rt, corner.target)
    expect(corner.target.direction).toBe(90)

    const inside = worldAt(20, 20, { direction: 90 })
    const redraws = inside.rt.redraws
    run(motionPrimitives.motion_ifonedgebounce, inside.rt, inside.target)
    expect(inside.target.direction).toBe(90)
    expect(inside.target.x).toBe(0)
    expect(inside.rt.redraws).toBe(redraws)
  })

  it('M12 · a near-tangent bounce keeps an inward component, then the costume is pulled inside', () => {
    const { target, rt } = worldAt(20, 20, { x: 250, y: 0, direction: 1, rotationStyle: "don't rotate" })
    run(motionPrimitives.motion_ifonedgebounce, rt, target)
    expect(target.x).toBe(230)
    // Direction is recovered from a vector whose outward component was forced to 0.2,
    // then normalized, so the unit step is inward of a pure reflection but a little under 0.2.
    const [sy, sx] = sinCosDeg(90 - target.direction)
    const pureDx = -sinCosDeg(89)[1]
    expect(sx).toBeLessThan(pureDx)
    expect(sx).toBeLessThan(-0.15)
    expect(sy).toBeGreaterThan(0)
  })

  it('M13 · flush with the edge bounces but is not past it', () => {
    const flush = worldAt(20, 20, { x: 230, direction: 90 })
    expect(isPastEdge(flush.world, flush.target)).toBe(false)
    run(motionPrimitives.motion_ifonedgebounce, flush.rt, flush.target)
    expect(flush.target.direction).toBe(-90)

    const past = worldAt(20, 20, { x: 230.1, direction: 0 })
    expect(isPastEdge(past.world, past.target)).toBe(true)
    run(motionPrimitives.motion_ifonedgebounce, past.rt, past.target)
    expect(past.target.direction).not.toBe(0)
  })

  it('M14 · rotation style changes the picture, not the stored direction', () => {
    const still = worldAt(20, 20, { direction: 0, rotationStyle: "don't rotate" })
    const stillPose = transformOf(still.target)
    expect(stillPose.sin).toBe(0)
    expect(stillPose.cos).toBe(1)
    expect(stillPose.flipX).toBe(1)
    run(motionPrimitives.motion_movesteps, still.rt, still.target, { STEPS: 10 })
    expect(still.target.direction).toBe(0)
    expect(still.target.y).toBeCloseTo(10, 10)

    const flip = worldAt(20, 20, { direction: -90 })
    run(motionPrimitives.motion_setrotationstyle, flip.rt, flip.target, {}, { STYLE: 'left-right' })
    expect(flip.target.rotationStyle).toBe('left-right')
    expect(flip.target.direction).toBe(-90)
    expect(transformOf(flip.target).flipX).toBe(-1)
    run(motionPrimitives.motion_movesteps, flip.rt, flip.target, { STEPS: 10 })
    expect(flip.target.x).toBeCloseTo(-10, 10)
    expect(flip.target.direction).toBe(-90)

    run(motionPrimitives.motion_setrotationstyle, flip.rt, flip.target, {}, { STYLE: 'sideways' })
    expect(flip.target.rotationStyle).toBe('left-right')
  })

  it('visible motion asks for a redraw and hidden motion does not', () => {
    const shown = worldAt(20, 20)
    run(motionPrimitives.motion_changexby, shown.rt, shown.target, { DX: 1 })
    expect(shown.rt.redraws).toBe(1)
    shown.target.visible = false
    run(motionPrimitives.motion_changexby, shown.rt, shown.target, { DX: 1 })
    expect(shown.target.x).toBe(2)
    expect(shown.rt.redraws).toBe(1)
  })

  it('the stage ignores motion that would move a sprite', () => {
    const { world, rt } = worldAt(20, 20)
    world.stage.x = 4
    world.stage.direction = 90
    run(motionPrimitives.motion_setx, rt, world.stage, { X: 20 })
    run(motionPrimitives.motion_pointindirection, rt, world.stage, { DIRECTION: 0 })
    expect(world.stage.x).toBe(4)
    expect(world.stage.direction).toBe(90)
  })
})
