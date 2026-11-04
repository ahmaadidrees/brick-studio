/**
 * Built-in bricks that a level gets only when a kid picks them (parity bucket B, 2026-11-04): the classic
 * bricks rebuilt with open code. A new project doesn't carry them, so saves stay small; the Bricks drawer offers each
 * one, and picking it adds a fresh copy to the level under its catalog id (store.addCatalogBrick). From then on it is a
 * built-in brick like the Walker: "Back to the original" works (remix.ts reads this list), and changing its blocks
 * makes it "My ...".
 *
 * Each Platformer brick talks to the rest of the level only through broadcasts and Platformer blocks, so it works in
 * any Platformer that has a Hero. Racing's are track bricks (race/raceExtras.ts).
 */
import type { BrickDef, LevelDesign } from '../../core/contracts'
import type { MadeBrick } from '../starter'
import type { StudioProject } from '../store'
import { createMovingPlatformBrick, createUpDownPlatformBrick, LIFT_BRICK_ID, PLATFORM_BRICK_ID } from './platforms'
import { CHECKPOINT_BRICK_ID, createCheckpointBrick } from './checkpoint'
import { FLYER_BRICK_ID, SHELLBUG_BRICK_ID, SPIKY_BRICK_ID, createFlyerBrick, createShellbugBrick, createSpikyBrick } from './critters'
import { BUMPER_BRICK_ID, TIRES_BRICK_ID, createRaceExtraBrick } from '../race/raceExtras'

export interface ExtraBrick {
  /** Catalog id, the id the brick has in a level. */
  id: string
  /** The drawer category: the Platformer's (catalog.ts CatalogCategory) or Racing's (race/raceDrawer.ts). */
  category: 'terrain' | 'blocks' | 'items' | 'critters' | 'course' | 'track' | 'scenery'
  /** One line for the paint strip and the drawer. */
  hint: string
  make(): MadeBrick
}

export const PLATFORMER_EXTRAS: readonly ExtraBrick[] = [
  { id: PLATFORM_BRICK_ID, category: 'blocks', hint: 'Glides side to side and carries you', make: () => createMovingPlatformBrick() },
  { id: LIFT_BRICK_ID, category: 'blocks', hint: 'Goes up and down and carries you', make: () => createUpDownPlatformBrick() },
  { id: CHECKPOINT_BRICK_ID, category: 'course', hint: 'Touch it: get hurt and you come back here', make: () => createCheckpointBrick() },
  { id: SHELLBUG_BRICK_ID, category: 'critters', hint: 'Stomp it into a shell, then kick the shell', make: () => createShellbugBrick() },
  { id: FLYER_BRICK_ID, category: 'critters', hint: 'Bobs up and down; stomp off its wings', make: () => createFlyerBrick() },
  { id: SPIKY_BRICK_ID, category: 'critters', hint: 'Walks, and hurts from every side: don\'t stomp it', make: () => createSpikyBrick() },
]

/** Hackable Racing's, in drawer order. */
export const RACE_EXTRAS: readonly ExtraBrick[] = [
  { id: TIRES_BRICK_ID, category: 'track', hint: 'Soaks up a crash: cars hardly bounce', make: () => createRaceExtraBrick(TIRES_BRICK_ID) },
  { id: BUMPER_BRICK_ID, category: 'track', hint: 'Kicks cars back the way they came', make: () => createRaceExtraBrick(BUMPER_BRICK_ID) },
]

const ALL: readonly ExtraBrick[] = [...PLATFORMER_EXTRAS, ...RACE_EXTRAS]
const BY_ID: ReadonlyMap<string, ExtraBrick> = new Map(ALL.map((x) => [x.id, x]))
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

/**
 * A fresh copy to add to a level. A grid brick whose character another brick of the level already paints with gets a
 * free one (`taken`), so its cells never turn into the other brick's.
 */
export function freshExtra(id: string, taken: ReadonlySet<string> = new Set()): { brick: BrickDef; workspace: unknown } | undefined {
  const m = extraOriginal(id)
  if (!m) return undefined
  const fresh = copyOf({ brick: m.brick, workspace: m.workspace })
  const grid = fresh.brick.grid
  if (grid && taken.has(grid.char)) {
    const free = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'].find((c) => !taken.has(c))
    if (!free) return undefined
    fresh.brick = { ...fresh.brick, grid: { ...grid, char: free } }
  }
  return fresh
}

/** Every extra brick as one project, for the remix catalog (remix.ts `catalogOriginal`). It is never played. */
export function createExtrasProject(): StudioProject {
  const bricks = ALL.map((x) => extraOriginal(x.id)!)
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
