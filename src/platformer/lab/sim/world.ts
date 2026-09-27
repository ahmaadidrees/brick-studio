import { TS } from '@brick-studio/platformer-core/engine/constants'
import type { Theme } from '@brick-studio/platformer-core/engine/level'
import { decodeRuns, encodeRuns } from '@brick-studio/platformer-core/engine/level'
import { TILE_ID_COUNT } from '@brick-studio/platformer-core/engine/tiles'
import { LAB_LIMITS } from '../program/types'
import { moveThingTo, runThing, seat } from '../runtime/runtime'
import { updateContacts } from './contacts'
import { heroStep, solidsFor, stepBody } from './physics'
import { PLAYER_BRICK, findThing, placedSpot, spawnThing } from './things'
import { NO_KEYS, type LabHost, type LabInput, type LabWorld, type Thing, type Trace } from './types'

/** A thing placed in a level: which brick, where (its anchor cell, bottom row), which way it faces. */
export interface PlacedThing {
  id: number
  brick: string
  x: number
  y: number
  dir: 1 | -1
}

/** A lab level: tiles (the engine's ids), where you start, and the bricks placed in it. Plain data. */
export interface LabLevel {
  width: number
  height: number
  theme: Theme
  tiles: Uint8Array
  start: { x: number; y: number }
  things: PlacedThing[]
}

const HURT_GRACE = 60

/** The world a level starts as: you first, then every placed thing, each about to say "appear". */
export function createLabWorld(level: LabLevel, host: LabHost, seed = 20260926): LabWorld {
  const w: LabWorld = {
    tick: 0,
    width: level.width,
    height: level.height,
    tiles: level.tiles.slice(),
    things: [],
    nextId: 1,
    playerId: 0,
    start: { ...level.start },
    seed: seed >>> 0,
    input: NO_KEYS,
    effects: [],
    notes: [],
  }
  const p = spawnThing(w, host, PLAYER_BRICK, level.start.x * TS + TS / 2, (level.start.y + 1) * TS, 1, 0)
  w.playerId = p.id
  for (const o of level.things) {
    const info = host.brick(o.brick)
    const spot = placedSpot(info?.costume ?? 'crate', o.x, o.y)
    spawnThing(w, host, o.brick, spot.cx, spot.bottom, o.dir, o.id)
  }
  return w
}

/** Things stand on things: move what carries first. */
function physicsOrder(w: LabWorld): Thing[] {
  const list = w.things.filter((t) => !t.removed && !t.riding)
  const depth = new Map<number, number>()
  for (const t of list) {
    let n = 0
    let g = t.ground
    const seen = new Set([t.id])
    while (g && n < 4 && !seen.has(g)) {
      seen.add(g)
      const under = findThing(w, g)
      if (!under) break
      n++
      g = under.ground
    }
    depth.set(t.id, n)
  }
  return list.sort((a, b) => depth.get(a.id)! - depth.get(b.id)! || a.id - b.id)
}

/**
 * One frame: every thing takes its turn (scripts), then the keys move whoever runs with them, then everything moves,
 * riders ride along, touches are worked out (events for next frame), and whatever fell out of the level is handled.
 */
export function advance(w: LabWorld, host: LabHost, input: LabInput = NO_KEYS, trace: Trace | null = null) {
  w.tick++
  w.effects = []
  w.notes = []
  w.input = input
  const budget = { left: LAB_LIMITS.opsPerTick }
  // Things made this frame take their first turn this frame too, before anything moves.
  for (let i = 0; i < w.things.length; i++) {
    const t = w.things[i]
    if (t.removed) continue
    const prog = host.program(t.brick)
    if (!prog) {
      t.events = []
      continue
    }
    runThing(w, host, t, prog, budget, trace)
  }

  for (const t of w.things) {
    t.ox = t.x
    t.oy = t.y
  }
  for (const t of w.things) if (!t.removed && t.hero && !t.riding) heroStep(t, w.input, host.feel)
  const solids = solidsFor(w)
  for (const t of physicsOrder(w)) if (stepBody(w, t, solids)) t.events.push({ kind: 'land' })
  for (const t of w.things) {
    if (t.removed || !t.riding) continue
    const vehicle = findThing(w, t.riding)
    if (vehicle) seat(vehicle, t)
    else t.riding = 0
  }
  updateContacts(w)

  const below = (w.height + 2) * TS
  for (const t of w.things) {
    if (t.removed || t.riding || t.y <= below) continue
    if (t.id === w.playerId) {
      // Falling out hurts the player (their "when I get hurt" decides what that means); far below, back to the start.
      if (w.tick - t.hurtAt >= HURT_GRACE) {
        t.hurtAt = w.tick
        t.events.push({ kind: 'hurt', other: 0 })
      }
      if (t.y > (w.height + 12) * TS) moveThingTo(w, t, w.start.x * TS + TS / 2, (w.start.y + 1) * TS)
    } else {
      t.removed = true
      const rider = findThing(w, t.rider)
      if (rider) rider.riding = 0
    }
  }
  for (const t of w.things) if (t.say && w.tick >= t.sayUntil) t.say = null
  if (w.things.some((t) => t.removed)) w.things = w.things.filter((t) => !t.removed)
}

/** The world as JSON-safe data (tiles run-length encoded like the engine's levels). */
export function serializeLabWorld(w: LabWorld): Record<string, unknown> {
  return JSON.parse(JSON.stringify({ ...w, tiles: encodeRuns(w.tiles), effects: [], notes: [] }))
}

export function deserializeLabWorld(j: Record<string, unknown>): LabWorld {
  const w = JSON.parse(JSON.stringify(j)) as LabWorld & { tiles: unknown }
  w.tiles = decodeRuns(j.tiles as string, (j.width as number) * (j.height as number), TILE_ID_COUNT)
  return w as LabWorld
}

/** FNV-1a over the world's data: two worlds with equal hashes are (almost surely) equal. */
export function hashLabWorld(w: LabWorld): number {
  const text = JSON.stringify(serializeLabWorld(w))
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return h >>> 0
}
