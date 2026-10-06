/**
 * Starter level for Code Lab (steps 3, 5 and 6).
 *
 * A small platformer made of tiles and bricks:
 * - Tiles (STARTER_TILES): the ground, a few floating brick and ? platforms, walls for the Walkers, a gap and a spike pit.
 *   They are painted on the level's tile layer, not placed as bricks.
 * - Hero: the open-block Hero (studio/hero), with labels and handlers for boing, hero hurt, stomped and the spikes.
 * - Walker (two copies, different "speed" knobs), Coin, Spring and Goal: each is a few short labelled scripts
 *   made of My Blocks (real procedures_definition / procedures_call), so the top view reads like a sentence and a kid
 *   can drill into any My Block to see how it works.
 * - Stage: counts the coins.
 *
 * Level is 960 x 360 steps, y-up, (0, 0) at the bottom-left; tiles are 16 x 16 (60 columns by 22 rows, row 0 at the bottom).
 * Every costume is pixel art built with `imageFromRows`; every brick's blocks are real Blockly workspace JSON.
 *
 * Labels: each top script's hat carries `data: "label:<text>"` (studio/code/layers.ts), see `withLabel` in hero/heroBrick.ts.
 *
 * Note: `platformer_touchingtile` (the Hero's spike check) only runs once the tiles lane is merged. The compiler doesn't
 * warn about unknown opcodes, so the starter compiles with zero diagnostics either way.
 */

import { TILE_CHAR, TILE_SIZE, type BrickDef, type Costume, type LevelDesign, type TileKind, type TileLayer, type VariableDecl } from '../core/contracts'
import { compileWorkspace, type WorkspaceJson } from '../core/editor/compile'
import { createHeroBrick, HERO_START, withLabel } from './hero/heroBrick'
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
  jumperCostume: Costume
  walkerCostume: Costume
  coinCostume: Costume
  springCostume: Costume
  goalCostume: Costume
  stageCostume: Costume
} {
  return {
    groundCostume: costume('Grass', GROUND_ROWS),
    jumperCostume: costume('Hero', JUMPER_ROWS),
    walkerCostume: costume('Blob', WALKER_ROWS),
    coinCostume: costume('Gold', COIN_ROWS),
    springCostume: costume('Coil', SPRING_ROWS),
    goalCostume: costume('Flag', GOAL_ROWS),
    stageCostume: costume('Sunset', STAGE_ROWS),
  }
}

// -----------------------------------------------------------------------------
// Blockly workspace JSON helpers
// -----------------------------------------------------------------------------

type BlockJson = Record<string, unknown>
type Conn = { block: BlockJson } | { shadow: BlockJson }

/** A My Block: its definition and calls share this. `proccode` uses %s for each number input, as in Scratch. */
interface MyBlock {
  proccode: string
  argumentNames: string[]
}

/** Builds one brick's workspace JSON. Block ids are `<prefix>_<n>`, so they never repeat inside a brick. */
class Blocks {
  private n = 0
  private row = 0
  readonly scripts: BlockJson[] = []
  constructor(private readonly prefix: string) {}

