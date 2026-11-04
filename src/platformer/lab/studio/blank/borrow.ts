/**
 * Borrow a brick (docs/qa/blank-2d, board 4a): a copy of a kit's own brick, code and all, joins My bricks in a game made
 * from nothing. The copy is the kid's to change; nothing ties it to the kit any more.
 *
 * "From your class" (on the board) waits for the class shelf to hold bricks: today it holds only powers.
 */
import type { BrickDef, LevelDesign } from '../../core/contracts'
import { createCoinBrick, createGoalBrick, createSpringBrick, createWalkerBrick } from '../starter'
import { createHeroBrick } from '../hero/heroBrick'
import { createCarBrick, createRacerBrick, RACE_GLOBALS } from '../race/carBrick'
import { createStarterBrick, createStarterWorkspace, createTrackBrick, trackWorkspace } from '../race/raceTrack'
import { standardTemplate } from '../builder/catalog'
import { freeBrickName } from '../builder/newBrick'
import { createMovingPlatformBrick, createUpDownPlatformBrick } from '../builtins/platforms'
import { createCheckpointBrick } from '../builtins/checkpoint'
import { createFlyerBrick, createShellbugBrick, createSpikyBrick } from '../builtins/critters'
import { BUMPER_BRICK_ID, FLOWERS_BRICK_ID, STAND_BRICK_ID, TIRES_BRICK_ID, TREE_BRICK_ID, createRaceExtraBrick } from '../race/raceExtras'
import { rewriteReferences } from '../remix'
import { PLAYER_MENU } from '../../core/contracts'

export type BorrowShelf = 'platformer' | 'race'

export interface Borrowable {
  id: string
  name: string
  /** A few words under the picture: "runs, jumps". */
  what: string
  shelf: BorrowShelf
  /** It moves with the keys: borrowed into a game with no player yet, it becomes the player. */
  player?: boolean
  make(): { brick: Omit<BrickDef, 'id'>; workspace: unknown }
  /** The Stage variables and lists its code reads (Racing's laps to win and results). */
  needs?: { variables?: Array<{ id: string; name: string; value: number }>; lists?: Array<{ id: string; name: string }> }
}

const strip = ({ id: _id, ...rest }: BrickDef): Omit<BrickDef, 'id'> => rest
const made = (m: { brick: BrickDef; workspace: unknown }) => ({ brick: strip(m.brick), workspace: m.workspace })
const RACE_NEEDS = { variables: [{ id: RACE_GLOBALS.lapsToWin, name: 'laps to win', value: 3 }], lists: [{ id: RACE_GLOBALS.results, name: 'results' }] }

function grid(key: Parameters<typeof standardTemplate>[0]) {
  const t = standardTemplate(key)
  if (!t) throw new Error(`No grid brick ${key}`)
  return { brick: t.brick, workspace: t.workspace }
}

export const BORROWABLE: readonly Borrowable[] = [
  { id: 'hero', name: 'Hero', what: 'runs, jumps', shelf: 'platformer', player: true, make: () => made(createHeroBrick()) },
  { id: 'walker', name: 'Walker', what: 'paces', shelf: 'platformer', make: () => made(createWalkerBrick('b', 'Walker')) },
  { id: 'coin', name: 'Coin', what: 'collect', shelf: 'platformer', make: () => made(createCoinBrick('b', 'Coin')) },
  { id: 'spring', name: 'Spring', what: 'boing', shelf: 'platformer', make: () => made(createSpringBrick('b', 'Spring')) },
  { id: 'goal', name: 'Goal', what: 'ends the level', shelf: 'platformer', make: () => made(createGoalBrick('b', 'Goal')) },
  { id: 'ground', name: 'Ground', what: 'tiles', shelf: 'platformer', make: () => grid('ground') },
  { id: 'spikes', name: 'Spikes', what: 'ouch', shelf: 'platformer', make: () => grid('spikes') },
  // Parity B's classic bricks (studio/builtins).
  { id: 'platform', name: 'Moving platform', what: 'carries you', shelf: 'platformer', make: () => made(createMovingPlatformBrick('b')) },
  { id: 'lift', name: 'Up-down platform', what: 'lifts you', shelf: 'platformer', make: () => made(createUpDownPlatformBrick('b')) },
  { id: 'checkpoint', name: 'Checkpoint', what: 'come back here', shelf: 'platformer', make: () => made(createCheckpointBrick('b')) },
  { id: 'spiky', name: 'Spiky', what: 'don\'t stomp', shelf: 'platformer', make: () => made(createSpikyBrick('b')) },
  { id: 'flyer', name: 'Flyer', what: 'bobs, stomp it', shelf: 'platformer', make: () => made(createFlyerBrick('b')) },
  { id: 'shellbug', name: 'Shellbug', what: 'kick its shell', shelf: 'platformer', make: () => made(createShellbugBrick('b')) },
  { id: 'car', name: 'Car', what: 'drives', shelf: 'race', player: true, needs: RACE_NEEDS, make: () => made(createCarBrick()) },
  { id: 'racer', name: 'Computer racer', what: 'drives itself', shelf: 'race', needs: RACE_NEEDS, make: () => made(createRacerBrick()) },
  { id: 'starter', name: 'Starter', what: '3, 2, 1, go!', shelf: 'race', needs: RACE_NEEDS, make: () => ({ brick: strip(createStarterBrick()), workspace: createStarterWorkspace() }) },
  { id: 'road', name: 'Road', what: 'tiles', shelf: 'race', make: () => ({ brick: strip(createTrackBrick('road')), workspace: trackWorkspace('road') }) },
  { id: 'barrier', name: 'Barrier', what: 'tiles', shelf: 'race', make: () => ({ brick: strip(createTrackBrick('barrier')), workspace: trackWorkspace('barrier') }) },
  { id: 'finish', name: 'Finish', what: 'counts laps', shelf: 'race', make: () => ({ brick: strip(createTrackBrick('finish')), workspace: trackWorkspace('finish') }) },
  // Parity B's track bricks (race/raceExtras.ts): a borrowed Car or Computer racer bounces off each by "what I hit".
  { id: 'tires', name: 'Tire stack', what: 'soft crash', shelf: 'race', make: () => made(createRaceExtraBrick(TIRES_BRICK_ID)) },
  { id: 'bumper', name: 'Bumper', what: 'kicks back', shelf: 'race', make: () => made(createRaceExtraBrick(BUMPER_BRICK_ID)) },
  { id: 'tree', name: 'Tree', what: 'scenery', shelf: 'race', make: () => made(createRaceExtraBrick(TREE_BRICK_ID)) },
  { id: 'grandstand', name: 'Grandstand', what: 'scenery', shelf: 'race', make: () => made(createRaceExtraBrick(STAND_BRICK_ID)) },
  { id: 'flowers', name: 'Flowers', what: 'slow grass', shelf: 'race', make: () => made(createRaceExtraBrick(FLOWERS_BRICK_ID)) },
]

