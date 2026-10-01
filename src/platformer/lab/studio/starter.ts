/**
 * Starter level for Code Lab step 3 (the Platformer extension).
 *
 * A small platformer, built only from Scratch blocks plus the Platformer blocks:
 * - Ground and Platform: solid bricks that never move.
 * - Hero: the open-block Hero (studio/hero): arrows walk, x runs, space jumps; it feels like the main 2D game (FEEL.md).
 * - Walker: walks back and forth, turns around when it bumps a side. It has a "speed" knob
 *   (a showInBuild variable) painted twice with different values.
 * - Coin: hides when the Hero touches it (Scratch `touching`, which is pixel-based).
 *
 * Level is 960 x 360 steps, y-up, (0, 0) at the bottom-left. Every costume is pixel art built with
 * `imageFromRows`; every brick's blocks are real Blockly workspace JSON, so they open in the editor.
 *
 * Note: the `platformer_*` opcodes only run once the physics lane is merged, and only compile into
 * scripts (the `platformer_whenbump` hat) once the editor lane has registered that hat.
 */

import type { BrickDef, Costume, LevelDesign, VariableDecl } from '../core/contracts'
import { compileWorkspace, type WorkspaceJson } from '../core/editor/compile'
import { createHeroBrick } from './hero/heroBrick'
import { costumeFromImage, imageFromRows } from './pixels'
import { STAGE_ID, type StudioProject } from './store'

// -----------------------------------------------------------------------------
// Pixel art (1 step = 1 art pixel)
// -----------------------------------------------------------------------------

const PALETTE: Record<string, string> = {
  '.': '',
  '#': '#0f172a',
  Y: '#facc15',
  O: '#fb923c',
  W: '#ffffff',
  G: '#22c55e',
  g: '#15803d',
  D: '#92400e',
  d: '#78350f',
  R: '#ef4444',
  r: '#b91c1c',
  B: '#38bdf8',
  b: '#0284c7',
  P: '#c084fc',
  p: '#7e22ce',
  K: '#1e1b4b',
  S: '#64748b',
}

/** Ground tile: 128 x 16. Grass on top, dirt below. */
export const GROUND_WIDTH = 128
export const GROUND_HEIGHT = 16
const GROUND_ROWS = [
  'G'.repeat(GROUND_WIDTH),
  'g'.repeat(GROUND_WIDTH),
  ...Array.from({ length: GROUND_HEIGHT - 2 }, (_, i) => (i % 4 === 1 ? 'dD'.repeat(GROUND_WIDTH / 2) : 'D'.repeat(GROUND_WIDTH))),
]

/** Platform: 64 x 16, a stone slab. */
export const PLATFORM_WIDTH = 64
export const PLATFORM_HEIGHT = 16
const PLATFORM_ROWS = [
  'W'.repeat(PLATFORM_WIDTH),
  ...Array.from({ length: PLATFORM_HEIGHT - 2 }, () => 'S'.repeat(PLATFORM_WIDTH)),
  '#'.repeat(PLATFORM_WIDTH),
]

/** Jumper: 16 x 16, a blue hero with eyes. */
const JUMPER_ROWS = [
  '....########....',
  '...#BBBBBBBB#...',
  '..#BBBBBBBBBB#..',
  '..#BBWWBBWWBB#..',
  '..#BBWKBBWKBB#..',
  '..#BBBBBBBBBB#..',
  '..#BBBBRRBBBB#..',
  '...#BBBBBBBB#...',
  '....########....',
  '...#bbbbbbbb#...',
  '..#bbbbbbbbbb#..',
  '..#bbbbbbbbbb#..',
  '..#bbbbbbbbbb#..',
  '...##bb##bb##...',
  '...#bb#..#bb#...',
  '...####..####...',
]

/** Walker: 16 x 16, a purple blob with feet. */
const WALKER_ROWS = [
  '................',
  '....########....',
  '...#PPPPPPPP#...',
  '..#PPPPPPPPPP#..',
  '.#PPWWPPPPWWPP#.',
  '.#PPWKPPPPWKPP#.',
  '.#PPPPPPPPPPPP#.',
  '.#PPPPpppPPPPP#.',
  '.#PPPPPPPPPPPP#.',
  '.#PPPPPPPPPPPP#.',
  '.#PPPPPPPPPPPP#.',
  '.#PPPPPPPPPPPP#.',
  '..#PPPPPPPPPP#..',
  '..##pp####pp##..',
  '..#pp#....#pp#..',
  '..####....####..',
]

