import {
  AVATAR_FLIP_DURATION_SECONDS,
  AVATAR_MAX_FRAME_DELTA_SECONDS,
  chooseAvatarMotionState,
  createMotionSnapshot,
  type AvatarMotionState,
  type MotionSnapshot,
} from './avatarMotion'

/**
 * Pure pose math for the Explore toy figure.
 *
 * Nothing here imports three or touches physics: the character controller owns
 * movement, publishes a MotionSnapshot, and this module turns that snapshot into
 * joint angles. Every channel below is a local rotation for one rig node, so the
 * renderer stays a dumb transform applier and the interesting animation decisions
 * stay unit-testable.
 *
 * Sign conventions (the figure faces +Z, +Y is up, "left" is the -X side to match
 * the existing rig naming):
 *   - limb `pitch` is an applied `rotation.x`; positive swings a hanging limb back.
 *   - `kneeFlex` / `elbowFlex` are positive magnitudes; the renderer negates the
 *     elbow so both read as "amount of bend" here.
 *   - `roll` is an applied `rotation.z`, `yaw` an applied `rotation.y`.
 */

export const TAU = Math.PI * 2

/** Face atlas is a 2x2 canvas: open, blink, grin, gasp (row-major from top-left). */
export const FACE_FRAME_OPEN = 0
export const FACE_FRAME_BLINK = 1
export const FACE_FRAME_GRIN = 2
export const FACE_FRAME_GASP = 3
export const FACE_ATLAS_COLUMNS = 2
export const FACE_ATLAS_ROWS = 2

/** Metres of ground covered by one full two-step gait cycle, at a standstill. */
export const GAIT_CYCLE_BASE_DISTANCE = 1.12
/** Stride lengthens with speed, so cadence rises sub-linearly like a real gait. */
export const GAIT_CYCLE_SPEED_GAIN = 0.1
export const LANDING_DURATION_SECONDS = 0.42
export const LAUNCH_DURATION_SECONDS = 0.34
export const BLINK_DURATION_SECONDS = 0.13
export const BLINK_MIN_INTERVAL_SECONDS = 2.4
export const BLINK_MAX_INTERVAL_SECONDS = 5.6
export const GLANCE_DURATION_SECONDS = 1.35
export const GLANCE_MIN_INTERVAL_SECONDS = 3.4
export const GLANCE_MAX_INTERVAL_SECONDS = 7.2

export type ToyFigurePose = {
  state: AvatarMotionState
  facingYaw: number
  /** Whole-figure offset and squash/stretch, applied above the flip node. */
  rootY: number
  rootScaleY: number
  rootScaleXZ: number
  bodyPitch: number
  bodyRoll: number
  pelvisYaw: number
  pelvisRoll: number
  chestYaw: number
  chestPitch: number
  chestRoll: number
  headYaw: number
  headPitch: number
  headRoll: number
  leftShoulderPitch: number
  rightShoulderPitch: number
  leftShoulderRoll: number
  rightShoulderRoll: number
  leftElbowFlex: number
  rightElbowFlex: number
  leftHipPitch: number
  rightHipPitch: number
  leftHipRoll: number
  rightHipRoll: number
  leftKneeFlex: number
  rightKneeFlex: number
  leftFootPitch: number
  rightFootPitch: number
  /** Visual-only somersault, never fed back into physics. */
  flipRotationX: number
  /** Multiplier on limb length for squash/stretch follow-through. */
  limbStretch: number
  faceFrame: number
}

export type ToyFigureSpring = {
  value: number
  velocity: number
}

