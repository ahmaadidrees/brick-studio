import { describe, expect, it } from 'vitest'
import { AVATAR_FLIP_DURATION_SECONDS, AVATAR_MAX_FRAME_DELTA_SECONDS, createMotionSnapshot } from './avatarMotion'
import {
  BLINK_DURATION_SECONDS,
  BLINK_MAX_INTERVAL_SECONDS,
  FACE_ATLAS_COLUMNS,
  FACE_FRAME_BLINK,
  FACE_FRAME_GASP,
  FACE_FRAME_GRIN,
  FACE_FRAME_OPEN,
  LANDING_DURATION_SECONDS,
  TAU,
  advanceGaitPhase,
  apexWeight,
  chooseFaceFrame,
  createToyFigureRuntime,
  fallWeight,
  riseWeight,
  faceFrameOffsetX,
  faceFrameOffsetY,
  gaitArmPitch,
  gaitBob,
  gaitCycleDistance,
  gaitFootPitch,
  gaitHipPitch,
  gaitKneeFlex,
  jumpLaunchSignal,
  landingSquash,
  stepSpring,
  stepToyFigurePose,
  wrapPhase,
  type ToyFigureRuntime,
} from './avatarPose'
import type { MotionSnapshot } from './avatarMotion'

const STEP = 1 / 120

function advance(seconds: number, runtime: ToyFigureRuntime, snapshot: MotionSnapshot, reducedMotion = false) {
  for (let elapsed = 0; elapsed < seconds; elapsed += STEP) {
    stepToyFigurePose(runtime, snapshot, STEP, reducedMotion)
  }
  // The runtime intentionally reuses one pose object, so callers that compare two
  // moments in time need a copy rather than the live reference.
  return { ...runtime.pose }
}

function walking(overrides: Partial<MotionSnapshot> = {}) {
  return createMotionSnapshot({ horizontalSpeed: 3.5, maxSpeed: 3.5, ...overrides })
}

describe('gait cycle math', () => {
  it('advances the cycle by distance travelled, not by wall-clock time', () => {
    const halfCycle = gaitCycleDistance(2) / 2
    const slow = advanceGaitPhase(0, 2, halfCycle / 2)
    const fast = advanceGaitPhase(0, 2, halfCycle / 2)
    expect(slow).toBeCloseTo(fast)
    expect(slow).toBeCloseTo(Math.PI)
  })

  it('freezes the cycle when the figure is not moving', () => {
    expect(advanceGaitPhase(1.2, 0, 1)).toBe(1.2)
  })

  it('lengthens the stride with speed so cadence grows slower than speed', () => {
    const walkCadence = advanceGaitPhase(0, 3.5, 0.05) / TAU
    const runCadence = advanceGaitPhase(0, 5.4, 0.05) / TAU
    expect(runCadence).toBeGreaterThan(walkCadence)
    expect(runCadence / walkCadence).toBeLessThan(5.4 / 3.5)
  })

  it('keeps the phase wrapped into a single turn', () => {
    expect(wrapPhase(TAU + 0.5)).toBeCloseTo(0.5)
    expect(wrapPhase(-0.25)).toBeCloseTo(TAU - 0.25)
    expect(advanceGaitPhase(TAU - 0.01, 40, 1)).toBeLessThan(TAU)
  })

  it('swings the arms exactly out of phase with the same-side leg', () => {
    for (const phase of [0.3, 1.1, 2.7, 4.9]) {
      expect(gaitArmPitch(phase, 0.5)).toBeCloseTo(-gaitHipPitch(phase, 0.5))
    }
  })

  it('puts the leg fully forward a quarter cycle in and fully back three quarters in', () => {
    expect(gaitHipPitch(Math.PI / 2, 0.4)).toBeCloseTo(-0.4)
    expect(gaitHipPitch((3 * Math.PI) / 2, 0.4)).toBeCloseTo(0.4)
  })

  it('never bends a knee the wrong way and peaks the lift at mid-swing', () => {
    let peakPhase = 0
    let peak = -1
    for (let phase = 0; phase < TAU; phase += TAU / 720) {
      const flex = gaitKneeFlex(phase, 0.9)
      expect(flex).toBeGreaterThanOrEqual(0)
      if (flex > peak) {
        peak = flex
        peakPhase = phase
      }
    }
    expect(Math.min(peakPhase, TAU - peakPhase)).toBeLessThan(0.2)
  })

  it('counter-rotates the ankle so the foot does not follow the whole leg chain', () => {
    const hip = gaitHipPitch(1.2, 0.4)
    const knee = gaitKneeFlex(1.2, 0.8)
    const foot = gaitFootPitch(hip, knee, 1.2, 0)
    expect(Math.sign(foot)).toBe(-Math.sign(hip + knee))
    expect(Math.abs(foot)).toBeLessThan(Math.abs(hip + knee))
  })

  it('bobs twice per cycle, lowest at foot contact', () => {
    expect(gaitBob(0, 0.03)).toBeCloseTo(-0.03)
    expect(gaitBob(Math.PI / 2, 0.03)).toBeCloseTo(0.03)
    expect(gaitBob(Math.PI, 0.03)).toBeCloseTo(-0.03)
  })
})

