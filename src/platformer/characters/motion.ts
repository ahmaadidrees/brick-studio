import { SUB } from '@brick-studio/platformer-core/engine/constants'
import type { Player } from '@brick-studio/platformer-core/engine/player'
import type { CharacterId } from '@brick-studio/platformer-core/net/protocol'
import type { PlayerPose } from '../render/art/characters'

export interface CharacterMotion {
  gait?: 'walk' | 'run'
  gaitPhase: number
  /** Continuous walk (0) to run (1), separate from the hysteretic gait label. */
  gaitBlend: number
  /** Stride amplitude: settles to a neutral stance without advancing the cycle at rest. */
  gaitWeight: number
  /** Landing response, 0..1. Independent of the head-bounce squash. */
  landingCompression: number
}
interface MotionState {
  frame: number; anim: number; x: number; y: number; grounded: boolean
  character: CharacterId; running: boolean; phase: number; blend: number; weight: number
  landingAge: number; result: CharacterMotion
}
const states = new WeakMap<Player, MotionState>()
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t) }

/** Travel per complete left/right cycle, in pixels. These short strides reduce foot slide. */
export function gaitCycleLength(height: number, blend: number, character: CharacterId = 'builder'): number {
  const personality = character === 'brick-fox' ? 0.96 : character === 'bolt-bot' ? 1.04 : 1
  return height * (1.05 + clamp(blend) * 0.23) * personality
}

/** Rendering state only: never writes Player, physics, snapshots, or deterministic hashes. */
export function characterMotion(p: Player, frame: number, character: CharacterId, walkMax: number, pose: PlayerPose): CharacterMotion {
  const locomotion = p.onGround && (pose === 'stand' || pose.startsWith('walk'))
  const speed = Math.abs(p.vx) / SUB
  let state = states.get(p)
  if (!state || frame < state.frame || state.character !== character) {
    const running = speed > walkMax + 0.22
    const result: CharacterMotion = { gait: locomotion ? (running ? 'run' : 'walk') : undefined, gaitPhase: 0, gaitBlend: running ? 1 : 0, gaitWeight: 0, landingCompression: 0 }
    state = { frame, anim: p.anim, x: p.x, y: p.y, grounded: p.onGround, character, running, phase: 0, blend: result.gaitBlend, weight: 0, landingAge: 99, result }
    states.set(p, state)
    return result
  }
  // The view can be requested more than once per simulation tick.
  if (frame === state.frame) return state.result
  const ticks = frame - state.frame
  const distance = (p.anim - state.anim) / SUB
  const discontinuity = ticks > 8 || distance < 0 || distance > ticks * (speed + 4)
    || Math.abs(p.x - state.x) / SUB > Math.max(8, ticks * (speed + 4))
    || Math.abs(p.y - state.y) / SUB > Math.max(12, ticks * (Math.abs(p.vy) / SUB + 4))
  const elapsed = Math.min(ticks, 8)
  if (speed > walkMax + 0.22) state.running = true
  else if (speed < walkMax - 0.12) state.running = false
  const targetBlend = locomotion ? smooth((speed - walkMax * 0.7) / Math.max(0.5, walkMax * 0.65)) : state.blend
  state.blend += (targetBlend - state.blend) * (1 - Math.exp(-elapsed / 5))
  const travelled = !discontinuity && locomotion && distance > 0
  const targetWeight = travelled ? smooth(speed / 0.8) : 0
  state.weight += (targetWeight - state.weight) * (1 - Math.exp(-elapsed / (targetWeight > state.weight ? 3 : 4)))
  if (discontinuity) { state.weight = 0; state.landingAge = 99 }
  // Integrate each increment with the CURRENT cycle length. Never re-modulo total distance
  // when changing gait: that would snap the feet as walk becomes run.
  if (travelled) {
    const height = p.power ? 34 : 23
    state.phase = (state.phase + distance / gaitCycleLength(height, state.blend, character)) % 1
  }
  if (!discontinuity && !state.grounded && p.onGround && !p.dead && !p.celebrate) state.landingAge = 0
  else state.landingAge += elapsed
  const age = state.landingAge
  const landingCompression = p.onGround && !p.dead && age < 13
    ? (age < 3 ? Math.sin((age + 1) / 4 * Math.PI / 2) : Math.pow(1 - (age - 3) / 10, 2)) : 0
  state.result = { gait: locomotion ? (state.running ? 'run' : 'walk') : undefined, gaitPhase: state.phase, gaitBlend: state.blend, gaitWeight: state.weight < 0.001 ? 0 : state.weight, landingCompression }
  state.frame = frame; state.anim = p.anim; state.x = p.x; state.y = p.y; state.grounded = p.onGround
  return state.result
}
