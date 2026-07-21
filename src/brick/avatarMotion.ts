export const AVATAR_FLIP_DURATION_SECONDS = 0.58
export const AVATAR_MAX_FRAME_DELTA_SECONDS = 0.05

export type AvatarMotionState = 'idle' | 'walk' | 'run' | 'rise' | 'fall'

/**
 * Transient controller-to-animator seam. The controller mutates one stable object;
 * animation consumers read it from the render loop without scheduling React state.
 * Sequence fields are monotonically increasing edge counters rather than booleans.
 */
export type MotionSnapshot = {
  grounded: boolean
  horizontalSpeed: number
  maxSpeed: number
  verticalVelocity: number
  facingYaw: number
  /** Signed, normalized acceleration/braking signal in [-1, 1]. */
  acceleration: number
  /** Signed, normalized turn signal in [-1, 1]. */
  turnSignal: number
  /** Increment for every controller-accepted ground or air jump. */
  jumpSequence: number
  /** Increment once on a reliable airborne-to-grounded transition. */
  landSequence: number
  /** Positive pre-landing downward speed, captured on the landing edge. */
  impact: number
  /** Increment only when the accepted air jump should trigger a visual flip. */
  flipSequence: number
}

export type MotionSnapshotRef = {
  current: MotionSnapshot
}

export function createMotionSnapshot(overrides: Partial<MotionSnapshot> = {}): MotionSnapshot {
  return {
    grounded: true,
    horizontalSpeed: 0,
    maxSpeed: 1,
    verticalVelocity: 0,
    facingYaw: 0,
    acceleration: 0,
    turnSignal: 0,
    jumpSequence: 0,
    landSequence: 0,
    impact: 0,
    flipSequence: 0,
    ...overrides,
  }
}

export type AvatarAnimationPose = {
  state: AvatarMotionState
  facingYaw: number
  bodyY: number
  bodyScaleY: number
  bodyScaleXZ: number
  bodyPitch: number
  bodyRoll: number
  headPitch: number
  headRoll: number
  leftArmPitch: number
  rightArmPitch: number
  leftLegPitch: number
  rightLegPitch: number
  flipRotationX: number
}

export type AvatarAnimationRuntime = {
  elapsed: number
  gaitPhase: number
  flipElapsed: number
  flipActive: boolean
  flipSettleAngle: number
  flipSequenceSeen: number
  landSequenceSeen: number
  wasGrounded: boolean
  landingElapsed: number
  landingStrength: number
  pose: AvatarAnimationPose
}

const FULL_TURN = Math.PI * 2

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function damp(current: number, target: number, response: number, delta: number) {
  return target + (current - target) * Math.exp(-response * delta)
}

function dampAngle(current: number, target: number, response: number, delta: number) {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + difference * (1 - Math.exp(-response * delta))
}

function easeInOutSine(value: number) {
  return -(Math.cos(Math.PI * value) - 1) / 2
}

export function chooseAvatarMotionState(snapshot: MotionSnapshot): AvatarMotionState {
  if (!snapshot.grounded) return snapshot.verticalVelocity > 0.15 ? 'rise' : 'fall'
  const speedRatio = snapshot.horizontalSpeed / Math.max(snapshot.maxSpeed, 0.001)
  if (speedRatio >= 0.62) return 'run'
  if (speedRatio >= 0.06) return 'walk'
  return 'idle'
}

export function createAvatarAnimationRuntime(snapshot: MotionSnapshot = createMotionSnapshot()): AvatarAnimationRuntime {
  return {
    elapsed: 0,
    gaitPhase: 0,
    flipElapsed: 0,
    flipActive: false,
    flipSettleAngle: 0,
    flipSequenceSeen: snapshot.flipSequence,
    landSequenceSeen: snapshot.landSequence,
    wasGrounded: snapshot.grounded,
    landingElapsed: Number.POSITIVE_INFINITY,
    landingStrength: 0,
    pose: {
      state: chooseAvatarMotionState(snapshot),
      facingYaw: snapshot.facingYaw,
      bodyY: 0,
      bodyScaleY: 1,
      bodyScaleXZ: 1,
      bodyPitch: 0,
      bodyRoll: 0,
      headPitch: 0,
      headRoll: 0,
      leftArmPitch: 0,
      rightArmPitch: 0,
      leftLegPitch: 0,
      rightLegPitch: 0,
      flipRotationX: 0,
    },
  }
}

/**
 * Advances one mutable animation runtime and returns its stable pose object.
 * It intentionally never touches physics state; flip rotation exists only here.
 */
