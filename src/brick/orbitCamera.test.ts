import { describe, expect, it } from 'vitest'
import {
  ORBIT_DEFAULT_PITCH,
  ORBIT_MAX_PITCH,
  ORBIT_MIN_PITCH,
  addOrbitLook,
  computeOrbitBoom,
  createOrbitState,
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
})
