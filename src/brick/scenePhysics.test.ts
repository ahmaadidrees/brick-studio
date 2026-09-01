import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  CAMERA_MIN_DISTANCE,
  CAMERA_PROBE_RADIUS,
  CAMERA_SURFACE_PADDING,
  EXPLORE_SPAWN_FLOOR_GAP,
  EXPLORE_SPAWN_HEAD_CLEARANCE,
  EXPLORE_SPAWN_SIDE_CLEARANCE,
  createExploreSpawnCandidates,
  findCameraObstruction,
  findSafeExploreSpawn,
  isExploreSpawnSafe,
  resolveCameraBoomDistance,
} from './scenePhysics'
import { EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS, GRID_SIZE, STUD } from './parts'

beforeAll(async () => {
  await RAPIER.init()
})

describe('Explore camera boom obstruction', () => {
  it('sphere-casts against a wall with radius and surface padding', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    const wall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(1, 2, 0.1).setTranslation(0, 1, -2), wall)
    world.step()

    const hit = world.castShape(
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 0, y: 0, z: -1 },
      new RAPIER.Ball(CAMERA_PROBE_RADIUS),
      CAMERA_SURFACE_PADDING,
      6,
      true,
    )

    expect(hit).not.toBeNull()
    expect(hit!.time_of_impact).toBeGreaterThan(1.5)
    expect(hit!.time_of_impact).toBeLessThan(1.7)
    world.free()
  })

  it('contracts immediately and recovers smoothly after the path clears', () => {
    const desiredDistance = 6
    const hitDistance = 1.6
    const contracted = resolveCameraBoomDistance(desiredDistance, desiredDistance, hitDistance, 1 / 60)
    expect(contracted).toBeCloseTo(hitDistance - CAMERA_SURFACE_PADDING)

    const firstClearFrame = resolveCameraBoomDistance(contracted, desiredDistance, null, 1 / 60)
    expect(firstClearFrame).toBeGreaterThan(contracted)
    expect(firstClearFrame).toBeLessThan(desiredDistance)

    let recovered = firstClearFrame
    for (let frame = 0; frame < 120; frame += 1) {
      recovered = resolveCameraBoomDistance(recovered, desiredDistance, null, 1 / 60)
    }
    expect(recovered).toBeGreaterThan(5.99)
  })

  it('never lets an obstruction collapse the camera inside the target', () => {
    expect(resolveCameraBoomDistance(4, 6, 0.1, 1 / 60)).toBe(CAMERA_MIN_DISTANCE)
  })

  it('ignores a collider overlapping the target and still finds the next obstruction', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    const overlapBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5), overlapBody)
    const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const wall = world.createCollider(RAPIER.ColliderDesc.cuboid(1, 1, 0.1).setTranslation(0, 0, 3), wallBody)
    world.step()

    const hit = findCameraObstruction(
      world,
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: 0, y: 0, z: 1 },
      new RAPIER.Ball(CAMERA_PROBE_RADIUS),
      6,
    )

    expect(hit?.collider.handle).toBe(wall.handle)
    expect(hit!.time_of_impact).toBeGreaterThan(2.5)
    expect(resolveCameraBoomDistance(CAMERA_MIN_DISTANCE, 6, hit!.time_of_impact, 1 / 60)).toBeGreaterThan(CAMERA_MIN_DISTANCE)
    world.free()
  })
})

function createSpawnShapes() {
  const clearanceExpansion = EXPLORE_SPAWN_HEAD_CLEARANCE / 2
  return {
    avatar: new RAPIER.Capsule(EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS),
    clearance: new RAPIER.Capsule(
      EXPLORER_CAPSULE_HALF_HEIGHT + Math.max(0, clearanceExpansion - EXPLORE_SPAWN_SIDE_CLEARANCE),
      EXPLORER_CAPSULE_RADIUS + EXPLORE_SPAWN_SIDE_CLEARANCE,
    ),
    clearanceOffset: clearanceExpansion,
    standingY: EXPLORER_CAPSULE_HALF_HEIGHT + EXPLORER_CAPSULE_RADIUS + EXPLORE_SPAWN_FLOOR_GAP,
  }
}

function createSupportedWorld() {
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  const floorBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  world.createCollider(RAPIER.ColliderDesc.cuboid(30, 0.09, 30).setTranslation(0, -0.09, 0), floorBody)
  return world
}

describe('safe Explore spawning', () => {
  it('prefers a revalidated prior Explore position', () => {
    const world = createSupportedWorld()
    world.step()
    const shapes = createSpawnShapes()
    const previous = { x: 6, y: shapes.standingY, z: -4 }
    const candidates = createExploreSpawnCandidates({
      preferred: [previous],
      gridSize: GRID_SIZE,
      stud: STUD,
      standingY: shapes.standingY,
    })

    expect(findSafeExploreSpawn(
      world,
      candidates,
      shapes.avatar,
      shapes.clearance,
      shapes.clearanceOffset,
    )).toEqual(previous)
    world.free()
  })

  it('rejects a blocked starting position and chooses a supported fallback', () => {
    const world = createSupportedWorld()
    const obstacleBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.5, 0.7, 0.5).setTranslation(0, 0.7, 5), obstacleBody)
    world.step()
    const shapes = createSpawnShapes()
    const blocked = { x: 0, y: shapes.standingY, z: 5 }
    const fallback = { x: 2, y: shapes.standingY, z: 5 }

    expect(isExploreSpawnSafe(
      world,
      blocked,
      shapes.avatar,
      shapes.clearance,
      shapes.clearanceOffset,
    )).toBe(false)
    expect(findSafeExploreSpawn(
      world,
      [blocked, fallback],
      shapes.avatar,
      shapes.clearance,
      shapes.clearanceOffset,
    )).toEqual(fallback)
    world.free()
  })

  it('requires both headroom and support', () => {
    const shapes = createSpawnShapes()
    const candidate = { x: 0, y: shapes.standingY, z: 0 }
    const unsupported = new RAPIER.World({ x: 0, y: 0, z: 0 })
    unsupported.step()
    expect(isExploreSpawnSafe(
      unsupported,
      candidate,
      shapes.avatar,
      shapes.clearance,
      shapes.clearanceOffset,
    )).toBe(false)
    unsupported.free()

    const lowCeiling = createSupportedWorld()
    const ceilingBody = lowCeiling.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    lowCeiling.createCollider(RAPIER.ColliderDesc.cuboid(1, 0.05, 1).setTranslation(0, 0.85, 0), ceilingBody)
    lowCeiling.step()
    expect(isExploreSpawnSafe(
      lowCeiling,
      candidate,
      shapes.avatar,
      shapes.clearance,
      shapes.clearanceOffset,
    )).toBe(false)
    lowCeiling.free()
  })

  it('reports failure without moving or deleting an obstacle', () => {
    const world = createSupportedWorld()
    const obstacleBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const obstacle = world.createCollider(RAPIER.ColliderDesc.cuboid(5, 1, 5).setTranslation(0, 1, 0), obstacleBody)
    world.step()
    const shapes = createSpawnShapes()
    const candidates = [
      { x: 0, y: shapes.standingY, z: 0 },
      { x: 1, y: shapes.standingY, z: 1 },
    ]

    expect(findSafeExploreSpawn(
      world,
      candidates,
      shapes.avatar,
      shapes.clearance,
      shapes.clearanceOffset,
    )).toBeNull()
    expect(world.getCollider(obstacle.handle)).not.toBeNull()
    world.free()
  })
})
