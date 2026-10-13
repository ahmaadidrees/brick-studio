import { TILE } from './constants'
import type { LevelDesign } from './level'
import { DIR4, RT, raceTrack } from './raceTiles'

// =============================================================================================
// Laps without checkpoint bricks. From the finish line's arrow side we follow the track all the way round back to
// the line, numbering every track tile by how far round it is. Three hidden gates sit a quarter, half and three
// quarters of the way. A lap counts when you cross the line the arrow's way after passing all three, so turning round
// at the line or cutting across the infield never counts.
// =============================================================================================

export type RaceLoop =
  | { ok: true; dist: Int32Array; length: number }
  | { ok: false; reason: 'no-finish' | 'no-loop' | 'finish-gap' }

/** Shorter than this, the "loop" is really traffic leaking round the end of a finish line that misses part of the road. */
const MIN_LOOP = 24

export const LOOP_REASON_TEXT: Record<'no-finish' | 'no-loop' | 'finish-gap', string> = {
  'no-finish': 'Add a finish line so laps can count',
  'no-loop': 'The road doesn’t loop back to the finish line',
  'finish-gap': 'The finish line has to go all the way across the road',
}

export function computeLoop(design: Pick<LevelDesign, 'tiles' | 'width' | 'height' | 'race'>): RaceLoop {
  const { tiles, width: w, height: h } = design
  const finish: number[] = []
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === RT.FINISH) finish.push(i)
  if (!finish.length) return { ok: false, reason: 'no-finish' }
  const [dx, dy] = DIR4[design.race?.finishDir ?? 0]
  const dist = new Int32Array(w * h).fill(-1)
  const onPath = (t: number) => t !== RT.FINISH && (raceTrack(t) || t === RT.WATER)
  const queue: number[] = []
  for (const i of finish) {
    const x = (i % w) + dx, y = Math.floor(i / w) + dy
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const j = y * w + x
    if (onPath(tiles[j]) && dist[j] < 0) {
      dist[j] = 1
      queue.push(j)
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % w, y = Math.floor(i / w)
    for (const [ax, ay] of DIR4) {
      const nx = x + ax, ny = y + ay
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const j = ny * w + nx
      if (dist[j] >= 0 || !onPath(tiles[j])) continue
      dist[j] = dist[i] + 1
      queue.push(j)
    }
  }
  let length = Infinity
  for (const i of finish) {
    const x = (i % w) - dx, y = Math.floor(i / w) - dy
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    const d = dist[y * w + x]
    if (d > 0) length = Math.min(length, d + 1)
  }
  if (!Number.isFinite(length)) return { ok: false, reason: 'no-loop' }
  if (length < MIN_LOOP) return { ok: false, reason: 'finish-gap' }
  return { ok: true, dist, length }
}

/** Which hidden gate (0..3) a distance round the loop is in. */
export const gateOf = (length: number, d: number): number => Math.min(3, Math.floor((d * 4) / length))

export interface LapState {
  /** Laps finished. */
  lap: number
  /** Bit per hidden gate passed this lap. */
  gates: number
  /** Last known distance round the loop (kept while off the track). */
  d: number
  onFinish: boolean
  lapStart: number
  lapTimes: number[]
  /** Tick the last lap finished, or -1. */
  done: number
}

export const createLapState = (tick = 0): LapState => ({ lap: 0, gates: 0, d: 0, onFinish: false, lapStart: tick, lapTimes: [], done: -1 })

const ALL_GATES = 0b1110

/** Follow a car at (px, py). Returns 'lap' when a lap is finished, 'finish' when the last one is, else null. */
export function trackLaps(s: LapState, loop: RaceLoop, design: Pick<LevelDesign, 'tiles' | 'width' | 'height'>, px: number, py: number, tick: number, laps: number): 'lap' | 'finish' | null {
  if (!loop.ok) return null
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE)
  if (tx < 0 || ty < 0 || tx >= design.width || ty >= design.height) return null
  const i = ty * design.width + tx
  const d = loop.dist[i]
  let result: 'lap' | 'finish' | null = null
  if (d > 0) {
    // Just crossed the line the arrow's way, with every gate passed.
    if (s.onFinish && d <= 3 && (s.gates & ALL_GATES) === ALL_GATES && s.done < 0) {
      s.gates = 0
      s.lapTimes.push(tick - s.lapStart)
      s.lapStart = tick
      s.lap++
      result = 'lap'
      if (s.lap >= laps) {
        s.done = tick
        result = 'finish'
      }
    }
    s.d = d
    s.gates |= 1 << gateOf(loop.length, d)
  }
  s.onFinish = design.tiles[i] === RT.FINISH
  return result
}

/** How far round the race a car is, for standings: laps, then distance (a car still behind the line counts as behind). */
export function raceProgress(s: LapState, loop: RaceLoop): number {
  if (!loop.ok) return 0
  if (s.done >= 0) return 1e9 - s.done
  const behindLine = !(s.gates & 2) && s.d > loop.length / 2
  return s.lap * loop.length + (behindLine ? s.d - loop.length : s.d)
}
