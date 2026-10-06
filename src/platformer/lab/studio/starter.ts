/**
 * Starter level for Code Lab (steps 3, 5 and 6).
 *
 * A small platformer made of tiles and bricks:
 * - Grid cells (createStarterTiles): the ground, a few floating Brick and ? block platforms, a one-way platform, a Bounce block, hard-block walls for the Walkers, a gap and a Spikes pit.
 *   They are painted on the level's grid, one char per cell, and each char is one of the standard grid bricks (gridBricks.ts) with its own code.
 * - Hero: the open-block Hero (studio/hero), with labels and handlers for boing, hero hurt, stomped and bounce. Spikes, lava and ? blocks are bricks that run their own code.
 * - Walker (two copies, different "speed" knobs), Coin, Spring and Goal: each is a few short labelled scripts
 *   made of My Blocks (real procedures_definition / procedures_call), so the top view reads like a sentence and a kid
 *   can drill into any My Block to see how it works.
 * - Stage: counts the coins. It has no backdrop costume, so the stage draws the Brickgineers day sky.
 *
 * Level is 960 x 360 steps, y-up, (0, 0) at the bottom-left; tiles are 16 x 16 (60 columns by 22 rows, row 0 at the bottom).
 * Every costume is pixel art built with `imageFromRows`; every brick's blocks are real Blockly workspace JSON.
 *
 * Labels: each top script's hat carries `data: "label:<text>"` (studio/code/layers.ts), see `withLabel` in hero/heroBrick.ts.
 */

import { TILE_SIZE, type BrickDef, type Costume, type LevelDesign, type TileLayer, type VariableDecl } from '../core/contracts'
import { compileWorkspace, type WorkspaceJson } from '../core/editor/compile'
import { createHeroBrick, HERO_START } from './hero/heroBrick'
import { GRID_BRICK_KEYS, gridBrickTemplate, type GridBrickKey } from './gridBricks'
import { Blocks, chain, type BlockJson, type MyBlock } from './blockBuilder'
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

/** Legacy (feel/jumperStandIn.ts only): ground tile: 128 x 16. Grass on top, dirt below. */
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

/** Spring: 16 x 12, a red coil on a blue base. */
const SPRING_ROWS = [
  '.##############.',
  '#RRRRRRRRRRRRRR#',
  '#rrrrrrrrrrrrrr#',
  '.##SSSSSSSSSS##.',
  '...#WSSSSSSS#...',
  '..#SSSSSSSSSS#..',
  '...#SSSSSSWS#...',
  '..#SSSSSSSSSS#..',
  '#bbbbbbbbbbbbbb#',
  '#BBBBBBBBBBBBBB#',
  '#bbbbbbbbbbbbbb#',
  '################',
]

/** Goal: 16 x 32, a flag on a pole. */
const GOAL_ROWS = [
  '.#YYYYYYYYYY#...',
  '.#YYYYYYYYYYY#..',
  '.#YOOOYYYYYYY#..',
  '.#YOOOYYYYYY#...',
  '.#YYYYYYYYY#....',
  '.#YYYYYYYY#.....',
  '.#YYYYYYY#......',
  '.#YYYYYY#.......',
  '.#WWWW##........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '.#WS#...........',
  '#SSSS#..........',
  '#SSSSS#.........',
  '################',
]

function costume(name: string, rows: string[]): Costume {
  const width = rows[0]!.length
  const height = rows.length
  return costumeFromImage(name, imageFromRows(rows, PALETTE), { x: width / 2, y: height / 2 })
}

export function createCostumes(): {
  groundCostume: Costume
  jumperCostume: Costume
  walkerCostume: Costume
  coinCostume: Costume
  springCostume: Costume
  goalCostume: Costume
} {
  return {
    groundCostume: costume('Grass', GROUND_ROWS),
    jumperCostume: costume('Hero', JUMPER_ROWS),
    walkerCostume: costume('Blob', WALKER_ROWS),
    coinCostume: costume('Gold', COIN_ROWS),
    springCostume: costume('Coil', SPRING_ROWS),
    goalCostume: costume('Flag', GOAL_ROWS),
  }
}

// -----------------------------------------------------------------------------
// Blockly workspace JSON helpers
// -----------------------------------------------------------------------------


// -----------------------------------------------------------------------------
// The bricks. Each `create...Brick(id, name)` returns a fresh brick, so templates reuse them.
// -----------------------------------------------------------------------------

export interface MadeBrick {
  brick: BrickDef
  workspace: WorkspaceJson
}

function compiled(id: string, name: string, costumes: Costume[], workspace: WorkspaceJson, variables?: VariableDecl[]): MadeBrick {
  return {
    brick: { id, name, costumes, sounds: [], program: compileWorkspace(workspace, variables ? { variables } : undefined).program },
    workspace,
  }
}

