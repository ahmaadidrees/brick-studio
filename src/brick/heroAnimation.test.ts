import { describe, expect, it } from 'vitest'
import { createMotionSnapshot, type MotionSnapshot } from './avatarMotion'
import { CHARACTER_RUN_SPEED, CHARACTER_WALK_SPEED } from './characterController'
import {
  HERO_EMOTE_ORDER,
  HERO_FLIP_DURATION_SECONDS,
  HERO_IDLE_FLOURISH_DELAY_SECONDS,
  HERO_LOCOMOTION_MAX_RATE,
  HERO_WEIGHT_EPSILON,
  chooseHeroMotionState,
  createHeroAnimationRuntime,
  heroClipTargets,
  heroLocomotionTimeScale,
  heroSpeedRatio,
  stepHeroAnimation,
  type HeroAnimationRuntime,
  type HeroClipWeights,
} from './heroAnimation'

const FRAME = 1 / 60

function emptyWeights(): HeroClipWeights {
  return { idle: 0, walk: 0, run: 0, jump: 0, fall: 0 }
}

function targetsFor(overrides: Partial<MotionSnapshot>, flipping = false) {
  return heroClipTargets(createMotionSnapshot(overrides), emptyWeights(), undefined, flipping)
}

function advance(
  runtime: HeroAnimationRuntime,
  overrides: Partial<MotionSnapshot>,
  seconds: number,
  reducedMotion = false,
) {
  const snapshot = createMotionSnapshot(overrides)
  const steps = Math.max(1, Math.round(seconds / FRAME))
  let pose = runtime.pose
  for (let index = 0; index < steps; index += 1) {
    pose = stepHeroAnimation(runtime, snapshot, FRAME, reducedMotion)
  }
  // The runtime intentionally reuses one pose object, so detach a copy for comparisons.
  return { ...pose, weights: { ...pose.weights } }
}

/** Runs the idle timer forward until the next flourish fires, then lets it fade in. */
function advanceToNextFlourish(runtime: HeroAnimationRuntime, limitSeconds = 60) {
  const start = runtime.pose.emoteRestartSequence
  const snapshot = createMotionSnapshot()
  const steps = Math.round(limitSeconds / FRAME)
  for (let index = 0; index < steps; index += 1) {
    stepHeroAnimation(runtime, snapshot, FRAME)
    if (runtime.pose.emoteRestartSequence !== start) return advance(runtime, {}, 0.3)
  }
  throw new Error('no idle flourish started within the limit')
}

function dominant(weights: HeroClipWeights) {
  return (Object.keys(weights) as (keyof HeroClipWeights)[])
    .reduce((best, key) => (weights[key] > weights[best] ? key : best), 'idle' as keyof HeroClipWeights)
}

describe('heroSpeedRatio', () => {
  it('stays stable when the controller swaps its walk and run speed caps', () => {
    const walking = createMotionSnapshot({ horizontalSpeed: CHARACTER_WALK_SPEED, maxSpeed: CHARACTER_WALK_SPEED })
    const sprinting = createMotionSnapshot({ horizontalSpeed: CHARACTER_RUN_SPEED, maxSpeed: CHARACTER_RUN_SPEED })
    expect(heroSpeedRatio(walking)).toBeCloseTo(CHARACTER_WALK_SPEED / CHARACTER_RUN_SPEED, 5)
    expect(heroSpeedRatio(sprinting)).toBeCloseTo(1, 5)
    expect(heroSpeedRatio(walking)).toBeLessThan(heroSpeedRatio(sprinting))
  })

  it('clamps to the unit range for stalled and overspeed snapshots', () => {
    expect(heroSpeedRatio(createMotionSnapshot({ horizontalSpeed: 0 }))).toBe(0)
    expect(heroSpeedRatio(createMotionSnapshot({ horizontalSpeed: 99, maxSpeed: 3.5 }))).toBe(1)
  })
})

