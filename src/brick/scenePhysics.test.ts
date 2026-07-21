import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  CAMERA_MIN_DISTANCE,
  CAMERA_PROBE_RADIUS,
  CAMERA_SURFACE_PADDING,
  resolveCameraBoomDistance,
} from './scenePhysics'

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
})
