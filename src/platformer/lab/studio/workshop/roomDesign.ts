/**
 * The Workshop's test room: a tiny sandbox LevelDesign built around one brick. Pure and deterministic (no UI), so it
 * can be tested headlessly. About 320 x 160 steps, a floor and walls of Ground cells (the standard Ground grid brick is
 * added to the room, step 7), plus the level's own walls. A grid brick's room has a few of its own cells painted where
 * the helper Hero will touch them (see `roomCells`).
 */
import type { BrickDef, LevelDesign, TileLayer, Value } from '../../core/contracts'
import { TILE_SIZE } from '../../core/contracts'
import { gridBrickTemplate } from '../gridBricks'
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

/** The room's brick id for the standard Ground (a room never shares ids with the project). */
export const ROOM_GROUND_ID = 'room_ground'

/**
 * Floor along the bottom row and a wall column on each side, all `ground` (the Ground brick's character), plus, for a
 * grid brick, `cells` (its character): a run on the floor the Hero walks into (spikes, lava, bounce, walls) and a run
 * floating above it the Hero can jump up into from below (? block, brick) or land on top of (one-way, bounce).
 */
export function roomTiles(ground = 'G', cells?: string): TileLayer {
  const rows = Array.from({ length: ROOM_ROWS }, (_, r) => {
    if (r === 0) return (ground.repeat(ROOM_COLS)).split('')
    const row = Array.from({ length: ROOM_COLS }, () => '.')
    row[0] = ground
    row[ROOM_COLS - 1] = ground
    return row
  })
  if (cells) {
    for (const col of ROOM_FLOOR_RUN) rows[1][col] = cells
    for (const col of ROOM_AIR_RUN) rows[ROOM_AIR_ROW][col] = cells
  }
  return { cols: ROOM_COLS, rows: ROOM_ROWS, data: rows.map((r) => r.join('')) }
}

/** Columns of the cells on the floor (x 128 to 176, in the helper's path), and of the cells floating above it. */
export const ROOM_FLOOR_RUN = [8, 9, 10]
export const ROOM_AIR_RUN = [12, 13, 14]
/** Bottom of the floating run is two tiles over the floor: a jump from the floor bumps it from below. */
export const ROOM_AIR_ROW = 3

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
  // Grid cells need their bricks: the room always has the standard Ground (its floor), or the brick itself if it is Ground.
  const groundTemplate = gridBrickTemplate('ground')
  const groundChar = groundTemplate.brick.grid?.char ?? 'G'
  const isGround = brick.grid?.char === groundChar
  const ground: BrickDef | undefined = isGround ? undefined : { ...groundTemplate.brick, id: ROOM_GROUND_ID }
  const floorChar = isGround ? groundChar : ground!.grid!.char
  const bricks = [brick, ...(helper ? [helper] : []), ...(ground ? [ground] : [])]
  const knobs = opts.knobs && Object.keys(opts.knobs).length > 0 ? { ...opts.knobs } : undefined
  // A grid brick is the cells, not a copy; any other brick is one copy.
  const copies = [
    ...(helper ? [{ id: 'room_helper', brickId: helper.id, x: HELPER_X, y: copyY(helper) }] : []),
    ...(brick.grid ? [] : [{ id: 'room_brick', brickId: brick.id, x: hero ? HELPER_X : BRICK_X, y: copyY(brick), ...(knobs ? { knobs } : {}) }]),
  ]
  return {
    id: 'workshop_room',
    name: 'Test room',
    seed: 1,
    bounds: { left: 0, right: ROOM_WIDTH, bottom: 0, top: ROOM_HEIGHT },
    stage: { ...stage, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: stage.program.variables, lists: stage.program.lists } },
    bricks,
    copies,
    tiles: roomTiles(floorChar, brick.grid?.char),
  }
}
