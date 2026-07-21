import { describe, expect, it } from 'vitest'
import {
  AVATAR_FLIP_DURATION_SECONDS,
  AVATAR_MAX_FRAME_DELTA_SECONDS,
  chooseAvatarMotionState,
  createAvatarAnimationRuntime,
  createMotionSnapshot,
  stepAvatarAnimation,
} from './avatarMotion'

function advance(seconds: number, runtime = createAvatarAnimationRuntime(), snapshot = createMotionSnapshot()) {
  const step = 1 / 120
  for (let elapsed = 0; elapsed < seconds; elapsed += step) stepAvatarAnimation(runtime, snapshot, step)
  return { runtime, snapshot }
}

describe('avatar motion state selection', () => {
  it('selects idle, walk, and run from normalized grounded speed', () => {
    expect(chooseAvatarMotionState(createMotionSnapshot())).toBe('idle')
    expect(chooseAvatarMotionState(createMotionSnapshot({ horizontalSpeed: 2, maxSpeed: 6 }))).toBe('walk')
    expect(chooseAvatarMotionState(createMotionSnapshot({ horizontalSpeed: 5, maxSpeed: 6 }))).toBe('run')
  })

  it('selects rise and fall from airborne vertical velocity', () => {
    expect(chooseAvatarMotionState(createMotionSnapshot({ grounded: false, verticalVelocity: 2 }))).toBe('rise')
    expect(chooseAvatarMotionState(createMotionSnapshot({ grounded: false, verticalVelocity: -0.1 }))).toBe('fall')
  })
})

describe('visual-only avatar events', () => {
  it('runs a complete visual flip in the configured interval without mutating the snapshot', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: 4 })
    const runtime = createAvatarAnimationRuntime(snapshot)
    const before = { ...snapshot }
    snapshot.flipSequence += 1

    advance(AVATAR_FLIP_DURATION_SECONDS / 2, runtime, snapshot)
    expect(runtime.flipActive).toBe(true)
    expect(runtime.pose.flipRotationX).toBeGreaterThan(Math.PI * 0.45)
    expect(runtime.pose.flipRotationX).toBeLessThan(Math.PI * 1.55)

    advance(AVATAR_FLIP_DURATION_SECONDS, runtime, snapshot)
    expect(runtime.flipActive).toBe(false)
    expect(runtime.pose.flipRotationX).toBe(0)
    expect(snapshot).toEqual({ ...before, flipSequence: before.flipSequence + 1 })
  })

  it('keeps facing and visual flip in independent pose channels', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: 3, facingYaw: Math.PI / 2, flipSequence: 1 })
    const runtime = createAvatarAnimationRuntime(createMotionSnapshot())
    const pose = stepAvatarAnimation(runtime, snapshot, 1 / 30)

    expect(pose.facingYaw).toBeGreaterThan(0)
    expect(pose.facingYaw).toBeLessThan(Math.PI / 2)
    expect(pose.flipRotationX).toBeGreaterThan(0)
    expect(snapshot.facingYaw).toBe(Math.PI / 2)
  })

  it('cancels a mid-air flip into an impact-scaled landing squash', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: -5, flipSequence: 1, maxSpeed: 6 })
    const runtime = createAvatarAnimationRuntime(createMotionSnapshot())
    stepAvatarAnimation(runtime, snapshot, 0.2)
    expect(runtime.flipActive).toBe(true)

    snapshot.grounded = true
    snapshot.verticalVelocity = 0
    snapshot.impact = 5
    snapshot.landSequence += 1
    const landingPose = stepAvatarAnimation(runtime, snapshot, 1 / 60)

    expect(runtime.flipActive).toBe(false)
    expect(runtime.landingStrength).toBeCloseTo(5 / 6)
    expect(landingPose.bodyScaleY).toBeLessThan(1)
    expect(landingPose.bodyScaleXZ).toBeGreaterThan(1)
  })

  it('suppresses the flip flourish for reduced motion while preserving airborne state', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: 3, flipSequence: 1 })
    const runtime = createAvatarAnimationRuntime(createMotionSnapshot())
    const pose = stepAvatarAnimation(runtime, snapshot, 0.2, true)

    expect(pose.state).toBe('rise')
    expect(runtime.flipActive).toBe(false)
    expect(pose.flipRotationX).toBe(0)
  })

  it('cancels an active flourish if reduced motion changes mid-flip', () => {
    const snapshot = createMotionSnapshot({ grounded: false, verticalVelocity: 3, flipSequence: 1 })
    const runtime = createAvatarAnimationRuntime(createMotionSnapshot())
    stepAvatarAnimation(runtime, snapshot, 0.1)
    expect(runtime.flipActive).toBe(true)

    stepAvatarAnimation(runtime, snapshot, 1 / 60, true)
    expect(runtime.flipActive).toBe(false)
  })

  it('caps a resumed frame before advancing decorative motion', () => {
    const runtime = createAvatarAnimationRuntime()
    stepAvatarAnimation(runtime, createMotionSnapshot(), 10)
    expect(runtime.elapsed).toBe(AVATAR_MAX_FRAME_DELTA_SECONDS)
  })

  it('reuses a stable pose object across animation frames', () => {
    const runtime = createAvatarAnimationRuntime()
    const firstPose = stepAvatarAnimation(runtime, createMotionSnapshot({ horizontalSpeed: 2 }), 1 / 60)
    const secondPose = stepAvatarAnimation(runtime, createMotionSnapshot({ horizontalSpeed: 3 }), 1 / 60)
    expect(secondPose).toBe(firstPose)
  })
})