/**
 * Walker (variables: "speed", a Build knob; "way", +1 right / -1 left):
 *   when flag clicked        -> walk at (speed), then forever: check for stomp
 *   when I bump left/right   -> turn around
 * My Blocks:
 *   walk at (speed)   gravity on, point the way I go, set x speed to way x speed
 *   turn around       flip "way", flip direction, set x speed again (a bump already zeroed it, so we can't just negate it)
 *   check for stomp   touching Hero: Hero above -> broadcast stomped, hide; otherwise broadcast hero hurt
 */
export function createWalkerBrick(id: string, name: string, speed = 3): MadeBrick {
  const b = new Blocks(id)
  const speedId = `${id}_speed`
  const wayId = `${id}_way`
  const walkAt: MyBlock = { proccode: 'walk at %s', argumentNames: ['speed'] }
  const turnAround: MyBlock = { proccode: 'turn around', argumentNames: [] }
  const checkStomp: MyBlock = { proccode: 'check for stomp', argumentNames: [] }

  b.flag('When the level starts: walk, and watch for the Hero', [b.call(walkAt, b.v(speedId)), b.forever([b.call(checkStomp)])])
  b.bump('When I run into something on my right: turn around', 'left', [b.call(turnAround)])
  b.bump('When I run into something on my left: turn around', 'right', [b.call(turnAround)])

  b.define(walkAt, 'Walk the way I face at this speed', [
    b.gravityOn(),
    b.rotationStyle('left-right'),
    b.pointInDirection(b.mul(b.v(wayId), 90)),
    b.setSpeed('x', b.mul(b.v(wayId), b.arg('speed'))),
  ])
  b.define(turnAround, 'Face the other way and keep walking', [
    b.set(wayId, b.sub(0, b.v(wayId))),
    b.pointInDirection(b.mul(b.v(wayId), 90)),
    b.setSpeed('x', b.mul(b.v(wayId), b.v(speedId))),
  ])
  b.define(checkStomp, 'Stomped from above, or hurt the Hero', [
    b.when(b.touchingHero(), [
      b.either(
        b.gt(b.heroY(), b.add(b.myY(), 6)),
        [b.broadcast('stomped'), b.hide()],
        [b.broadcast('hero hurt')],
      ),
    ]),
  ])

  const variables: VariableDecl[] = [
    { id: speedId, name: 'speed', value: speed, showInBuild: true },
    { id: wayId, name: 'way', value: 1 },
  ]
  const workspace = b.workspace(variables.map(({ id: vid, name: vname }) => ({ id: vid, name: vname })))
  return compiled(id, name, [costume('Blob', WALKER_ROWS)], workspace, variables)
}

/**
 * Coin:
 *   when flag clicked -> show, then forever: spin, check for Hero
 * My Blocks:
 *   spin             turn a little
 *   check for Hero   touching Hero: broadcast coin collected, hide, stop this script
 * The Stage adds one to "coins" when it hears coin collected.
 */
export function createCoinBrick(id: string, name: string): MadeBrick {
  const b = new Blocks(id)
  const spin: MyBlock = { proccode: 'spin', argumentNames: [] }
  const checkHero: MyBlock = { proccode: 'check for Hero', argumentNames: [] }
  b.flag('When the level starts: spin and wait for the Hero', [b.show(), b.forever([b.call(spin), b.call(checkHero)])])
  b.define(spin, 'Turn a little', [b.turnRight(15)])
  b.define(checkHero, 'Count me and vanish when the Hero touches me', [
    b.when(b.touchingHero(), [b.broadcast('coin collected'), b.hide(), b.blk('control_stop', { fields: { STOP_OPTION: 'this script' } })]),
  ])
  return compiled(id, name, [costume('Gold', COIN_ROWS)], b.workspace())
}

/**
 * Spring:
 *   when flag clicked -> forever: launch the Hero
 * My Blocks:
 *   launch the Hero   touching Hero: broadcast boing (the Hero answers with a big y speed)
 */
export function createSpringBrick(id: string, name: string): MadeBrick {
  const b = new Blocks(id)
  const launch: MyBlock = { proccode: 'launch the Hero', argumentNames: [] }
  b.flag('When the level starts: launch the Hero if it lands on me', [b.forever([b.call(launch)])])
  b.define(launch, 'Say boing when the Hero touches me', [b.when(b.touchingHero(), [b.broadcast('boing')])])
  return compiled(id, name, [costume('Coil', SPRING_ROWS)], b.workspace())
}

/**
 * Goal:
 *   when flag clicked -> forever: check for the Hero
 * My Blocks:
 *   check for the Hero   touching Hero: say it, broadcast course clear, stop all
 */
