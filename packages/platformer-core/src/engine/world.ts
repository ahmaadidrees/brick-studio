import { LEVEL_MAX_OBJECTS, RESPAWN_TICKS, SUB, TS, fdiv, sub } from './constants'
import { moveX, moveY, overlaps, tileAt, type Box } from './collide'
import type { EditOp, WorldEvent } from './events'
import {
  OBJECT_KINDS,
  SINGLETON_KINDS,
  STYLES,
  THEMES,
  decodeRuns,
  encodeRuns,
  levelFromJson,
  levelToJson,
  type LevelDesign,
  type LevelJson,
  type LevelObject,
} from './level'
import { C, T, TILE_ID_COUNT, holdsContent, isBumpable } from './tiles'

// =============================================================================================
// The shared world. Everything in here is deterministic: the same level plus the same events at
// the same ticks produce bit-identical state on every machine. Whole numbers only, fixed
// iteration order, no clocks, no randomness.
// =============================================================================================

/** Entity kinds. */
export const EK = {
  WALKER: 1,
  SHELLBUG: 2,
  SPIKY: 3,
  FLYER: 4,
  PLATFORM: 5,
  GROW: 6,
  SPARK_ITEM: 7,
  SPARK_SHOT: 8,
  COIN_POP: 9,
} as const

/** Entity states. */
export const ES = {
  ACTIVE: 0,
  SQUASHED: 1,
  DEAD: 2,
  SHELL: 3,
  SLIDING: 4,
  EMERGING: 5,
  BURST: 6,
} as const

export interface Entity extends Box {
  id: number
  kind: number
  vx: number
  vy: number
  /** Position at the start of the current tick. Riders and stomp checks use it. */
  ox: number
  oy: number
  dir: number
  state: number
  timer: number
  /** The level object this came from, or 0 (items released from blocks, sparks). */
  spawn: number
  /** Player number that threw it (sparks). */
  owner: number
  /** Kind-specific: flyers' bob centre, platforms' origin and axis. */
  a: number
  b: number
  c: number
  /** 0 = alive, 1 = defeated (comes back later), 2 = deleted by an edit. */
  rm: number
}

export interface Bump {
  tx: number
  ty: number
  timer: number
}

export interface Respawn {
  spawn: number
  at: number
}

export type EffectKind =
  | 'coin'
  | 'bump'
  | 'break'
  | 'stomp'
  | 'kick'
  | 'kill'
  | 'grow'
  | 'spark-up'
  | 'item'
  | 'throw'
  | 'burst'
  | 'thud'
  | 'bounce'
  | 'sparkle'
  | 'reset'
  | 'poof'
  | 'propeller'

/** Something that happened this tick, for sounds, particles and rewards. Not part of the state. */
export interface Effect {
  k: EffectKind
  /** Pixel position. */
  x: number
  y: number
  /** Player number that caused it, 0 for the world itself. */
  by: number
  /** Entity id or tile index, used to recognise the same effect when a tick is re-simulated. */
  id: number
}

export interface World {
  tick: number
  width: number
  height: number
  design: LevelDesign
  /** Live tiles: the design with coins taken, bricks broken and blocks used. */
  tiles: Uint8Array
  entities: Entity[]
  nextId: number
  bumps: Bump[]
  respawns: Respawn[]
  effects: Effect[]
  /** Copy-on-write flags: arrays currently shared with a snapshot. */
  cow: number
}

export interface AppliedEvent {
  ev: WorldEvent
  by: number
}

const COW_TILES = 1
const COW_DTILES = 2
const COW_CONTENTS = 4
const COW_OBJECTS = 8
const COW_ALL = 15

