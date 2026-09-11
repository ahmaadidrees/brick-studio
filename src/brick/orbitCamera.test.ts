import { beforeAll, describe, expect, it } from 'vitest'
import RAPIER from '@dimforge/rapier3d-compat'
import { CAMERA_PROBE_RADIUS, findCameraObstruction, resolveCameraBoomDistance } from './scenePhysics'

beforeAll(async () => { await RAPIER.init() })
import {
  ORBIT_DEFAULT_PITCH,
  ORBIT_DEFAULT_DISTANCE,
  ORBIT_DEFAULT_YAW,
  ORBIT_MAX_DISTANCE,
  ORBIT_MAX_PITCH,
  ORBIT_MIN_DISTANCE,
  ORBIT_MIN_PITCH,
  addOrbitLook,
  clampOrbitDistance,
  computeOrbitBoom,
  createOrbitState,
  recenterOrbit,
  shortestAngleDelta,
  stepOrbit,
} from './orbitCamera'

describe('damped orbit camera', () => {
  it('clamps pitch targets and never introduces a roll component', () => {
    const orbit = createOrbitState()
    addOrbitLook(orbit, 0.4, 100)
    expect(orbit.targetPitch).toBe(ORBIT_MAX_PITCH)
    for (let frame = 0; frame < 120; frame += 1) stepOrbit(orbit, 1 / 60)
    expect(orbit.pitch).toBeCloseTo(ORBIT_MAX_PITCH)

    addOrbitLook(orbit, 0, -100)
    expect(orbit.targetPitch).toBe(ORBIT_MIN_PITCH)
    const boom = computeOrbitBoom(orbit.yaw, orbit.targetPitch, 6, { x: 0, y: 0, z: 0 })
    expect(Math.hypot(boom.x, boom.y, boom.z)).toBeCloseTo(6)
  })

  it('looks upward at tall builds while the camera sphere stays above the floor', () => {
    const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
    const floor = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.1, 20).setTranslation(0, -0.1, 0), floor)
    world.step()
    const target = { x: 0, y: 1.2, z: 0 }
    const direction = computeOrbitBoom(0, ORBIT_MIN_PITCH, 1, { x: 0, y: 0, z: 0 })
    expect(direction.y).toBeLessThan(-0.8)
    const hit = findCameraObstruction(world, target, { x: 0, y: 0, z: 0, w: 1 }, direction, new RAPIER.Ball(CAMERA_PROBE_RADIUS), 6)
    expect(hit).not.toBeNull()
    const distance = resolveCameraBoomDistance(6, 6, hit!.time_of_impact, 1 / 60)
    const cameraY = target.y + direction.y * distance
    expect(cameraY).toBeGreaterThan(CAMERA_PROBE_RADIUS)
    expect(cameraY).toBeLessThan(target.y)
    world.free()
  })

  it('takes the shortest yaw path across the wrap boundary', () => {
    expect(shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2)
    const orbit = createOrbitState(Math.PI - 0.1, ORBIT_DEFAULT_PITCH)
    orbit.targetYaw = -Math.PI + 0.1
    stepOrbit(orbit, 1 / 60)
    expect(orbit.yaw).toBeGreaterThan(Math.PI - 0.1)
  })

  it('damps comparably across different frame rates', () => {
    const sixtyFps = createOrbitState()
    const thirtyFps = createOrbitState()
    addOrbitLook(sixtyFps, 1, 0.2)
    addOrbitLook(thirtyFps, 1, 0.2)
    for (let frame = 0; frame < 60; frame += 1) stepOrbit(sixtyFps, 1 / 60)
    for (let frame = 0; frame < 30; frame += 1) stepOrbit(thirtyFps, 1 / 30)
    expect(sixtyFps.yaw).toBeCloseTo(thirtyFps.yaw, 5)
    expect(sixtyFps.pitch).toBeCloseTo(thirtyFps.pitch, 5)
  })

  it('caps a background-sized delta before applying damping', () => {
    const orbit = createOrbitState()
    addOrbitLook(orbit, 1, 0)
    stepOrbit(orbit, 5)
    expect(orbit.yaw).toBeLessThan(Math.PI + 1)
    expect(orbit.yaw).toBeGreaterThan(Math.PI)
  })

  it('clamps zoom and recenters yaw/pitch without adding roll state', () => {
    expect(clampOrbitDistance(-100)).toBe(ORBIT_MIN_DISTANCE)
    expect(clampOrbitDistance(100)).toBe(ORBIT_MAX_DISTANCE)
    expect(clampOrbitDistance(ORBIT_DEFAULT_DISTANCE)).toBe(ORBIT_DEFAULT_DISTANCE)
    const orbit = createOrbitState(0.2, ORBIT_MAX_PITCH)
    recenterOrbit(orbit)
    expect(orbit.targetYaw).toBe(ORBIT_DEFAULT_YAW)
    expect(orbit.targetPitch).toBe(ORBIT_DEFAULT_PITCH)
    expect(Object.keys(orbit)).not.toContain('roll')
  })
})