describe('chooseHeroMotionState', () => {
  it('reports walk at the walk cap and run only at the sprint cap', () => {
    expect(chooseHeroMotionState(createMotionSnapshot({ horizontalSpeed: 0 }))).toBe('idle')
    expect(chooseHeroMotionState(createMotionSnapshot({
      horizontalSpeed: CHARACTER_WALK_SPEED,
      maxSpeed: CHARACTER_WALK_SPEED,
    }))).toBe('walk')
    expect(chooseHeroMotionState(createMotionSnapshot({
      horizontalSpeed: CHARACTER_RUN_SPEED,
      maxSpeed: CHARACTER_RUN_SPEED,
    }))).toBe('run')
  })

  it('splits airborne states by vertical velocity', () => {
    expect(chooseHeroMotionState(createMotionSnapshot({ grounded: false, verticalVelocity: 4 }))).toBe('rise')
    expect(chooseHeroMotionState(createMotionSnapshot({ grounded: false, verticalVelocity: -4 }))).toBe('fall')
  })
})

describe('heroClipTargets', () => {
  it('always forms a normalized blend', () => {
    const cases: Partial<MotionSnapshot>[] = [
      {},
      { horizontalSpeed: 1 },
      { horizontalSpeed: CHARACTER_WALK_SPEED, maxSpeed: CHARACTER_WALK_SPEED },
      { horizontalSpeed: CHARACTER_RUN_SPEED, maxSpeed: CHARACTER_RUN_SPEED },
      { grounded: false, verticalVelocity: 5 },
      { grounded: false, verticalVelocity: -5 },
    ]
    for (const snapshot of cases) {
      const weights = targetsFor(snapshot)
      const total = Object.values(weights).reduce((sum, value) => sum + value, 0)
      expect(total).toBeCloseTo(1, 6)
    }
  })

  it('keeps a full walk on the Walk clip instead of promoting it to Run', () => {
    const weights = targetsFor({ horizontalSpeed: CHARACTER_WALK_SPEED, maxSpeed: CHARACTER_WALK_SPEED })
    expect(weights.walk).toBeGreaterThan(0.9)
    expect(weights.run).toBeLessThan(0.05)
    expect(weights.idle).toBeLessThan(0.05)
  })

  it('gives the Run clip the sprint cap', () => {
    const weights = targetsFor({ horizontalSpeed: CHARACTER_RUN_SPEED, maxSpeed: CHARACTER_RUN_SPEED })
    expect(weights.run).toBeGreaterThan(0.95)
  })

  it('blends idle into walk rather than switching at a threshold', () => {
    const weights = targetsFor({ horizontalSpeed: 0.44, maxSpeed: CHARACTER_WALK_SPEED })
    expect(weights.idle).toBeGreaterThan(0.05)
    expect(weights.walk).toBeGreaterThan(0.05)
    expect(weights.run).toBe(0)
  })

  it('hands the launch pose over to the fall pose as the arc turns over', () => {
    const rising = targetsFor({ grounded: false, verticalVelocity: 5 })
    const apex = targetsFor({ grounded: false, verticalVelocity: 0 })
    const falling = targetsFor({ grounded: false, verticalVelocity: -5 })
    expect(rising.jump).toBeCloseTo(1, 5)
    expect(apex.fall).toBeGreaterThan(apex.jump)
    expect(falling.fall).toBeCloseTo(1, 5)
    expect(rising.idle + rising.walk + rising.run).toBe(0)
  })

  it('holds the tucked launch pose for the whole flip', () => {
    const flipping = targetsFor({ grounded: false, verticalVelocity: -5 }, true)
    expect(flipping.jump).toBe(1)
    expect(flipping.fall).toBe(0)
  })
})

describe('heroLocomotionTimeScale', () => {
  it('rises with speed and stays inside the readable band', () => {
    expect(heroLocomotionTimeScale(0)).toBeLessThan(heroLocomotionTimeScale(0.5))
    expect(heroLocomotionTimeScale(0.5)).toBeLessThan(heroLocomotionTimeScale(1))
    expect(heroLocomotionTimeScale(1)).toBeCloseTo(HERO_LOCOMOTION_MAX_RATE, 5)
    expect(heroLocomotionTimeScale(0)).toBeGreaterThan(0)
  })
})

