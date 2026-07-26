import type { AvatarMotionState, MotionSnapshot } from './avatarMotion'
import { CHARACTER_RUN_SPEED } from './characterController'

export const HERO_MAX_FRAME_DELTA_SECONDS = 0.05
export const HERO_FLIP_DURATION_SECONDS = 0.58

/**
 * Locomotion blends normalize against the fastest speed the controller can ever
 * request, not against the snapshot's *current* maxSpeed. maxSpeed drops to the
 * walk cap whenever run is released, so a plain ratio would report 1.0 for both
 * a full walk and a full sprint and the Run clip would play while walking.
 */
export const HERO_LOCOMOTION_REFERENCE_SPEED = CHARACTER_RUN_SPEED

/** Ratio window over which Idle hands off to Walk. */
export const HERO_IDLE_BAND: readonly [number, number] = [0.02, 0.14]
/** Ratio window over which Walk hands off to Run. Sits above the walk cap ratio. */
export const HERO_RUN_BAND: readonly [number, number] = [0.7, 0.99]
/** Vertical velocity window over which the launch pose hands off to the fall pose. */
export const HERO_AIR_BAND: readonly [number, number] = [-0.8, 1.6]

export const HERO_LOCOMOTION_MIN_RATE = 0.55
export const HERO_LOCOMOTION_RATE_GAIN = 1.55
export const HERO_LOCOMOTION_MAX_RATE = 2.1

/** Seconds into the Jump clip to start from, skipping its crouch anticipation. */
export const HERO_JUMP_CLIP_START_SECONDS = 0.17
/** Seconds into the Jump clip that holds the tucked airborne pose. */
export const HERO_FALL_POSE_SECONDS = 0.33

export const HERO_LAND_PULSE_SECONDS = 0.34
export const HERO_TAKEOFF_PULSE_SECONDS = 0.2
export const HERO_IDLE_FLOURISH_DELAY_SECONDS = 9

export const HERO_EMOTE_ORDER = ['wave', 'thumbsUp', 'dance'] as const

export type HeroEmoteKey = (typeof HERO_EMOTE_ORDER)[number]
export type HeroClipKey = 'idle' | 'walk' | 'run' | 'jump' | 'fall'
export type HeroClipWeights = Record<HeroClipKey, number>

const HERO_CLIP_KEYS: readonly HeroClipKey[] = ['idle', 'walk', 'run', 'jump', 'fall']

/** Ground clips crossfade lazily; the air handoff has to be snappy or takeoff mushes. */
const HERO_BLEND_RESPONSE: HeroClipWeights = { idle: 10, walk: 10, run: 10, jump: 16, fall: 16 }

/** Below this a clip contributes nothing visible, so it is released entirely. */
export const HERO_WEIGHT_EPSILON = 0.002

export type HeroAnimationOptions = {
  referenceSpeed: number
  idleFlourishDelay: number
  emoteDurations: Record<HeroEmoteKey, number>
}

/** Clip lengths shipped in the vendored hero model; overridable from measured clips. */
export const HERO_DEFAULT_OPTIONS: HeroAnimationOptions = {
  referenceSpeed: HERO_LOCOMOTION_REFERENCE_SPEED,
  idleFlourishDelay: HERO_IDLE_FLOURISH_DELAY_SECONDS,
  emoteDurations: { wave: 1.83, thumbsUp: 1.58, dance: 3.33 },
}

export type HeroPose = {
  state: AvatarMotionState
  /** Effective mixer weights, already epsilon-snapped. */
  weights: HeroClipWeights
  /** Shared playback rate for the Walk and Run clips so their phases stay locked. */
  locomotionTimeScale: number
  facingYaw: number
  leanPitch: number
  leanRoll: number
  flipRotationX: number
  squashY: number
  squashXZ: number
  /** 1 while planted, 0 while airborne — drives the cheap blob shadow. */
  groundContact: number
  /** Increments when the one-shot launch clip should be restarted. */
  jumpRestartSequence: number
  /** Seconds since the last landing; drives the dust ring. */
  landingElapsed: number
  landingStrength: number
  emote: HeroEmoteKey | null
  emoteWeight: number
  /** Increments when a new idle flourish begins. */
  emoteRestartSequence: number
}

