/**
 * Hackable Racing's Bricks drawer (docs/qa/hackable-modes/R1-SCREENS.md, lane 2): Track (Road, Dirt, Ice, Barrier,
 * Boost pad, Finish line), Racers (the Car, Computer racer), Start (Starter), then My bricks (remixes and the kid's own).
 *
 * Entries are always the level's own bricks, matched by brick id, never by grid character: the Boost pad and the
 * Platformer's Brick are both 'B', so nothing here asks the Platformer's catalog (standardKeyOf, gridEntryId) anything.
 */
import type { BrickDef } from '../../core/contracts'
import { brickEntryId, extraEntryId, placeableBricks, type DrawerEntry } from '../builder/catalog'
import { RACE_EXTRAS, extraOriginal } from '../builtins/extras'
import { CAR_BRICK_ID, RACER_BRICK_ID } from './carBrick'
import { STARTER_BRICK_ID, TRACK_BRICK_KEYS, type TrackBrickKey } from './raceTrack'

export type RaceDrawerCategory = 'track' | 'racers' | 'start' | 'scenery' | 'mine'

const CATEGORIES: ReadonlyArray<{ id: RaceDrawerCategory; label: string }> = [
  { id: 'track', label: 'Track' },
  { id: 'racers', label: 'Racers' },
  { id: 'start', label: 'Start' },
  // Parity bucket B: the classic kit's trees, grandstands and flowers.
  { id: 'scenery', label: 'Scenery' },
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
  ...RACE_EXTRAS.map((x): [string, string] => [x.id, x.hint]),
])

/** Built-in race bricks in drawer order, with their category: the starter's, with the classic kit's (parity B) after its kind. */
const extrasIn = (category: RaceDrawerCategory): Array<[string, RaceDrawerCategory]> => RACE_EXTRAS.filter((x) => x.category === category).map((x) => [x.id, category])
const ORDER: ReadonlyArray<[string, RaceDrawerCategory]> = [
  ...TRACK_BRICK_KEYS.map((key): [string, RaceDrawerCategory] => [trackId(key), 'track']),
  ...extrasIn('track'),
  [CAR_BRICK_ID, 'racers'],
  [RACER_BRICK_ID, 'racers'],
  [STARTER_BRICK_ID, 'start'],
  ...extrasIn('scenery'),
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

/**
 * Every placeable brick the level has, plus the classic kit's bricks it doesn't have yet (parity bucket B: picking one
 * adds it): the built-in ones in their fixed order, then the rest as the level lists them.
 */
export function raceDrawerEntries(bricks: readonly BrickDef[]): DrawerEntry[] {
  const rank = (id: string) => RANK.get(id) ?? RANK.size
  const placeable = placeableBricks(bricks)
  const have = new Set(placeable.filter((b) => !b.remixOf).map((b) => b.id))
  const entries = placeable.map((b, i) => ({
    rank: rank(b.remixOf ?? b.id),
    i,
    entry: { id: brickEntryId(b.id), name: b.name, category: categoryOf(b), brick: b, asset: b.costumes[0]?.asset, hint: raceBrickHint(b) } as DrawerEntry,
  }))
  for (const x of RACE_EXTRAS) {
    if (have.has(x.id)) continue
    const original = extraOriginal(x.id)!.brick
    entries.push({ rank: rank(x.id), i: -1, entry: { id: extraEntryId(x.id), name: original.name, category: x.category, brick: undefined, asset: original.costumes[0]?.asset, hint: x.hint } })
  }
  return entries.sort((a, b) => a.rank - b.rank || a.i - b.i).map((e) => e.entry)
}

/** The paint strip's words while a grid brick is armed: a built-in track brick's hint, by id. */
export function raceDrawerHint(brick: BrickDef): string | undefined {
  return brick.grid ? raceBrickHint(brick) : undefined
}

/** The entry the armed brush matches: always the brick's own entry, by id. */
export function raceDrawerActive(brushBrickId: string | null, bricks: readonly BrickDef[]): string | null {
  return brushBrickId && bricks.some((b) => b.id === brushBrickId && !b.isStage) ? brickEntryId(brushBrickId) : null
}
