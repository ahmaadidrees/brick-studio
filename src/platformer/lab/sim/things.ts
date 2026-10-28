import { TS, fdiv, sub } from '@brick-studio/platformer-core/engine/constants'
import { tileAt } from '@brick-studio/platformer-core/engine/collide'
import { isSolid } from '@brick-studio/platformer-core/engine/tiles'
import type { Costume, Place, Who } from '../program/types'
import { SOLID_NONE, type Fiber, type LabHost, type LabWorld, type Thing } from './types'

/** Each costume's box in pixels (the drawing may reach past it), and how deep a rider sits in it. */
export const COSTUME_BOX: Readonly<Record<Costume, { w: number; h: number; seat?: number }>> = {
  hero: { w: 12, h: 14 },
  walker: { w: 14, h: 14 },
  walkerFlat: { w: 14, h: 7 },
  spiky: { w: 14, h: 14 },
  flyer: { w: 14, h: 14 },
  spring: { w: 16, h: 16 },
  springDown: { w: 16, h: 16 },
  qblock: { w: 16, h: 16 },
  usedBlock: { w: 16, h: 16 },
  platform: { w: 48, h: 8 },
  coin: { w: 12, h: 14 },
  goal: { w: 8, h: 160 },
  ball: { w: 8, h: 8 },
  car: { w: 30, h: 14, seat: 8 },
  rocket: { w: 14, h: 30, seat: 3 },
  rocketFire: { w: 14, h: 30, seat: 3 },
  crate: { w: 16, h: 16 },
  star: { w: 14, h: 14 },
}

export const PLAYER_BRICK = 'you'

export function findThing(w: LabWorld, id: number): Thing | undefined {
  if (!id) return undefined
  // Things are appended with increasing ids and removals keep order, so the list is sorted.
  const list = w.things
  let lo = 0
  let hi = list.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const v = list[mid].id
    if (v === id) return list[mid].removed ? undefined : list[mid]
    if (v < id) lo = mid + 1
    else hi = mid - 1
  }
  return undefined
}

export const player = (w: LabWorld): Thing | undefined => findThing(w, w.playerId)

/** A costume's box at a size, whole sub-pixels. */
export function boxOf(costume: Costume, size: number): { w: number; h: number } {
  const b = COSTUME_BOX[costume]
  const k = Math.max(0.1, Math.min(4, size / 100))
  return { w: Math.max(sub(2), Math.round(sub(b.w) * k)), h: Math.max(sub(2), Math.round(sub(b.h) * k)) }
}

/** Anything solid (tiles) in a box. */
export function boxHitsTiles(w: LabWorld, x: number, y: number, bw: number, bh: number): boolean {
  const c1 = fdiv(x + bw - 1, TS)
  const r1 = fdiv(y + bh - 1, TS)
  for (let r = fdiv(y, TS); r <= r1; r++) for (let c = fdiv(x, TS); c <= c1; c++) if (isSolid(tileAt(w, c, r))) return true
  return false
}

/** Change a thing's box (a costume or size change) around its bottom middle; step up out of anything solid. */
export function reshape(w: LabWorld, t: Thing) {
  const { w: nw, h: nh } = boxOf(t.costume, t.size)
  if (nw === t.w && nh === t.h) return
  const cx = t.x + t.w / 2
  const bottom = t.y + t.h
  t.w = nw
  t.h = nh
  t.x = Math.round(cx - nw / 2)
  t.y = bottom - nh
  if (!boxHitsTiles(w, t.x, t.y, t.w, t.h)) return
  for (let k = 1; k <= 4; k++) {
    const ny = (fdiv(bottom - 1, TS) - k + 1) * TS - t.h
    if (!boxHitsTiles(w, t.x, ny, t.w, t.h)) {
      t.y = ny
      return
    }
  }
}

export function newFiber(script: string, them = 0): Fiber {
  return { script, frames: [{ owner: script, arm: 'body', index: 0, at: '', loop: 0, left: 0 }], state: 0, wake: 0, until: '', them, on: '' }
}

