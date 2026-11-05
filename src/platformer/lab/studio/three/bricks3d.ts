/**
 * Hackable 3D's code bricks (docs/qa/hackable-3d/D1.md; the spike mock's "Six 3D code bricks"): Bounce pad, Mover,
 * Spinner, Coin, Goal, and Button + Door, plus the 3D Hero. Each is a real brick: its scripts are ordinary blocks
 * (built with the same builder as the 2D starter's bricks), its numbers are variables shown as Sliders, and See inside
 * opens exactly what runs.
 *
 * Every distance and speed is in studs (owner decision 2026-11-04): 1 stud is one brick's width.
 */
import type { BrickDef, VariableDecl } from '../../core/contracts'
import { compileWorkspace, type WorkspaceJson } from '../../core/editor/compile'
import { PLATE, STUD, type BrickDef3, type Model3 } from '../../kit3d/contracts3d'
import { HERO3D } from '../../kit3d/engine3d'
import { Blocks, type BlockJson, type Conn } from '../blockBuilder'
import { costumeFromImage, imageFromRows } from '../pixels'
import type { Costume } from '../../core/contracts'

export interface Made3 {
  brick: BrickDef3
  workspace: WorkspaceJson
}

/** The messages the bricks use, so the Hero, the Stage and the HUD agree. */
export const MSG_BACK_TO_START = 'back to start'
export const MSG_COIN = 'coin collected'
export const MSG_WIN = 'you win'
export const MSG_OPEN = 'open'

/** The 3D category's colour (the mock: "3D" next to Platformer and Racing). */
export const COLOR_3D = '#4B58B8'

/** A 16 × 16 picture of a brick with two studs, in the brick's colour: its thumbnail on cards and in Code. */
const BRICK_ICON = [
  '................',
  '................',
  '...SS......SS...',
  '..STTS....STTS..',
  '.##TT######TT##.',
  '.#CCCCCCCCCCCC#.',
  '.#CHHHHHHHHHHC#.',
  '.#CCCCCCCCCCCC#.',
  '.#CCCCCCCCCCCC#.',
  '.#CCCCCCCCCCCC#.',
  '.#CCCCCCCCCCCC#.',
  '.#DDDDDDDDDDDD#.',
  '.#DDDDDDDDDDDD#.',
  '.##############.',
  '................',
  '................',
]

const shade = (hex: string, f: number): string => {
  const n = parseInt(hex.slice(1), 16)
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.min(255, Math.round(v * f)).toString(16).padStart(2, '0')).join('')
}

/** The costume a 3D brick carries (2D screens and the save format expect one; the 3D view draws its shape). */
export function brickIcon3d(color: string, name = 'Brick'): Costume {
  const palette = { '#': '#16213e', C: color, H: shade(color, 1.25), D: shade(color, 0.75), S: shade(color, 0.8), T: shade(color, 1.15) }
  return costumeFromImage(name, imageFromRows(BRICK_ICON, palette), { x: 8, y: 8 })
}

function made(id: string, name: string, shape: { w: number; h: number; d: number; color: string; model: Model3 }, b: Blocks, variables: VariableDecl[] = [], extra: Partial<BrickDef> = {}): Made3 {
  const workspace = b.workspace(variables.map(({ id: vid, name: vname }) => ({ id: vid, name: vname })))
  const program = compileWorkspace(workspace, variables.length > 0 ? { variables } : undefined).program
  return {
    brick: { id, name, costumes: [brickIcon3d(shape.color, name)], sounds: [], program, shape3d: { w: shape.w, h: shape.h, d: shape.d, look: { color: shape.color, model: shape.model } }, ...extra },
    workspace,
  }
}

/** A few blocks the 2D builder has no helper for. */
class Blocks3 extends Blocks {
  solidOn(): BlockJson { return this.setSolid('on') }
  speed(axis: 'x' | 'y' | 'z', value: Conn | number): BlockJson {
    return this.blk('platformer_setspeed', { fields: { AXIS: axis }, inputs: { SPEED: this.as(value) } })
  }
  waitFor(seconds: Conn | number): BlockJson {
    return this.blk('control_wait', { inputs: { DURATION: this.as(seconds) } })
  }
  turnBy(degrees: Conn | number): BlockJson {
    return this.blk('motion_turnright', { inputs: { DEGREES: this.as(degrees) } })
  }
  changeYBy(dy: Conn | number): BlockJson {
    return this.blk('motion_changeyby', { inputs: { DY: this.as(dy) } })
  }
  div(a: Conn | number, b: Conn | number): Conn {
    return { block: this.blk('operator_divide', { inputs: { NUM1: this.as(a), NUM2: this.as(b) } }) }
  }
  launch(speed: Conn | number): BlockJson {
    return this.blk('kit3d_launchlanders', { inputs: { SPEED: this.as(speed) } })
  }
  goHome(): BlockJson { return this.blk('kit3d_gohome') }
  sayFor(message: string, seconds: number): BlockJson {
    return this.blk('looks_sayforsecs', { inputs: { MESSAGE: this.text(message), SECS: this.num(seconds) } })
  }
  repeatN(times: number, body: BlockJson[]): BlockJson { return this.repeat(times, body) }
}

