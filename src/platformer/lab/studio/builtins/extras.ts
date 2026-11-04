/**
 * Built-in Platformer bricks that a level gets only when a kid picks them (parity bucket B, 2026-11-04): the classic
 * bricks rebuilt with open code. A new project doesn't carry them, so saves stay small; the Bricks drawer offers each
 * one, and picking it adds a fresh copy to the level under its catalog id (store.addCatalogBrick). From then on it is a
 * built-in brick like the Walker: "Back to the original" works (remix.ts reads this list), and changing its blocks
 * makes it "My ...".
 *
 * Each brick talks to the rest of the level only through broadcasts and Platformer blocks, so it works in any
 * Platformer that has a Hero.
 */
import type { BrickDef, LevelDesign } from '../../core/contracts'
import type { MadeBrick } from '../starter'
import type { StudioProject } from '../store'
import { createMovingPlatformBrick, createUpDownPlatformBrick, LIFT_BRICK_ID, PLATFORM_BRICK_ID } from './platforms'
import { CHECKPOINT_BRICK_ID, createCheckpointBrick } from './checkpoint'

export interface ExtraBrick {
  /** Catalog id, the id the brick has in a level. */
  id: string
  /** The Platformer drawer category (catalog.ts CatalogCategory). */
  category: 'terrain' | 'blocks' | 'items' | 'critters' | 'course'
  /** One line for the paint strip and the drawer. */
  hint: string
  make(): MadeBrick
}

export const PLATFORMER_EXTRAS: readonly ExtraBrick[] = [
  { id: PLATFORM_BRICK_ID, category: 'blocks', hint: 'Glides side to side and carries you', make: () => createMovingPlatformBrick() },
  { id: LIFT_BRICK_ID, category: 'blocks', hint: 'Goes up and down and carries you', make: () => createUpDownPlatformBrick() },
  { id: CHECKPOINT_BRICK_ID, category: 'course', hint: 'Touch it: get hurt and you come back here', make: () => createCheckpointBrick() },
]

const BY_ID: ReadonlyMap<string, ExtraBrick> = new Map(PLATFORMER_EXTRAS.map((x) => [x.id, x]))
export const extraBrick = (id: string): ExtraBrick | undefined => BY_ID.get(id)

const made = new Map<string, MadeBrick>()
/** One shared copy of an extra brick, built the first time it is needed. Never change it in place: clone it first. */
export function extraOriginal(id: string): MadeBrick | undefined {
  const x = BY_ID.get(id)
  if (!x) return undefined
  let m = made.get(id)
  if (!m) made.set(id, (m = x.make()))
  return m
}

/** A deep copy that keeps costume masks as plain, same-realm byte arrays (structuredClone may not, in every host). */
function copyOf<T>(value: T): T {
  if (ArrayBuffer.isView(value)) return new Uint8Array(value as unknown as Uint8Array) as T
  if (Array.isArray(value)) return value.map(copyOf) as T
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copyOf(v)])) as T
  return value
}

/** A fresh copy to add to a level. */
export function freshExtra(id: string): { brick: BrickDef; workspace: unknown } | undefined {
  const m = extraOriginal(id)
  return m ? copyOf({ brick: m.brick, workspace: m.workspace }) : undefined
}

/** Every extra brick as one project, for the remix catalog (remix.ts `catalogOriginal`). It is never played. */
export function createExtrasProject(): StudioProject {
  const bricks = PLATFORMER_EXTRAS.map((x) => extraOriginal(x.id)!)
  const design: LevelDesign = {
    id: 'platformer_extras',
    name: 'Platformer bricks',
    seed: 1,
    bounds: { left: 0, right: 480, bottom: 0, top: 360 },
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
    bricks: bricks.map((m) => m.brick),
    copies: [],
  }
  return { design, workspaces: Object.fromEntries(bricks.map((m) => [m.brick.id, m.workspace])) }
}