describe('stepHeroAnimation locomotion', () => {
  it('settles on idle at rest', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    const pose = advance(runtime, {}, 1)
    expect(pose.state).toBe('idle')
    expect(pose.weights.idle).toBeGreaterThan(0.95)
    expect(pose.weights.walk).toBe(0)
    expect(pose.weights.run).toBe(0)
  })

  it('crossfades into run instead of popping', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    const sprint = { horizontalSpeed: CHARACTER_RUN_SPEED, maxSpeed: CHARACTER_RUN_SPEED }
    const live = stepHeroAnimation(runtime, createMotionSnapshot(sprint), FRAME)
    const firstRun = live.weights.run
    expect(firstRun).toBeGreaterThan(0)
    expect(firstRun).toBeLessThan(0.5)
    expect(live.weights.idle).toBeGreaterThan(0.5)

    const midway = advance(runtime, sprint, 0.1)
    expect(midway.weights.run).toBeGreaterThan(firstRun)
    expect(midway.weights.run).toBeLessThan(1)

    const settled = advance(runtime, sprint, 1)
    expect(dominant(settled.weights)).toBe('run')
    expect(settled.weights.run).toBeGreaterThan(0.95)
  })

  it('drives the shared clip rate from speed', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    const idleRate = advance(runtime, {}, 0.5).locomotionTimeScale
    const walkRate = advance(
      runtime,
      { horizontalSpeed: CHARACTER_WALK_SPEED, maxSpeed: CHARACTER_WALK_SPEED },
      0.5,
    ).locomotionTimeScale
    const runRate = advance(
      runtime,
      { horizontalSpeed: CHARACTER_RUN_SPEED, maxSpeed: CHARACTER_RUN_SPEED },
      0.5,
    ).locomotionTimeScale
    expect(idleRate).toBeLessThan(walkRate)
    expect(walkRate).toBeLessThan(runRate)
  })

  it('releases clips fully once their weight is imperceptible', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    const pose = advance(runtime, { horizontalSpeed: CHARACTER_RUN_SPEED, maxSpeed: CHARACTER_RUN_SPEED }, 2)
    expect(pose.weights.idle).toBe(0)
    expect(pose.weights.jump).toBe(0)
    expect(pose.weights.fall).toBe(0)
    for (const value of Object.values(pose.weights)) {
      expect(value === 0 || value >= HERO_WEIGHT_EPSILON).toBe(true)
    }
  })

  it('damps facing toward the controller yaw along the shortest arc', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot({ facingYaw: 0 }))
    const partial = stepHeroAnimation(runtime, createMotionSnapshot({ facingYaw: 1 }), FRAME)
    expect(partial.facingYaw).toBeGreaterThan(0)
    expect(partial.facingYaw).toBeLessThan(1)
    const settled = advance(runtime, { facingYaw: 1 }, 1)
    expect(settled.facingYaw).toBeCloseTo(1, 2)
  })
})

