/**
 * A tiny flat test level for the Hero: a long solid floor and one Hero standing on it. The feel harness plugs this in
 * (`createHeroTestDesign()`), then drives the Hero with key presses.
 *
 * Level is 1920 x 360 steps, y up, (0, 0) bottom-left. The floor's top is y = 16. The Hero's box bottom sits on it, so
 * the Hero's costume center rests at y = 24 and its opaque box (12 x 14) spans x +-6 around the copy's x.
 */
import type { BrickDef, Costume, LevelDesign } from '../../core/contracts'
import { compileWorkspace } from '../../core/editor/compile'
import { costumeFromImage, imageFromRows } from '../pixels'
import { createHeroBrick, HERO_BRICK_ID } from './heroBrick'

export const HERO_LEVEL_WIDTH = 1920
export const HERO_LEVEL_HEIGHT = 360
export const FLOOR_TOP = 16
/** The Hero's copy y when standing on the floor: floor top plus half the 16 x 16 costume. */
export const HERO_STAND_Y = FLOOR_TOP + 8
export const HERO_START_X = 40

const FLOOR_SEGMENT_WIDTH = 128
const FLOOR_PALETTE: Record<string, string> = { '.': '', G: '#22c55e', g: '#15803d', D: '#92400e' }

function floorCostume(): Costume {
  const rows = ['G'.repeat(FLOOR_SEGMENT_WIDTH), 'g'.repeat(FLOOR_SEGMENT_WIDTH), ...Array.from({ length: FLOOR_TOP - 2 }, () => 'D'.repeat(FLOOR_SEGMENT_WIDTH))]
  return costumeFromImage('Grass', imageFromRows(rows, FLOOR_PALETTE), { x: FLOOR_SEGMENT_WIDTH / 2, y: FLOOR_TOP / 2 })
}

/** "when flag clicked, solid on": a floor tile that bodies cannot pass through. */
function floorBrick(): BrickDef {
  const workspace = {
    blocks: {
      blocks: [
        {
          type: 'event_whenflagclicked',
          id: 'floor_flag',
          next: { block: { type: 'platformer_setsolid', id: 'floor_solid', fields: { SOLID: 'on' } } },
        },
      ],
    },
  }
  return { id: 'brick_floor', name: 'Floor', costumes: [floorCostume()], sounds: [], program: compileWorkspace(workspace).program }
}

/** Optional variations for feel tests; with no options this is the plain flat floor with the Hero on it. */
export interface HeroTestOptions {
  /** Start the Hero this high (copy y). Default: standing on the floor. */
  heroY?: number
  /** Stop the floor at this x (a multiple of 128): a ledge to walk off. */
  floorEnd?: number
  /** A solid wall standing on the floor, `x` is its left edge, `height` is measured from the floor top. */
  wall?: { x: number; height: number }
}

const WALL_WIDTH = 16

function wallBrick(height: number): BrickDef {
  const rows = Array.from({ length: height }, () => 'S'.repeat(WALL_WIDTH))
  const workspace = {
    blocks: {
      blocks: [
        { type: 'event_whenflagclicked', id: 'wall_flag', next: { block: { type: 'platformer_setsolid', id: 'wall_solid', fields: { SOLID: 'on' } } } },
      ],
    },
  }
  return {
    id: 'brick_wall',
    name: 'Wall',
    costumes: [costumeFromImage('Stone', imageFromRows(rows, { S: '#64748b' }), { x: WALL_WIDTH / 2, y: height / 2 })],
    sounds: [],
    program: compileWorkspace(workspace).program,
  }
}

export function createHeroTestDesign(options: HeroTestOptions = {}): LevelDesign {
  const { brick: hero } = createHeroBrick()
  const floorEnd = options.floorEnd ?? HERO_LEVEL_WIDTH
  const segments = Math.min(HERO_LEVEL_WIDTH, floorEnd) / FLOOR_SEGMENT_WIDTH
  const wall = options.wall
  return {
    id: 'hero_test_level',
    name: 'Hero test level',
    seed: 1,
    bounds: { left: 0, right: HERO_LEVEL_WIDTH, bottom: 0, top: HERO_LEVEL_HEIGHT },
    stage: { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } },
    bricks: [floorBrick(), hero, ...(wall ? [wallBrick(wall.height)] : [])],
    copies: [
      ...Array.from({ length: segments }, (_, i) => ({
        id: `copy_floor_${i + 1}`,
        brickId: 'brick_floor',
        x: FLOOR_SEGMENT_WIDTH / 2 + i * FLOOR_SEGMENT_WIDTH,
        y: FLOOR_TOP / 2,
      })),
      ...(wall ? [{ id: 'copy_wall', brickId: 'brick_wall', x: wall.x + WALL_WIDTH / 2, y: FLOOR_TOP + wall.height / 2 }] : []),
      { id: 'copy_hero', brickId: HERO_BRICK_ID, x: HERO_START_X, y: options.heroY ?? HERO_STAND_Y },
    ],
  }
}
