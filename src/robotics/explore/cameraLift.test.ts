import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { CAMERA_MIN_DISTANCE, CAMERA_PROBE_RADIUS, findCameraObstruction, resolveCameraBoomDistance } from '../../brick/scenePhysics'
import { LIFT, boomAt, boomClearance, createCameraLift, isBlocked, liftPitch } from './cameraLift'

/**
 * The follow camera beside a big build, in a real Rapier world laid out like Explore: the plate
 * (top at y = 0), the character's capsule (excluded from the camera's probe, as the studio does)
 * and a tall robot right behind her, where a novice tester's camera ended up on the back of her head.
 */
beforeAll(async () => { await RAPIER.init() })

const DEFAULT_PITCH = 0.55
const DEFAULT_DISTANCE = 6.1
/** The character's head, the camera's target (capsule centre 0.385 + 0.52). */
const TARGET = { x: 0, y: 0.905, z: 0 }
/** The orbit's yaw that puts the camera on the robot's side of her (the boom points to -Z). */
const INTO_ROBOT = 0

function scene({ robot = true, roof = false, wall = false } = {}) {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  world.createCollider(RAPIER.ColliderDesc.cuboid(20, 0.09, 20).setTranslation(0, -0.09, 0), ground)
  const avatar = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.385, 0))
  world.createCollider(RAPIER.ColliderDesc.capsule(0.18, 0.18), avatar)
  if (robot) {
    // The tester's Buggy behind her: its motors and plate (up to 0.9, lower than her head) start
    // 0.4 units behind her, and its tower (2 × 2 studs, up to 4.7 units) stands 1.8 units back.
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(2, 0.45, 2.5).setTranslation(0, 0.45, -2.9), body)
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.62, 1.9, 0.62).setTranslation(0, 2.8, -2.42), body)
  }
  if (wall) {
    // A wall taller than her, right behind her.
    const block = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(4, 3, 0.3).setTranslation(0, 3, -0.7), block)
  }
  if (roof) {
    const cover = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(6, 0.2, 6).setTranslation(0, 2.6, 0), cover)
  }
  world.step()
  return { world, avatar, probe: new RAPIER.Ball(CAMERA_PROBE_RADIUS) }
}

/** Where the studio's arm would put the camera for this boom (the same resolver, settled). */
function armLength(world: RAPIER.World, avatar: RAPIER.RigidBody, direction: { x: number; y: number; z: number }, distance: number) {
  const hit = findCameraObstruction(world, TARGET, { x: 0, y: 0, z: 0, w: 1 }, direction, new RAPIER.Ball(CAMERA_PROBE_RADIUS), distance, avatar)
  return resolveCameraBoomDistance(null, distance, hit?.time_of_impact ?? null, 1 / 60)
}

describe('the camera beside a tall robot', () => {
  it('without a rise, the arm pins the camera on her head whatever the zoom: the tester’s close-up', () => {
    const { world, avatar } = scene()
    const into = boomAt(INTO_ROBOT, DEFAULT_PITCH)
    expect(armLength(world, avatar, into, DEFAULT_DISTANCE)).toBeCloseTo(CAMERA_MIN_DISTANCE, 6)
    expect(armLength(world, avatar, into, 10.9)).toBeCloseTo(CAMERA_MIN_DISTANCE, 6)
  })

  it('a boom the robot would cut hard rises to the least steep clear pitch; zoomed out it still finds one', () => {
    const { world, avatar, probe } = scene()
    const query = { target: TARGET, direction: boomAt(INTO_ROBOT, DEFAULT_PITCH), distance: DEFAULT_DISTANCE }
    expect(isBlocked(boomClearance(world, query, probe, avatar), DEFAULT_DISTANCE)).toBe(true)
    const pitch = liftPitch(world, query, probe, avatar)!
    expect(pitch).toBeGreaterThan(DEFAULT_PITCH)
    expect(pitch).toBeLessThanOrEqual(LIFT.maxPitch + 1e-9)
    const risen = boomAt(INTO_ROBOT, pitch)
    expect(boomClearance(world, { ...query, direction: risen }, probe, avatar)).toBeGreaterThanOrEqual(DEFAULT_DISTANCE * LIFT.clearFraction)
    // One step less steep is still blocked: it is the least steep clear pitch.
    expect(boomClearance(world, { ...query, direction: boomAt(INTO_ROBOT, pitch - LIFT.step) }, probe, avatar)).toBeLessThan(DEFAULT_DISTANCE * LIFT.clearFraction)
    // The studio's arm then keeps the full distance: the camera is out in the open, not on her head.
    expect(armLength(world, avatar, risen, DEFAULT_DISTANCE)).toBeGreaterThan(0.9 * DEFAULT_DISTANCE)
    // Zoomed out, the rise still finds room, so the zoom shows.
    const far = liftPitch(world, { ...query, distance: 10.9 }, probe, avatar)!
    expect(armLength(world, avatar, boomAt(INTO_ROBOT, far), 10.9)).toBeGreaterThan(0.9 * 10.9)
  })

  it('nothing in the way, or the robot on the other side: no rise', () => {
    const open = scene({ robot: false })
    expect(liftPitch(open.world, { target: TARGET, direction: boomAt(INTO_ROBOT, DEFAULT_PITCH), distance: DEFAULT_DISTANCE }, open.probe, open.avatar)).toBeNull()
    const beside = scene()
    expect(liftPitch(beside.world, { target: TARGET, direction: boomAt(Math.PI, DEFAULT_PITCH), distance: DEFAULT_DISTANCE }, beside.probe, beside.avatar)).toBeNull()
  })

  it('under a roof, or backed against a wall taller than her, nothing clears: no rise, and the arm stays in charge', () => {
    for (const layout of [{ robot: false, roof: true }, { robot: false, wall: true }]) {
      const { world, avatar, probe } = scene(layout)
      const query = { target: TARGET, direction: boomAt(INTO_ROBOT, DEFAULT_PITCH), distance: DEFAULT_DISTANCE }
      expect(isBlocked(boomClearance(world, query, probe, avatar), DEFAULT_DISTANCE)).toBe(true)
      expect(liftPitch(world, query, probe, avatar)).toBeNull()
    }
  })

  it('eases up quickly and back down gently once she walks away, then hands the camera back', () => {
    const { world, avatar, probe } = scene()
    const lift = createCameraLift(world, probe, () => avatar)
    const frame = (direction: { x: number; y: number; z: number }) => lift({ target: TARGET, direction, distance: DEFAULT_DISTANCE, delta: 1 / 60 })
    const into = boomAt(INTO_ROBOT, DEFAULT_PITCH)
    const first = frame(into)!
    expect(first.y).toBeGreaterThan(into.y)
    let last = first
    for (let index = 0; index < 30; index += 1) last = frame(into)!
    const target = liftPitch(world, { target: TARGET, direction: into, distance: DEFAULT_DISTANCE }, probe, avatar)!
    expect(Math.asin(last.y)).toBeCloseTo(target, 2)
    // The robot is gone from behind her (she turned the camera): it settles back to the orbit's own boom, then returns null.
    const away = boomAt(Math.PI, DEFAULT_PITCH)
    const settling = frame(away)!
    expect(Math.asin(settling.y)).toBeGreaterThan(DEFAULT_PITCH)
    expect(Math.asin(settling.y)).toBeLessThan(target)
    let released: ReturnType<typeof frame> = settling
    for (let index = 0; index < 240 && released; index += 1) released = frame(away)
    expect(released).toBeNull()
    expect(lift.risenPitch()).toBeNull()
  })
})