// Tuning for the world's inhabitants (sub-pixel units per tick).
const GRAVITY = sub(0.25)
const MAX_FALL = sub(4)
const WALK_SPEED = sub(0.5)
const SHELL_SPEED = sub(3)
const ITEM_SPEED = sub(1)
const EMERGE_SPEED = sub(0.5)
const EMERGE_TICKS = 32
const SPARK_SPEED = sub(3.25)
const SPARK_GRAVITY = sub(0.35)
const SPARK_MAX_FALL = sub(4)
const SPARK_BOUNCE = sub(2.5)
const SPARK_LIFE = 150
const SPARKS_PER_PLAYER = 2
const SHELL_WAKE_WARN = 420
const SHELL_WAKE = 510
const SQUASH_TICKS = 30
const BUMP_TICKS = 12
const PLATFORM_SPEED = sub(1)
const PLATFORM_RANGE = 5 * TS
// Flyers bob with constant acceleration toward their centre: closed form, no drift.
const FLY_ACC = 8
const FLY_Q = 40
const FLY_AMP = (FLY_ACC * FLY_Q * FLY_Q) / 2

const SIZE: Record<number, [number, number]> = {
  [EK.WALKER]: [sub(14), sub(14)],
  [EK.SHELLBUG]: [sub(14), sub(14)],
  [EK.SPIKY]: [sub(14), sub(14)],
  [EK.FLYER]: [sub(14), sub(14)],
  [EK.PLATFORM]: [sub(48), sub(8)],
  [EK.GROW]: [sub(14), sub(15)],
  [EK.SPARK_ITEM]: [sub(14), sub(15)],
  [EK.SPARK_SHOT]: [sub(8), sub(8)],
  [EK.COIN_POP]: [sub(16), sub(16)],
}

export const isEnemy = (e: Entity): boolean =>
  e.kind === EK.WALKER || e.kind === EK.SHELLBUG || e.kind === EK.SPIKY || e.kind === EK.FLYER

/** An enemy that is still in play (not squashed or knocked out). */
export const isKillable = (e: Entity): boolean =>
  isEnemy(e) && e.rm === 0 && (e.state === ES.ACTIVE || e.state === ES.SHELL || e.state === ES.SLIDING)

export const isItem = (e: Entity): boolean => e.kind === EK.GROW || e.kind === EK.SPARK_ITEM

// ---------------------------------------------------------------------------------------------
// Creation, snapshots and copy-on-write

export function createWorld(design: LevelDesign, tick = 0): World {
  const w: World = {
    tick,
    width: design.width,
    height: design.height,
    design: { ...design, tiles: design.tiles.slice(), contents: design.contents.slice(), objects: design.objects.map((o) => ({ ...o })) },
    tiles: design.tiles.slice(),
    entities: [],
    nextId: 1,
    bumps: [],
    respawns: [],
    effects: [],
    cow: 0,
  }
  for (const o of w.design.objects) spawnFromObject(w, o)
  return w
}

/**
 * An immutable copy of the world for rollback. Big arrays are shared, not copied: whichever
 * world writes to one next copies it first.
 */
export function snapshotWorld(w: World): World {
  w.cow = COW_ALL
  return {
    ...w,
    design: { ...w.design },
    entities: w.entities.map((e) => ({ ...e })),
    bumps: w.bumps.map((b) => ({ ...b })),
    respawns: w.respawns.map((r) => ({ ...r })),
    effects: [],
    cow: COW_ALL,
  }
}

/** A live, writable world starting from a snapshot. The snapshot stays untouched. */
export const restoreWorld = (snap: World): World => snapshotWorld(snap)

function ownTiles(w: World) {
  if (w.cow & COW_TILES) {
    w.tiles = w.tiles.slice()
    w.cow &= ~COW_TILES
  }
}
function ownDesignTiles(w: World) {
  if (w.cow & COW_DTILES) {
    w.design.tiles = w.design.tiles.slice()
    w.cow &= ~COW_DTILES
  }
}
function ownContents(w: World) {
  if (w.cow & COW_CONTENTS) {
    w.design.contents = w.design.contents.slice()
    w.cow &= ~COW_CONTENTS
  }
}
function ownObjects(w: World) {
  if (w.cow & COW_OBJECTS) {
    w.design.objects = w.design.objects.slice()
    w.cow &= ~COW_OBJECTS
  }
}