export function createGoalBrick(id: string, name: string): MadeBrick {
  const b = new Blocks(id)
  const check: MyBlock = { proccode: 'check for the Hero', argumentNames: [] }
  b.flag('When the level starts: wait for the Hero', [b.forever([b.call(check)])])
  b.define(check, 'The Hero reached me: course clear', [
    b.when(b.touchingHero(), [b.say('Course clear!'), b.broadcast('course clear'), b.stopAll()]),
  ])
  // One goal per level: the builder moves the existing Goal instead of adding another.
  const made = compiled(id, name, [costume('Flag', GOAL_ROWS)], b.workspace())
  return { ...made, brick: { ...made.brick, limit: 1 } }
}

/** Empty: a costume and no scripts. */
export function createEmptyBrick(id: string, name: string): MadeBrick {
  return compiled(id, name, [costume('Blob', WALKER_ROWS)], { blocks: { blocks: [] } })
}

/** Stage: adds one to "coins" every time a Coin says it was collected. */
export function createStageWorkspace(): WorkspaceJson {
  const b = new Blocks('stage')
  b.flag('When the level starts: no coins yet', [b.set('coins', 0)])
  b.receive('When a Coin is collected: count it', 'coin collected', [b.change('coins', 1)])
  return b.workspace([{ id: 'coins', name: 'coins' }])
}

// -----------------------------------------------------------------------------
// Legacy step 3 pieces, kept only because feel/jumperStandIn.ts builds its stand-in hero and floor from them
// -----------------------------------------------------------------------------

const num = (id: string, value: number): { shadow: BlockJson } => ({
  shadow: { type: 'math_number', id, fields: { NUM: value } },
})

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

/** Legacy ground: "when flag clicked, solid on". */
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

export const STARTER_GROUND_XS = [64, 192, 320, 448, 576, 704, 832, 896]

// -----------------------------------------------------------------------------
// Tiles (60 x 22, row 0 is the bottom row; a tile at (col, row) covers x col*16.., y row*16..)
// -----------------------------------------------------------------------------

export const STARTER_COLS = 60
export const STARTER_ROWS = 22
/** The ground's top edge: ground is the bottom row, so y = 16. */
export const GROUND_TOP = TILE_SIZE

/** Ground row 0 everywhere except the gap and the spike pit. */
export const STARTER_GAP_COLS: readonly number[] = [20, 21, 22]
export const STARTER_PIT_COLS: readonly number[] = [44, 45, 46]
/** Floating platforms: [first column, row, tiles from left to right]. 'B' brick, 'Q' ? block. */
export const STARTER_PLATFORMS: ReadonlyArray<{ col: number; row: number; tiles: string }> = [
  { col: 11, row: 3, tiles: 'BQBB' }, // top y 64, x 176..240
  { col: 21, row: 6, tiles: 'BQQB' }, // top y 112, x 336..400, over the gap
  { col: 28, row: 9, tiles: 'BBQB' }, // top y 160, x 448..512
  { col: 40, row: 6, tiles: 'BQBB' }, // top y 112, x 640..704, just before the pit
  { col: 50, row: 4, tiles: 'BQQB' }, // top y 80, x 800..864, where the Spring throws you
]
/** A one-way platform: you jump up through it from below and land on top ('-', TILE_CHAR.semi). Top y 64, x 528..592, over the slow Walker's lane. */
export const STARTER_ONE_WAY = { col: 33, row: 3, length: 4 } as const
/** A bounce block ('O', TILE_CHAR.bounce) on the ground just before the gap: land on it to be thrown high. x 288..304, top y 32. */
export const STARTER_BOUNCE = { col: 18, row: 1 } as const
/** One-tile-high hard blocks standing on the ground: the Walkers turn around when they bump them. */
export const STARTER_WALLS: ReadonlyArray<{ col: number; row: number }> = [
  { col: 6, row: 1 },
  { col: 15, row: 1 },
  { col: 31, row: 1 },
  { col: 39, row: 1 },
]

/** Each standard grid brick's `grid.char`, read from the brick itself (G H S L - B Q O). */
export const STARTER_CHAR = Object.fromEntries(GRID_BRICK_KEYS.map((k) => [k, gridBrickTemplate(k).brick.grid!.char])) as Record<GridBrickKey, string>