  id(): string {
    return `${this.prefix}_${++this.n}`
  }
  blk(type: string, extra: BlockJson = {}): BlockJson {
    return { type, id: this.id(), ...extra }
  }
  num(value: number): Conn {
    return { shadow: { type: 'math_number', id: this.id(), fields: { NUM: value } } }
  }
  text(value: string): Conn {
    return { shadow: { type: 'text', id: this.id(), fields: { TEXT: value } } }
  }
  as(c: Conn | number): Conn {
    return typeof c === 'number' ? this.num(c) : c
  }
  v(variableId: string): Conn {
    return { block: this.blk('data_variable', { fields: { VARIABLE: variableId } }) }
  }
  arg(name: string): Conn {
    return { block: this.blk('argument_reporter_string_number', { fields: { VALUE: name } }) }
  }
  sub(a: Conn | number, b: Conn | number): Conn {
    return { block: this.blk('operator_subtract', { inputs: { NUM1: this.as(a), NUM2: this.as(b) } }) }
  }
  mul(a: Conn | number, b: Conn | number): Conn {
    return { block: this.blk('operator_multiply', { inputs: { NUM1: this.as(a), NUM2: this.as(b) } }) }
  }
  gt(a: Conn | number, b: Conn | number): Conn {
    return { block: this.blk('operator_gt', { inputs: { OPERAND1: this.as(a), OPERAND2: this.as(b) } }) }
  }
  add(a: Conn | number, b: Conn | number): Conn {
    return { block: this.blk('operator_add', { inputs: { NUM1: this.as(a), NUM2: this.as(b) } }) }
  }
  touchingHero(): Conn {
    return { block: this.blk('sensing_touchingobject', { fields: { TOUCHINGOBJECTMENU: 'Hero' } }) }
  }
  /** The Hero's y position (sensing "y position of Hero"). */
  heroY(): Conn {
    return { block: this.blk('sensing_of', { fields: { PROPERTY: 'y position', OBJECT: 'Hero' } }) }
  }
  myY(): Conn {
    return { block: this.blk('motion_yposition') }
  }
  xSpeed(): Conn {
    return { block: this.blk('platformer_speed', { fields: { AXIS: 'x' } }) }
  }
  direction(): Conn {
    return { block: this.blk('motion_direction') }
  }

  set(variableId: string, value: Conn | number): BlockJson {
    return this.blk('data_setvariableto', { fields: { VARIABLE: variableId }, inputs: { VALUE: this.as(value) } })
  }
  change(variableId: string, value: Conn | number): BlockJson {
    return this.blk('data_changevariableby', { fields: { VARIABLE: variableId }, inputs: { VALUE: this.as(value) } })
  }
  setSpeed(axis: 'x' | 'y', value: Conn | number): BlockJson {
    return this.blk('platformer_setspeed', { fields: { AXIS: axis }, inputs: { SPEED: this.as(value) } })
  }
  gravityOn(): BlockJson {
    return this.blk('platformer_setgravity', { fields: { GRAVITY: 'on' } })
  }
  broadcast(message: string): BlockJson {
    return this.blk('event_broadcast', { inputs: { BROADCAST_INPUT: this.text(message) } })
  }
  hide(): BlockJson {
    return this.blk('looks_hide')
  }
  show(): BlockJson {
    return this.blk('looks_show')
  }
  stopAll(): BlockJson {
    return this.blk('control_stop', { fields: { STOP_OPTION: 'all' } })
  }
  pointInDirection(d: Conn | number): BlockJson {
    return this.blk('motion_pointindirection', { inputs: { DIRECTION: this.as(d) } })
  }
  say(message: string): BlockJson {
    return this.blk('looks_say', { inputs: { MESSAGE: this.text(message) } })
  }
  turnRight(degrees: number): BlockJson {
    return this.blk('motion_turnright', { inputs: { DEGREES: this.num(degrees) } })
  }
  rotationStyle(style: string): BlockJson {
    return this.blk('motion_setrotationstyle', { fields: { STYLE: style } })
  }
  when(cond: Conn, then: BlockJson[]): BlockJson {
    return this.blk('control_if', { inputs: { CONDITION: cond, SUBSTACK: { block: chain(then) } } })
  }
  either(cond: Conn, then: BlockJson[], otherwise: BlockJson[]): BlockJson {
    return this.blk('control_if_else', {
      inputs: { CONDITION: cond, SUBSTACK: { block: chain(then) }, SUBSTACK2: { block: chain(otherwise) } },
    })
  }
  forever(body: BlockJson[]): BlockJson {
    return this.blk('control_forever', { inputs: { SUBSTACK: { block: chain(body) } } })
  }
  /** A call to a My Block. `args` are the input values in the order of `argumentNames`. */
  call(proc: MyBlock, ...args: Array<Conn | number>): BlockJson {
    const inputs: Record<string, Conn> = {}
    proc.argumentNames.forEach((name, i) => {
      inputs[name] = this.as(args[i] ?? 0)
    })
    return this.blk('procedures_call', {
      extraState: { proccode: proc.proccode, argumentNames: proc.argumentNames, warp: false },
      ...(proc.argumentNames.length > 0 ? { inputs } : {}),
    })
  }