/** Coin: 12 x 12, a gold coin. */
const COIN_ROWS = [
  '...######...',
  '..#YYYYYY#..',
  '.#YYOOOOYY#.',
  '#YYOYYYYOYY#',
  '#YOYYWYYYOY#',
  '#YOYYWYYYOY#',
  '#YOYYYYYYOY#',
  '#YOYYYYYYOY#',
  '#YYOYYYYOYY#',
  '.#YYOOOOYY#.',
  '..#YYYYYY#..',
  '...######...',
]

/** Stage backdrop: 32 x 16, a dusk sky with stars. */
const STAGE_ROWS = [
  'KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK',
  'KKKKKKKKKK.WKKKKKKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKKKKKKKKKKKKWKKKKK',
  'KKKKKWKKKKKKKKKKKKKKKKKKKKKKKKKK',
  'KKKKKKKKKKKKKKKKK.WKKKKKKKKKKKKK',
  'pppppppppppppppppppppppppppppppp',
  'pppppppppppppppppppppppppppppppp',
  'pppppppppppppppppppppppppppppppp',
  'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
  'PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP',
  'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO',
  'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO',
  'YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY',
  'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
  '################################',
  '################################',
]

function costume(name: string, rows: string[]): Costume {
  const width = rows[0]!.length
  const height = rows.length
  return costumeFromImage(name, imageFromRows(rows, PALETTE), { x: width / 2, y: height / 2 })
}

export function createCostumes(): {
  groundCostume: Costume
  platformCostume: Costume
  jumperCostume: Costume
  walkerCostume: Costume
  coinCostume: Costume
  stageCostume: Costume
} {
  return {
    groundCostume: costume('Grass', GROUND_ROWS),
    platformCostume: costume('Stone', PLATFORM_ROWS),
    jumperCostume: costume('Hero', JUMPER_ROWS),
    walkerCostume: costume('Blob', WALKER_ROWS),
    coinCostume: costume('Gold', COIN_ROWS),
    stageCostume: costume('Sunset', STAGE_ROWS),
  }
}

// -----------------------------------------------------------------------------
// Blockly workspace JSON helpers
// -----------------------------------------------------------------------------

type BlockJson = Record<string, unknown>

const num = (id: string, value: number): { shadow: BlockJson } => ({
  shadow: { type: 'math_number', id, fields: { NUM: value } },
})

/** Chains blocks with `next`, first to last. */
function chain(blocks: BlockJson[]): BlockJson {
  const [first, ...rest] = blocks
  if (!first) throw new Error('chain needs at least one block')
  let tail = first
  for (const block of rest) {
    tail.next = { block }
    tail = block
  }
  return first
}

const workspace = (...scripts: BlockJson[]): WorkspaceJson => ({ blocks: { blocks: scripts } })

const setSpeed = (id: string, axis: 'x' | 'y', speed: unknown): BlockJson => ({
  type: 'platformer_setspeed',
  id,
  fields: { AXIS: axis },
  inputs: { SPEED: speed },
})

const gravityOn = (id: string): BlockJson => ({ type: 'platformer_setgravity', id, fields: { GRAVITY: 'on' } })
const solidOn = (id: string): BlockJson => ({ type: 'platformer_setsolid', id, fields: { SOLID: 'on' } })
const flagHat = (id: string, body: BlockJson[]): BlockJson => ({ type: 'event_whenflagclicked', id, next: { block: chain(body) } })
const keyDown = (id: string, key: string): { block: BlockJson } => ({
  block: { type: 'sensing_keypressed', id, fields: { KEY_OPTION: key } },
})

// -----------------------------------------------------------------------------
// Blockly workspaces
// -----------------------------------------------------------------------------

/** Ground: "when flag clicked, solid on". */
export function createGroundWorkspace(): WorkspaceJson {
  return workspace(flagHat('ground_flag', [solidOn('ground_solid')]))
}

/** Platform: "when flag clicked, solid on". */
export function createPlatformWorkspace(): WorkspaceJson {
  return workspace(flagHat('platform_flag', [solidOn('platform_solid')]))
}

