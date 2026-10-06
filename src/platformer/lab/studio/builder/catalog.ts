/**
 * What the Bricks drawer offers (step 7). There are no fixed tiles any more: Terrain and Blocks list the standard grid
 * bricks (offered even before the level has them; picking one adds it from `gridBrickTemplate`), the kid's own grid
 * bricks go under My bricks, and other bricks are sorted into the real builder's categories by name (Walker is a
 * critter, Coin an item...), anything else being one of "My bricks".
 */
import type { BrickDef } from '../../core/contracts'
import { GRID_BRICK_KEYS, gridBrickTemplate, type GridBrickKey, type GridBrickTemplate } from '../gridBricks'

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
export const gridEntryId = (key: string) => `grid:${key}`
export const isGridEntry = (id: string) => id.startsWith('grid:')
export const gridKeyOf = (entryId: string) => entryId.slice('grid:'.length) as GridBrickKey

const templates = new Map<GridBrickKey, GridBrickTemplate | null>()

/** A standard grid brick's template, built once. Null if it cannot be built (nothing is offered for it). */
export function standardTemplate(key: GridBrickKey): GridBrickTemplate | null {
  if (!templates.has(key)) {
    try {
      templates.set(key, gridBrickTemplate(key))
    } catch (err) {
      console.warn(`Code Lab: grid brick "${key}" is unavailable:`, err)
      templates.set(key, null)
    }
  }
  return templates.get(key) ?? null
}

/** The standard grid bricks, in Bricks panel order. */
export function standardTemplates(): { key: GridBrickKey; template: GridBrickTemplate }[] {
  const out: { key: GridBrickKey; template: GridBrickTemplate }[] = []
  for (const key of GRID_BRICK_KEYS) {
    const template = standardTemplate(key)
    if (template) out.push({ key, template })
  }
  return out
}

/** The standard grid brick (by its character) a level brick stands for, if any. */
export function standardKeyOf(brick: Pick<BrickDef, 'grid'>): GridBrickKey | undefined {
  const ch = brick.grid?.char
  if (!ch) return undefined
  return standardTemplates().find((t) => t.template.brick.grid?.char === ch)?.key
}

export interface DrawerEntry {
  id: string
  name: string
  category: CatalogCategory
  /** The level's brick this entry arms, or undefined for a standard grid brick the level does not have yet. */
  brick?: BrickDef
  /** First costume of the brick (or of the template), for the thumbnail. */
  asset?: string
  /** Set for standard grid bricks. */
  key?: GridBrickKey
  hint?: string
}

/** Everything the drawer lists, in order (the "+ New brick" tile is added by the panel). */
export function drawerEntries(bricks: readonly BrickDef[]): DrawerEntry[] {
  const out: DrawerEntry[] = []
  const used = new Set<string>()
  for (const { key, template } of standardTemplates()) {
    const ch = template.brick.grid?.char
    const have = bricks.find((b) => b.grid?.char === ch)
    if (have) used.add(have.id)
    out.push({
      id: gridEntryId(key),
      name: template.brick.name,
      category: template.category,
      brick: have,
      asset: (have ?? template.brick).costumes[0]?.asset,
      key,
      hint: template.hint,
    })
  }
  for (const b of placeableBricks(bricks)) {
    if (used.has(b.id)) continue
    out.push({ id: brickEntryId(b.id), name: b.name, category: b.grid ? 'mine' : categoryForBrick(b), brick: b, asset: b.costumes[0]?.asset })
  }
  return out
}

/** The entry the armed brush matches, or null. */
export function activeEntryId(brushBrickId: string | null, bricks: readonly BrickDef[]): string | null {
  const brick = brushBrickId ? bricks.find((b) => b.id === brushBrickId) : undefined
  if (!brick) return null
  const key = brick.grid ? standardKeyOf(brick) : undefined
  return key ? gridEntryId(key) : brickEntryId(brick.id)
}

/** The Stage is not a brick you can place. */
export function placeableBricks(bricks: readonly BrickDef[]): BrickDef[] {
  return bricks.filter((b) => !b.isStage)
}