  /** Adds a labelled top script: the hat comes first, the body follows. Scripts lay out down the left side. */
  script(label: string, hat: BlockJson, body: BlockJson[]): BlockJson {
    hat.next = { block: chain(body) }
    return this.place(withLabel(hat, label), 20)
  }
  flag(label: string, body: BlockJson[]): BlockJson {
    return this.script(label, this.blk('event_whenflagclicked'), body)
  }
  receive(label: string, message: string, body: BlockJson[]): BlockJson {
    return this.script(label, this.blk('event_whenbroadcastreceived', { fields: { BROADCAST_OPTION: message } }), body)
  }
  bump(label: string, side: string, body: BlockJson[]): BlockJson {
    return this.script(label, this.blk('platformer_whenbump', { fields: { SIDE: side, BRICK: '_any_' } }), body)
  }
  /** A My Block definition (kept in the right-hand column, out of the way of the scripts). */
  define(proc: MyBlock, label: string, body: BlockJson[], warp = false): BlockJson {
    const def = this.blk('procedures_definition', { extraState: { proccode: proc.proccode, argumentNames: proc.argumentNames, warp }, next: { block: chain(body) } })
    return this.place(withLabel(def, label), 520)
  }
  private place(top: BlockJson, x: number): BlockJson {
    top.x = x
    top.y = 20 + (x === 20 ? this.scriptRows++ : this.defRows++) * 240
    this.scripts.push(top)
    return top
  }
  private scriptRows = 0
  private defRows = 0

  workspace(variables: Array<{ id: string; name: string }> = []): WorkspaceJson {
    return { ...(variables.length > 0 ? { variables } : {}), blocks: { blocks: this.scripts as never } }
  }
}

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
  return compiled(id, name, [costume('Flag', GOAL_ROWS)], b.workspace())
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
/** One-tile-high hard blocks standing on the ground: the Walkers turn around when they bump them. */
export const STARTER_WALLS: ReadonlyArray<{ col: number; row: number }> = [
  { col: 6, row: 1 },
  { col: 15, row: 1 },
  { col: 31, row: 1 },
  { col: 39, row: 1 },
]

export function createStarterTiles(): TileLayer {
  const grid: string[][] = Array.from({ length: STARTER_ROWS }, () => Array.from({ length: STARTER_COLS }, () => '.'))
  const put = (col: number, row: number, tile: TileKind | '.' | 'B' | 'Q'): void => {
    grid[row]![col] = tile in TILE_CHAR ? TILE_CHAR[tile as TileKind] : tile
  }
  for (let col = 0; col < STARTER_COLS; col++) {
    if (STARTER_GAP_COLS.includes(col)) continue
    put(col, 0, STARTER_PIT_COLS.includes(col) ? 'spikes' : 'ground')
  }
  for (const p of STARTER_PLATFORMS) [...p.tiles].forEach((ch, i) => put(p.col + i, p.row, ch as 'B' | 'Q'))
  for (const w of STARTER_WALLS) put(w.col, w.row, 'hard')
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

  const stageWs = createStageWorkspace()
  const coinsVar: VariableDecl = { id: 'coins', name: 'coins', value: 0 }
  const stageBrick: BrickDef = {
    id: STAGE_ID,
    name: 'Stage',
    isStage: true,
    costumes: [c.stageCostume],
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
    bricks: [hero.brick, walker.brick, coin.brick, spring.brick, goal.brick],
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
  }

  return { design, workspaces }
}