function setLiveTile(w: World, i: number, t: number) {
  if (w.tiles[i] === t) return
  ownTiles(w)
  w.tiles[i] = t
}

// ---------------------------------------------------------------------------------------------
// Lookups

export function findEntity(w: World, id: number): Entity | undefined {
  // Entities are appended with increasing ids and removals keep order, so the list is sorted.
  const list = w.entities
  let lo = 0
  let hi = list.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const v = list[mid].id
    if (v === id) return list[mid]
    if (v < id) lo = mid + 1
    else hi = mid - 1
  }
  return undefined
}

export const findObject = (w: World, id: number): LevelObject | undefined => w.design.objects.find((o) => o.id === id)

function effect(w: World, k: EffectKind, x: number, y: number, by: number, id: number) {
  w.effects.push({ k, x: fdiv(x, SUB), y: fdiv(y, SUB), by, id })
}

// ---------------------------------------------------------------------------------------------
// Spawning

function addEntity(w: World, kind: number, centerX: number, bottomY: number, dir: number, spawn: number): Entity {
  const [ew, eh] = SIZE[kind]
  const x = centerX - ew / 2
  const y = bottomY - eh
  const e: Entity = {
    id: w.nextId++,
    kind,
    x,
    y,
    w: ew,
    h: eh,
    vx: 0,
    vy: 0,
    ox: x,
    oy: y,
    dir,
    state: ES.ACTIVE,
    timer: 0,
    spawn,
    owner: 0,
    a: 0,
    b: 0,
    c: 0,
    rm: 0,
  }
  w.entities.push(e)
  return e
}

export function spawnFromObject(w: World, o: LevelObject): Entity | undefined {
  const cx = o.x * TS + TS / 2
  const bottom = (o.y + 1) * TS
  switch (o.kind) {
    case 'walker':
      return addEntity(w, EK.WALKER, cx, bottom, o.dir, o.id)
    case 'shellbug':
      return addEntity(w, EK.SHELLBUG, cx, bottom, o.dir, o.id)
    case 'spiky':
      return addEntity(w, EK.SPIKY, cx, bottom, o.dir, o.id)
    case 'flyer': {
      const e = addEntity(w, EK.FLYER, cx, bottom, o.dir, o.id)
      e.a = e.y
      return e
    }
    case 'platform': {
      const e = addEntity(w, EK.PLATFORM, o.x * TS + SIZE[EK.PLATFORM][0] / 2, o.y * TS + SIZE[EK.PLATFORM][1], o.dir, o.id)
      e.a = e.x
      e.b = e.y
      e.c = o.alt
      return e
    }
    case 'grow':
      return addEntity(w, EK.GROW, cx, bottom, o.dir, o.id)
    case 'spark':
      return addEntity(w, EK.SPARK_ITEM, cx, bottom, o.dir, o.id)
    default:
      return undefined
  }
}

function releaseContent(w: World, tx: number, ty: number, content: number, dir: number, by: number) {
  const idx = ty * w.width + tx
  if (content === C.COIN) {
    const e = addEntity(w, EK.COIN_POP, tx * TS + TS / 2, ty * TS, 1, 0)
    e.vy = -sub(5.5)
    effect(w, 'coin', tx * TS, (ty - 1) * TS, by, idx)
    return
  }
  const kind = content === C.GROW ? EK.GROW : EK.SPARK_ITEM
  const [, eh] = SIZE[kind]
  const e = addEntity(w, kind, tx * TS + TS / 2, ty * TS + eh, dir, 0)
  // Starts inside the block and rises out of it.
  e.y = ty * TS + TS - eh
  e.oy = e.y
  e.state = ES.EMERGING
  effect(w, 'item', tx * TS, ty * TS, by, e.id)
}

// ---------------------------------------------------------------------------------------------
// Events

function kill(w: World, e: Entity, dir: number, by: number) {
  e.state = ES.DEAD
  e.vy = -sub(3.5)
  e.vx = dir * sub(1)
  e.timer = 0
  effect(w, 'kill', e.x, e.y, by, e.id)
}

