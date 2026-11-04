/**
 * What the Bricks drawer offers (step 7). There are no fixed tiles any more: Terrain and Blocks list the standard grid
 * bricks (offered even before the level has them; picking one adds it from `gridBrickTemplate`), the kid's own grid
 * bricks go under My bricks, and other bricks are sorted into the real builder's categories by name (Walker is a
 * critter, Coin an item...), anything else being one of "My bricks".
 */
import type { BrickDef } from '../../core/contracts'
import { catalogOriginal } from '../remix'
import { GRID_BRICK_KEYS, gridBrickTemplate, type GridBrickKey, type GridBrickTemplate } from '../gridBricks'
import { PLATFORMER_EXTRAS, extraBrick, extraOriginal } from '../builtins/extras'

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
export function categoryForBrick(brick: Pick<BrickDef, 'name'> & Partial<Pick<BrickDef, 'id' | 'remixOf'>>): CatalogCategory {
  if (brick.remixOf || (brick.id && !isCatalogBrick(brick as BrickDef))) return 'mine'
  const extra = brick.id ? extraBrick(brick.id) : undefined
  if (extra) return extra.category
  return BY_NAME[brick.name.trim().toLowerCase().replace(/\s+\d+$/, '')] ?? 'mine'
}

export const brickEntryId = (brickId: string) => `brick:${brickId}`
export const isBrickEntry = (id: string) => id.startsWith('brick:')
export const brickIdOf = (entryId: string) => entryId.slice('brick:'.length)
export const gridEntryId = (key: string) => `grid:${key}`
export const isGridEntry = (id: string) => id.startsWith('grid:')
export const gridKeyOf = (entryId: string) => entryId.slice('grid:'.length) as GridBrickKey
/** A built-in brick the level doesn't have yet (builtins/extras.ts): picking it adds it. */
export const extraEntryId = (brickId: string) => `extra:${brickId}`
export const isExtraEntry = (id: string) => id.startsWith('extra:')
export const extraIdOf = (entryId: string) => entryId.slice('extra:'.length)

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

type GridLike = Pick<BrickDef, 'grid'> & Partial<Pick<BrickDef, 'id' | 'remixOf'>>

/**
 * Does this level brick stand for that standard grid brick? Its character matches, and it is not another kit's built-in
 * brick that happens to share the character: Hackable Racing's Boost pad is 'B', like the Platformer's Brick.
 */
function standsFor(brick: GridLike, key: GridBrickKey, ch: string | undefined): boolean {
  if (!ch || brick.grid?.char !== ch) return false
  const original = brick.id ? catalogOriginal(brick as BrickDef) : undefined
  return !original || original.brick.id === `brick_${key}`
}

/** The standard grid brick (by its character) a level brick stands for, if any. */
export function standardKeyOf(brick: GridLike): GridBrickKey | undefined {
  if (!brick.grid?.char) return undefined
  return standardTemplates().find((t) => standsFor(brick, t.key, t.template.brick.grid?.char))?.key
}

export interface DrawerEntry {
  id: string
  name: string
  /** A CatalogCategory for the Platformer; each kit names its own (kitScreens drawer.categories). */
  category: string
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
    const have = bricks.find((b) => standsFor(b, key, ch))
    if (have) used.add(have.id)
    out.push({
      id: gridEntryId(key),
      name: have?.name ?? template.brick.name,
      category: have && !isCatalogBrick(have) ? 'mine' : template.category,
      brick: have,
      asset: (have ?? template.brick).costumes[0]?.asset,
      key,
      hint: template.hint,
    })
  }
  // The level's own bricks, then the Platformer's other built-in bricks (parity bucket B: the level's copy, or an offer
  // to add one), then the kid's own bricks last, so the bricks kids know keep their places.
  const extras: DrawerEntry[] = []
  for (const extra of PLATFORMER_EXTRAS) {
    const have = bricks.find((b) => b.id === extra.id && !b.remixOf)
    if (have) used.add(have.id)
    const original = extraOriginal(extra.id)!.brick
    extras.push({
      id: have ? brickEntryId(have.id) : extraEntryId(extra.id),
      name: have?.name ?? original.name,
      category: extra.category,
      brick: have,
      asset: (have ?? original).costumes[0]?.asset,
      hint: extra.hint,
    })
  }
  const mine: DrawerEntry[] = []
  for (const b of placeableBricks(bricks)) {
    if (used.has(b.id)) continue
    const entry: DrawerEntry = { id: brickEntryId(b.id), name: b.name, category: b.grid ? 'mine' : categoryForBrick(b), brick: b, asset: b.costumes[0]?.asset }
    if (entry.category === 'mine') mine.push(entry)
    else out.push(entry)
  }
  out.push(...extras, ...mine)
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

/** Built-in identity follows the catalog definition, never a student's chosen display name. */
export function isCatalogBrick(brick: BrickDef): boolean {
  return !brick.remixOf && !!catalogOriginal(brick)
}

export function originalBrickName(brick: BrickDef): string | undefined {
  return catalogOriginal(brick)?.brick.name
}
