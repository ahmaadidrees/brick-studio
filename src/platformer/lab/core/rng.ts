/** Seeded RNG (decision 5): mulberry32 over a uint32 state stored in World.rngState, so snapshots capture it. */

export interface RngState {
  rngState: number
}

/** Uniform float in [0, 1). Advances `s.rngState`. */
export function nextFloat(s: RngState): number {
  let t = (s.rngState = (s.rngState + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const seedState = (seed: number): number => seed >>> 0