export type HeroAnimationRuntime = {
  options: HeroAnimationOptions
  elapsed: number
  targets: HeroClipWeights
  flipElapsed: number
  flipActive: boolean
  flipSettleAngle: number
  flipSequenceSeen: number
  jumpSequenceSeen: number
  landSequenceSeen: number
  wasGrounded: boolean
  landingElapsed: number
  landingStrength: number
  takeoffElapsed: number
  takeoffStrength: number
  idleElapsed: number
  emoteIndex: number
  emoteKey: HeroEmoteKey
  emoteElapsed: number
  emoteDuration: number
  emoteActive: boolean
  pose: HeroPose
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

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * Fraction of the controller's top speed, stable across the walk/run cap swap.
 */
export function heroSpeedRatio(snapshot: MotionSnapshot, referenceSpeed = HERO_LOCOMOTION_REFERENCE_SPEED) {
  const reference = Math.max(snapshot.maxSpeed, referenceSpeed, 0.001)
  return clamp(snapshot.horizontalSpeed / reference, 0, 1)
}

export function chooseHeroMotionState(
  snapshot: MotionSnapshot,
  referenceSpeed = HERO_LOCOMOTION_REFERENCE_SPEED,
): AvatarMotionState {
  if (!snapshot.grounded) return snapshot.verticalVelocity > 0.15 ? 'rise' : 'fall'
  const ratio = heroSpeedRatio(snapshot, referenceSpeed)
  if (ratio >= HERO_RUN_BAND[0]) return 'run'
  if (ratio > HERO_IDLE_BAND[0]) return 'walk'
  return 'idle'
}

/**
 * Steady-state clip weights for a snapshot, before any temporal smoothing.
 * Always sums to 1, so no clip can be starved during a blend.
 */
export function heroClipTargets(
  snapshot: MotionSnapshot,
  out: HeroClipWeights,
  options: HeroAnimationOptions = HERO_DEFAULT_OPTIONS,
  flipping = false,
): HeroClipWeights {
  if (snapshot.grounded) {
    const ratio = heroSpeedRatio(snapshot, options.referenceSpeed)
    const moving = smoothstep(HERO_IDLE_BAND[0], HERO_IDLE_BAND[1], ratio)
    const running = smoothstep(HERO_RUN_BAND[0], HERO_RUN_BAND[1], ratio)
    out.idle = 1 - moving
    out.walk = moving * (1 - running)
    out.run = moving * running
    out.jump = 0
    out.fall = 0
    return out
  }
  // A double-jump flip stays tucked in the launch pose so the spin reads cleanly.
  const falling = flipping
    ? 0
    : 1 - smoothstep(HERO_AIR_BAND[0], HERO_AIR_BAND[1], snapshot.verticalVelocity)
  out.idle = 0
  out.walk = 0
  out.run = 0
  out.jump = 1 - falling
  out.fall = falling
  return out
}

export function heroLocomotionTimeScale(ratio: number) {
  return clamp(
    HERO_LOCOMOTION_MIN_RATE + ratio * HERO_LOCOMOTION_RATE_GAIN,
    HERO_LOCOMOTION_MIN_RATE,
    HERO_LOCOMOTION_MAX_RATE,
  )
}

export function createHeroAnimationRuntime(
  snapshot: MotionSnapshot,
  options: Partial<HeroAnimationOptions> = {},
): HeroAnimationRuntime {
  const resolved: HeroAnimationOptions = {
    ...HERO_DEFAULT_OPTIONS,
    ...options,
    emoteDurations: { ...HERO_DEFAULT_OPTIONS.emoteDurations, ...options.emoteDurations },
  }
  const weights: HeroClipWeights = { idle: 0, walk: 0, run: 0, jump: 0, fall: 0 }
  const targets: HeroClipWeights = { idle: 0, walk: 0, run: 0, jump: 0, fall: 0 }
  heroClipTargets(snapshot, targets, resolved)
  for (const key of HERO_CLIP_KEYS) weights[key] = targets[key]
  return {
    options: resolved,
    elapsed: 0,
    targets,
    flipElapsed: 0,
    flipActive: false,
    flipSettleAngle: 0,
    flipSequenceSeen: snapshot.flipSequence,
    jumpSequenceSeen: snapshot.jumpSequence,
    landSequenceSeen: snapshot.landSequence,
    wasGrounded: snapshot.grounded,
    landingElapsed: Number.POSITIVE_INFINITY,
    landingStrength: 0,
    takeoffElapsed: Number.POSITIVE_INFINITY,
    takeoffStrength: 0,
    idleElapsed: 0,
    emoteIndex: 0,
    emoteKey: HERO_EMOTE_ORDER[0],
    emoteElapsed: 0,
    emoteDuration: 0,
    emoteActive: false,
    pose: {
      state: chooseHeroMotionState(snapshot, resolved.referenceSpeed),
      weights,
      locomotionTimeScale: heroLocomotionTimeScale(heroSpeedRatio(snapshot, resolved.referenceSpeed)),
      facingYaw: snapshot.facingYaw,
      leanPitch: 0,
      leanRoll: 0,
      flipRotationX: 0,
      squashY: 1,
      squashXZ: 1,
      groundContact: snapshot.grounded ? 1 : 0,
      jumpRestartSequence: 0,
      landingElapsed: Number.POSITIVE_INFINITY,
      landingStrength: 0,
      emote: null,
      emoteWeight: 0,
      emoteRestartSequence: 0,
    },
  }
}

/**
 * Advances one mutable hero runtime and returns its stable pose object.
 * Purely derived from the controller's MotionSnapshot — it never writes physics
 * state, and the flip rotation exists only here so it cannot reach the body.
 */
export function stepHeroAnimation(
  runtime: HeroAnimationRuntime,
  snapshot: MotionSnapshot,
  frameDelta: number,
  reducedMotion = false,
): HeroPose {
  const delta = clamp(Number.isFinite(frameDelta) ? frameDelta : 0, 0, HERO_MAX_FRAME_DELTA_SECONDS)
  const pose = runtime.pose
  const options = runtime.options
  runtime.elapsed += delta
  runtime.landingElapsed += delta
  runtime.takeoffElapsed += delta

  if (snapshot.jumpSequence !== runtime.jumpSequenceSeen) {
    runtime.jumpSequenceSeen = snapshot.jumpSequence
    runtime.takeoffElapsed = 0
    runtime.takeoffStrength = 1
    runtime.emoteActive = false
    runtime.idleElapsed = 0
    pose.jumpRestartSequence += 1
  }

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
    runtime.flipSettleAngle = pose.flipRotationX < Math.PI ? 0 : FULL_TURN
  }

  const landed = snapshot.landSequence !== runtime.landSequenceSeen || (!runtime.wasGrounded && snapshot.grounded)
  if (landed) {
    runtime.landSequenceSeen = snapshot.landSequence
    runtime.landingElapsed = 0
    runtime.landingStrength = clamp(snapshot.impact / Math.max(snapshot.maxSpeed, 1), 0, 1)
    if (runtime.flipActive) {
      runtime.flipActive = false
      runtime.flipSettleAngle = pose.flipRotationX < Math.PI ? 0 : FULL_TURN
    }
  }
  runtime.wasGrounded = snapshot.grounded

  const ratio = heroSpeedRatio(snapshot, options.referenceSpeed)
  const state = chooseHeroMotionState(snapshot, options.referenceSpeed)
  heroClipTargets(snapshot, runtime.targets, options, runtime.flipActive)

  const still = snapshot.grounded && ratio <= HERO_IDLE_BAND[0]
  if (still && !reducedMotion) runtime.idleElapsed += delta
  else runtime.idleElapsed = 0

  if (runtime.emoteActive) {
    runtime.emoteElapsed += delta
    if (!still || reducedMotion || runtime.emoteElapsed >= runtime.emoteDuration) runtime.emoteActive = false
  } else if (still && !reducedMotion && runtime.idleElapsed >= options.idleFlourishDelay) {
    runtime.emoteKey = HERO_EMOTE_ORDER[runtime.emoteIndex % HERO_EMOTE_ORDER.length]
    runtime.emoteIndex += 1
    runtime.emoteActive = true
    runtime.emoteElapsed = 0
    runtime.emoteDuration = options.emoteDurations[runtime.emoteKey]
    runtime.idleElapsed = 0
    pose.emoteRestartSequence += 1
  }

  const emoteTarget = runtime.emoteActive
    ? clamp(
      Math.min(runtime.emoteElapsed / 0.22, (runtime.emoteDuration - runtime.emoteElapsed) / 0.3),
      0,
      1,
    )
    : 0
  pose.emoteWeight = damp(pose.emoteWeight, emoteTarget, 14, delta)
  if (pose.emoteWeight < HERO_WEIGHT_EPSILON) pose.emoteWeight = 0
  pose.emote = pose.emoteWeight > 0 ? runtime.emoteKey : null

  const weights = pose.weights
  for (const key of HERO_CLIP_KEYS) {
    const next = damp(weights[key], runtime.targets[key], HERO_BLEND_RESPONSE[key], delta)
    weights[key] = next < HERO_WEIGHT_EPSILON ? 0 : clamp(next, 0, 1)
  }
  // The flourish owns the upper body, so the idle base gets out of its way.
  weights.idle *= 1 - pose.emoteWeight
  if (weights.idle < HERO_WEIGHT_EPSILON) weights.idle = 0

  const decoration = reducedMotion ? 0.25 : 1
  const landingWave = runtime.landingElapsed < HERO_LAND_PULSE_SECONDS
    ? Math.exp(-runtime.landingElapsed * 9)
      * Math.max(0, Math.cos(runtime.landingElapsed * 20))
      * runtime.landingStrength
    : 0
  const takeoffWave = runtime.takeoffElapsed < HERO_TAKEOFF_PULSE_SECONDS
    ? Math.exp(-runtime.takeoffElapsed * 11) * runtime.takeoffStrength
    : 0

  let targetPitch = clamp(snapshot.acceleration, -1, 1) * 0.13
  if (state === 'rise') targetPitch -= 0.07
  else if (state === 'fall') targetPitch += 0.09

  if (runtime.flipActive) {
    runtime.flipElapsed += delta
    const progress = clamp(runtime.flipElapsed / HERO_FLIP_DURATION_SECONDS, 0, 1)
    pose.flipRotationX = easeInOutSine(progress) * FULL_TURN
    if (progress >= 1) {
      runtime.flipActive = false
      pose.flipRotationX = 0
      runtime.flipSettleAngle = 0
    }
  } else if (pose.flipRotationX !== 0) {
    pose.flipRotationX = damp(pose.flipRotationX, runtime.flipSettleAngle, 18, delta)
    if (Math.abs(pose.flipRotationX - runtime.flipSettleAngle) < 0.015) {
      pose.flipRotationX = 0
      runtime.flipSettleAngle = 0
    }
  }

  pose.state = state
  pose.locomotionTimeScale = heroLocomotionTimeScale(ratio)
  pose.facingYaw = dampAngle(pose.facingYaw, snapshot.facingYaw, 15, delta)
  pose.leanPitch = damp(pose.leanPitch, targetPitch * decoration, 12, delta)
  pose.leanRoll = damp(pose.leanRoll, -clamp(snapshot.turnSignal, -1, 1) * 0.12 * decoration, 12, delta)
  pose.squashY = damp(pose.squashY, 1 + (takeoffWave * 0.13 - landingWave * 0.17) * decoration, 26, delta)
  pose.squashXZ = damp(pose.squashXZ, 1 + (landingWave * 0.11 - takeoffWave * 0.08) * decoration, 26, delta)
  pose.groundContact = damp(pose.groundContact, snapshot.grounded ? 1 : 0, 14, delta)
  pose.landingElapsed = runtime.landingElapsed
  pose.landingStrength = runtime.landingStrength
  return pose
}
