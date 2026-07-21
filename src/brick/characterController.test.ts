import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  AIR_JUMPS,
  CHARACTER_AUTOSTEP_HEIGHT,
  CHARACTER_AUTOSTEP_MIN_WIDTH,
  CHARACTER_CONTROLLER_OFFSET,
  CHARACTER_FIXED_STEP,
  CHARACTER_GROUND_SNAP,
  CHARACTER_MAX_FRAME_DELTA,
  CHARACTER_MAX_SLOPE_ANGLE,
  CHARACTER_MAX_SUBSTEPS,
  CHARACTER_RUN_SPEED,
  CHARACTER_SLIDE_ANGLE,
  CHARACTER_WALK_SPEED,
  COYOTE_SECONDS,
  JUMP_BUFFER_SECONDS,
  accumulateCharacterTranslation,
  applyKinematicCharacterStep,
  bufferCharacterJump,
  clampCharacterDelta,
  configureKinematicCharacterController,
  consumeCharacterFixedSteps,
  createCharacterMotionState,
  createCharacterStepResult,
  createFixedStepClock,
  resetCharacterFrameTranslation,
  stepCharacterMotion,
} from './characterController'

beforeAll(async () => {
  await RAPIER.init()
})

function step(
  state = createCharacterMotionState(),
  grounded = false,
  running = false,
  worldX = 0,
  worldZ = 0,
) {
  const output = createCharacterStepResult()
  stepCharacterMotion(state, { worldX, worldZ, running }, grounded, CHARACTER_FIXED_STEP, output)
  return { state, output }
}

describe('fixed-step character timing', () => {
  it('clamps delayed/background frames and bounds catch-up work', () => {
    expect(clampCharacterDelta(10)).toBe(CHARACTER_MAX_FRAME_DELTA)
    expect(clampCharacterDelta(Number.NaN)).toBe(0)
    const clock = createFixedStepClock()
    const callback = vi.fn()
    expect(consumeCharacterFixedSteps(clock, 10, callback)).toBe(CHARACTER_MAX_SUBSTEPS)
    expect(callback).toHaveBeenCalledTimes(CHARACTER_MAX_SUBSTEPS)
    expect(callback).toHaveBeenCalledWith(CHARACTER_FIXED_STEP)
  })

  it('accumulates catch-up intent into one reusable Rapier movement vector', () => {
    const state = createCharacterMotionState(true)
    const output = createCharacterStepResult()
    const translation = { x: 99, y: 99, z: 99 }
    resetCharacterFrameTranslation(translation)
    consumeCharacterFixedSteps(createFixedStepClock(), CHARACTER_FIXED_STEP * 2, (delta) => {
      stepCharacterMotion(state, { worldX: 0, worldZ: 1, running: false }, true, delta, output)
      accumulateCharacterTranslation(translation, output)
    })
    expect(translation.x).toBe(0)
    expect(translation.z).toBeGreaterThan(output.desiredTranslation.z)
    expect(translation.y).toBeLessThan(0)
  })
})

describe('smooth locomotion', () => {
  it('accelerates and brakes smoothly instead of snapping velocity', () => {
    const state = createCharacterMotionState(true)
    const output = createCharacterStepResult()
    stepCharacterMotion(state, { worldX: 0, worldZ: 1, running: false }, true, CHARACTER_FIXED_STEP, output)
    expect(output.horizontalSpeed).toBeGreaterThan(0)
    expect(output.horizontalSpeed).toBeLessThan(CHARACTER_WALK_SPEED)

    for (let frame = 0; frame < 90; frame += 1) {
      stepCharacterMotion(state, { worldX: 0, worldZ: 1, running: false }, true, CHARACTER_FIXED_STEP, output)
    }
    expect(output.horizontalSpeed).toBeCloseTo(CHARACTER_WALK_SPEED, 3)

    stepCharacterMotion(state, { worldX: 0, worldZ: 0, running: false }, true, CHARACTER_FIXED_STEP, output)
    expect(output.horizontalSpeed).toBeGreaterThan(0)
    expect(output.horizontalSpeed).toBeLessThan(CHARACTER_WALK_SPEED)
  })

  it('uses a higher target speed for running and turns through a damped facing seam', () => {
    const state = createCharacterMotionState(true)
    const output = createCharacterStepResult()
    stepCharacterMotion(state, { worldX: 1, worldZ: 0, running: true }, true, CHARACTER_FIXED_STEP, output)
    expect(output.turn).toBeLessThan(0)
    for (let frame = 0; frame < 90; frame += 1) {
      stepCharacterMotion(state, { worldX: 1, worldZ: 0, running: true }, true, CHARACTER_FIXED_STEP, output)
    }
    expect(output.maxSpeed).toBe(CHARACTER_RUN_SPEED)
    expect(output.horizontalSpeed).toBeCloseTo(CHARACTER_RUN_SPEED, 3)
    expect(output.facingYaw).toBeCloseTo(Math.PI / 2, 3)
  })
})