/**
 * Jumper:
 *   when flag clicked: turn gravity on, then forever:
 *     set x speed to 0
 *     if key left arrow pressed: set x speed to -4
 *     if key right arrow pressed: set x speed to 4
 *     if on ground? and key space pressed: set y speed to 12
 */
export function createJumperWorkspace(): WorkspaceJson {
  const walkLeft: BlockJson = {
    type: 'control_if',
    id: 'jumper_if_left',
    inputs: {
      CONDITION: keyDown('jumper_key_left', 'left arrow'),
      SUBSTACK: { block: setSpeed('jumper_walk_left', 'x', num('jumper_walk_left_n', -4)) },
    },
  }
  const walkRight: BlockJson = {
    type: 'control_if',
    id: 'jumper_if_right',
    inputs: {
      CONDITION: keyDown('jumper_key_right', 'right arrow'),
      SUBSTACK: { block: setSpeed('jumper_walk_right', 'x', num('jumper_walk_right_n', 4)) },
    },
  }
  const jump: BlockJson = {
    type: 'control_if',
    id: 'jumper_if_jump',
    inputs: {
      CONDITION: {
        block: {
          type: 'operator_and',
          id: 'jumper_and',
          inputs: {
            OPERAND1: { block: { type: 'platformer_onground', id: 'jumper_on_ground' } },
            OPERAND2: keyDown('jumper_key_space', 'space'),
          },
        },
      },
      SUBSTACK: { block: setSpeed('jumper_jump', 'y', num('jumper_jump_n', 12)) },
    },
  }
  const loop: BlockJson = {
    type: 'control_forever',
    id: 'jumper_forever',
    inputs: {
      SUBSTACK: {
        block: chain([setSpeed('jumper_stop', 'x', num('jumper_stop_n', 0)), walkLeft, walkRight, jump]),
      },
    },
  }
  return workspace(flagHat('jumper_flag', [gravityOn('jumper_gravity'), loop]))
}

/**
 * Walker (variable "speed", a Build knob):
 *   when flag clicked: turn gravity on, set x speed to speed
 *   when I bump [left] of [anything]:  set x speed to (0 - speed)   (it hit something while walking right: go left)
 *   when I bump [right] of [anything]: set x speed to speed         (it hit something while walking left: go right)
 */
export function createWalkerWorkspace(): WorkspaceJson {
  const speedVar = (id: string): { block: BlockJson } => ({
    block: { type: 'data_variable', id, fields: { VARIABLE: 'walker_speed' } },
  })
  const bumpHat = (id: string, side: string, body: BlockJson[]): BlockJson => ({
    type: 'platformer_whenbump',
    id,
    fields: { SIDE: side, BRICK: '_any_' },
    next: { block: chain(body) },
  })
  return {
    variables: [{ id: 'walker_speed', name: 'speed' }],
    blocks: {
      blocks: [
        flagHat('walker_flag', [gravityOn('walker_gravity'), setSpeed('walker_start', 'x', speedVar('walker_start_speed'))]),
        bumpHat('walker_bump_left', 'left', [
          setSpeed('walker_go_left', 'x', {
            block: {
              type: 'operator_subtract',
              id: 'walker_negate',
              inputs: { NUM1: num('walker_negate_zero', 0), NUM2: speedVar('walker_negate_speed') },
            },
          }),
        ]),
        bumpHat('walker_bump_right', 'right', [setSpeed('walker_go_right', 'x', speedVar('walker_right_speed'))]),
      ],
    },
  }
}

/** Coin: "when flag clicked, show; forever: if touching Hero, hide". */
export function createCoinWorkspace(): WorkspaceJson {
  const check: BlockJson = {
    type: 'control_if',
    id: 'coin_if',
    inputs: {
      CONDITION: { block: { type: 'sensing_touchingobject', id: 'coin_touching', fields: { TOUCHINGOBJECTMENU: 'Hero' } } },
      SUBSTACK: { block: { type: 'looks_hide', id: 'coin_hide' } },
    },
  }
  const loop: BlockJson = { type: 'control_forever', id: 'coin_forever', inputs: { SUBSTACK: { block: check } } }
  return workspace(flagHat('coin_flag', [{ type: 'looks_show', id: 'coin_show' }, loop]))
}

