import { sub } from './constants'

/**
 * How the player moves, in pixels per frame (speeds) and pixels per frame² (accelerations) at
 * 60 frames per second. Defaults follow Super Mario Bros. 3's shape: momentum, a run button that
 * fills a run meter, jump height that grows with speed and with how long jump is held, and a
 * quick fall. Everything here is tunable live from the feel panel.
 */
export interface Feel {
  walkMax: number
  runMax: number
  pMax: number
  walkAccel: number
  runAccel: number
  airAccel: number
  releaseDecel: number
  skidDecel: number
  airTurn: number
  pFillFrames: number
  pDrainFrames: number
  jump0: number
  jump1: number
  jump2: number
  jump3: number
  /** Gravity while rising with jump held, for standing and walking jumps. */
  holdSlow: number
  /** Gravity while rising with jump held, for running and P-speed jumps. */
  holdFast: number
  fallGravity: number
  maxFall: number
  stompBounce: number
  springLow: number
  springHigh: number
  bounceLow: number
  bounceHigh: number
  wallSlideMax: number
  wallJumpX: number
  wallJumpY: number
  wallJumpLock: number
  coyoteFrames: number
  bufferFrames: number
  cornerNudge: number
}

export const DEFAULT_FEEL: Feel = {
  walkMax: 1.5,
  runMax: 2.5,
  pMax: 3.5,
  walkAccel: 0.0547,
  runAccel: 0.0625,
  airAccel: 0.0547,
  releaseDecel: 0.0547,
  skidDecel: 0.125,
  airTurn: 0.0938,
  pFillFrames: 8,
  pDrainFrames: 24,
  jump0: 4.0,
  jump1: 4.25,
  jump2: 4.75,
  jump3: 5.0,
  holdSlow: 0.125,
  holdFast: 0.135,
  fallGravity: 0.375,
  maxFall: 4.25,
  stompBounce: 4.0,
  springLow: 4.5,
  springHigh: 6.75,
  bounceLow: 3.25,
  bounceHigh: 5.5,
  wallSlideMax: 1.0,
  wallJumpX: 2.0,
  wallJumpY: 4.0,
  wallJumpLock: 9,
  coyoteFrames: 4,
  bufferFrames: 5,
  cornerNudge: 4,
}

/** The run meter has this many segments; when it is full you are at P-speed. */
export const P_SEGMENTS = 7

/** Feel converted to whole sub-pixel units for the simulation. */
export interface FeelSub {
  walkMax: number
  runMax: number
  pMax: number
  walkAccel: number
  runAccel: number
  airAccel: number
  releaseDecel: number
  skidDecel: number
  airTurn: number
  pFillFrames: number
  pDrainFrames: number
  jump: [number, number, number, number]
  hold: [number, number, number, number]
  fallGravity: number
  maxFall: number
  stompBounce: number
  springLow: number
  springHigh: number
  bounceLow: number
  bounceHigh: number
  wallSlideMax: number
  wallJumpX: number
  wallJumpY: number
  wallJumpLock: number
  coyoteFrames: number
  bufferFrames: number
  cornerNudge: number
}

export function feelToSub(f: Feel): FeelSub {
  return {
    walkMax: sub(f.walkMax),
    runMax: sub(f.runMax),
    pMax: sub(f.pMax),
    walkAccel: sub(f.walkAccel),
    runAccel: sub(f.runAccel),
    airAccel: sub(f.airAccel),
    releaseDecel: sub(f.releaseDecel),
    skidDecel: sub(f.skidDecel),
    airTurn: sub(f.airTurn),
    pFillFrames: Math.max(1, Math.round(f.pFillFrames)),
    pDrainFrames: Math.max(1, Math.round(f.pDrainFrames)),
    jump: [sub(f.jump0), sub(f.jump1), sub(f.jump2), sub(f.jump3)],
    hold: [sub(f.holdSlow), sub(f.holdSlow), sub(f.holdFast), sub(f.holdFast)],
    fallGravity: sub(f.fallGravity),
    maxFall: sub(f.maxFall),
    stompBounce: sub(f.stompBounce),
    springLow: sub(f.springLow),
    springHigh: sub(f.springHigh),
    bounceLow: sub(f.bounceLow),
    bounceHigh: sub(f.bounceHigh),
    wallSlideMax: sub(f.wallSlideMax),
    wallJumpX: sub(f.wallJumpX),
    wallJumpY: sub(f.wallJumpY),
    wallJumpLock: Math.round(f.wallJumpLock),
    coyoteFrames: Math.round(f.coyoteFrames),
    bufferFrames: Math.round(f.bufferFrames),
    cornerNudge: sub(f.cornerNudge),
  }
}