export const BORROW_SHELVES: ReadonlyArray<{ id: BorrowShelf; label: string }> = [
  { id: 'platformer', label: 'From the Platformer' },
  { id: 'race', label: 'From Racing' },
]

/** Characters a grid brick can take, in the order they are handed out. Never '.', the empty cell. */
const GRID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#*+=%&@$!?~^'

/** A grid character no grid brick in this design has, the wanted one when it is free. */
export function freeGridChar(design: Pick<LevelDesign, 'bricks'>, wanted?: string): string {
  const taken = new Set(design.bricks.flatMap((b) => (b.grid ? [b.grid.char] : [])))
  if (wanted && wanted !== '.' && wanted.length === 1 && !taken.has(wanted)) return wanted
  for (const ch of GRID_CHARS) if (!taken.has(ch)) return ch
  throw new Error('No grid characters left')
}

/** The name the kits' bricks use for the Platformer's player. */
const KIT_HERO = 'Hero'

/**
 * A kit brick's code names the player "Hero" (touching Hero?, y position of Hero, when I bump Hero). A game from nothing
 * names its player by id, so a borrowed brick's menus say "the player" instead (core/contracts.ts PLAYER_MENU): a
 * Walker hurts Zip, a Coin counts for Zip, a Checkpoint raises its flag for Zip. The player bricks themselves (Hero,
 * Car) keep their code as it is.
 */
export function aimAtThePlayer<T>(code: T): T {
  return rewriteReferences(code, KIT_HERO, PLAYER_MENU) as T
}

/**
 * A borrowed brick's own variables and lists keep the kit's ids ("b_speed", "car_top"), and a project's ids must all
 * differ (core/project.ts validateDesign), so a second Walker, or a Walker and a Spiky, made a save that would not open
 * again. Each id the game already uses gets a fresh one, the same in the brick's program and in its blocks.
 */
function withFreshIds(design: Pick<LevelDesign, 'bricks'> & Partial<Pick<LevelDesign, 'stage'>>, made: { brick: Omit<BrickDef, 'id'>; workspace: unknown }) {
  const taken = new Set<string>()
  for (const b of design.stage ? [design.stage, ...design.bricks] : design.bricks) for (const d of [...b.program.variables, ...b.program.lists]) taken.add(d.id)
  const own = [...made.brick.program.variables, ...made.brick.program.lists].map((d) => d.id)
  const clashing = own.filter((id) => taken.has(id))
  if (!clashing.length) return made
  const used = new Set([...taken, ...own])
  let program = JSON.stringify(made.brick.program)
  let workspace = JSON.stringify(made.workspace ?? null)
  for (const id of clashing) {
    let n = 2
    while (used.has(`${id}_${n}`)) n++
    const fresh = `${id}_${n}`
    used.add(fresh)
    program = program.split(JSON.stringify(id)).join(JSON.stringify(fresh))
    workspace = workspace.split(JSON.stringify(id)).join(JSON.stringify(fresh))
  }
  return { brick: { ...made.brick, program: JSON.parse(program) as BrickDef['program'] }, workspace: JSON.parse(workspace) as unknown }
}

/** The borrowed brick, ready to add: a free name, ids of its own and, for a grid brick, a free character. */
export function borrowedBrick(design: Pick<LevelDesign, 'bricks'> & Partial<Pick<LevelDesign, 'stage'>>, item: Borrowable): { brick: Omit<BrickDef, 'id'>; workspace: unknown } {
  const made = withFreshIds(design, item.make())
  const brick = item.player ? made.brick : { ...made.brick, program: aimAtThePlayer(made.brick.program) }
  const workspace = item.player ? made.workspace : aimAtThePlayer(made.workspace)
  const name = freeBrickName(brick.name, design.bricks.map((b) => b.name))
  // The copy is the kid's own: it no longer remembers the kit's brick it came from.
  const { remixOf: _remixOf, ...rest } = brick
  return { brick: { ...rest, name, ...(brick.grid ? { grid: { ...brick.grid, char: freeGridChar(design, brick.grid.char) } } : {}) }, workspace }
}