describe('impact and jump curves', () => {
  it('squashes hardest on contact then overshoots into a stretch before settling', () => {
    expect(landingSquash(0, 1)).toBeCloseTo(1)
    expect(landingSquash(LANDING_DURATION_SECONDS * 0.2, 1)).toBeGreaterThan(0)
    expect(landingSquash(LANDING_DURATION_SECONDS * 0.6, 1)).toBeLessThan(0)
    expect(landingSquash(LANDING_DURATION_SECONDS + 0.01, 1)).toBe(0)
    expect(landingSquash(Number.POSITIVE_INFINITY, 1)).toBe(0)
  })

  it('scales the whole landing curve by impact strength', () => {
    expect(landingSquash(0.05, 0.5)).toBeCloseTo(landingSquash(0.05, 1) * 0.5)
  })

  it('runs anticipation before extension and settles back to neutral', () => {
    expect(jumpLaunchSignal(0)).toBe(0)
    expect(jumpLaunchSignal(0.03)).toBeLessThan(0)
    expect(jumpLaunchSignal(0.05)).toBeCloseTo(-1)
    expect(jumpLaunchSignal(0.18)).toBeCloseTo(1)
    expect(jumpLaunchSignal(0.34)).toBeCloseTo(0)
    expect(jumpLaunchSignal(1)).toBe(0)
    expect(jumpLaunchSignal(Number.POSITIVE_INFINITY)).toBe(0)
  })

  it('peaks the airborne tuck when vertical speed crosses zero', () => {
    expect(apexWeight(0)).toBe(1)
    expect(apexWeight(1.3)).toBeCloseTo(0.5)
    expect(apexWeight(-1.3)).toBeCloseTo(0.5)
    expect(apexWeight(-9)).toBe(0)
  })

  it('blends rise and fall continuously so the apex never snaps', () => {
    expect(riseWeight(5)).toBe(1)
    expect(riseWeight(0)).toBe(0)
    expect(riseWeight(-5)).toBe(0)
    expect(fallWeight(5)).toBe(0)
    expect(fallWeight(0)).toBe(0)
    expect(fallWeight(-9)).toBe(1)
    // No vertical velocity produces both a rise and a fall contribution at once.
    for (let vy = -6; vy <= 6; vy += 0.1) {
      expect(Math.min(riseWeight(vy), fallWeight(vy))).toBe(0)
    }
  })
})

describe('follow-through spring', () => {
  it('overshoots the target before settling, unlike an exponential damp', () => {
    const spring = { value: 0, velocity: 0 }
    let overshot = false
    for (let step = 0; step < 200; step += 1) {
      const value = stepSpring(spring, 1, 118, 15, 1 / 120)
      if (value > 1.001) overshot = true
    }
    expect(overshot).toBe(true)
    expect(spring.value).toBeCloseTo(1, 2)
  })

  it('stays stable at the largest frame delta the avatar ever sees', () => {
    const spring = { value: 0, velocity: 0 }
    for (let step = 0; step < 400; step += 1) {
      stepSpring(spring, 1, 118, 15, AVATAR_MAX_FRAME_DELTA_SECONDS)
    }
    expect(Number.isFinite(spring.value)).toBe(true)
    expect(spring.value).toBeCloseTo(1, 1)
  })
})