export function createStarterTiles(): TileLayer {
  const grid: string[][] = Array.from({ length: STARTER_ROWS }, () => Array.from({ length: STARTER_COLS }, () => '.'))
  const put = (col: number, row: number, tile: GridBrickKey): void => {
    grid[row]![col] = STARTER_CHAR[tile]
  }
  for (let col = 0; col < STARTER_COLS; col++) {
    if (STARTER_GAP_COLS.includes(col)) continue
    put(col, 0, STARTER_PIT_COLS.includes(col) ? 'spikes' : 'ground')
  }
  for (const p of STARTER_PLATFORMS) [...p.tiles].forEach((ch, i) => put(p.col + i, p.row, ch === 'Q' ? 'qblock' : 'brick'))
  for (const w of STARTER_WALLS) put(w.col, w.row, 'hard')
  for (let i = 0; i < STARTER_ONE_WAY.length; i++) put(STARTER_ONE_WAY.col + i, STARTER_ONE_WAY.row, 'semi')
  put(STARTER_BOUNCE.col, STARTER_BOUNCE.row, 'bounce')
  return { cols: STARTER_COLS, rows: STARTER_ROWS, data: grid.map((r) => r.join('')) }
}

// -----------------------------------------------------------------------------
// Level layout (steps, y-up, origin at the level's bottom-left; copy x/y is the costume center)
// -----------------------------------------------------------------------------

export const STARTER_COINS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 208, y: 80 },
  { x: 368, y: 128 },
  { x: 480, y: 176 },
  { x: 672, y: 128 },
  { x: 736, y: 72 }, // above the spike pit
]
/** Walkers: both stand on the ground (center y 24) between hard blocks. */
export const STARTER_WALKERS: ReadonlyArray<{ id: string; x: number; speed: number }> = [
  { id: 'copy_walker_fast', x: 170, speed: 4 }, // between the hard blocks at columns 6 and 15
  { id: 'copy_walker_slow', x: 560, speed: 2 }, // between the hard blocks at columns 31 and 39
]
export const STARTER_SPRING = { x: 776, y: GROUND_TOP + 6 } // 16 x 12, standing on the ground
export const STARTER_GOAL = { x: 920, y: GROUND_TOP + 16 } // 16 x 32 flag, standing on the ground

export function createStarterProject(): StudioProject {
  const c = createCostumes()

  const hero = createHeroBrick()
  const walker = createWalkerBrick('brick_walker', 'Walker')
  const coin = createCoinBrick('brick_coin', 'Coin')
  const spring = createSpringBrick('brick_spring', 'Spring')
  const goal = createGoalBrick('brick_goal', 'Goal')

  // The standard grid bricks: ids brick_ground, brick_hard, ... Their cells are the tiles layer (grid.char).
  const gridBricks = GRID_BRICK_KEYS.map((key) => {
    const t = gridBrickTemplate(key)
    return { key, brick: { ...t.brick, id: `brick_${key}` } as BrickDef, workspace: t.workspace }
  })

  const stageWs = createStageWorkspace()
  const coinsVar: VariableDecl = { id: 'coins', name: 'coins', value: 0 }
  const stageBrick: BrickDef = {
    id: STAGE_ID,
    name: 'Stage',
    isStage: true,
    // No backdrop costume: the stage draws the Brickgineers day sky.
    costumes: [],
    sounds: [],
    program: compileWorkspace(stageWs, { variables: [coinsVar] }).program,
  }

  const design: LevelDesign = {
    id: 'starter_level',
    name: 'Starter Platformer',
    seed: 12345,
    bounds: { left: 0, right: 960, bottom: 0, top: 360 },
    stage: stageBrick,
    tiles: createStarterTiles(),
    bricks: [hero.brick, walker.brick, coin.brick, spring.brick, goal.brick, ...gridBricks.map((g) => g.brick)],
    copies: [
      // Starts above the ground so you can watch it fall and land on the ground tiles.
      { id: 'copy_hero', brickId: hero.brick.id, x: HERO_START.x, y: 40 },
      // One Walker brick painted twice with different knob values.
      ...STARTER_WALKERS.map((w) => ({ id: w.id, brickId: 'brick_walker', x: w.x, y: GROUND_TOP + 8, knobs: { brick_walker_speed: w.speed } })),
      ...STARTER_COINS.map((p, i) => ({ id: `copy_coin_${i + 1}`, brickId: 'brick_coin', x: p.x, y: p.y })),
      { id: 'copy_spring', brickId: 'brick_spring', x: STARTER_SPRING.x, y: STARTER_SPRING.y },
      { id: 'copy_goal', brickId: 'brick_goal', x: STARTER_GOAL.x, y: STARTER_GOAL.y },
    ],
  }

  const workspaces: Record<string, unknown> = {
    [STAGE_ID]: stageWs,
    [hero.brick.id]: hero.workspace,
    brick_walker: walker.workspace,
    brick_coin: coin.workspace,
    brick_spring: spring.workspace,
    brick_goal: goal.workspace,
    ...Object.fromEntries(gridBricks.map((g) => [g.brick.id, g.workspace])),
  }

  return { design, workspaces }
}
