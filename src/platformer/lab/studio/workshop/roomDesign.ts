/**
 * The Workshop's test room: a tiny sandbox LevelDesign built around one brick. Pure and deterministic (no UI), so it
 * can be tested headlessly. About 320 x 160 steps, a tile floor and tile walls, plus the level's own walls (the core
 * stops bodies at the level edges, so the room works even before tiles are simulated).
 */
import type { BrickDef, LevelDesign, TileLayer, Value } from '../../core/contracts'
import { TILE_CHAR, TILE_SIZE } from '../../core/contracts'
import { createHeroBrick, HERO_BRICK_ID } from '../hero/heroBrick'

export const ROOM_WIDTH = 320
export const ROOM_HEIGHT = 160
export const ROOM_COLS = ROOM_WIDTH / TILE_SIZE
export const ROOM_ROWS = ROOM_HEIGHT / TILE_SIZE
/** Top of the one-row tile floor. */
export const ROOM_FLOOR_TOP = TILE_SIZE
export const HELPER_X = 64
export const BRICK_X = 176

export interface TestRoomOptions {
  /** Knob values to run with, keyed by variable id (the same idea as a painted copy's knobs). */
  knobs?: Record<string, Value>
  /** The project's Hero brick to use as the helper. Defaults to the built-in Hero. */
  hero?: BrickDef
}

export function isHeroBrick(brick: BrickDef): boolean {
  return brick.id === HERO_BRICK_ID
}

/** Tile floor along the bottom row and a wall column on each side, all ground. */
export function roomTiles(): TileLayer {
  const G = TILE_CHAR.ground
  const data = Array.from({ length: ROOM_ROWS }, (_, r) => {
    if (r === 0) return G.repeat(ROOM_COLS)
    return G + '.'.repeat(ROOM_COLS - 2) + G
  })
  return { cols: ROOM_COLS, rows: ROOM_ROWS, data }
}

function copyY(brick: BrickDef): number {
  const h = brick.costumes[0]?.height ?? TILE_SIZE
  // Drop in a hair above the floor and let gravity settle it.
  return ROOM_FLOOR_TOP + h / 2 + 1
}

/**
 * The room for one brick. A non-Hero brick gets a helper Hero (from `opts.hero` or the built-in one) to touch coins,
 * land on springs and reach goals; the Hero brick runs on its own. `stage` supplies the project's global variables
 * and lists but none of its scripts or backdrops.
 */
export function buildTestRoom(brick: BrickDef, stage: BrickDef, opts: TestRoomOptions = {}): LevelDesign {
  const hero = isHeroBrick(brick)
  const helper = hero ? undefined : (opts.hero ?? createHeroBrick().brick)
  const bricks = helper ? [brick, helper] : [brick]
  const knobs = opts.knobs && Object.keys(opts.knobs).length > 0 ? { ...opts.knobs } : undefined
  const copies = [
    ...(helper ? [{ id: 'room_helper', brickId: helper.id, x: HELPER_X, y: copyY(helper) }] : []),
    { id: 'room_brick', brickId: brick.id, x: hero ? HELPER_X : BRICK_X, y: copyY(brick), ...(knobs ? { knobs } : {}) },
  ]
  return {
    id: 'workshop_room',
    name: 'Test room',
    seed: 1,
    bounds: { left: 0, right: ROOM_WIDTH, bottom: 0, top: ROOM_HEIGHT },
    stage: { ...stage, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: stage.program.variables, lists: stage.program.lists } },
    bricks,
    copies,
    tiles: roomTiles(),
  }
}