export interface FeelField {
  key: keyof Feel
  label: string
  min: number
  max: number
  step: number
}

export interface FeelGroup {
  title: string
  fields: FeelField[]
}

/** How the feel panel lays out its sliders. */
export const FEEL_GROUPS: FeelGroup[] = [
  {
    title: 'Running',
    fields: [
      { key: 'walkMax', label: 'Walk top speed', min: 0.5, max: 3, step: 0.0625 },
      { key: 'runMax', label: 'Run top speed', min: 1, max: 4, step: 0.0625 },
      { key: 'pMax', label: 'P-speed top speed', min: 1.5, max: 5, step: 0.0625 },
      { key: 'walkAccel', label: 'Walk acceleration', min: 0.01, max: 0.25, step: 0.0039 },
      { key: 'runAccel', label: 'Run acceleration', min: 0.01, max: 0.25, step: 0.0039 },
      { key: 'releaseDecel', label: 'Friction (let go)', min: 0.01, max: 0.3, step: 0.0039 },
      { key: 'skidDecel', label: 'Skid (turn around)', min: 0.02, max: 0.5, step: 0.0039 },
      { key: 'pFillFrames', label: 'Run meter fill (frames/step)', min: 1, max: 20, step: 1 },
      { key: 'pDrainFrames', label: 'Run meter drain (frames/step)', min: 1, max: 60, step: 1 },
    ],
  },
  {
    title: 'Jumping',
    fields: [
      { key: 'jump0', label: 'Jump speed standing', min: 2, max: 7, step: 0.0625 },
      { key: 'jump1', label: 'Jump speed walking', min: 2, max: 7, step: 0.0625 },
      { key: 'jump2', label: 'Jump speed running', min: 2, max: 7, step: 0.0625 },
      { key: 'jump3', label: 'Jump speed at P-speed', min: 2, max: 7, step: 0.0625 },
      { key: 'holdSlow', label: 'Gravity holding jump (walk)', min: 0.03, max: 0.5, step: 0.0039 },
      { key: 'holdFast', label: 'Gravity holding jump (run)', min: 0.03, max: 0.5, step: 0.0039 },
      { key: 'fallGravity', label: 'Gravity falling / released', min: 0.1, max: 1, step: 0.0039 },
      { key: 'maxFall', label: 'Top fall speed', min: 2, max: 8, step: 0.0625 },
      { key: 'airAccel', label: 'Air control', min: 0.01, max: 0.25, step: 0.0039 },
      { key: 'airTurn', label: 'Air turn-around', min: 0.01, max: 0.3, step: 0.0039 },
      { key: 'coyoteFrames', label: 'Late jump grace (frames)', min: 0, max: 12, step: 1 },
      { key: 'bufferFrames', label: 'Early jump grace (frames)', min: 0, max: 12, step: 1 },
    ],
  },
  {
    title: 'Walls, stomps, springs',
    fields: [
      { key: 'wallSlideMax', label: 'Wall slide speed', min: 0.25, max: 4, step: 0.0625 },
      { key: 'wallJumpX', label: 'Wall jump push', min: 0.5, max: 4, step: 0.0625 },
      { key: 'wallJumpY', label: 'Wall jump height', min: 2, max: 7, step: 0.0625 },
      { key: 'wallJumpLock', label: 'Wall jump steer lock (frames)', min: 0, max: 30, step: 1 },
      { key: 'stompBounce', label: 'Stomp bounce', min: 1, max: 7, step: 0.0625 },
      { key: 'springHigh', label: 'Spring (jump held)', min: 3, max: 10, step: 0.0625 },
      { key: 'cornerNudge', label: 'Head corner nudge (px)', min: 0, max: 8, step: 1 },
    ],
  },
]
