import { TS } from './constants'
import type { WorldEvent } from './events'
import { DEFAULT_FEEL, feelToSub, type FeelSub } from './feel'
import type { LevelDesign } from './level'
import { NO_INPUT, createPlayer, grantEffect, respawn, stepPlayer, type Player, type PlayerContext, type PlayerInput } from './player'
import { isSolid, kills } from './tiles'
import { advanceWorld, createWorld, restoreWorld, snapshotWorld, type World } from './world'

/*
 * A player that searches for a way through a level, using the real game physics. It tries short
 * bursts of button presses from many candidate positions at once (a beam search) and keeps the
 * ones that get closest to the goal without dying. If it reaches the goal, the level is
 * beatable; where it gets stuck is where a person would struggle too.
 */

interface State {
  world: World
  p: Player
  pending: WorldEvent[]
  inputs: string
  best: number
  hurt: number
}

type Macro = { name: string; frames: PlayerInput[] }

function macro(name: string, n: number, f: (i: number) => Partial<PlayerInput>): Macro {
  return { name, frames: Array.from({ length: n }, (_, i) => ({ ...NO_INPUT, ...f(i) })) }
}

const N = 8
const MACROS: Macro[] = [
  macro('>', N, () => ({ right: true })),
  macro('>>', N, () => ({ right: true, run: true })),
  macro('>>J', N, (i) => ({ right: true, run: true, jump: true, jumpPressed: i === 0 })),
  macro('>>j', N, () => ({ right: true, run: true, jump: true })),
  macro('>J', N, (i) => ({ right: true, jump: true, jumpPressed: i === 0 })),
  macro('>j', N, () => ({ right: true, jump: true })),
  macro('>>h', N, (i) => ({ right: true, run: true, jump: i < 3, jumpPressed: i === 0 })),
  macro('<', N, () => ({ left: true })),
  macro('<J', N, (i) => ({ left: true, jump: true, jumpPressed: i === 0 })),
  macro('<j', N, () => ({ left: true, jump: true })),
  macro('<<', N, () => ({ left: true, run: true })),
  macro('J', N, (i) => ({ jump: true, jumpPressed: i === 0 })),
  macro('j', N, () => ({ jump: true })),
  macro('.', N, () => ({})),
]

/** Distance to the goal in tiles, walking through open space (gravity ignored). */
function distanceField(d: LevelDesign): Int32Array {
  const { width: w, height: h } = d
  const dist = new Int32Array(w * h).fill(-1)
  const goal = d.objects.find((o) => o.kind === 'goal')
  if (!goal) return dist
  const queue: number[] = []
  for (let y = Math.max(0, goal.y - 9); y <= goal.y; y++) {
    dist[y * w + goal.x] = 0
    queue.push(y * w + goal.x)
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]
    const x = i % w
    const y = (i / w) | 0
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const j = ny * w + nx
      const t = d.tiles[j]
      if (dist[j] >= 0 || isSolid(t) || kills(t)) continue
      dist[j] = dist[i] + 1
      queue.push(j)
    }
  }
  return dist
}

export interface AutoplayResult {
  cleared: boolean
  /** Game time to the goal, in ticks. */
  ticks: number
  /** Furthest point reached (tile), and how far from the goal it was. */
  furthest: { x: number; y: number; distance: number }
  deaths: number
  inputs: string
}

export function autoplay(design: LevelDesign, opts: { beam?: number; maxSteps?: number; feel?: FeelSub } = {}): AutoplayResult {
  const beam = opts.beam ?? 24
  const maxSteps = opts.maxSteps ?? 2500
  const feel = opts.feel ?? feelToSub(DEFAULT_FEEL)
  const field = distanceField(design)
  const w0 = createWorld(design)
  const p0 = createPlayer(1)
  const pending0: WorldEvent[] = []
  const ctx: PlayerContext = { world: w0, feel, tick: 0, emit: (ev) => pending0.push(ev), sound: () => {}, others: [] }
  respawn(p0, ctx, true)
  p0.invuln = 0

  const score = (s: State): number => {
    const tx = Math.floor((s.p.x + s.p.w / 2) / TS)
    const ty = Math.floor((s.p.y + s.p.h - 1) / TS)
    const inBounds = tx >= 0 && ty >= 0 && tx < design.width && ty < design.height
    const d = inBounds ? field[ty * design.width + tx] : -1
    // Unknown cells (inside walls, off the map) score badly but not infinitely.
    const dist = d < 0 ? 400 : d
    return -dist * 100 + s.p.x / TS + s.p.power * 30 - s.hurt * 60
  }

  let frontier: State[] = [{ world: w0, p: p0, pending: pending0.slice(), inputs: '', best: 0, hurt: 0 }]
  frontier[0].best = score(frontier[0])
  let furthest = { x: 0, y: 0, distance: Infinity }
  let deaths = 0

  for (let step = 0; step < maxSteps; step++) {
    const next: State[] = []
    for (const s of frontier) {
      for (const m of MACROS) {
        const world = restoreWorld(snapshotWorld(s.world))
        const p: Player = { ...s.p, ignore: new Map(s.p.ignore), claimedCoins: new Map(s.p.claimedCoins) }
        const pending = s.pending.slice()
        const c: PlayerContext = { world, feel, tick: world.tick, emit: (ev) => pending.push(ev), sound: () => {}, others: [] }
        let dead = false
        let hurt = s.hurt
        for (const input of m.frames) {
          const events = pending.splice(0).map((ev) => ({ ev, by: 1 }))
          advanceWorld(world, events)
          for (const e of world.effects) grantEffect(p, e, c)
          c.tick = world.tick
          const power = p.power
          stepPlayer(p, input, c)
          if (p.power < power) hurt++
          if (p.dead) {
            dead = true
            break
          }
          if (p.clearTime >= 0) break
        }
        if (dead) {
          deaths++
          continue
        }
        const ns: State = { world, p, pending, inputs: s.inputs + m.name + ' ', best: 0, hurt }
        ns.best = score(ns)
        if (p.clearTime >= 0) {
          return { cleared: true, ticks: world.tick, furthest: { x: Math.floor(p.x / TS), y: Math.floor(p.y / TS), distance: 0 }, deaths, inputs: ns.inputs }
        }
        next.push(ns)
      }
    }
    if (!next.length) break
    // Keep the best candidates, but only one per (tile, speed, air) bucket so the beam stays varied.
    next.sort((a, b) => b.best - a.best)
    const seen = new Set<string>()
    frontier = []
    for (const s of next) {
      const key = `${Math.floor(s.p.x / (TS / 2))},${Math.floor(s.p.y / (TS / 2))},${Math.sign(s.p.vx)}${Math.round(s.p.vx / 256)},${s.p.onGround ? 1 : 0},${s.p.wallSide},${s.p.power}`
      if (seen.has(key)) continue
      seen.add(key)
      frontier.push(s)
      if (frontier.length >= beam) break
    }
    const lead = frontier[0]
    const tx = Math.floor((lead.p.x + lead.p.w / 2) / TS)
    const ty = Math.floor((lead.p.y + lead.p.h - 1) / TS)
    const d = field[ty * design.width + tx]
    if (d >= 0 && d < furthest.distance) furthest = { x: tx, y: ty, distance: d }
  }
  const lead = frontier[0]
  return { cleared: false, ticks: lead?.world.tick ?? 0, furthest, deaths, inputs: lead?.inputs ?? '' }
}
