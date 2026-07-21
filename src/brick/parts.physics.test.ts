import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  BRICK_PART_MAP,
  EXPLORER_CAPSULE_HALF_HEIGHT,
  EXPLORER_CAPSULE_RADIUS,
  brickPhysicalShapes,
  frameOpening,
  partPhysicalShapes,
  rotateLocalPoint,
  walkableSurfaceHeight,
  type PhysicalShape,
} from './parts'
import type { BrickInstance } from './types'

const FIXED_STEP = 1 / 60
const WALK_SPEED = 2
const PART_COLLIDER_FRICTION = 0.5

beforeAll(async () => {
  await RAPIER.init()
})

function addShapes(world: RAPIER.World, shapes: PhysicalShape[]) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  for (const shape of shapes) {
    if (shape.shape === 'convexHull') {
      const vertices = new Float32Array(shape.vertices.flat())
      const description = RAPIER.ColliderDesc.convexHull(vertices)
      if (!description) throw new Error('Invalid convex hull test fixture')
      description.setFriction(PART_COLLIDER_FRICTION)
      world.createCollider(description, body)
      continue
    }

    const [halfWidth, halfHeight, halfDepth] = shape.halfExtents
    const description = shape.shape === 'roundCuboid'
      ? RAPIER.ColliderDesc.roundCuboid(
          halfWidth - shape.borderRadius,
          halfHeight - shape.borderRadius,
          halfDepth - shape.borderRadius,
          shape.borderRadius,
        )
      : RAPIER.ColliderDesc.cuboid(halfWidth, halfHeight, halfDepth)
    description.setTranslation(...shape.center).setFriction(PART_COLLIDER_FRICTION)
    world.createCollider(description, body)
  }
}

function simulateWalk(
  shapes: PhysicalShape[],
  start: { x: number; y: number; z: number },
  movement: { x: number; z: number },
  steps = 180,
) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  world.timestep = FIXED_STEP
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  world.createCollider(RAPIER.ColliderDesc.cuboid(10, 0.09, 10).setTranslation(0, -0.09, 0), ground)
  addShapes(world, shapes)

  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(start.x, start.y, start.z)
      .lockRotations()
      .setLinearDamping(4)
      .setCcdEnabled(true),
  )
  world.createCollider(
    RAPIER.ColliderDesc.capsule(EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS).setFriction(0.2),
    body,
  )

  let maximumY = start.y
  for (let step = 0; step < steps; step += 1) {
    const velocity = body.linvel()
    body.setLinvel({ x: movement.x * WALK_SPEED, y: velocity.y, z: movement.z * WALK_SPEED }, true)
    world.step()
    maximumY = Math.max(maximumY, body.translation().y)
  }

  const position = { ...body.translation() }
  world.free()
  return { position, maximumY }
}

function pointInFrameMember(point: [number, number, number], shapes: PhysicalShape[]) {
  return shapes.some((shape) => {
    if (shape.shape === 'convexHull') return false
    return point.every((coordinate, axis) => (
      coordinate >= shape.center[axis] - shape.halfExtents[axis]
      && coordinate <= shape.center[axis] + shape.halfExtents[axis]
    ))
  })
}

describe('part-aware physical shapes', () => {
  it('leaves real door and window apertures that fit the Explorer capsule', () => {
    const capsuleHeight = (EXPLORER_CAPSULE_HALF_HEIGHT + EXPLORER_CAPSULE_RADIUS) * 2
    const capsuleDiameter = EXPLORER_CAPSULE_RADIUS * 2

    for (const partId of ['door_1x4', 'window_1x4']) {
      const part = BRICK_PART_MAP[partId]
      const opening = frameOpening(part)
      expect(opening).not.toBeNull()
      expect(opening!.width).toBeGreaterThan(capsuleDiameter)
      expect(opening!.height).toBeGreaterThan(capsuleHeight)

      const shapes = partPhysicalShapes(part)
      const apertureCenter: [number, number, number] = [
        0,
        opening!.sillHeight + opening!.height / 2,
        0,
      ]
      expect(pointInFrameMember(apertureCenter, shapes)).toBe(false)
    }

    expect(frameOpening(BRICK_PART_MAP.window_1x4)!.sillHeight).toBeLessThan(EXPLORER_CAPSULE_RADIUS)
  })

  it.each(['door_1x4', 'window_1x4'])('walks through the %s opening without jumping', (partId) => {
    const result = simulateWalk(
      partPhysicalShapes(BRICK_PART_MAP[partId]),
      { x: -1, y: 0.37, z: 0 },
      { x: 1, z: 0 },
    )
    expect(result.position.x).toBeGreaterThan(0.8)
    expect(result.maximumY).toBeLessThan(0.7)
  })

  it('builds stairs from three treads plus short walkable riser ramps', () => {
    const part = BRICK_PART_MAP.stair_2x3
    const shapes = partPhysicalShapes(part)
    expect(shapes.filter((shape) => shape.shape === 'cuboid')).toHaveLength(3)
    expect(shapes.filter((shape) => shape.shape === 'convexHull')).toHaveLength(3)
    expect(walkableSurfaceHeight(part, -0.62)).toBeCloseTo(0.175)
    expect(walkableSurfaceHeight(part, 0)).toBeCloseTo(0.35)
    expect(walkableSurfaceHeight(part, 0.62)).toBeCloseTo(0.525)

    const result = simulateWalk(shapes, { x: 0, y: 0.37, z: -1.8 }, { x: 0, z: 1 })
    expect(result.position.z).toBeGreaterThan(1.2)
    expect(result.maximumY).toBeGreaterThan(0.8)
  })

  it('uses a convex ramp whose surface rises continuously', () => {
    const part = BRICK_PART_MAP.slope_2x2
    const shapes = partPhysicalShapes(part)
    expect(shapes).toHaveLength(1)
    expect(shapes[0].shape).toBe('convexHull')
    expect(walkableSurfaceHeight(part, -10)).toBe(0)
    expect(walkableSurfaceHeight(part, 0)).toBeCloseTo(0.2625)
    expect(walkableSurfaceHeight(part, 10)).toBeCloseTo(0.525)

    const result = simulateWalk(shapes, { x: 0, y: 0.37, z: -1.4 }, { x: 0, z: 1 }, 140)
    expect(result.position.z).toBeGreaterThan(1)
    expect(result.maximumY).toBeGreaterThan(0.8)
  })

  it('rotates collider offsets and a full stair traversal by quarter turns', () => {
    expect(rotateLocalPoint([0, 0.5, -1], 1)).toEqual([-1, 0.5, 0])
    expect(rotateLocalPoint([0, 0.5, -1], 2)).toEqual([0, 0.5, 1])
    expect(rotateLocalPoint([0, 0.5, -1], 3)).toEqual([1, 0.5, 0])

    const brick: BrickInstance = {
      id: 'rotated-stairs',
      partId: 'stair_2x3',
      x: 30,
      y: 0,
      z: 31,
      rotation: 1,
      color: '#fff',
    }
    const shapes = brickPhysicalShapes(brick)
    const result = simulateWalk(shapes, { x: -2.1, y: 0.37, z: 0 }, { x: 1, z: 0 })
    expect(result.position.x).toBeGreaterThan(0.8)
    expect(result.maximumY).toBeGreaterThan(0.8)
  })
})