describe('stepHeroAnimation air state', () => {
  it('restarts the launch clip on every accepted jump', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    const before = runtime.pose.jumpRestartSequence
    const takeoff = stepHeroAnimation(
      runtime,
      createMotionSnapshot({ grounded: false, verticalVelocity: 5, jumpSequence: 1 }),
      FRAME,
    )
    expect(takeoff.jumpRestartSequence).toBe(before + 1)

    const held = advance(runtime, { grounded: false, verticalVelocity: 5, jumpSequence: 1 }, 0.3)
    expect(held.jumpRestartSequence).toBe(before + 1)

    const airJump = stepHeroAnimation(
      runtime,
      createMotionSnapshot({ grounded: false, verticalVelocity: 5, jumpSequence: 2 }),
      FRAME,
    )
    expect(airJump.jumpRestartSequence).toBe(before + 2)
  })

  it('stretches on takeoff and squashes on landing', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    advance(runtime, {}, 0.5)
    const takeoff = advance(runtime, { grounded: false, verticalVelocity: 5, jumpSequence: 1 }, 0.05)
    expect(takeoff.squashY).toBeGreaterThan(1)
    expect(takeoff.squashXZ).toBeLessThan(1)

    const landing = advance(
      runtime,
      { grounded: true, jumpSequence: 1, landSequence: 1, impact: 8, maxSpeed: CHARACTER_WALK_SPEED },
      0.06,
    )
    expect(landing.squashY).toBeLessThan(1)
    expect(landing.squashXZ).toBeGreaterThan(1)
    expect(landing.landingStrength).toBeCloseTo(1, 5)
  })

  it('scales the landing pulse by impact speed', () => {
    const soft = createHeroAnimationRuntime(createMotionSnapshot({ grounded: false }))
    const hard = createHeroAnimationRuntime(createMotionSnapshot({ grounded: false }))
    const softPose = advance(soft, { grounded: true, landSequence: 1, impact: 1, maxSpeed: 5.4 }, 0.06)
    const hardPose = advance(hard, { grounded: true, landSequence: 1, impact: 9, maxSpeed: 5.4 }, 0.06)
    expect(hardPose.landingStrength).toBeGreaterThan(softPose.landingStrength)
    expect(hardPose.squashY).toBeLessThan(softPose.squashY)
  })

  it('drops ground contact while airborne and restores it on landing', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    expect(advance(runtime, {}, 0.5).groundContact).toBeCloseTo(1, 2)
    expect(advance(runtime, { grounded: false, verticalVelocity: 4 }, 0.5).groundContact).toBeLessThan(0.05)
    expect(advance(runtime, { grounded: true, landSequence: 1 }, 0.5).groundContact).toBeCloseTo(1, 2)
  })
})

describe('stepHeroAnimation double-jump flip', () => {
  it('spins a full turn and returns to zero', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    const air = { grounded: false, verticalVelocity: 5, jumpSequence: 2, flipSequence: 1 }
    const quarter = advance(runtime, air, HERO_FLIP_DURATION_SECONDS * 0.25)
    expect(quarter.flipRotationX).toBeGreaterThan(0.2)
    const half = advance(runtime, air, HERO_FLIP_DURATION_SECONDS * 0.25)
    expect(half.flipRotationX).toBeGreaterThan(quarter.flipRotationX)
    const done = advance(runtime, air, HERO_FLIP_DURATION_SECONDS)
    expect(done.flipRotationX).toBe(0)
  })

  it('cancels the spin cleanly when the landing arrives mid-flip', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    advance(runtime, { grounded: false, verticalVelocity: 5, jumpSequence: 2, flipSequence: 1 }, 0.12)
    expect(runtime.flipActive).toBe(true)
    const landed = advance(runtime, { grounded: true, landSequence: 1, impact: 4, maxSpeed: 5.4 }, 0.4)
    expect(runtime.flipActive).toBe(false)
    expect(landed.flipRotationX).toBe(0)
  })

  it('never spins under reduced motion', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    const pose = advance(
      runtime,
      { grounded: false, verticalVelocity: 5, jumpSequence: 2, flipSequence: 1 },
      HERO_FLIP_DURATION_SECONDS * 0.5,
      true,
    )
    expect(runtime.flipActive).toBe(false)
    expect(pose.flipRotationX).toBe(0)
  })
})