export function bumpTile(w: World, tx: number, ty: number, big: number, dir: number, by: number): boolean {
  if (tx < 0 || ty < 0 || tx >= w.width || ty >= w.height) return false
  const i = ty * w.width + tx
  const t = w.tiles[i]
  if (!isBumpable(t)) return false
  if (w.bumps.some((b) => b.tx === tx && b.ty === ty)) return false
  const content = w.design.contents[i]
  if (t === T.QBLOCK || (t === T.BRICK && content !== C.NONE)) {
    setLiveTile(w, i, T.USED)
    releaseContent(w, tx, ty, content === C.NONE ? C.COIN : content, dir, by)
    w.bumps.push({ tx, ty, timer: BUMP_TICKS })
    effect(w, 'bump', tx * TS, ty * TS, by, i)
  } else if (t === T.BRICK && big) {
    setLiveTile(w, i, T.EMPTY)
    effect(w, 'break', tx * TS, ty * TS, by, i)
  } else {
    w.bumps.push({ tx, ty, timer: BUMP_TICKS })
    effect(w, t === T.BOUNCE ? 'bounce' : 'bump', tx * TS, ty * TS, by, i)
  }
  // Whatever stands on the block gets knocked: enemies are defeated, items hop.
  const top = ty * TS
  for (const e of w.entities) {
    if (e.rm) continue
    const feet = e.y + e.h
    if (feet < top - 2 * SUB || feet > top + 4 * SUB) continue
    if (e.x + e.w <= tx * TS || e.x >= (tx + 1) * TS) continue
    if (isKillable(e)) kill(w, e, e.x * 2 + e.w < tx * TS * 2 + TS ? -1 : 1, by)
    else if (isItem(e) && e.state === ES.ACTIVE) e.vy = -sub(3.5)
  }
  // A coin sitting on the block is collected by whoever hit it.
  if (ty > 0 && w.tiles[i - w.width] === T.COIN) {
    setLiveTile(w, i - w.width, T.EMPTY)
    effect(w, 'coin', tx * TS, (ty - 1) * TS, by, i - w.width)
  }
  return true
}

function removeObjectEntities(w: World, id: number) {
  for (const e of w.entities) if (e.spawn === id && e.rm === 0) e.rm = 2
  if (w.respawns.length) w.respawns = w.respawns.filter((r) => r.spawn !== id)
}

function applyOp(w: World, op: EditOp): boolean {
  const d = w.design
  switch (op.o) {
    case 'tile': {
      const i = op.y * w.width + op.x
      const t = op.t < TILE_ID_COUNT ? op.t : T.EMPTY
      const c = holdsContent(t) ? op.c : 0
      if (d.tiles[i] === t && d.contents[i] === c && w.tiles[i] === t) return false
      ownDesignTiles(w)
      ownContents(w)
      d.tiles[i] = t
      d.contents[i] = c
      setLiveTile(w, i, t)
      if (w.bumps.length) w.bumps = w.bumps.filter((b) => b.tx !== op.x || b.ty !== op.y)
      return true
    }
    case 'add': {
      if (d.objects.length >= LEVEL_MAX_OBJECTS || d.objects.some((o) => o.id === op.obj.id)) return false
      ownObjects(w)
      if (SINGLETON_KINDS.has(op.obj.kind)) {
        for (const o of d.objects) if (o.kind === op.obj.kind) removeObjectEntities(w, o.id)
        d.objects = d.objects.filter((o) => o.kind !== op.obj.kind)
      }
      const obj = { ...op.obj }
      d.objects.push(obj)
      spawnFromObject(w, obj)
      return true
    }
    case 'del': {
      const idx = d.objects.findIndex((o) => o.id === op.id)
      if (idx < 0) return false
      ownObjects(w)
      d.objects.splice(idx, 1)
      removeObjectEntities(w, op.id)
      return true
    }
    case 'move': {
      const idx = d.objects.findIndex((o) => o.id === op.id)
      if (idx < 0) return false
      const old = d.objects[idx]
      if (old.x === op.x && old.y === op.y) return false
      ownObjects(w)
      const moved = { ...old, x: op.x, y: op.y }
      d.objects[idx] = moved
      removeObjectEntities(w, op.id)
      spawnFromObject(w, moved)
      return true
    }
    case 'theme':
      if (d.theme === op.theme) return false
      d.theme = op.theme
      return true
    case 'style':
      if (d.style === op.style) return false
      d.style = op.style
      return true
    case 'title':
      if (d.title === op.title) return false
      d.title = op.title
      return true
  }
}