export function stepAvatarAnimation(
  runtime: AvatarAnimationRuntime,
  snapshot: MotionSnapshot,
  frameDelta: number,
  reducedMotion = false,
): AvatarAnimationPose {
  const delta = clamp(Number.isFinite(frameDelta) ? frameDelta : 0, 0, AVATAR_MAX_FRAME_DELTA_SECONDS)
  runtime.elapsed += delta
  runtime.landingElapsed += delta

  if (snapshot.flipSequence !== runtime.flipSequenceSeen) {
    runtime.flipSequenceSeen = snapshot.flipSequence
    if (!snapshot.grounded && !reducedMotion) {
      runtime.flipElapsed = 0
      runtime.flipActive = true
      runtime.flipSettleAngle = FULL_TURN
    }
  }

  if (reducedMotion && runtime.flipActive) {
    runtime.flipActive = false
    runtime.flipSettleAngle = runtime.pose.flipRotationX < Math.PI ? 0 : FULL_TURN
  }

  const landed = snapshot.landSequence !== runtime.landSequenceSeen || (!runtime.wasGrounded && snapshot.grounded)
  if (landed) {
    runtime.landSequenceSeen = snapshot.landSequence
    runtime.landingElapsed = 0
    runtime.landingStrength = clamp(snapshot.impact / Math.max(snapshot.maxSpeed, 1), 0, 1)
    if (runtime.flipActive) {
      runtime.flipActive = false
      runtime.flipSettleAngle = runtime.pose.flipRotationX < Math.PI ? 0 : FULL_TURN
    }
  }
  runtime.wasGrounded = snapshot.grounded

  const state = chooseAvatarMotionState(snapshot)
  const speedRatio = clamp(snapshot.horizontalSpeed / Math.max(snapshot.maxSpeed, 0.001), 0, 1)
  const gaitWeight = snapshot.grounded ? clamp((speedRatio - 0.03) / 0.35, 0, 1) : 0
  const runBlend = clamp((speedRatio - 0.5) / 0.5, 0, 1)
  runtime.gaitPhase += delta * (3.8 + speedRatio * 6.2)

  const decorationScale = reducedMotion ? 0.22 : 1
  const gaitScale = reducedMotion ? 0.65 : 1
  const gait = Math.sin(runtime.gaitPhase) * gaitWeight * (0.32 + runBlend * 0.32) * gaitScale
  const idleWave = Math.sin(runtime.elapsed * 1.8)
  const strideBob = Math.abs(Math.sin(runtime.gaitPhase * 2)) * gaitWeight * 0.035 * decorationScale
  const breathing = state === 'idle' ? idleWave * 0.012 * decorationScale : 0
  const landingWave = runtime.landingElapsed < 0.28
    ? Math.exp(-runtime.landingElapsed * 9) * Math.max(0, Math.cos(runtime.landingElapsed * 22)) * runtime.landingStrength
    : 0

  let targetArmLeft = -gait * 0.9
  let targetArmRight = gait * 0.9
  let targetLegLeft = gait
  let targetLegRight = -gait
  let targetPitch = clamp(snapshot.acceleration, -1, 1) * 0.12 * decorationScale
  let targetHeadPitch = 0

  if (state === 'rise') {
    targetArmLeft = -0.38 * (reducedMotion ? 0.6 : 1)
    targetArmRight = -0.38 * (reducedMotion ? 0.6 : 1)
    targetLegLeft = 0.28
    targetLegRight = -0.16
    targetPitch -= 0.08 * decorationScale
    targetHeadPitch = -0.04 * decorationScale
  } else if (state === 'fall') {
    targetArmLeft = 0.48 * (reducedMotion ? 0.6 : 1)
    targetArmRight = 0.48 * (reducedMotion ? 0.6 : 1)
    targetLegLeft = -0.12
    targetLegRight = 0.22
    targetPitch += 0.08 * decorationScale
    targetHeadPitch = 0.06 * decorationScale
  }

  if (runtime.flipActive) {
    runtime.flipElapsed += delta
    const progress = clamp(runtime.flipElapsed / AVATAR_FLIP_DURATION_SECONDS, 0, 1)
    runtime.pose.flipRotationX = easeInOutSine(progress) * FULL_TURN
    if (progress >= 1) {
      runtime.flipActive = false
      runtime.pose.flipRotationX = 0
      runtime.flipSettleAngle = 0
    }
  } else if (runtime.pose.flipRotationX !== 0) {
    runtime.pose.flipRotationX = damp(runtime.pose.flipRotationX, runtime.flipSettleAngle, 18, delta)
    if (Math.abs(runtime.pose.flipRotationX - runtime.flipSettleAngle) < 0.015) {
      runtime.pose.flipRotationX = 0
      runtime.flipSettleAngle = 0
    }
  }

  const pose = runtime.pose
  pose.state = state
  pose.facingYaw = dampAngle(pose.facingYaw, snapshot.facingYaw, 15, delta)
  pose.bodyY = damp(pose.bodyY, breathing + strideBob - landingWave * 0.055, 18, delta)
  pose.bodyScaleY = damp(pose.bodyScaleY, 1 + breathing - landingWave * 0.13, 24, delta)
  pose.bodyScaleXZ = damp(pose.bodyScaleXZ, 1 - breathing * 0.5 + landingWave * 0.07, 24, delta)
  pose.bodyPitch = damp(pose.bodyPitch, targetPitch, 12, delta)
  pose.bodyRoll = damp(pose.bodyRoll, -clamp(snapshot.turnSignal, -1, 1) * 0.1 * decorationScale, 12, delta)
  pose.headPitch = damp(pose.headPitch, targetHeadPitch, 10, delta)
  pose.headRoll = damp(pose.headRoll, state === 'idle' ? idleWave * 0.025 * decorationScale : 0, 8, delta)
  pose.leftArmPitch = damp(pose.leftArmPitch, targetArmLeft, 15, delta)
  pose.rightArmPitch = damp(pose.rightArmPitch, targetArmRight, 15, delta)
  pose.leftLegPitch = damp(pose.leftLegPitch, targetLegLeft, 17, delta)
  pose.rightLegPitch = damp(pose.rightLegPitch, targetLegRight, 17, delta)
  return pose
}
