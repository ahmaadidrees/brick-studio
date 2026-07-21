import type { MutableVector3 } from './orbitCamera'

export const CHARACTER_FIXED_STEP = 1 / 60
export const CHARACTER_MAX_FRAME_DELTA = 0.05
export const CHARACTER_MAX_SUBSTEPS = 3
export const JUMP_BUFFER_SECONDS = 0.15
export const COYOTE_SECONDS = 0.12
export const AIR_JUMPS = 1

export const CHARACTER_WALK_SPEED = 3.5
export const CHARACTER_RUN_SPEED = 5.4
export const CHARACTER_JUMP_SPEED = 5.25
export const CHARACTER_GRAVITY = -16
export const CHARACTER_MAX_FALL_SPEED = -12

export const CHARACTER_CONTROLLER_OFFSET = 0.025
export const CHARACTER_AUTOSTEP_HEIGHT = 0.22
export const CHARACTER_AUTOSTEP_MIN_WIDTH = 0.18
export const CHARACTER_GROUND_SNAP = 0.13
export const CHARACTER_MAX_SLOPE_ANGLE = Math.PI * (50 / 180)
export const CHARACTER_SLIDE_ANGLE = Math.PI * (55 / 180)

const JUMP_GROUND_IGNORE_SECONDS = 0.08
const RELIABLE_LANDING_AIR_TIME = 0.05
const GROUND_STICK_VELOCITY = -0.35
const MOVE_EPSILON = 1e-5
const GROUND_ACCELERATION_DAMPING = 11
const AIR_ACCELERATION_DAMPING = 4.5
const BRAKING_DAMPING = 15
const FACING_DAMPING = 14

export type JumpKind = 'ground' | 'air' | null

export type CharacterMotionState = {
  velocityX: number
  velocityZ: number
  verticalVelocity: number
  facingYaw: number
  grounded: boolean
  coyoteRemaining: number
  jumpBufferRemaining: number
  airJumpsRemaining: number
  groundIgnoreRemaining: number
  airborneTime: number
}

export type CharacterMotionInput = {
  /** World-space direction with analog magnitude in the 0..1 range. */
  worldX: number
  worldZ: number
  running: boolean
}

export type CharacterStepResult = {
  delta: number
  desiredTranslation: MutableVector3
  grounded: boolean
  horizontalSpeed: number
  maxSpeed: number
  verticalVelocity: number
  facingYaw: number
  jump: JumpKind
  landed: boolean
  leftGround: boolean
  impact: number
  acceleration: number
  turn: number
}

export type FixedStepClock = {
  accumulator: number
}

export function createCharacterMotionState(grounded = false): CharacterMotionState {
  return {
    velocityX: 0,
    velocityZ: 0,
    verticalVelocity: grounded ? GROUND_STICK_VELOCITY : 0,
    facingYaw: Math.PI,
    grounded,
    coyoteRemaining: grounded ? COYOTE_SECONDS : 0,
    jumpBufferRemaining: 0,
    airJumpsRemaining: AIR_JUMPS,
    groundIgnoreRemaining: 0,
    airborneTime: 0,
  }
}

export function createCharacterStepResult(): CharacterStepResult {
  return {
    delta: CHARACTER_FIXED_STEP,
    desiredTranslation: { x: 0, y: 0, z: 0 },
    grounded: false,
    horizontalSpeed: 0,
    maxSpeed: CHARACTER_WALK_SPEED,
    verticalVelocity: 0,
    facingYaw: Math.PI,
    jump: null,
    landed: false,
    leftGround: false,
    impact: 0,
    acceleration: 0,
    turn: 0,
  }
}

export function createFixedStepClock(): FixedStepClock {
  return { accumulator: 0 }
}

export function resetCharacterFrameTranslation(translation: MutableVector3) {
  translation.x = 0
  translation.y = 0
  translation.z = 0
  return translation
}

/** Accumulates fixed-step intent for one Rapier kinematic query per render frame. */
export function accumulateCharacterTranslation(
  frameTranslation: MutableVector3,
  stepResult: Readonly<CharacterStepResult>,
) {
  frameTranslation.x += stepResult.desiredTranslation.x
  frameTranslation.y += stepResult.desiredTranslation.y
  frameTranslation.z += stepResult.desiredTranslation.z
  return frameTranslation
}

export function clampCharacterDelta(delta: number) {
  if (!Number.isFinite(delta) || delta <= 0) return 0
  return Math.min(delta, CHARACTER_MAX_FRAME_DELTA)
}