export function resetWorld(w: World) {
  w.tiles = w.design.tiles.slice()
  w.cow &= ~COW_TILES
  w.entities = []
  w.bumps = []
  w.respawns = []
  for (const o of w.design.objects) spawnFromObject(w, o)
  effect(w, 'reset', 0, 0, 0, 0)
}

/** Apply one event. Returns false when it no longer makes sense (the enemy is already gone, etc). */
export function applyEvent(w: World, ev: WorldEvent, by: number): boolean {
  switch (ev.t) {
    case 'edit': {
      let changed = false
      for (const op of ev.ops) changed = applyOp(w, op) || changed
      return changed
    }
    case 'stomp': {
      const e = findEntity(w, ev.id)
      if (!e || e.rm) return false
      if (e.kind === EK.WALKER && e.state === ES.ACTIVE) {
        e.state = ES.SQUASHED
        e.timer = 0
        e.vx = 0
      } else if (e.kind === EK.FLYER && e.state === ES.ACTIVE) {
        e.kind = EK.WALKER
        e.vy = 0
        e.timer = 0
        effect(w, 'propeller', e.x, e.y, by, e.id)
      } else if (e.kind === EK.SHELLBUG && (e.state === ES.ACTIVE || e.state === ES.SLIDING)) {
        e.state = ES.SHELL
        e.timer = 0
        e.vx = 0
      } else if (e.kind === EK.SHELLBUG && e.state === ES.SHELL) {
        e.state = ES.SLIDING
        e.dir = ev.dir
        e.timer = 0
        effect(w, 'kick', e.x, e.y, by, e.id)
        return true
      } else {
        return false
      }
      effect(w, 'stomp', e.x, e.y, by, e.id)
      return true
    }
    case 'kick': {
      const e = findEntity(w, ev.id)
      if (!e || e.rm || e.kind !== EK.SHELLBUG || e.state !== ES.SHELL) return false
      e.state = ES.SLIDING
      e.dir = ev.dir
      e.timer = 0
      effect(w, 'kick', e.x, e.y, by, e.id)
      return true
    }
    case 'bump':
      return bumpTile(w, ev.x, ev.y, ev.big, ev.dir, by)
    case 'coin': {
      const i = ev.y * w.width + ev.x
      if (ev.x < 0 || ev.y < 0 || ev.x >= w.width || ev.y >= w.height || w.tiles[i] !== T.COIN) return false
      setLiveTile(w, i, T.EMPTY)
      effect(w, 'coin', ev.x * TS, ev.y * TS, by, i)
      return true
    }
    case 'take': {
      const e = findEntity(w, ev.id)
      if (!e || e.rm || !isItem(e) || (e.state !== ES.ACTIVE && e.state !== ES.EMERGING)) return false
      e.rm = 1
      effect(w, e.kind === EK.GROW ? 'grow' : 'spark-up', e.x, e.y, by, e.id)
      return true
    }
    case 'spark': {
      let mine = 0
      for (const e of w.entities) if (e.kind === EK.SPARK_SHOT && e.owner === by && e.state === ES.ACTIVE && !e.rm) mine++
      if (mine >= SPARKS_PER_PLAYER) return false
      const e = addEntity(w, EK.SPARK_SHOT, ev.x, ev.y, ev.dir, 0)
      e.owner = by
      e.vy = sub(1)
      effect(w, 'throw', e.x, e.y, by, e.id)
      return true
    }
    case 'reset':
      resetWorld(w)
      return true
    case 'load': {
      let d: LevelDesign
      try {
        d = levelFromJson(ev.level)
      } catch {
        return false
      }
      w.design = d
      w.width = d.width
      w.height = d.height
      w.cow &= ~(COW_DTILES | COW_CONTENTS | COW_OBJECTS)
      w.respawns = []
      resetWorld(w)
      return true
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Stepping

function fall(w: World, e: Entity): number {
  e.vy = Math.min(e.vy + GRAVITY, MAX_FALL)
  const r = moveY(w, e, e.vy)
  if (r !== 0) e.vy = 0
  return r
}

function walk(w: World, e: Entity) {
  e.vx = e.dir * WALK_SPEED
  if (moveX(w, e, e.vx) !== null) e.dir = -e.dir
  fall(w, e)
}

function flyOffset(t: number): number {
  const q = FLY_Q
  const u = t % q
  const a = FLY_ACC
  switch (Math.floor(t / q) % 4) {
    case 0:
      return -(a * q * u - (a * u * u) / 2)
    case 1:
      return -(FLY_AMP - (a * u * u) / 2)
    case 2:
      return a * q * u - (a * u * u) / 2
    default:
      return FLY_AMP - (a * u * u) / 2
  }
}

function platformOffset(t: number): number {
  const half = PLATFORM_RANGE / PLATFORM_SPEED
  const p = t % (2 * half)
  return (p < half ? p : 2 * half - p) * PLATFORM_SPEED
}

function updateEntity(w: World, e: Entity) {
  switch (e.kind) {
    case EK.WALKER:
    case EK.SPIKY:
      if (e.state === ES.ACTIVE) walk(w, e)
      else if (e.state === ES.SQUASHED && ++e.timer >= SQUASH_TICKS) e.rm = 1
      break
    case EK.SHELLBUG:
      if (e.state === ES.ACTIVE) walk(w, e)
      else if (e.state === ES.SHELL) {
        e.timer++
        if (e.timer === SHELL_WAKE_WARN) effect(w, 'poof', e.x, e.y, 0, e.id)
        if (e.timer >= SHELL_WAKE) {
          e.state = ES.ACTIVE
          e.timer = 0
        }
        fall(w, e)
      } else if (e.state === ES.SLIDING) {
        e.vx = e.dir * SHELL_SPEED
        const col = moveX(w, e, e.vx)
        if (col !== null) {
          const r1 = fdiv(e.y + e.h - 1, TS)
          for (let r = fdiv(e.y, TS); r <= r1; r++) if (isBumpable(tileAt(w, col, r))) bumpTile(w, col, r, 1, -e.dir, 0)
          e.dir = -e.dir
          effect(w, 'thud', e.x, e.y, 0, e.id)
        }
        fall(w, e)
      }
      break
    case EK.FLYER:
      if (e.state === ES.ACTIVE) {
        e.timer++
        e.y = e.a + flyOffset(e.timer)
        e.vy = e.y - e.oy
      }
      break
    case EK.PLATFORM: {
      e.timer++
      const d = e.dir * platformOffset(e.timer)
      if (e.c === 0) e.x = e.a + d
      else e.y = e.b + d
      e.vx = e.x - e.ox
      e.vy = e.y - e.oy
      break
    }
    case EK.GROW:
    case EK.SPARK_ITEM:
      if (e.state === ES.EMERGING) {
        e.y -= EMERGE_SPEED
        if (++e.timer >= EMERGE_TICKS) {
          e.state = ES.ACTIVE
          e.vy = 0
        }
      } else {
        if (e.kind === EK.GROW) {
          e.vx = e.dir * ITEM_SPEED
          if (moveX(w, e, e.vx) !== null) e.dir = -e.dir
        }
        fall(w, e)
      }
      break
    case EK.SPARK_SHOT:
      if (e.state === ES.ACTIVE) {
        e.vx = e.dir * SPARK_SPEED
        if (moveX(w, e, e.vx) !== null || ++e.timer > SPARK_LIFE) {
          e.state = ES.BURST
          e.timer = 0
          effect(w, 'burst', e.x, e.y, e.owner, e.id)
          break
        }
        e.vy = Math.min(e.vy + SPARK_GRAVITY, SPARK_MAX_FALL)
        const r = moveY(w, e, e.vy)
        if (r === 1) e.vy = -SPARK_BOUNCE
        else if (r === -1) e.vy = 0
      } else if (++e.timer > 8) e.rm = 2
      break
    case EK.COIN_POP:
      e.vy += sub(0.35)
      e.y += e.vy
      if (++e.timer >= 26) {
        e.rm = 2
        effect(w, 'sparkle', e.x, e.y, 0, e.id)
      }
      break
  }
  if (e.state === ES.DEAD) {
    e.vy = Math.min(e.vy + GRAVITY, MAX_FALL)
    e.x += e.vx
    e.y += e.vy
  }
  if (e.y > (w.height + 4) * TS && e.rm === 0) e.rm = e.spawn ? 1 : 2
}

function interact(w: World) {
  const list = w.entities
  const n = list.length
  for (let i = 0; i < n; i++) {
    const a = list[i]
    if (a.rm) continue
    if (a.kind === EK.SHELLBUG && a.state === ES.SLIDING) {
      for (let j = 0; j < n; j++) {
        const b = list[j]
        if (j === i || !isKillable(b) || !overlaps(a, b)) continue
        if (b.kind === EK.SHELLBUG && b.state === ES.SLIDING) {
          kill(w, a, b.dir, 0)
          kill(w, b, a.dir, 0)
          break
        }
        kill(w, b, a.dir, 0)
      }
    } else if (a.kind === EK.SPARK_SHOT && a.state === ES.ACTIVE) {
      for (let j = 0; j < n; j++) {
        const b = list[j]
        if (!isKillable(b) || !overlaps(a, b)) continue
        kill(w, b, a.dir, a.owner)
        a.state = ES.BURST
        a.timer = 0
        effect(w, 'burst', a.x, a.y, a.owner, a.id)
        break
      }
    }
  }
  // Walking enemies turn around when they meet.
  for (let i = 0; i < n; i++) {
    const a = list[i]
    if (a.rm || a.state !== ES.ACTIVE || (a.kind !== EK.WALKER && a.kind !== EK.SHELLBUG && a.kind !== EK.SPIKY)) continue
    for (let j = i + 1; j < n; j++) {
      const b = list[j]
      if (b.rm || b.state !== ES.ACTIVE || (b.kind !== EK.WALKER && b.kind !== EK.SHELLBUG && b.kind !== EK.SPIKY)) continue
      if (!overlaps(a, b)) continue
      const aLeft = a.x <= b.x
      a.dir = aLeft ? -1 : 1
      b.dir = aLeft ? 1 : -1
    }
  }
}

function cleanup(w: World) {
  let any = false
  for (const e of w.entities) if (e.rm) any = true
  if (!any) return
  w.entities = w.entities.filter((e) => {
    if (!e.rm) return true
    if (e.rm === 1 && e.spawn) w.respawns.push({ spawn: e.spawn, at: w.tick + RESPAWN_TICKS })
    return false
  })
}

function processRespawns(w: World) {
  if (!w.respawns.length) return
  let due = false
  for (const r of w.respawns) if (r.at <= w.tick) due = true
  if (!due) return
  const later: Respawn[] = []
  for (const r of w.respawns) {
    if (r.at > w.tick) {
      later.push(r)
      continue
    }
    const o = findObject(w, r.spawn)
    if (!o || w.entities.some((e) => e.spawn === o.id)) continue
    const e = spawnFromObject(w, o)
    if (e) effect(w, 'poof', e.x, e.y, 0, e.id)
  }
  w.respawns = later
}

/** Advance one tick: apply this tick's events in order, then move everything. */
export function advanceWorld(w: World, events: readonly AppliedEvent[] = []): boolean[] {
  w.tick++
  w.effects = []
  const results = events.map(({ ev, by }) => applyEvent(w, ev, by))
  for (const e of w.entities) {
    if (e.rm) continue
    e.ox = e.x
    e.oy = e.y
    updateEntity(w, e)
  }
  interact(w)
  cleanup(w)
  processRespawns(w)
  if (w.bumps.length) {
    for (const b of w.bumps) b.timer--
    w.bumps = w.bumps.filter((b) => b.timer > 0)
  }
  return results
}

// ---------------------------------------------------------------------------------------------
// Hashing and serialisation

/** FNV-1a over the whole logical state. Two worlds with equal hashes are (almost surely) equal. */
export function hashWorld(w: World): number {
  let h = 0x811c9dc5
  const mix = (n: number) => {
    h = Math.imul(h ^ (n | 0), 0x01000193)
    h = Math.imul(h ^ Math.floor(n / 4294967296), 0x01000193)
  }
  const bytes = (a: Uint8Array) => {
    for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], 0x01000193)
  }
  mix(w.tick)
  mix(w.nextId)
  mix(w.width)
  mix(w.height)
  for (const e of w.entities) {
    mix(e.id)
    mix(e.kind)
    mix(e.x)
    mix(e.y)
    mix(e.w)
    mix(e.h)
    mix(e.vx)
    mix(e.vy)
    mix(e.dir)
    mix(e.state)
    mix(e.timer)
    mix(e.spawn)
    mix(e.owner)
    mix(e.a)
    mix(e.b)
    mix(e.c)
    mix(e.rm)
  }
  for (const b of w.bumps) {
    mix(b.tx)
    mix(b.ty)
    mix(b.timer)
  }
  for (const r of w.respawns) {
    mix(r.spawn)
    mix(r.at)
  }
  bytes(w.tiles)
  bytes(w.design.tiles)
  bytes(w.design.contents)
  for (const o of w.design.objects) {
    mix(o.id)
    mix(OBJECT_KINDS.indexOf(o.kind))
    mix(o.x)
    mix(o.y)
    mix(o.dir)
    mix(o.alt)
  }
  mix(THEMES.indexOf(w.design.theme))
  mix(STYLES.indexOf(w.design.style))
  return h >>> 0
}

export interface WorldJson {
  tick: number
  level: LevelJson
  tiles: string
  nextId: number
  entities: number[][]
  bumps: number[][]
  respawns: number[][]
}

const ENTITY_FIELDS = ['id', 'kind', 'x', 'y', 'w', 'h', 'vx', 'vy', 'ox', 'oy', 'dir', 'state', 'timer', 'spawn', 'owner', 'a', 'b', 'c', 'rm'] as const

export function serializeWorld(w: World): WorldJson {
  return {
    tick: w.tick,
    level: levelToJson(w.design),
    tiles: encodeRuns(w.tiles),
    nextId: w.nextId,
    entities: w.entities.map((e) => ENTITY_FIELDS.map((f) => e[f])),
    bumps: w.bumps.map((b) => [b.tx, b.ty, b.timer]),
    respawns: w.respawns.map((r) => [r.spawn, r.at]),
  }
}

export function deserializeWorld(j: WorldJson): World {
  const design = levelFromJson(j.level)
  const w = createWorld(design, j.tick)
  w.tiles = decodeRuns(j.tiles, design.width * design.height, TILE_ID_COUNT)
  w.nextId = j.nextId
  w.entities = j.entities.map((row) => {
    const e = {} as Record<string, number>
    ENTITY_FIELDS.forEach((f, i) => (e[f] = row[i]))
    return e as unknown as Entity
  })
  w.bumps = j.bumps.map(([tx, ty, timer]) => ({ tx, ty, timer }))
  w.respawns = j.respawns.map(([spawn, at]) => ({ spawn, at }))
  return w
}