describe('face atlas', () => {
  it('maps the 2x2 atlas row-major from the top-left frame', () => {
    expect([faceFrameOffsetX(FACE_FRAME_OPEN), faceFrameOffsetY(FACE_FRAME_OPEN)]).toEqual([0, 0.5])
    expect([faceFrameOffsetX(FACE_FRAME_BLINK), faceFrameOffsetY(FACE_FRAME_BLINK)]).toEqual([0.5, 0.5])
    expect([faceFrameOffsetX(FACE_FRAME_GRIN), faceFrameOffsetY(FACE_FRAME_GRIN)]).toEqual([0, 0])
    expect([faceFrameOffsetX(FACE_FRAME_GASP), faceFrameOffsetY(FACE_FRAME_GASP)]).toEqual([0.5, 0])
    expect(FACE_ATLAS_COLUMNS).toBe(2)
  })

  it('lets gameplay expressions outrank the ambient blink', () => {
    const base = { speedRatio: 0, verticalVelocity: 0, landingElapsed: 99, landingStrength: 0, blinking: false }
    expect(chooseFaceFrame({ ...base, state: 'idle', blinking: false })).toBe(FACE_FRAME_OPEN)
    expect(chooseFaceFrame({ ...base, state: 'idle', blinking: true })).toBe(FACE_FRAME_BLINK)
    expect(chooseFaceFrame({ ...base, state: 'run', blinking: true })).toBe(FACE_FRAME_GRIN)
    expect(chooseFaceFrame({ ...base, state: 'rise', blinking: true })).toBe(FACE_FRAME_GRIN)
    expect(chooseFaceFrame({ ...base, state: 'fall', verticalVelocity: -6, blinking: false })).toBe(FACE_FRAME_GASP)
    expect(chooseFaceFrame({ ...base, state: 'idle', landingElapsed: 0.05, landingStrength: 0.9 })).toBe(FACE_FRAME_GASP)
    expect(chooseFaceFrame({ ...base, state: 'idle', landingElapsed: 0.05, landingStrength: 0.1 })).toBe(FACE_FRAME_BLINK)
  })
})

