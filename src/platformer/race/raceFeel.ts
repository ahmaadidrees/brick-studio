import { DEFAULT_CAR_FEEL, type CarFeel } from '@brick-studio/platformer-core/engine/car'
import type { CameraMode, SteerMode } from './raceRun'

/** How the car drives, as tuned in the Feel panel; remembered in this browser. */
export interface RaceFeel {
  feel: CarFeel
  steer: SteerMode
  camera: CameraMode
}

const KEY = 'p2d-race-feel'

export function loadRaceFeel(): RaceFeel {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<RaceFeel> | null
    return { feel: { ...DEFAULT_CAR_FEEL, ...(s?.feel ?? {}) }, steer: s?.steer === 'point' ? 'point' : 'turn', camera: s?.camera === 'turn' ? 'turn' : 'map' }
  } catch {
    return { feel: { ...DEFAULT_CAR_FEEL }, steer: 'turn', camera: 'map' }
  }
}

export function saveRaceFeel(s: RaceFeel) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Private windows: the feel just isn't remembered.
  }
}
