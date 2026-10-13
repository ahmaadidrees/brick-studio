import type { Car, CarInput } from './car'
import { TILE } from './constants'
import type { LevelDesign } from './level'
import type { RaceLoop } from './laps'

const LOOK = 7
const AHEAD_MIN = 4
const AHEAD_MAX = 8

/**
 * A computer driver for any track that loops: it aims at the track tiles a few tiles further round the lap than
 * where it is. Used by the tests and for stand-in racers. `lastD` is the car's last known distance round the loop,
 * for when it is off the track.
 */
export function raceAutopilot(car: Car, loop: RaceLoop, design: Pick<LevelDesign, 'width' | 'height'>, lastD: number): CarInput {
  if (!loop.ok) return { steer: 0, gas: true, brake: false }
  const { width: w, height: h } = design
  const cx = Math.floor(car.x / TILE), cy = Math.floor(car.y / TILE)
  const here = cx >= 0 && cy >= 0 && cx < w && cy < h ? loop.dist[cy * w + cx] : -1
  const d = here > 0 ? here : lastD
  let sx = 0, sy = 0, n = 0
  for (let y = Math.max(0, cy - LOOK); y <= Math.min(h - 1, cy + LOOK); y++) {
    for (let x = Math.max(0, cx - LOOK); x <= Math.min(w - 1, cx + LOOK); x++) {
      const t = loop.dist[y * w + x]
      if (t <= 0) continue
      const ahead = (t - d + loop.length) % loop.length
      if (ahead < AHEAD_MIN || ahead > AHEAD_MAX) continue
      sx += x + 0.5
      sy += y + 0.5
      n++
    }
  }
  if (!n) return { steer: 0, gas: true, brake: false }
  const want = Math.atan2((sy / n) * TILE - car.y, (sx / n) * TILE - car.x)
  const diff = Math.atan2(Math.sin(want - car.a), Math.cos(want - car.a))
  const speed = Math.hypot(car.vx, car.vy)
  // Facing the wrong way: keep rolling forward and turn round rather than backing up.
  return { steer: Math.max(-1, Math.min(1, diff * 3)), gas: Math.abs(diff) < 0.9 || speed < 1.5, brake: Math.abs(diff) >= 0.9 && speed >= 1.5 }
}
