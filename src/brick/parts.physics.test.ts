import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  BRICK_PARTS,
  BRICK_PART_MAP,
  EXPLORER_CAPSULE_HALF_HEIGHT,
  EXPLORER_CAPSULE_RADIUS,
  ROUND_COLLIDER_SIDES,
  archProfile,
  brickPhysicalShapes,
  conePartBaseHeight,
  frameOpening,
  partPhysicalShapes,
  partWorldSize,
  roundPartRadius,
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

/** Settles a capsule dropped at a point and reports where it comes to rest. */
function simulateDrop(shapes: PhysicalShape[], start: { x: number; y: number; z: number }, steps = 150) {
  return simulateWalk(shapes, start, { x: 0, z: 0 }, steps)
}

function shapeBounds(shapes: PhysicalShape[]) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const shape of shapes) {
    const points = shape.shape === 'convexHull'
      ? shape.vertices
      : [
          shape.center.map((value, axis) => value - shape.halfExtents[axis]) as [number, number, number],
          shape.center.map((value, axis) => value + shape.halfExtents[axis]) as [number, number, number],
        ]
    for (const point of points) {
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], point[axis])
        max[axis] = Math.max(max[axis], point[axis])
      }
    }
  }
  return { min, max }
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

  it('keeps every catalogue part inside its footprint with a sane walkable surface', () => {
    for (const part of BRICK_PARTS) {
      const shapes = partPhysicalShapes(part)
      expect(shapes.length, part.id).toBeGreaterThan(0)

      const { width, depth, height } = partWorldSize(part)
      const box = shapeBounds(shapes)
      // Stair treads use the narrower STEP_INSET, and the first riser ramp deliberately
      // runs one capsule radius ahead of the tread so the Explorer can start the climb.
      const depthSlack = part.kind === 'stair' ? EXPLORER_CAPSULE_RADIUS + 0.005 : 0.005
      expect(box.min[0], part.id).toBeGreaterThanOrEqual(-width / 2 - 0.005)
      expect(box.max[0], part.id).toBeLessThanOrEqual(width / 2 + 0.005)
      expect(box.min[1], part.id).toBeGreaterThanOrEqual(-0.001)
      expect(box.max[1], part.id).toBeLessThanOrEqual(height + 0.001)
      expect(box.min[2], part.id).toBeGreaterThanOrEqual(-depth / 2 - depthSlack)
      expect(box.max[2], part.id).toBeLessThanOrEqual(depth / 2 + depthSlack)

      for (const localZ of [-depth / 2, -depth / 4, 0, depth / 4, depth / 2]) {
        const surface = walkableSurfaceHeight(part, localZ)
        expect(surface, `${part.id} @ ${localZ}`).toBeGreaterThanOrEqual(0)
        expect(surface, `${part.id} @ ${localZ}`).toBeLessThanOrEqual(height + 0.001)
      }
    }
  })

  it('builds the corner from two overlapping arms that leave the diagonal cell open', () => {
    const part = BRICK_PART_MAP.corner_2x2
    const shapes = partPhysicalShapes(part)
    expect(shapes).toHaveLength(2)
    expect(shapes.every((shape) => shape.shape === 'cuboid')).toBe(true)

    const { height } = partWorldSize(part)
    const midHeight = height / 2
    expect(pointInFrameMember([-0.31, midHeight, -0.31], shapes)).toBe(true)
    expect(pointInFrameMember([-0.31, midHeight, 0.31], shapes)).toBe(true)
    expect(pointInFrameMember([0.31, midHeight, -0.31], shapes)).toBe(true)
    expect(pointInFrameMember([0.31, midHeight, 0.31], shapes)).toBe(false)
    expect(walkableSurfaceHeight(part, 0)).toBeCloseTo(height)
  })

  it('wraps round bricks in a prism hull that stays inside the stud circle', () => {
    const part = BRICK_PART_MAP.round_1x1
    const shapes = partPhysicalShapes(part)
    expect(shapes).toHaveLength(1)
    expect(shapes[0].shape).toBe('convexHull')

    const hull = shapes[0] as Extract<PhysicalShape, { shape: 'convexHull' }>
    const radius = roundPartRadius(part)
    const { height } = partWorldSize(part)
    expect(hull.vertices).toHaveLength(ROUND_COLLIDER_SIDES * 2)
    for (const [x, y, z] of hull.vertices) {
      expect(Math.hypot(x, z)).toBeCloseTo(radius, 5)
      expect(y === 0 || Math.abs(y - height) < 1e-9).toBe(true)
    }
    expect(walkableSurfaceHeight(part, 0)).toBeCloseTo(height)

    const result = simulateDrop(shapes, { x: 0, y: 1.4, z: 0 })
    expect(result.position.y).toBeCloseTo(height + EXPLORER_CAPSULE_HALF_HEIGHT + EXPLORER_CAPSULE_RADIUS, 1)
  })

  it('caps the cone with an apex and slopes its walkable surface to the collar rim', () => {
    const part = BRICK_PART_MAP.cone_1x1
    const shapes = partPhysicalShapes(part)
    expect(shapes).toHaveLength(1)

    const hull = shapes[0] as Extract<PhysicalShape, { shape: 'convexHull' }>
    const { height } = partWorldSize(part)
    const base = conePartBaseHeight(part)
    const radius = roundPartRadius(part)
    expect(hull.vertices).toHaveLength(ROUND_COLLIDER_SIDES * 2 + 1)
    expect(hull.vertices.at(-1)).toEqual([0, height, 0])
    expect(hull.vertices.filter(([, y]) => Math.abs(y - base) < 1e-9)).toHaveLength(ROUND_COLLIDER_SIDES)

    expect(walkableSurfaceHeight(part, 0)).toBeCloseTo(height)
    expect(walkableSurfaceHeight(part, radius)).toBeCloseTo(base)
    expect(walkableSurfaceHeight(part, radius / 2)).toBeCloseTo(base + (height - base) / 2)
    expect(walkableSurfaceHeight(part, radius * 2)).toBeCloseTo(base)
  })

  it('hangs the overhang wedge from a flat top over an open front', () => {
    const part = BRICK_PART_MAP.slope_inv_2x2
    const shapes = partPhysicalShapes(part)
    expect(shapes).toHaveLength(1)
    expect(shapes[0].shape).toBe('convexHull')

    const hull = shapes[0] as Extract<PhysicalShape, { shape: 'convexHull' }>
    const { depth, height } = partWorldSize(part)
    expect(hull.vertices.filter(([, y]) => Math.abs(y - height) < 1e-9)).toHaveLength(4)
    expect(hull.vertices.filter(([, y]) => y === 0)).toHaveLength(2)
    // The two ground-level vertices sit on the solid +z end; −z is the thin edge.
    expect(hull.vertices.filter(([, y]) => y === 0).every(([, , z]) => z > 0)).toBe(true)

    expect(walkableSurfaceHeight(part, -depth / 2)).toBeCloseTo(height)
    expect(walkableSurfaceHeight(part, depth / 2)).toBeCloseTo(height)

    const rest = height + EXPLORER_CAPSULE_HALF_HEIGHT + EXPLORER_CAPSULE_RADIUS
    expect(simulateDrop(shapes, { x: 0, y: 1.6, z: -0.3 }).position.y).toBeCloseTo(rest, 1)
    expect(simulateDrop(shapes, { x: 0, y: 1.6, z: 0.3 }).position.y).toBeCloseTo(rest, 1)
  })

  it('leaves the archway wide enough to walk through under its chamfered soffit', () => {
    const part = BRICK_PART_MAP.arch_1x4
    const shapes = partPhysicalShapes(part)
    expect(shapes.filter((shape) => shape.shape === 'cuboid')).toHaveLength(3)
    expect(shapes.filter((shape) => shape.shape === 'convexHull')).toHaveLength(2)

    const capsuleHeight = (EXPLORER_CAPSULE_HALF_HEIGHT + EXPLORER_CAPSULE_RADIUS) * 2
    const opening = frameOpening(part)
    expect(opening).not.toBeNull()
    expect(opening!.sillHeight).toBe(0)
    expect(opening!.width).toBeGreaterThan(EXPLORER_CAPSULE_RADIUS * 2)
    expect(opening!.height).toBeGreaterThan(capsuleHeight)
    expect(pointInFrameMember([0, opening!.height / 2, 0], shapes)).toBe(false)

    const profile = archProfile(part)
    expect(profile.springHeight).toBeGreaterThan(0)
    expect(profile.soffitHeight).toBeCloseTo(profile.springHeight + profile.chamfer)
    expect(walkableSurfaceHeight(part, 0)).toBeCloseTo(partWorldSize(part).height)

    const result = simulateWalk(shapes, { x: -1, y: 0.37, z: 0 }, { x: 1, z: 0 })
    expect(result.position.x).toBeGreaterThan(0.8)
    expect(result.maximumY).toBeLessThan(0.7)
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