describe('buffer, coyote time, and exactly one double jump', () => {
  it('retains a jump request for the configured buffer window', () => {
    const state = createCharacterMotionState(false)
    state.airJumpsRemaining = 0
    bufferCharacterJump(state)
    for (let elapsed = 0; elapsed < JUMP_BUFFER_SECONDS - CHARACTER_FIXED_STEP; elapsed += CHARACTER_FIXED_STEP) {
      step(state, false)
    }
    expect(state.jumpBufferRemaining).toBeGreaterThan(0)
    const landing = step(state, true)
    expect(landing.output.jump).toBe('ground')
    expect(landing.output.verticalVelocity).toBeGreaterThan(0)
  })

  it('allows a first jump during coyote time after leaving an edge', () => {
    const state = createCharacterMotionState(true)
    step(state, false)
    expect(state.coyoteRemaining).toBeGreaterThan(0)
    bufferCharacterJump(state)
    const jumped = step(state, false)
    expect(jumped.output.jump).toBe('ground')
    expect(state.airJumpsRemaining).toBe(AIR_JUMPS)
    expect(state.coyoteRemaining).toBe(0)
  })

  it('permits exactly one air jump and resets it only on a reliable landing', () => {
    const state = createCharacterMotionState(true)
    bufferCharacterJump(state)
    expect(step(state, true).output.jump).toBe('ground')

    bufferCharacterJump(state)
    expect(step(state, false).output.jump).toBe('air')
    expect(state.airJumpsRemaining).toBe(0)

    bufferCharacterJump(state)
    expect(step(state, false).output.jump).toBeNull()
    expect(state.airJumpsRemaining).toBe(0)

    // A one-frame grounded seam is ignored during jump separation.
    step(state, true)
    expect(state.airJumpsRemaining).toBe(0)

    for (let frame = 0; frame < 60; frame += 1) step(state, false)
    const landed = step(state, true)
    expect(landed.output.landed).toBe(true)
    expect(landed.output.impact).toBeGreaterThan(0)
    expect(state.airJumpsRemaining).toBe(AIR_JUMPS)
  })

  it('expires coyote time after about 120ms', () => {
    const state = createCharacterMotionState(true)
    for (let elapsed = 0; elapsed <= COYOTE_SECONDS; elapsed += CHARACTER_FIXED_STEP) step(state, false)
    expect(state.coyoteRemaining).toBe(0)
  })
})

describe('Rapier 0.19.2 kinematic character controller', () => {
  it('configures autostep, snap, slopes, and static kinematic behavior', () => {
    const calls: unknown[][] = []
    const controller = {
      setUp: (...args: unknown[]) => calls.push(['up', ...args]),
      setSlideEnabled: (...args: unknown[]) => calls.push(['slide', ...args]),
      enableAutostep: (...args: unknown[]) => calls.push(['autostep', ...args]),
      enableSnapToGround: (...args: unknown[]) => calls.push(['snap', ...args]),
      setMaxSlopeClimbAngle: (...args: unknown[]) => calls.push(['maxSlope', ...args]),
      setMinSlopeSlideAngle: (...args: unknown[]) => calls.push(['slideSlope', ...args]),
      setApplyImpulsesToDynamicBodies: (...args: unknown[]) => calls.push(['impulses', ...args]),
    }
    configureKinematicCharacterController(controller)
    expect(calls).toContainEqual(['autostep', CHARACTER_AUTOSTEP_HEIGHT, CHARACTER_AUTOSTEP_MIN_WIDTH, false])
    expect(calls).toContainEqual(['snap', CHARACTER_GROUND_SNAP])
    expect(calls).toContainEqual(['maxSlope', CHARACTER_MAX_SLOPE_ANGLE])
    expect(calls).toContainEqual(['slideSlope', CHARACTER_SLIDE_ANGLE])
    expect(calls).toContainEqual(['impulses', false])
  })

  it('uses computed movement to stop a kinematic capsule at a wall', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(4, 0.1, 4).setTranslation(0, -0.1, 0), groundBody)
    const wallBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 1, 2).setTranslation(0.75, 1, 0), wallBody)

    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.36, 0))
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.18, 0.18), body)
    world.step()
    const controller = configureKinematicCharacterController(world.createCharacterController(CHARACTER_CONTROLLER_OFFSET))
    const nextPosition = { x: 0, y: 0, z: 0 }
    const grounded = applyKinematicCharacterStep(
      controller,
      collider,
      body,
      { x: 2, y: -0.02, z: 0 },
      nextPosition,
    )
    expect(nextPosition.x).toBeGreaterThan(0.4)
    expect(nextPosition.x).toBeLessThan(0.46)
    expect(grounded).toBe(true)
    world.removeCharacterController(controller)
    world.free()
  })

  it('autosteps the capsule onto a brick-height ledge', () => {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
    const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(4, 0.1, 4).setTranslation(0, -0.1, 0), groundBody)
    const stepBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.45, 0.0875, 1).setTranslation(0.7, 0.0875, 0), stepBody)

    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0.36, 0))
    const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.18, 0.18), body)
    world.step()
    const controller = configureKinematicCharacterController(world.createCharacterController(CHARACTER_CONTROLLER_OFFSET))
    const nextPosition = { x: 0, y: 0, z: 0 }
    applyKinematicCharacterStep(controller, collider, body, { x: 0.8, y: -0.02, z: 0 }, nextPosition)
    expect(nextPosition.x).toBeGreaterThan(0.6)
    expect(nextPosition.y).toBeGreaterThan(0.5)
    world.removeCharacterController(controller)
    world.free()
  })
})