/** The 3D Hero: the classic character, run by the engine. Its own scripts run alongside (D4 opens the moving). */
export function createHero3d(id = HERO3D, name = 'Hero'): Made3 {
  const b = new Blocks3(id)
  b.receive('When something sends me back: go back to where I started', MSG_BACK_TO_START, [b.goHome()])
  return made(id, name, { w: 0.36, h: 0.72, d: 0.36, color: '#3e83d7', model: 'hero' }, b, [], { limit: 1 })
}

/** Bounce pad: solid; a Hero who lands on it is thrown up at "launch speed" studs a second. */
export function createBouncePad3d(id: string, name = 'Bounce pad'): Made3 {
  const b = new Blocks3(id)
  const launch = `${id}_launch`
  b.flag('When the game starts: be solid', [b.solidOn()])
  b.bump('When a Hero lands on me: throw them up', 'bottom', [b.launch(b.v(launch))], 'Hero')
  return made(id, name, { w: 2 * STUD, h: PLATE, d: 2 * STUD, color: '#e0503a', model: 'pad' }, b,
    [{ id: launch, name: 'launch speed', value: 15, showInBuild: true }])
}

/** Mover: a solid platform that slides along x and back, carrying whoever stands on it. */
export function createMover3d(id: string, name = 'Mover'): Made3 {
  const b = new Blocks3(id)
  const speed = `${id}_speed`
  const secs = `${id}_seconds`
  b.flag('When the game starts: slide one way, then back, forever', [
    b.solidOn(),
    b.forever([b.speed('x', b.v(speed)), b.waitFor(b.v(secs)), b.speed('x', b.sub(0, b.v(speed))), b.waitFor(b.v(secs))]),
  ])
  return made(id, name, { w: 4 * STUD, h: PLATE, d: 2 * STUD, color: '#8796a0', model: 'box' }, b, [
    { id: speed, name: 'speed', value: 2, showInBuild: true },
    { id: secs, name: 'seconds', value: 2, showInBuild: true },
  ])
}

/** Spinner: a bar that turns round and round; a Hero who touches it goes back to the start. */
export function createSpinner3d(id: string, name = 'Spinner'): Made3 {
  const b = new Blocks3(id)
  const turn = `${id}_turn`
  b.flag('When the game starts: turn forever, and send back any Hero I touch', [
    b.forever([b.turnBy(b.v(turn)), b.when(b.touchingHero(), [b.broadcast(MSG_BACK_TO_START)])]),
  ])
  return made(id, name, { w: 6 * STUD, h: 2 * PLATE, d: 0.5 * STUD, color: '#6857d9', model: 'bar' }, b,
    [{ id: turn, name: 'turn', value: 3, showInBuild: true }])
}

/** Coin: spins; a Hero who touches it collects it (the Stage counts "coins"). */
export function createCoin3d(id: string, name = 'Coin'): Made3 {
  const b = new Blocks3(id)
  const spin = `${id}_spin`
  b.flag('When the game starts: spin, and vanish when a Hero touches me', [
    b.show(),
    b.forever([b.turnBy(b.v(spin)), b.when(b.touchingHero(), [b.broadcast(MSG_COIN), b.hide(), b.blk('control_stop', { fields: { STOP_OPTION: 'this script' } })])]),
  ])
  return made(id, name, { w: 0.8 * STUD, h: 0.8 * STUD, d: 0.8 * STUD, color: '#f4c93a', model: 'coin' }, b,
    [{ id: spin, name: 'spin', value: 6, showInBuild: true }])
}

/** Goal: a flag. Bump into it and you made it. */
export function createGoal3d(id: string, name = 'Goal'): Made3 {
  const b = new Blocks3(id)
  b.flag('When the game starts: be solid', [b.solidOn()])
  // "you win" first: a Hero still walking into the flag restarts this script every tick, so a say-for-2-seconds
  // before it would never finish (the mock had them the other way round).
  b.bump('When a Hero reaches me: you win', '_any_', [b.broadcast(MSG_WIN), b.sayFor('You made it!', 2)], 'Hero')
  return made(id, name, { w: STUD, h: 9 * PLATE, d: STUD, color: '#16213e', model: 'flag' }, b, [], { limit: 1 })
}