export type ToyFigureRuntime = {
  elapsed: number
  gaitPhase: number
  gaitWeight: number
  flipElapsed: number
  flipActive: boolean
  flipSettleAngle: number
  flipSequenceSeen: number
  jumpSequenceSeen: number
  landSequenceSeen: number
  wasGrounded: boolean
  launchElapsed: number
  landingElapsed: number
  landingStrength: number
  blinkCountdown: number
  blinkElapsed: number
  glanceCountdown: number
  glanceElapsed: number
  glanceTarget: number
  seed: number
  headYawSpring: ToyFigureSpring
  headPitchSpring: ToyFigureSpring
  pose: ToyFigurePose
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clamp01(value: number) {
  return clamp(value, 0, 1)
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

/** Deterministic PRNG so blink/glance cadence is reproducible in tests. */
function nextRandom(runtime: ToyFigureRuntime) {
  runtime.seed = (runtime.seed + 0x6d2b79f5) >>> 0
  let t = runtime.seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Semi-implicit spring. Head rotation runs through this rather than an
 * exponential damp so it overshoots slightly and reads as follow-through.
 */
export function stepSpring(
  spring: ToyFigureSpring,
  target: number,
  stiffness: number,
  damping: number,
  delta: number,
) {
  spring.velocity += ((target - spring.value) * stiffness - spring.velocity * damping) * delta
  spring.value += spring.velocity * delta
  return spring.value
}

export function wrapPhase(phase: number) {
  const wrapped = phase % TAU
  return wrapped < 0 ? wrapped + TAU : wrapped
}

/** Ground distance per full gait cycle; longer strides at higher speed. */
export function gaitCycleDistance(speed: number) {
  return GAIT_CYCLE_BASE_DISTANCE + Math.max(0, speed) * GAIT_CYCLE_SPEED_GAIN
}

/**
 * Advances the gait by distance travelled, not by wall-clock time, so feet stay
 * planted-looking at any speed and the cycle freezes the instant the figure stops.
 */
export function advanceGaitPhase(phase: number, speed: number, delta: number) {
  const distance = Math.max(0, speed) * Math.max(0, delta)
  return wrapPhase(phase + (distance / gaitCycleDistance(speed)) * TAU)
}

/** Hip swing. Negative is forward, so the leg is fully forward at phase pi/2. */
export function gaitHipPitch(phase: number, amplitude: number) {
  return -Math.sin(phase) * amplitude
}

/** Contralateral arm swing: exactly out of phase with the same-side leg. */
export function gaitArmPitch(phase: number, amplitude: number) {
  return Math.sin(phase) * amplitude
}

/**
 * Knees only ever bend one way. A tall narrow lift peaks at mid-swing (phase 0)
 * and a smaller loading bump follows heel strike, which is what stops a gait from
 * reading as two rotating sticks.
 */
export function gaitKneeFlex(phase: number, amplitude: number) {
  const swing = Math.max(0, Math.cos(phase))
  const load = Math.max(0, Math.sin(phase - Math.PI * 0.35))
  return amplitude * (swing * swing + 0.3 * load * load)
}

/** Ankle mostly cancels the chain above it, then adds a toe-off push late in stance. */
export function gaitFootPitch(hipPitch: number, kneeFlex: number, phase: number, amplitude: number) {
  const toeOff = Math.max(0, Math.sin(phase - Math.PI * 1.05))
  return -(hipPitch + kneeFlex) * 0.62 + toeOff * toeOff * amplitude
}

/** Two-per-cycle vertical bob: lowest at foot contact, highest at mid-stance. */
export function gaitBob(phase: number, amplitude: number) {
  return -Math.cos(phase * 2) * amplitude
}

/**
 * Squash on impact, then a rebound overshoot before settling. Positive is squash,
 * negative is the stretch on the way back out.
 */
export function landingSquash(elapsed: number, strength: number) {
  if (!(elapsed >= 0) || elapsed > LANDING_DURATION_SECONDS) return 0
  const progress = elapsed / LANDING_DURATION_SECONDS
  return strength * Math.exp(-progress * 5.2) * Math.cos(progress * Math.PI * 1.6)
}

/**
 * Jump beat: a fast crouch (negative) before the body has visibly left the ground,
 * then the extension (positive), then settle. Physics has already launched by frame
 * zero, so the anticipation is deliberately short enough to stay believable.
 */
export function jumpLaunchSignal(elapsed: number) {
  if (!(elapsed >= 0) || elapsed > LAUNCH_DURATION_SECONDS) return 0
  if (elapsed < 0.05) return -easeInOutSine(elapsed / 0.05)
  if (elapsed < 0.18) return -1 + 2 * easeInOutSine((elapsed - 0.05) / 0.13)
  return 1 - easeInOutSine((elapsed - 0.18) / (LAUNCH_DURATION_SECONDS - 0.18))
}

/**
 * Airborne blend weights. Driving the air pose off vertical velocity rather than
 * off the discrete rise/fall state keeps the arc continuous through the apex,
 * where a state switch would otherwise snap the legs.
 */
export function apexWeight(verticalVelocity: number) {
  return clamp01(1 - Math.abs(verticalVelocity) / 2.6)
}

export function riseWeight(verticalVelocity: number) {
  return clamp01(verticalVelocity / 2.5)
}

export function fallWeight(verticalVelocity: number) {
  return clamp01(-verticalVelocity / 3)
}

/** Texture offset for a 2x2 face atlas frame, given repeat of 0.5 on both axes. */
export function faceFrameOffsetX(frame: number) {
  return (frame % FACE_ATLAS_COLUMNS) / FACE_ATLAS_COLUMNS
}

export function faceFrameOffsetY(frame: number) {
  return (FACE_ATLAS_ROWS - 1 - Math.floor(frame / FACE_ATLAS_COLUMNS)) / FACE_ATLAS_ROWS
}

export type FaceFrameInputs = {
  state: AvatarMotionState
  speedRatio: number
  verticalVelocity: number
  blinking: boolean
  landingElapsed: number
  landingStrength: number
}

/**
 * Expression priority. Gameplay-driven faces outrank the ambient blink so the
 * figure never blinks through the one frame where it is falling off a tower.
 */
export function chooseFaceFrame(inputs: FaceFrameInputs) {
  if (inputs.state === 'fall' && inputs.verticalVelocity < -3.4) return FACE_FRAME_GASP
  if (inputs.landingElapsed < 0.2 && inputs.landingStrength > 0.55) return FACE_FRAME_GASP
  if (inputs.landingElapsed < 0.26) return FACE_FRAME_BLINK
  if (inputs.state === 'rise' || inputs.state === 'run' || inputs.speedRatio > 0.62) return FACE_FRAME_GRIN
  if (inputs.blinking) return FACE_FRAME_BLINK
  return FACE_FRAME_OPEN
}

export function createToyFigurePose(snapshot: MotionSnapshot): ToyFigurePose {
  return {
    state: chooseAvatarMotionState(snapshot),
    facingYaw: snapshot.facingYaw,
    rootY: 0,
    rootScaleY: 1,
    rootScaleXZ: 1,
    bodyPitch: 0,
    bodyRoll: 0,
    pelvisYaw: 0,
    pelvisRoll: 0,
    chestYaw: 0,
    chestPitch: 0,
    chestRoll: 0,
    headYaw: 0,
    headPitch: 0,
    headRoll: 0,
    leftShoulderPitch: 0,
    rightShoulderPitch: 0,
    leftShoulderRoll: 0,
    rightShoulderRoll: 0,
    leftElbowFlex: 0,
    rightElbowFlex: 0,
    leftHipPitch: 0,
    rightHipPitch: 0,
    leftHipRoll: 0,
    rightHipRoll: 0,
    leftKneeFlex: 0,
    rightKneeFlex: 0,
    leftFootPitch: 0,
    rightFootPitch: 0,
    flipRotationX: 0,
    limbStretch: 1,
    faceFrame: FACE_FRAME_OPEN,
  }
}

export function createToyFigureRuntime(
  snapshot: MotionSnapshot = createMotionSnapshot(),
  seed = 0x9e3779b9,
): ToyFigureRuntime {
  return {
    elapsed: 0,
    gaitPhase: 0,
    gaitWeight: 0,
    flipElapsed: 0,
    flipActive: false,
    flipSettleAngle: 0,
    flipSequenceSeen: snapshot.flipSequence,
    jumpSequenceSeen: snapshot.jumpSequence,
    landSequenceSeen: snapshot.landSequence,
    wasGrounded: snapshot.grounded,
    launchElapsed: Number.POSITIVE_INFINITY,
    landingElapsed: Number.POSITIVE_INFINITY,
    landingStrength: 0,
    blinkCountdown: BLINK_MIN_INTERVAL_SECONDS,
    blinkElapsed: Number.POSITIVE_INFINITY,
    glanceCountdown: GLANCE_MIN_INTERVAL_SECONDS,
    glanceElapsed: Number.POSITIVE_INFINITY,
    glanceTarget: 0,
    seed: seed >>> 0,
    headYawSpring: { value: 0, velocity: 0 },
    headPitchSpring: { value: 0, velocity: 0 },
    pose: createToyFigurePose(snapshot),
  }
}

function stepEvents(
  runtime: ToyFigureRuntime,
  snapshot: MotionSnapshot,
  delta: number,
  reducedMotion: boolean,
) {
  if (snapshot.flipSequence !== runtime.flipSequenceSeen) {
    runtime.flipSequenceSeen = snapshot.flipSequence
    if (!snapshot.grounded && !reducedMotion) {
      runtime.flipElapsed = 0
      runtime.flipActive = true
      runtime.flipSettleAngle = TAU
    }
  }

  if (reducedMotion && runtime.flipActive) {
    runtime.flipActive = false
    runtime.flipSettleAngle = runtime.pose.flipRotationX < Math.PI ? 0 : TAU
  }

  if (snapshot.jumpSequence !== runtime.jumpSequenceSeen) {
    runtime.jumpSequenceSeen = snapshot.jumpSequence
    runtime.launchElapsed = 0
  }

  const landed = snapshot.landSequence !== runtime.landSequenceSeen || (!runtime.wasGrounded && snapshot.grounded)
  if (landed) {
    runtime.landSequenceSeen = snapshot.landSequence
    runtime.landingElapsed = 0
    runtime.landingStrength = clamp01(snapshot.impact / Math.max(snapshot.maxSpeed, 1))
    runtime.launchElapsed = Number.POSITIVE_INFINITY
    if (runtime.flipActive) {
      runtime.flipActive = false
      runtime.flipSettleAngle = runtime.pose.flipRotationX < Math.PI ? 0 : TAU
    }
  }
  runtime.wasGrounded = snapshot.grounded

  if (runtime.flipActive) {
    runtime.flipElapsed += delta
    const progress = clamp01(runtime.flipElapsed / AVATAR_FLIP_DURATION_SECONDS)
    runtime.pose.flipRotationX = easeInOutSine(progress) * TAU
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
}

function stepIdleLife(runtime: ToyFigureRuntime, delta: number, idle: boolean, reducedMotion: boolean) {
  if (reducedMotion) {
    runtime.blinkElapsed = Number.POSITIVE_INFINITY
    runtime.glanceElapsed = Number.POSITIVE_INFINITY
    runtime.glanceTarget = 0
    return
  }

  runtime.blinkElapsed += delta
  runtime.blinkCountdown -= delta
  if (runtime.blinkCountdown <= 0) {
    runtime.blinkElapsed = 0
    runtime.blinkCountdown = BLINK_MIN_INTERVAL_SECONDS
      + nextRandom(runtime) * (BLINK_MAX_INTERVAL_SECONDS - BLINK_MIN_INTERVAL_SECONDS)
  }

  runtime.glanceElapsed += delta
  if (idle) {
    runtime.glanceCountdown -= delta
    if (runtime.glanceCountdown <= 0) {
      runtime.glanceElapsed = 0
      runtime.glanceTarget = (nextRandom(runtime) < 0.5 ? -1 : 1) * (0.2 + nextRandom(runtime) * 0.24)
      runtime.glanceCountdown = GLANCE_MIN_INTERVAL_SECONDS
        + nextRandom(runtime) * (GLANCE_MAX_INTERVAL_SECONDS - GLANCE_MIN_INTERVAL_SECONDS)
    }
  }
}

/** Bell curve over the glance window so the head eases out and back. */
function glanceWeight(elapsed: number) {
  if (!(elapsed >= 0) || elapsed > GLANCE_DURATION_SECONDS) return 0
  return Math.sin((elapsed / GLANCE_DURATION_SECONDS) * Math.PI)
}

/**
 * Advances one mutable runtime and returns its stable pose object. Allocation-free
 * per frame, and it never writes to the snapshot: the controller owns that.
 */
export function stepToyFigurePose(
  runtime: ToyFigureRuntime,
  snapshot: MotionSnapshot,
  frameDelta: number,
  reducedMotion = false,
): ToyFigurePose {
  const delta = clamp(Number.isFinite(frameDelta) ? frameDelta : 0, 0, AVATAR_MAX_FRAME_DELTA_SECONDS)
  runtime.elapsed += delta
  runtime.landingElapsed += delta
  runtime.launchElapsed += delta

  stepEvents(runtime, snapshot, delta, reducedMotion)

  const state = chooseAvatarMotionState(snapshot)
  const speed = Math.max(0, snapshot.horizontalSpeed)
  const speedRatio = clamp01(speed / Math.max(snapshot.maxSpeed, 0.001))
  const runBlend = clamp01((speedRatio - 0.45) / 0.55)
  const idle = state === 'idle'

  stepIdleLife(runtime, delta, idle, reducedMotion)

  const ambient = reducedMotion ? 0.22 : 1
  const gaitScale = reducedMotion ? 0.6 : 1

  if (snapshot.grounded) runtime.gaitPhase = advanceGaitPhase(runtime.gaitPhase, speed, delta)
  // Gait authority fades in with speed and out in the air, so the airborne pose
  // is never fighting a half-swung leg.
  const gaitTarget = snapshot.grounded ? clamp01((speedRatio - 0.03) / 0.3) : 0
  runtime.gaitWeight = damp(runtime.gaitWeight, gaitTarget, snapshot.grounded ? 14 : 9, delta)
  const gaitWeight = runtime.gaitWeight * gaitScale

  const strideAmplitude = gaitWeight * (0.34 + runBlend * 0.38)
  const armAmplitude = gaitWeight * (0.3 + runBlend * 0.5)
  const kneeAmplitude = gaitWeight * (0.5 + runBlend * 0.72)

  const phase = runtime.gaitPhase
  const oppositePhase = phase + Math.PI

  let leftHipPitch = gaitHipPitch(phase, strideAmplitude)
  let rightHipPitch = gaitHipPitch(oppositePhase, strideAmplitude)
  let leftKneeFlex = gaitKneeFlex(phase, kneeAmplitude)
  let rightKneeFlex = gaitKneeFlex(oppositePhase, kneeAmplitude)
  let leftFootPitch = gaitFootPitch(leftHipPitch, leftKneeFlex, phase, gaitWeight * 0.5)
  let rightFootPitch = gaitFootPitch(rightHipPitch, rightKneeFlex, oppositePhase, gaitWeight * 0.5)
  let leftShoulderPitch = gaitArmPitch(phase, armAmplitude)
  let rightShoulderPitch = gaitArmPitch(oppositePhase, armAmplitude)
  let leftShoulderRoll = -(0.12 + runBlend * 0.16 * gaitWeight)
  let rightShoulderRoll = 0.12 + runBlend * 0.16 * gaitWeight
  let leftElbowFlex = 0.14 + gaitWeight * (0.24 + runBlend * 0.7) * Math.max(0, -Math.sin(phase))
    + runBlend * gaitWeight * 0.45
  let rightElbowFlex = 0.14 + gaitWeight * (0.24 + runBlend * 0.7) * Math.max(0, -Math.sin(oppositePhase))
    + runBlend * gaitWeight * 0.45
  let hipRoll = 0

  const launch = jumpLaunchSignal(runtime.launchElapsed)

  if (!snapshot.grounded) {
    const rise = riseWeight(snapshot.verticalVelocity)
    const fall = fallWeight(snapshot.verticalVelocity)
    const tuck = apexWeight(snapshot.verticalVelocity)
    // Arms reach overhead on the way up and open into a V rather than folding
    // across the face, then drop wide for balance on the way down.
    const airArmPitch = -0.42 - rise * 1.35 + fall * 0.1
    const airArmRoll = 0.24 + rise * 0.5 + fall * 0.62 + tuck * 0.18
    // One leg leads and one trails on the way up, both tuck at the apex, and
    // both reach for the ground once the figure is falling.
    leftHipPitch = -0.1 - rise * 0.3 - tuck * 0.52 + fall * 0.26
    rightHipPitch = 0.06 + rise * 0.22 - tuck * 0.36 - fall * 0.22
    leftKneeFlex = 0.28 + rise * 0.35 + tuck * 1.15 - fall * 0.18
    rightKneeFlex = 0.16 + rise * 0.12 + tuck * 0.88 - fall * 0.1
    leftFootPitch = 0.2 + tuck * 0.3
    rightFootPitch = 0.12 + tuck * 0.24
    leftShoulderPitch = airArmPitch
    rightShoulderPitch = airArmPitch * 0.86
    leftShoulderRoll = -airArmRoll
    rightShoulderRoll = airArmRoll
    leftElbowFlex = 0.5 + fall * 0.28 + tuck * 0.16
    rightElbowFlex = 0.58 + fall * 0.16 + tuck * 0.2
  }

  if (launch !== 0) {
    // Crouch (launch < 0) folds the knees; extension (launch > 0) snaps them straight.
    const crouch = Math.max(0, -launch)
    const extend = Math.max(0, launch)
    leftKneeFlex = leftKneeFlex * (1 - extend * 0.7) + crouch * 1.05
    rightKneeFlex = rightKneeFlex * (1 - extend * 0.7) + crouch * 1.05
    leftHipPitch += crouch * 0.24
    rightHipPitch += crouch * 0.24
    leftShoulderPitch -= extend * 0.55
    rightShoulderPitch -= extend * 0.55
  }

  const squash = landingSquash(runtime.landingElapsed, runtime.landingStrength)
  const landingBend = Math.max(0, squash)
  if (landingBend > 0) {
    leftKneeFlex += landingBend * 1.15
    rightKneeFlex += landingBend * 1.15
    leftHipPitch -= landingBend * 0.3
    rightHipPitch -= landingBend * 0.3
    leftShoulderRoll -= landingBend * 0.55
    rightShoulderRoll += landingBend * 0.55
    leftShoulderPitch += landingBend * 0.3
    rightShoulderPitch += landingBend * 0.3
    // Feet splay outward to absorb, which reads as weight far better than a
    // straight-down compression.
    hipRoll = landingBend * 0.2
  }

  const breathe = idle ? Math.sin(runtime.elapsed * 1.7) : 0
  const sway = idle ? Math.sin(runtime.elapsed * 0.9) : 0
  const bob = gaitBob(phase, gaitWeight * (0.026 + runBlend * 0.03) * (reducedMotion ? 0.25 : 1))

  const blinking = runtime.blinkElapsed < BLINK_DURATION_SECONDS
  const glance = glanceWeight(runtime.glanceElapsed) * runtime.glanceTarget * (idle ? 1 : 0)

  const turn = clamp(snapshot.turnSignal, -1, 1)
  const acceleration = clamp(snapshot.acceleration, -1, 1)

  let targetBodyPitch = acceleration * 0.14 * ambient + speedRatio * speedRatio * 0.15 * gaitScale
  if (state === 'rise') targetBodyPitch -= 0.1
  else if (state === 'fall') targetBodyPitch += 0.12
  targetBodyPitch -= landingBend * 0.24

  const chestYawTarget = -Math.sin(phase) * gaitWeight * 0.2
  const pelvisYawTarget = Math.sin(phase) * gaitWeight * 0.13
  const pelvisRollTarget = Math.sin(phase) * gaitWeight * 0.07

  const pose = runtime.pose
  pose.state = state
  pose.facingYaw = dampAngle(pose.facingYaw, snapshot.facingYaw, 15, delta)
  pose.rootY = damp(pose.rootY, bob + breathe * 0.01 * ambient - squash * 0.1, 20, delta)
  pose.rootScaleY = damp(pose.rootScaleY, 1 - squash * 0.3 + launch * 0.1 + breathe * 0.012 * ambient, 26, delta)
  pose.rootScaleXZ = damp(pose.rootScaleXZ, 1 + squash * 0.2 - launch * 0.07 - breathe * 0.006 * ambient, 26, delta)
  pose.bodyPitch = damp(pose.bodyPitch, targetBodyPitch, 12, delta)
  pose.bodyRoll = damp(pose.bodyRoll, -turn * 0.13 * ambient, 11, delta)
  pose.pelvisYaw = damp(pose.pelvisYaw, pelvisYawTarget, 16, delta)
  pose.pelvisRoll = damp(pose.pelvisRoll, pelvisRollTarget, 16, delta)
  pose.chestYaw = damp(pose.chestYaw, chestYawTarget, 16, delta)
  pose.chestPitch = damp(pose.chestPitch, -targetBodyPitch * 0.35 + breathe * 0.02 * ambient, 10, delta)
  pose.chestRoll = damp(pose.chestRoll, -turn * 0.06 * ambient + sway * 0.012 * ambient, 9, delta)

  // Head counter-rotates the chest so the gaze stays level, then leads into turns.
  const headYawTarget = -pose.chestYaw * 0.65 + turn * 0.34 * ambient + glance * ambient
  const headPitchTarget = -pose.bodyPitch * 0.55
    + (state === 'fall' ? 0.1 : 0)
    + (state === 'rise' ? -0.08 : 0)
    + landingBend * 0.22
  pose.headYaw = stepSpring(runtime.headYawSpring, headYawTarget, 118, 15, delta)
  pose.headPitch = stepSpring(runtime.headPitchSpring, headPitchTarget, 108, 14, delta)
  pose.headRoll = damp(pose.headRoll, (idle ? sway * 0.05 : -turn * 0.07) * ambient, 8, delta)

  pose.leftShoulderPitch = damp(pose.leftShoulderPitch, leftShoulderPitch, 15, delta)
  pose.rightShoulderPitch = damp(pose.rightShoulderPitch, rightShoulderPitch, 15, delta)
  pose.leftShoulderRoll = damp(pose.leftShoulderRoll, leftShoulderRoll, 13, delta)
  pose.rightShoulderRoll = damp(pose.rightShoulderRoll, rightShoulderRoll, 13, delta)
  // Elbows trail the shoulders on purpose; the lag is the follow-through.
  pose.leftElbowFlex = damp(pose.leftElbowFlex, leftElbowFlex, 10, delta)
  pose.rightElbowFlex = damp(pose.rightElbowFlex, rightElbowFlex, 10, delta)
  pose.leftHipPitch = damp(pose.leftHipPitch, leftHipPitch, 17, delta)
  pose.rightHipPitch = damp(pose.rightHipPitch, rightHipPitch, 17, delta)
  pose.leftHipRoll = damp(pose.leftHipRoll, -hipRoll, 12, delta)
  pose.rightHipRoll = damp(pose.rightHipRoll, hipRoll, 12, delta)
  pose.leftKneeFlex = Math.max(0, damp(pose.leftKneeFlex, leftKneeFlex, 18, delta))
  pose.rightKneeFlex = Math.max(0, damp(pose.rightKneeFlex, rightKneeFlex, 18, delta))
  pose.leftFootPitch = damp(pose.leftFootPitch, leftFootPitch, 16, delta)
  pose.rightFootPitch = damp(pose.rightFootPitch, rightFootPitch, 16, delta)
  pose.limbStretch = damp(pose.limbStretch, 1 + launch * 0.07 - squash * 0.12, 22, delta)
  pose.faceFrame = chooseFaceFrame({
    state,
    speedRatio,
    verticalVelocity: snapshot.verticalVelocity,
    blinking,
    landingElapsed: runtime.landingElapsed,
    landingStrength: runtime.landingStrength,
  })
  return pose
}