describe('toy figure pose stepping', () => {
  it('reuses one pose object and never writes back to the snapshot', () => {
    const snapshot = walking()
    const before = { ...snapshot }
    const runtime = createToyFigureRuntime(snapshot)
    const first = stepToyFigurePose(runtime, snapshot, 1 / 60)
    const second = stepToyFigurePose(runtime, snapshot, 1 / 60)
    expect(second).toBe(first)
    expect(snapshot).toEqual(before)
  })

  it('caps a resumed frame so a backgrounded tab cannot teleport the gait', () => {
    const runtime = createToyFigureRuntime()
    stepToyFigurePose(runtime, createMotionSnapshot(), 10)
    expect(runtime.elapsed).toBe(AVATAR_MAX_FRAME_DELTA_SECONDS)
    stepToyFigurePose(runtime, createMotionSnapshot(), Number.NaN)
    expect(runtime.elapsed).toBe(AVATAR_MAX_FRAME_DELTA_SECONDS)
  })

  it('keeps opposing limbs in a real contralateral gait while walking', () => {
    const snapshot = walking()
    const runtime = createToyFigureRuntime(snapshot)
    const pose = advance(2, runtime, snapshot)
    expect(pose.state).toBe('run')
    expect(Math.sign(pose.leftHipPitch)).toBe(-Math.sign(pose.rightHipPitch))
    expect(Math.sign(pose.leftShoulderPitch)).toBe(-Math.sign(pose.leftHipPitch))
    expect(Math.abs(pose.leftHipPitch)).toBeGreaterThan(0.05)
    expect(pose.leftKneeFlex).toBeGreaterThanOrEqual(0)
    expect(pose.rightKneeFlex).toBeGreaterThanOrEqual(0)
  })

  it('swings wider at run speed than at a stroll', () => {
    const strollSnapshot = createMotionSnapshot({ horizontalSpeed: 0.9, maxSpeed: 3.5 })
    const runSnapshot = createMotionSnapshot({ horizontalSpeed: 5.4, maxSpeed: 5.4 })
    let strollPeak = 0
    let runPeak = 0
    const stroll = createToyFigureRuntime(strollSnapshot)
    const run = createToyFigureRuntime(runSnapshot)
    for (let step = 0; step < 600; step += 1) {
      strollPeak = Math.max(strollPeak, Math.abs(stepToyFigurePose(stroll, strollSnapshot, STEP).leftHipPitch))
      runPeak = Math.max(runPeak, Math.abs(stepToyFigurePose(run, runSnapshot, STEP).leftHipPitch))
    }
    expect(runPeak).toBeGreaterThan(strollPeak * 1.5)
  })

  it('settles the legs back to neutral after the figure stops', () => {
    const snapshot = walking()
    const runtime = createToyFigureRuntime(snapshot)
    advance(1.5, runtime, snapshot)
    snapshot.horizontalSpeed = 0
    const pose = advance(1.5, runtime, snapshot)
    expect(pose.state).toBe('idle')
    expect(Math.abs(pose.leftHipPitch)).toBeLessThan(0.02)
    expect(Math.abs(pose.rightHipPitch)).toBeLessThan(0.02)
    expect(pose.leftKneeFlex).toBeLessThan(0.05)
  })

  it('leans into acceleration and looks toward the turn', () => {
    const snapshot = walking({ acceleration: 1, turnSignal: 1 })
    const runtime = createToyFigureRuntime(snapshot)
    const pose = advance(1, runtime, snapshot)
    expect(pose.bodyPitch).toBeGreaterThan(0.1)
    expect(pose.headYaw).toBeGreaterThan(0.1)
    expect(pose.bodyRoll).toBeLessThan(0)
  })

  it('breathes while idle and stops breathing once it is moving', () => {
    const idleSnapshot = createMotionSnapshot()
    const runtime = createToyFigureRuntime(idleSnapshot)
    let low = Number.POSITIVE_INFINITY
    let high = Number.NEGATIVE_INFINITY
    for (let step = 0; step < 480; step += 1) {
      const pose = stepToyFigurePose(runtime, idleSnapshot, STEP)
      low = Math.min(low, pose.rootScaleY)
      high = Math.max(high, pose.rootScaleY)
    }
    expect(high - low).toBeGreaterThan(0.004)
  })

  it('blinks periodically while idle', () => {
    const snapshot = createMotionSnapshot()
    const runtime = createToyFigureRuntime(snapshot)
    let blinks = 0
    let wasBlinking = false
    for (let step = 0; step < 120 * 30; step += 1) {
      const blinking = stepToyFigurePose(runtime, snapshot, STEP).faceFrame === FACE_FRAME_BLINK
      if (blinking && !wasBlinking) blinks += 1
      wasBlinking = blinking
    }
    expect(blinks).toBeGreaterThanOrEqual(Math.floor(30 / BLINK_MAX_INTERVAL_SECONDS))
    expect(blinks).toBeLessThan(30 / BLINK_DURATION_SECONDS)
  })

  it('tucks the legs at the apex and reaches the arms up on the way there', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: 4.6 })
    const runtime = createToyFigureRuntime(createMotionSnapshot())
    const rising = advance(0.25, runtime, snapshot)
    expect(rising.state).toBe('rise')
    expect(rising.leftShoulderPitch).toBeLessThan(-1)

    snapshot.verticalVelocity = 0
    const apex = advance(0.25, runtime, snapshot)
    expect(apex.leftKneeFlex).toBeGreaterThan(rising.leftKneeFlex)
    expect(apex.leftHipPitch).toBeLessThan(0)
  })

  it('squashes on landing in proportion to impact and recovers to neutral', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: -7, maxSpeed: 6 })
    const runtime = createToyFigureRuntime(createMotionSnapshot())
    advance(0.3, runtime, snapshot)

    snapshot.grounded = true
    snapshot.verticalVelocity = 0
    snapshot.impact = 6
    snapshot.landSequence += 1
    const landing = advance(0.06, runtime, snapshot)
    expect(runtime.landingStrength).toBeCloseTo(1)
    expect(landing.rootScaleY).toBeLessThan(0.95)
    expect(landing.rootScaleXZ).toBeGreaterThan(1.02)
    expect(landing.leftKneeFlex).toBeGreaterThan(0.4)

    const recovered = advance(1.2, runtime, snapshot)
    expect(recovered.rootScaleY).toBeGreaterThan(0.99)
    expect(recovered.rootScaleXZ).toBeLessThan(1.01)
  })

  it('softens the landing squash for a gentle step-off', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: -1, maxSpeed: 6 })
    const runtime = createToyFigureRuntime(createMotionSnapshot())
    advance(0.2, runtime, snapshot)
    snapshot.grounded = true
    snapshot.verticalVelocity = 0
    snapshot.impact = 0.6
    snapshot.landSequence += 1
    const landing = advance(0.06, runtime, snapshot)
    expect(runtime.landingStrength).toBeCloseTo(0.1)
    expect(landing.rootScaleY).toBeGreaterThan(0.99)
  })

  it('crouches before it extends on the jump frame', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: 5.25, jumpSequence: 1 })
    const runtime = createToyFigureRuntime(createMotionSnapshot())
    const crouch = advance(0.04, runtime, snapshot)
    const crouchKnee = crouch.leftKneeFlex
    const extended = advance(0.16, runtime, snapshot)
    expect(crouchKnee).toBeGreaterThan(0.2)
    expect(extended.leftKneeFlex).toBeLessThan(crouchKnee)
    expect(extended.rootScaleY).toBeGreaterThan(1)
  })

  it('runs the visual flip to completion without touching physics channels', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: 4, facingYaw: 1.2 })
    const runtime = createToyFigureRuntime(snapshot)
    snapshot.flipSequence += 1

    advance(AVATAR_FLIP_DURATION_SECONDS / 2, runtime, snapshot)
    expect(runtime.flipActive).toBe(true)
    expect(runtime.pose.flipRotationX).toBeGreaterThan(Math.PI * 0.45)

    advance(AVATAR_FLIP_DURATION_SECONDS, runtime, snapshot)
    expect(runtime.flipActive).toBe(false)
    expect(runtime.pose.flipRotationX).toBe(0)
    expect(snapshot.facingYaw).toBe(1.2)
  })

  it('cancels a mid-air flip when the figure lands early', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: -5, flipSequence: 1, maxSpeed: 6 })
    const runtime = createToyFigureRuntime(createMotionSnapshot())
    stepToyFigurePose(runtime, snapshot, 0.2)
    expect(runtime.flipActive).toBe(true)

    snapshot.grounded = true
    snapshot.impact = 5
    snapshot.landSequence += 1
    stepToyFigurePose(runtime, snapshot, 1 / 60)
    expect(runtime.flipActive).toBe(false)
  })

  it('keeps facing yaw and the flip in independent channels', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: 3, facingYaw: Math.PI / 2, flipSequence: 1 })
    const runtime = createToyFigureRuntime(createMotionSnapshot())
    const pose = stepToyFigurePose(runtime, snapshot, 1 / 30)
    expect(pose.facingYaw).toBeGreaterThan(0)
    expect(pose.facingYaw).toBeLessThan(Math.PI / 2)
    expect(pose.flipRotationX).toBeGreaterThan(0)
  })
})

