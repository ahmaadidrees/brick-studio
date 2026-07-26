export const AVATAR_FLIP_DURATION_SECONDS = 0.58
export const AVATAR_MAX_FRAME_DELTA_SECONDS = 0.05

export type AvatarMotionState = 'idle' | 'walk' | 'run' | 'rise' | 'fall'

/**
 * Transient controller-to-animator seam. The controller mutates one stable object;
 * animation consumers read it from the render loop without scheduling React state.
 * Sequence fields are monotonically increasing edge counters rather than booleans.
 *
 * The pose math that consumes this lives in avatarPose.ts.
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

export function chooseAvatarMotionState(snapshot: MotionSnapshot): AvatarMotionState {
  if (!snapshot.grounded) return snapshot.verticalVelocity > 0.15 ? 'rise' : 'fall'
  const speedRatio = snapshot.horizontalSpeed / Math.max(snapshot.maxSpeed, 0.001)
  if (speedRatio >= 0.62) return 'run'
  if (speedRatio >= 0.06) return 'walk'
  return 'idle'
}