/**
 * Runs at most three 60 Hz updates after a delayed/background frame. The
 * callback is synchronous and the clock object is reused by the scene. When
 * more than one step runs, accumulate each result with
 * `accumulateCharacterTranslation` and perform one Rapier movement query.
 */
export function consumeCharacterFixedSteps(
  clock: FixedStepClock,
  frameDelta: number,
  step: (delta: number) => void,
) {
  clock.accumulator = Math.min(
    clock.accumulator + clampCharacterDelta(frameDelta),
    CHARACTER_FIXED_STEP * CHARACTER_MAX_SUBSTEPS,
  )
  let steps = 0
  while (clock.accumulator + Number.EPSILON >= CHARACTER_FIXED_STEP && steps < CHARACTER_MAX_SUBSTEPS) {
    step(CHARACTER_FIXED_STEP)
    clock.accumulator -= CHARACTER_FIXED_STEP
    steps += 1
  }
  return steps
}

/** Called only on a jump edge (keydown !repeat or a changed touch nonce). */
export function bufferCharacterJump(state: CharacterMotionState) {
  state.jumpBufferRemaining = JUMP_BUFFER_SECONDS
}

function damp(current: number, target: number, rate: number, delta: number) {
  return target + (current - target) * Math.exp(-rate * delta)
}

function shortestAngleDelta(from: number, to: number) {
  const twoPi = Math.PI * 2
  return ((to - from + Math.PI) % twoPi + twoPi) % twoPi - Math.PI
}

/**
 * Advances allocation-free character intent for one fixed step. Pass the
 * prior Rapier `computedGrounded()` result as `observedGrounded`, then feed
 * `out.desiredTranslation` to the kinematic character controller.
 *
 * `out` is also the integration seam for MotionSnapshot: speed/maxSpeed,
 * vertical velocity, jump/land edges, impact, facing, acceleration and turn.
 */
export function stepCharacterMotion(
  state: CharacterMotionState,
  input: Readonly<CharacterMotionInput>,
  observedGrounded: boolean,
  delta: number,
  out: CharacterStepResult,
) {
  const safeDelta = clampCharacterDelta(delta)
  const previousSpeed = Math.hypot(state.velocityX, state.velocityZ)
  const previousFacing = state.facingYaw
  const previousVerticalVelocity = state.verticalVelocity

  state.groundIgnoreRemaining = Math.max(0, state.groundIgnoreRemaining - safeDelta)
  const groundIsReliable = observedGrounded
    && state.groundIgnoreRemaining === 0
    && state.verticalVelocity <= 0

  let landed = false
  let leftGround = false
  let impact = 0

  if (groundIsReliable) {
    if (!state.grounded && state.airborneTime >= RELIABLE_LANDING_AIR_TIME) {
      landed = true
      impact = Math.max(0, -previousVerticalVelocity)
      state.airJumpsRemaining = AIR_JUMPS
    }
    state.grounded = true
    state.airborneTime = 0
    state.coyoteRemaining = COYOTE_SECONDS
    state.verticalVelocity = GROUND_STICK_VELOCITY
  } else {
    if (state.grounded) leftGround = true
    state.grounded = false
    state.airborneTime += safeDelta
    state.coyoteRemaining = Math.max(0, state.coyoteRemaining - safeDelta)
  }

  let jump: JumpKind = null
  if (state.jumpBufferRemaining > 0) {
    if (state.grounded || state.coyoteRemaining > 0) {
      jump = 'ground'
    } else if (state.airJumpsRemaining > 0) {
      jump = 'air'
      state.airJumpsRemaining -= 1
    }
  }

  if (jump !== null) {
    state.verticalVelocity = CHARACTER_JUMP_SPEED
    state.grounded = false
    state.coyoteRemaining = 0
    state.jumpBufferRemaining = 0
    state.groundIgnoreRemaining = JUMP_GROUND_IGNORE_SECONDS
    state.airborneTime = 0
    landed = false
    impact = 0
  } else {
    state.jumpBufferRemaining = Math.max(0, state.jumpBufferRemaining - safeDelta)
    if (!state.grounded) {
      state.verticalVelocity = Math.max(
        CHARACTER_MAX_FALL_SPEED,
        state.verticalVelocity + CHARACTER_GRAVITY * safeDelta,
      )
    }
  }

  const rawInputMagnitude = Math.hypot(input.worldX, input.worldZ)
  const inputScale = rawInputMagnitude > 1 ? 1 / rawInputMagnitude : 1
  const maxSpeed = input.running ? CHARACTER_RUN_SPEED : CHARACTER_WALK_SPEED
  const targetVelocityX = input.worldX * inputScale * maxSpeed
  const targetVelocityZ = input.worldZ * inputScale * maxSpeed
  const hasInput = rawInputMagnitude > MOVE_EPSILON
  const motionDamping = hasInput
    ? (state.grounded ? GROUND_ACCELERATION_DAMPING : AIR_ACCELERATION_DAMPING)
    : BRAKING_DAMPING

  state.velocityX = damp(state.velocityX, targetVelocityX, motionDamping, safeDelta)
  state.velocityZ = damp(state.velocityZ, targetVelocityZ, motionDamping, safeDelta)

  let turn = 0
  if (hasInput) {
    const targetFacing = Math.atan2(input.worldX, input.worldZ)
    const facingDelta = shortestAngleDelta(state.facingYaw, targetFacing)
    const facingAlpha = 1 - Math.exp(-FACING_DAMPING * safeDelta)
    state.facingYaw += facingDelta * facingAlpha
    turn = safeDelta > 0 ? shortestAngleDelta(previousFacing, state.facingYaw) / safeDelta : 0
  }

  const horizontalSpeed = Math.hypot(state.velocityX, state.velocityZ)
  out.delta = safeDelta
  out.desiredTranslation.x = state.velocityX * safeDelta
  out.desiredTranslation.y = state.verticalVelocity * safeDelta
  out.desiredTranslation.z = state.velocityZ * safeDelta
  out.grounded = state.grounded
  out.horizontalSpeed = horizontalSpeed
  out.maxSpeed = maxSpeed
  out.verticalVelocity = state.verticalVelocity
  out.facingYaw = state.facingYaw
  out.jump = jump
  out.landed = landed
  out.leftGround = leftGround
  out.impact = impact
  out.acceleration = safeDelta > 0 ? (horizontalSpeed - previousSpeed) / safeDelta : 0
  out.turn = turn
  return out
}

