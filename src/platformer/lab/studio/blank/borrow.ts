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
  { id: 'car', name: 'Car', what: 'drives', shelf: 'race', player: true, needs: RACE_NEEDS, make: () => made(createCarBrick()) },
  { id: 'racer', name: 'Computer racer', what: 'drives itself', shelf: 'race', needs: RACE_NEEDS, make: () => made(createRacerBrick()) },
  { id: 'starter', name: 'Starter', what: '3, 2, 1, go!', shelf: 'race', needs: RACE_NEEDS, make: () => ({ brick: strip(createStarterBrick()), workspace: createStarterWorkspace() }) },
  { id: 'road', name: 'Road', what: 'tiles', shelf: 'race', make: () => ({ brick: strip(createTrackBrick('road')), workspace: trackWorkspace('road') }) },
  { id: 'barrier', name: 'Barrier', what: 'tiles', shelf: 'race', make: () => ({ brick: strip(createTrackBrick('barrier')), workspace: trackWorkspace('barrier') }) },
  { id: 'finish', name: 'Finish', what: 'counts laps', shelf: 'race', make: () => ({ brick: strip(createTrackBrick('finish')), workspace: trackWorkspace('finish') }) },
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

/** The borrowed brick, ready to add: a free name and, for a grid brick, a free character. */
export function borrowedBrick(design: Pick<LevelDesign, 'bricks'>, item: Borrowable): { brick: Omit<BrickDef, 'id'>; workspace: unknown } {
  const { brick, workspace } = item.make()
  const name = freeBrickName(brick.name, design.bricks.map((b) => b.name))
  // The copy is the kid's own: it no longer remembers the kit's brick it came from.
  const { remixOf: _remixOf, ...rest } = brick
  return { brick: { ...rest, name, ...(brick.grid ? { grid: { ...brick.grid, char: freeGridChar(design, brick.grid.char) } } : {}) }, workspace }
}