describe('reduced motion', () => {
  it('suppresses the flip, the blink, and the idle glance', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: 3, flipSequence: 1 })
    const runtime = createToyFigureRuntime(createMotionSnapshot())
    const pose = stepToyFigurePose(runtime, snapshot, 0.2, true)
    expect(pose.state).toBe('rise')
    expect(runtime.flipActive).toBe(false)
    expect(pose.flipRotationX).toBe(0)

    const idleSnapshot = createMotionSnapshot()
    const idleRuntime = createToyFigureRuntime(idleSnapshot)
    for (let step = 0; step < 120 * 20; step += 1) {
      const idlePose = stepToyFigurePose(idleRuntime, idleSnapshot, STEP, true)
      expect(idlePose.faceFrame).toBe(FACE_FRAME_OPEN)
      expect(idlePose.headYaw).toBeCloseTo(0, 3)
    }
  })

  it('cancels an in-flight flip if the preference changes mid-air', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: 3, flipSequence: 1 })
    const runtime = createToyFigureRuntime(createMotionSnapshot())
    stepToyFigurePose(runtime, snapshot, 0.1)
    expect(runtime.flipActive).toBe(true)
    stepToyFigurePose(runtime, snapshot, 1 / 60, true)
    expect(runtime.flipActive).toBe(false)
  })

  it('shrinks ambient decoration but keeps the gait legible', () => {
    const snapshot = walking()
    const full = createToyFigureRuntime(snapshot)
    const reduced = createToyFigureRuntime(snapshot)
    let fullSwing = 0
    let reducedSwing = 0
    let fullBob = 0
    let reducedBob = 0
    for (let step = 0; step < 600; step += 1) {
      const fullPose = stepToyFigurePose(full, snapshot, STEP, false)
      const reducedPose = stepToyFigurePose(reduced, snapshot, STEP, true)
      fullSwing = Math.max(fullSwing, Math.abs(fullPose.leftHipPitch))
      reducedSwing = Math.max(reducedSwing, Math.abs(reducedPose.leftHipPitch))
      fullBob = Math.max(fullBob, Math.abs(fullPose.rootY))
      reducedBob = Math.max(reducedBob, Math.abs(reducedPose.rootY))
    }
    expect(reducedSwing).toBeGreaterThan(0.05)
    expect(reducedSwing).toBeLessThan(fullSwing)
    expect(reducedBob).toBeLessThan(fullBob * 0.5)
  })
})