/** Structural subset of Rapier 0.19.2 used to keep configuration testable. */
export type KinematicCharacterControllerLike = {
  setUp(up: { x: number; y: number; z: number }): void
  setSlideEnabled(enabled: boolean): void
  enableAutostep(maxHeight: number, minWidth: number, includeDynamicBodies: boolean): void
  enableSnapToGround(distance: number): void
  setMaxSlopeClimbAngle(angle: number): void
  setMinSlopeSlideAngle(angle: number): void
  setApplyImpulsesToDynamicBodies(enabled: boolean): void
}

export function configureKinematicCharacterController<T extends KinematicCharacterControllerLike>(controller: T): T {
  controller.setUp({ x: 0, y: 1, z: 0 })
  controller.setSlideEnabled(true)
  controller.enableAutostep(CHARACTER_AUTOSTEP_HEIGHT, CHARACTER_AUTOSTEP_MIN_WIDTH, false)
  controller.enableSnapToGround(CHARACTER_GROUND_SNAP)
  controller.setMaxSlopeClimbAngle(CHARACTER_MAX_SLOPE_ANGLE)
  controller.setMinSlopeSlideAngle(CHARACTER_SLIDE_ANGLE)
  controller.setApplyImpulsesToDynamicBodies(false)
  return controller
}

export type KinematicStepController = {
  computeColliderMovement(collider: unknown, desiredTranslation: MutableVector3): void
  computedMovement(): { x: number; y: number; z: number }
  computedGrounded(): boolean
}

export type KinematicBody = {
  translation(): { x: number; y: number; z: number }
  setNextKinematicTranslation(position: MutableVector3): void
}

/**
 * Applies the Rapier-computed translation without rotating the body. Reuse
 * `nextPosition` across frames; the visual facing/flip wrappers stay separate.
 */
export function applyKinematicCharacterStep(
  controller: KinematicStepController,
  collider: unknown,
  body: KinematicBody,
  desiredTranslation: MutableVector3,
  nextPosition: MutableVector3,
) {
  controller.computeColliderMovement(collider, desiredTranslation)
  const movement = controller.computedMovement()
  const position = body.translation()
  nextPosition.x = position.x + movement.x
  nextPosition.y = position.y + movement.y
  nextPosition.z = position.z + movement.z
  body.setNextKinematicTranslation(nextPosition)
  return controller.computedGrounded()
}
