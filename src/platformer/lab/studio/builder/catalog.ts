/**
 * What the Bricks drawer offers. Tiles are fixed; bricks come from the level's own bricks and are sorted into the
 * real builder's categories by name (Walker is a critter, Coin an item...). Anything else is one of "My bricks".
 */
import type { BrickDef } from '../../core/contracts'
import { TILE_CHAR } from '../../core/contracts'

export type CatalogCategory = 'terrain' | 'blocks' | 'items' | 'critters' | 'course' | 'mine'

export const CATALOG_CATEGORIES: { id: CatalogCategory; label: string }[] = [
  { id: 'terrain', label: 'Terrain' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'items', label: 'Items' },
  { id: 'critters', label: 'Critters' },
  { id: 'course', label: 'Start and goal' },
  { id: 'mine', label: 'My bricks' },
]

export const NEW_BRICK_ID = 'new-brick'

export interface TileEntry {
  id: string
  label: string
  category: CatalogCategory
  /** The TILE_CHAR value painted. */
  ch: string
  /** Art key shared with the real 2D builder's drawer. */
  art: string
  hint?: string
}

export const TILE_ENTRIES: TileEntry[] = [
  { id: 'tile:ground', label: 'Ground', category: 'terrain', ch: TILE_CHAR.ground, art: 'g:0:day' },
  { id: 'tile:hard', label: 'Hard block', category: 'terrain', ch: TILE_CHAR.hard, art: 'hard' },
  { id: 'tile:spikes', label: 'Spikes', category: 'terrain', ch: TILE_CHAR.spikes, art: 'spikes' },
  { id: 'tile:lava', label: 'Lava', category: 'terrain', ch: TILE_CHAR.lava, art: 'lava:0:1' },
  { id: 'tile:brick', label: 'Brick', category: 'blocks', ch: TILE_CHAR.brick, art: 'brick' },
  { id: 'tile:qblock', label: '? block', category: 'blocks', ch: TILE_CHAR.qblock, art: 'q:0' },
]

const BY_NAME: Record<string, CatalogCategory> = {
  spring: 'blocks',
  coin: 'items',
  walker: 'critters',
  hero: 'course',
  start: 'course',
  goal: 'course',
}

/** Which drawer category a brick belongs in. */
export function categoryForBrick(brick: Pick<BrickDef, 'name'>): CatalogCategory {
  return BY_NAME[brick.name.trim().toLowerCase().replace(/\s+\d+$/, '')] ?? 'mine'
}

export const brickEntryId = (brickId: string) => `brick:${brickId}`
export const isBrickEntry = (id: string) => id.startsWith('brick:')
export const brickIdOf = (entryId: string) => entryId.slice('brick:'.length)

/** The entry the armed brush matches: a tile, a brick, or null. */
export function activeEntryId(brushTile: string | null, brushBrickId: string | null): string | null {
  if (brushTile) return TILE_ENTRIES.find((t) => t.ch === brushTile)?.id ?? null
  return brushBrickId ? brickEntryId(brushBrickId) : null
}

export function tileEntryById(id: string): TileEntry | undefined {
  return TILE_ENTRIES.find((t) => t.id === id)
}

/** The Stage is not a brick you can place. */
export function placeableBricks(bricks: readonly BrickDef[]): BrickDef[] {
  return bricks.filter((b) => !b.isStage)
}