export function createStageWorkspace(): WorkspaceJson {
  return { blocks: { blocks: [] } }
}

// -----------------------------------------------------------------------------
// Level layout (steps, y-up, origin at the level's bottom-left; copy x/y is the costume center)
// -----------------------------------------------------------------------------

/** Ground top is y = 16; a 16 x 16 brick standing on it has its center at y = 24. */
export const GROUND_TOP = GROUND_HEIGHT
const GROUND_Y = GROUND_HEIGHT / 2

export const STARTER_GROUND_XS = [64, 192, 320, 448, 576, 704, 832, 896]
/** Platforms: the first is 48 above the ground top, then 48 steps higher each time (a jump rises about 66). */
export const STARTER_PLATFORMS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 200, y: 56 }, // top 64
  { x: 340, y: 104 }, // top 112
  { x: 480, y: 152 }, // top 160
  { x: 640, y: 104 }, // top 112
  // Two low blocks sitting on the ground: the walkers bump into their sides.
  { x: 300, y: GROUND_TOP + PLATFORM_HEIGHT / 2 },
  { x: 760, y: GROUND_TOP + PLATFORM_HEIGHT / 2 },
]
export const STARTER_COINS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 200, y: 80 },
  { x: 340, y: 128 },
  { x: 480, y: 176 },
  { x: 640, y: 128 },
  { x: 880, y: 32 },
]

export function createStarterProject(): StudioProject {
  const c = createCostumes()

  const groundWs = createGroundWorkspace()
  const platformWs = createPlatformWorkspace()
  const hero = createHeroBrick()
  const walkerWs = createWalkerWorkspace()
  const coinWs = createCoinWorkspace()
  const stageWs = createStageWorkspace()

  const walkerSpeed: VariableDecl = { id: 'walker_speed', name: 'speed', value: 3, showInBuild: true }

  const stageBrick: BrickDef = {
    id: STAGE_ID,
    name: 'Stage',
    isStage: true,
    costumes: [c.stageCostume],
    sounds: [],
    program: compileWorkspace(stageWs).program,
  }

  const brick = (id: string, name: string, costumes: Costume[], ws: WorkspaceJson, variables?: VariableDecl[]): BrickDef => ({
    id,
    name,
    costumes,
    sounds: [],
    program: compileWorkspace(ws, variables ? { variables } : undefined).program,
  })

  const design: LevelDesign = {
    id: 'starter_level',
    name: 'Starter Platformer',
    seed: 12345,
    bounds: { left: 0, right: 960, bottom: 0, top: 360 },
    stage: stageBrick,
    bricks: [
      brick('brick_ground', 'Ground', [c.groundCostume], groundWs),
      brick('brick_platform', 'Platform', [c.platformCostume], platformWs),
      hero.brick,
      brick('brick_walker', 'Walker', [c.walkerCostume], walkerWs, [walkerSpeed]),
      brick('brick_coin', 'Coin', [c.coinCostume], coinWs),
    ],
    copies: [
      ...STARTER_GROUND_XS.map((x, i) => ({ id: `copy_ground_${i + 1}`, brickId: 'brick_ground', x, y: GROUND_Y })),
      ...STARTER_PLATFORMS.map((p, i) => ({ id: `copy_platform_${i + 1}`, brickId: 'brick_platform', x: p.x, y: p.y })),
      // Starts above the ground so you can watch it fall and land on the Ground.
      { id: 'copy_hero', brickId: hero.brick.id, x: 60, y: 40 },
      // One Walker brick painted twice with different knob values: slow (2) and fast (4).
      { id: 'copy_walker_slow', brickId: 'brick_walker', x: 560, y: 24, knobs: { walker_speed: 2 } },
      { id: 'copy_walker_fast', brickId: 'brick_walker', x: 150, y: 24, knobs: { walker_speed: 4 } },
      ...STARTER_COINS.map((p, i) => ({ id: `copy_coin_${i + 1}`, brickId: 'brick_coin', x: p.x, y: p.y })),
    ],
  }

  const workspaces: Record<string, unknown> = {
    [STAGE_ID]: stageWs,
    brick_ground: groundWs,
    brick_platform: platformWs,
    [hero.brick.id]: hero.workspace,
    brick_walker: walkerWs,
    brick_coin: coinWs,
  }

  return { design, workspaces }
}
