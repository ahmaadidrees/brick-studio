/**
 * Hackable Racing's Bricks drawer (docs/qa/hackable-modes/R1-SCREENS.md). A first draft from the contract: every brick
 * the level has, sorted by its catalog id (a remix, or a brick of the kid's own, is one of "My bricks"). Entries are
 * always the level's own bricks, matched by id, never by grid character: the Boost pad and the Platformer's Brick are
 * both 'B'. Lane 2 (Build) owns this file.
 */
import type { BrickDef } from '../../core/contracts'
import { brickEntryId, placeableBricks, type DrawerEntry } from '../builder/catalog'
import { CAR_BRICK_ID, RACER_BRICK_ID } from './carBrick'
import { STARTER_BRICK_ID, TRACK_BRICK_KEYS } from './raceTrack'

export type RaceDrawerCategory = 'track' | 'racers' | 'start' | 'mine'

const CATEGORIES: ReadonlyArray<{ id: RaceDrawerCategory; label: string }> = [
  { id: 'track', label: 'Track' },
  { id: 'racers', label: 'Racers' },
  { id: 'start', label: 'Start' },
  { id: 'mine', label: 'My bricks' },
]

export const raceDrawerCategories = (): ReadonlyArray<{ id: RaceDrawerCategory; label: string }> => CATEGORIES

function categoryOf(brick: BrickDef): RaceDrawerCategory {
  if (brick.remixOf) return 'mine'
  if ((TRACK_BRICK_KEYS as readonly string[]).some((key) => brick.id === `brick_${key}`)) return 'track'
  if (brick.id === CAR_BRICK_ID || brick.id === RACER_BRICK_ID) return 'racers'
  if (brick.id === STARTER_BRICK_ID) return 'start'
  return 'mine'
}

export function raceDrawerEntries(bricks: readonly BrickDef[]): DrawerEntry[] {
  return placeableBricks(bricks).map((b) => ({ id: brickEntryId(b.id), name: b.name, category: categoryOf(b), brick: b, asset: b.costumes[0]?.asset }))
}

export function raceDrawerHint(_brick: BrickDef): string | undefined {
  return undefined
}

export function raceDrawerActive(brushBrickId: string | null, bricks: readonly BrickDef[]): string | null {
  return brushBrickId && bricks.some((b) => b.id === brushBrickId && !b.isStage) ? brickEntryId(brushBrickId) : null
}