/** A new thing of a brick, its bottom middle at (cx, bottom). It says "appear" on its first turn. */
export function spawnThing(w: LabWorld, host: LabHost, brick: string, cx: number, bottom: number, facing: 1 | -1, spawn: number): Thing {
  const info = host.brick(brick)
  const costume: Costume = info?.costume ?? 'crate'
  const box = boxOf(costume, 100)
  const t: Thing = {
    id: w.nextId++,
    brick,
    x: Math.round(cx - box.w / 2),
    y: bottom - box.h,
    w: box.w,
    h: box.h,
    vx: 0,
    vy: 0,
    ox: 0,
    oy: 0,
    facing,
    gravity: 100,
    bounce: 0,
    friction: 100,
    solid: SOLID_NONE,
    hero: false,
    controlsEnabled: true,
    physicsEnabled: true,
    jumpPct: 100,
    speedPct: 100,
    hs: { coyote: 0, buffer: 0, jumping: false, jumpHold: 0, skid: false, anim: 0 },
    onGround: false,
    ground: 0,
    rider: 0,
    riding: 0,
    costume,
    useCustomCostume: true,
    costumeFrame: 1,
    costumePlaying: false,
    costumeFps: info?.appearance?.fps ?? 8,
    costumeFrameDue: w.tick,
    visible: true,
    color: 'none',
    size: 100,
    say: null,
    sayUntil: 0,
    shown: [],
    mem: {},
    variables: {},
    fibers: [],
    events: [{ kind: 'appear' }],
    contacts: [],
    it: 0,
    born: w.tick,
    removed: false,
    spawn,
    hurtAt: -1000,
    made: 0,
  }
  t.ox = t.x
  t.oy = t.y
  w.things.push(t)
  return t
}

/** A placed thing's spot: its anchor cell's bottom middle, or the cell's left edge for things wider than a brick. */
export function placedSpot(costume: Costume, tx: number, ty: number): { cx: number; bottom: number } {
  const bw = sub(COSTUME_BOX[costume].w)
  const cx = bw > TS ? tx * TS + bw / 2 : tx * TS + TS / 2
  return { cx: Math.round(cx), bottom: (ty + 1) * TS }
}

/** Resolve a pronoun for the thing running a script. */
export function resolveWho(w: LabWorld, me: Thing, fiber: Fiber, who: Who): Thing | undefined {
  switch (who) {
    case 'me':
      return me
    case 'it':
      return findThing(w, me.it)
    case 'them':
      return findThing(w, fiber.them)
    case 'player':
      return findThing(w, w.playerId)
    case 'rider':
      return findThing(w, me.rider)
  }
}

/** A spot next to me for something `nw` × `nh`: its bottom middle. */
export function spotNear(w: LabWorld, me: Thing, place: Place, nw: number, nh: number): { cx: number; bottom: number } {
  const cx = me.x + me.w / 2
  switch (place) {
    case 'hand': {
      const x = me.facing > 0 ? me.x + me.w + sub(1) : me.x - nw - sub(1)
      const bottom = Math.round(me.y + me.h / 2 + nh / 2)
      const spot = { cx: Math.round(x + nw / 2), bottom }
      // Facing a wall: from my middle instead, so it never starts inside the wall.
      if (boxHitsTiles(w, spot.cx - nw / 2, bottom - nh, nw, nh)) return { cx: Math.round(cx), bottom }
      return spot
    }
    case 'feet':
      return { cx: Math.round(cx), bottom: me.y + me.h }
    case 'above':
      return { cx: Math.round(cx), bottom: me.y }
    case 'here':
      return { cx: Math.round(cx), bottom: Math.round(me.y + me.h / 2 + nh / 2) }
    case 'start':
      return { cx: w.start.x * TS + TS / 2, bottom: (w.start.y + 1) * TS }
  }
}

/** Does this thing belong to `brickId` (or a brick made from it)? */
export function isOfBrick(host: LabHost, t: Thing, brickId: string): boolean {
  if (t.brick === brickId) return true
  const info = host.brick(t.brick)
  return !!info && info.lineage.includes(brickId)
}
