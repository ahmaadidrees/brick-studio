/**
 * Hackable Racing's Bricks drawer (docs/qa/hackable-modes/R1-SCREENS.md, lane 2): Track (Road, Dirt, Ice, Barrier,
 * Boost pad, Finish line), Racers (the Car, Computer racer), Start (Starter), then My bricks (remixes and the kid's own).
 *
 * Entries are always the level's own bricks, matched by brick id, never by grid character: the Boost pad and the
 * Platformer's Brick are both 'B', so nothing here asks the Platformer's catalog (standardKeyOf, gridEntryId) anything.
 */
import type { BrickDef } from '../../core/contracts'
import { brickEntryId, placeableBricks, type DrawerEntry } from '../builder/catalog'
import { CAR_BRICK_ID, RACER_BRICK_ID } from './carBrick'
import { STARTER_BRICK_ID, TRACK_BRICK_KEYS, type TrackBrickKey } from './raceTrack'

export type RaceDrawerCategory = 'track' | 'racers' | 'start' | 'mine'

const CATEGORIES: ReadonlyArray<{ id: RaceDrawerCategory; label: string }> = [
  { id: 'track', label: 'Track' },
  { id: 'racers', label: 'Racers' },
  { id: 'start', label: 'Start' },
  { id: 'mine', label: 'My bricks' },
]

export const raceDrawerCategories = (): ReadonlyArray<{ id: RaceDrawerCategory; label: string }> => CATEGORIES

/** What each track brick does, in a few words (the paint strip shows it while you paint). */
export const RACE_TRACK_HINTS: Readonly<Record<TrackBrickKey, string>> = {
  road: 'Cars go fastest on road',
  dirt: 'Bumpy: cars slow down on it',
  ice: 'Slippery: cars slide on it',
  barrier: 'Cars bounce off it',
  boost: 'Shoots cars forward',
  finish: 'Laps count here. Paint it right across the road',
}

const trackId = (key: TrackBrickKey) => `brick_${key}`
const HINTS_BY_ID: ReadonlyMap<string, string> = new Map([
  ...TRACK_BRICK_KEYS.map((key): [string, string] => [trackId(key), RACE_TRACK_HINTS[key]]),
  [CAR_BRICK_ID, 'You drive it with the arrow keys'],
  [RACER_BRICK_ID, 'Drives round the track by itself'],
  [STARTER_BRICK_ID, 'Counts down 3, 2, 1, go!'],
])

/** Built-in race bricks in drawer order, with their category. */
const ORDER: ReadonlyArray<[string, RaceDrawerCategory]> = [
  ...TRACK_BRICK_KEYS.map((key): [string, RaceDrawerCategory] => [trackId(key), 'track']),
  [CAR_BRICK_ID, 'racers'],
  [RACER_BRICK_ID, 'racers'],
  [STARTER_BRICK_ID, 'start'],
]
const RANK: ReadonlyMap<string, number> = new Map(ORDER.map(([id], i) => [id, i]))
const CATEGORY: ReadonlyMap<string, RaceDrawerCategory> = new Map(ORDER)

/** A built-in race brick, untouched: by its id. A remix ("My Car") or anything else is one of "My bricks". */
function categoryOf(brick: BrickDef): RaceDrawerCategory {
  return brick.remixOf ? 'mine' : CATEGORY.get(brick.id) ?? 'mine'
}

/** A built-in race brick's hint, by id (a remix keeps its original's). The kid's own bricks have none. */
export function raceBrickHint(brick: Pick<BrickDef, 'id' | 'remixOf'>): string | undefined {
  return HINTS_BY_ID.get(brick.remixOf ?? brick.id)
}

/** Every placeable brick the level has: the built-in ones in their fixed order, then the rest as the level lists them. */
export function raceDrawerEntries(bricks: readonly BrickDef[]): DrawerEntry[] {
  const rank = (b: BrickDef) => RANK.get(b.remixOf ?? b.id) ?? RANK.size
  const placeable = placeableBricks(bricks)
  return placeable
    .map((b, i) => ({ b, i }))
    .sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i)
    .map(({ b }) => ({ id: brickEntryId(b.id), name: b.name, category: categoryOf(b), brick: b, asset: b.costumes[0]?.asset, hint: raceBrickHint(b) }))
}

/** The paint strip's words while a grid brick is armed: a built-in track brick's hint, by id. */
export function raceDrawerHint(brick: BrickDef): string | undefined {
  return brick.grid ? raceBrickHint(brick) : undefined
}

/** The entry the armed brush matches: always the brick's own entry, by id. */
export function raceDrawerActive(brushBrickId: string | null, bricks: readonly BrickDef[]): string | null {
  return brushBrickId && bricks.some((b) => b.id === brushBrickId && !b.isStage) ? brickEntryId(brushBrickId) : null
}
