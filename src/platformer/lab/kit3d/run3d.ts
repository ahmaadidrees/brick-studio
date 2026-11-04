/**
 * A Hackable 3D game, made the way the studio makes one (core/index.ts createRuntime picks KIT_ENGINES['3d']). For
 * tests, the lockstep harness and dev pages that hold a LevelDesign3.
 */
import { createRuntime, type Runtime } from '../core'
import type { LevelDesign3 } from './contracts3d'

export function createRuntime3d(design: LevelDesign3): Runtime {
  return createRuntime(design)
}