/** Button: step on it and it says "open" (once). */
export function createButton3d(id: string, name = 'Button'): Made3 {
  const b = new Blocks3(id)
  const pressed = `${id}_pressed`
  b.flag('When the game starts: be solid, not pressed yet', [b.solidOn(), b.set(pressed, 0)])
  b.bump('When a Hero steps on me: open the door (once)', 'bottom', [
    b.when(b.eq(b.v(pressed), 0), [b.set(pressed, 1), b.broadcast(MSG_OPEN)]),
  ], 'Hero')
  return made(id, name, { w: 2 * STUD, h: PLATE, d: 2 * STUD, color: '#e7473c', model: 'button' }, b,
    [{ id: pressed, name: 'pressed', value: 0 }])
}

/** Door: solid; when it hears "open" it rises "how high" studs, a tenth at a time. */
export function createDoor3d(id: string, name = 'Door'): Made3 {
  const b = new Blocks3(id)
  const high = `${id}_high`
  b.flag('When the game starts: be solid', [b.solidOn()])
  b.receive('When I hear open: rise', MSG_OPEN, [b.repeatN(10, [b.changeYBy(b.div(b.v(high), 10))])])
  return made(id, name, { w: 4 * STUD, h: 9 * PLATE, d: STUD, color: '#7b5238', model: 'box' }, b,
    [{ id: high, name: 'how high', value: 2, showInBuild: true }])
}

/** The six Code bricks the drawer offers, in the mock's order. Button + Door places two bricks. */
export interface CodeBrick3 {
  key: 'pad' | 'mover' | 'spinner' | 'coin' | 'goal' | 'buttonDoor'
  label: string
  /** One short line, for the drawer's title and the New brick sheet. */
  does: string
  color: string
  /** The bricks it adds (fixed ids, so a second Coin reuses the first's brick) and where each goes from the click. */
  parts: ReadonlyArray<{ id: string; make: (id: string) => Made3; offset: { x: number; y: number; z: number } }>
}

/** Things float this high above what they are placed on (a coin hovers; everything else stands). */
const HOVER = 0.5 * STUD

export const CODE_BRICKS_3D: readonly CodeBrick3[] = [
  { key: 'pad', label: 'Bounce pad', does: 'Throws a Hero up when they land on it', color: '#e0503a', parts: [{ id: 'brick3d_pad', make: (id) => createBouncePad3d(id), offset: { x: 0, y: 0, z: 0 } }] },
  { key: 'mover', label: 'Mover', does: 'A platform that slides back and forth', color: '#8796a0', parts: [{ id: 'brick3d_mover', make: (id) => createMover3d(id), offset: { x: 0, y: 0, z: 0 } }] },
  { key: 'spinner', label: 'Spinner', does: 'Turns round and round; touch it and you go back', color: '#6857d9', parts: [{ id: 'brick3d_spinner', make: (id) => createSpinner3d(id), offset: { x: 0, y: 0, z: 0 } }] },
  { key: 'coin', label: 'Coin', does: 'Spins; a Hero who touches it gets a coin', color: '#f4c93a', parts: [{ id: 'brick3d_coin', make: (id) => createCoin3d(id), offset: { x: 0, y: HOVER, z: 0 } }] },
  { key: 'goal', label: 'Goal', does: 'Reach it to win', color: '#16213e', parts: [{ id: 'brick3d_goal', make: (id) => createGoal3d(id), offset: { x: 0, y: 0, z: 0 } }] },
  {
    key: 'buttonDoor', label: 'Button + Door', does: 'Step on the button and the door opens', color: '#7b5238', parts: [
      { id: 'brick3d_button', make: (id) => createButton3d(id), offset: { x: 0, y: 0, z: 0 } },
      // The Door stands 2½ studs behind the Button's middle: a stud-wide wall on the grid, one stud clear of the Button.
      { id: 'brick3d_door', make: (id) => createDoor3d(id), offset: { x: 0, y: 0, z: -2.5 * STUD } },
    ],
  },
]

/** The Stage of a 3D game: counts coins, and starts each game with none. */
export function createStage3dWorkspace(): WorkspaceJson {
  const b = new Blocks('stage')
  b.flag('When the game starts: no coins yet', [b.set('coins', 0)])
  b.receive('When a Coin is collected: count it', MSG_COIN, [b.change('coins', 1)])
  return b.workspace([{ id: 'coins', name: 'coins' }])
}

export const STAGE_VARIABLES_3D: VariableDecl[] = [{ id: 'coins', name: 'coins', value: 0 }]

/** + New brick in 3D: a 1 × 1 brick with one empty flag hat, ready for the kid's own blocks. */
export function createEmpty3d(id: string, name: string): Made3 {
  const workspace: WorkspaceJson = { blocks: { blocks: [{ type: 'event_whenflagclicked', id: `${id}_flag`, x: 20, y: 20, data: 'label:Drag blocks under this hat.' }] as never } }
  const program = compileWorkspace(workspace).program
  return {
    brick: { id, name, costumes: [brickIcon3d('#a9b7bd', name)], sounds: [], program, shape3d: { w: STUD, h: 3 * PLATE, d: STUD, look: { color: '#a9b7bd', model: 'box' } } },
    workspace,
  }
}