describe('stepHeroAnimation reduced motion', () => {
  it('keeps locomotion clips but damps the embellishments', () => {
    const full = createHeroAnimationRuntime(createMotionSnapshot())
    const reduced = createHeroAnimationRuntime(createMotionSnapshot())
    const sprint = { horizontalSpeed: CHARACTER_RUN_SPEED, maxSpeed: CHARACTER_RUN_SPEED, turnSignal: 1, acceleration: 1 }
    const fullPose = advance(full, sprint, 1)
    const reducedPose = advance(reduced, sprint, 1, true)

    expect(reducedPose.weights.run).toBeCloseTo(fullPose.weights.run, 5)
    expect(reducedPose.locomotionTimeScale).toBeCloseTo(fullPose.locomotionTimeScale, 5)
    expect(Math.abs(reducedPose.leanRoll)).toBeLessThan(Math.abs(fullPose.leanRoll))
    expect(Math.abs(reducedPose.leanPitch)).toBeLessThan(Math.abs(fullPose.leanPitch))
  })

  it('softens the landing squash', () => {
    const full = createHeroAnimationRuntime(createMotionSnapshot({ grounded: false }))
    const reduced = createHeroAnimationRuntime(createMotionSnapshot({ grounded: false }))
    const landing = { grounded: true, landSequence: 1, impact: 9, maxSpeed: 5.4 }
    const fullPose = advance(full, landing, 0.06)
    const reducedPose = advance(reduced, landing, 0.06, true)
    expect(1 - reducedPose.squashY).toBeLessThan(1 - fullPose.squashY)
    expect(reducedPose.squashY).toBeLessThan(1)
  })

  it('suppresses idle flourishes entirely', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    const pose = advance(runtime, {}, HERO_IDLE_FLOURISH_DELAY_SECONDS + 2, true)
    expect(pose.emote).toBeNull()
    expect(pose.emoteWeight).toBe(0)
    expect(pose.emoteRestartSequence).toBe(0)
  })
})

describe('stepHeroAnimation idle flourishes', () => {
  it('plays a flourish after a long idle and rotates through the set', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    const early = advance(runtime, {}, HERO_IDLE_FLOURISH_DELAY_SECONDS - 1)
    expect(early.emote).toBeNull()
    expect(early.emoteRestartSequence).toBe(0)

    const first = advanceToNextFlourish(runtime)
    expect(first.emote).toBe(HERO_EMOTE_ORDER[0])
    expect(first.emoteWeight).toBeGreaterThan(0.5)
    expect(first.emoteRestartSequence).toBe(1)
    expect(first.weights.idle).toBeLessThan(0.5)

    expect(advanceToNextFlourish(runtime).emote).toBe(HERO_EMOTE_ORDER[1])
    expect(advanceToNextFlourish(runtime).emote).toBe(HERO_EMOTE_ORDER[2])
    const wrapped = advanceToNextFlourish(runtime)
    expect(wrapped.emote).toBe(HERO_EMOTE_ORDER[0])
    expect(wrapped.emoteRestartSequence).toBe(4)
  })

  it('cancels a flourish the moment the player moves', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    advance(runtime, {}, HERO_IDLE_FLOURISH_DELAY_SECONDS + 0.5)
    expect(runtime.emoteActive).toBe(true)
    const moving = advance(runtime, { horizontalSpeed: CHARACTER_WALK_SPEED, maxSpeed: CHARACTER_WALK_SPEED }, 0.5)
    expect(runtime.emoteActive).toBe(false)
    expect(moving.emote).toBeNull()
    expect(moving.emoteWeight).toBe(0)
  })

  it('cancels a flourish on jump', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    advance(runtime, {}, HERO_IDLE_FLOURISH_DELAY_SECONDS + 0.5)
    expect(runtime.emoteActive).toBe(true)
    stepHeroAnimation(runtime, createMotionSnapshot({ jumpSequence: 1, grounded: false, verticalVelocity: 5 }), FRAME)
    expect(runtime.emoteActive).toBe(false)
  })
})

describe('stepHeroAnimation frame hygiene', () => {
  it('ignores non-finite and oversized frame deltas', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    const sprint = createMotionSnapshot({ horizontalSpeed: CHARACTER_RUN_SPEED, maxSpeed: CHARACTER_RUN_SPEED })
    stepHeroAnimation(runtime, sprint, Number.NaN)
    expect(runtime.elapsed).toBe(0)
    stepHeroAnimation(runtime, sprint, 10)
    expect(runtime.elapsed).toBeCloseTo(0.05, 6)
    for (const value of Object.values(runtime.pose.weights)) expect(Number.isFinite(value)).toBe(true)
  })

  it('returns the same pose object every frame', () => {
    const runtime = createHeroAnimationRuntime(createMotionSnapshot())
    const first = stepHeroAnimation(runtime, createMotionSnapshot(), FRAME)
    const second = stepHeroAnimation(runtime, createMotionSnapshot(), FRAME)
    expect(second).toBe(first)
    expect(second.weights).toBe(first.weights)
  })
})
