/**
 * Hackable Racing's Car and Computer racer in open blocks (docs/qa/hackable-modes R1).
 *
 * Today's car is `packages/platformer-core/src/engine/car.ts` (60 frames a second, px/frame, radians, y down). This
 * file rebuilds it as Scratch blocks plus the Platformer's self-move blocks and the Racing blocks, so a kid can open
 * the Car and read how it drives. Nothing here touches the engine.
 *
 * How it works, in kid words:
 *   - The Car keeps two speeds of its own every tick: "forward" (the way it points) and "sideways" (sliding).
 *   - "every tick" scripts run in order, once a tick (30 a second). The basics start each tick with plain numbers:
 *     road speed, on rails (no sliding). Each feel script, just before the basic that uses it, changes one number:
 *     off-road slowdown, grip and drift, boost pads. Switch a feel script off and the car still drives.
 *   - "drive and bounce off barriers" (a My Block) turns the two speeds back into x and y speeds and moves the car,
 *     bouncing off anything solid.
 *
 * Units. One tick is two old frames, as for the Hero (studio/hero/heroBrick.ts):
 *   speed (px/frame -> px/tick)                x 2
 *   acceleration (px/frame^2 -> px/tick^2)     x 4
 *   steering (degrees/frame -> degrees/tick)   x 2
 *   frame counts (frames -> ticks)             / 2
 *   "keep k of it every frame" (grip, coasting) -> keep k x k every tick
 * Angles are Scratch directions (0 up, 90 right, clockwise), and sin and cos are the operators' (detmath), never the
 * browser's. The old angle a (radians, 0 right, clockwise on screen) is direction - 90.
 */
import type { BrickDef, Costume, VariableDecl } from '../../core/contracts'
import { compileWorkspace, type WorkspaceJson } from '../../core/editor/compile'
import { Blocks, type BlockJson, type Conn, type MyBlock } from '../blockBuilder'
import { costumeFromImage, imageFromRows } from '../pixels'
import { readLabel } from '../code/layers'

// -----------------------------------------------------------------------------
// The knobs, converted from car.ts DEFAULT_CAR_FEEL ("Kart") to ticks
// -----------------------------------------------------------------------------

const SPEED = 2
const ACCEL = 4
const TICKS = 0.5
/** Keep k of it every frame -> keep k x k of it every tick; as a share removed: 1 - (1 - share)^2. */
const perTick = (sharePerFrame: number): number => 1 - (1 - sharePerFrame) ** 2

export interface CarKnob {
  id: string
  name: string
  value: number
  /** The conversion, in words, from the car.ts value. */
  from: string
}

export const CAR_KNOBS: readonly CarKnob[] = [
  { id: 'top', name: 'top speed', value: 3.2 * SPEED, from: 'top 3.2 px/frame x 2' },
  { id: 'accel', name: 'acceleration', value: 0.07 * ACCEL, from: 'accel 0.07 px/frame^2 x 4' },
  { id: 'brakes', name: 'brakes', value: 0.16 * ACCEL, from: 'brake 0.16 px/frame^2 x 4' },
  { id: 'steering', name: 'steering', value: 3.4 * SPEED, from: 'steer 3.4 degrees/frame x 2' },
  { id: 'grip', name: 'grip', value: perTick(0.22), from: 'grip 0.22 of the slide removed each frame: 1 - 0.78 x 0.78 each tick' },
  { id: 'bounce', name: 'barrier bounce', value: 0.35, from: 'bounce 0.35 (a share, same in both)' },
  { id: 'grass', name: 'grass slows to', value: 0.45, from: 'grass 0.45 of top speed (a share, same in both)' },
  { id: 'dirt', name: 'dirt slows to', value: 0.75, from: 'dirt 0.75 of top speed (a share, same in both)' },
  { id: 'ice_grip', name: 'ice grip', value: perTick(0.04), from: 'ice 0.04 each frame: 1 - 0.96 x 0.96 each tick' },
  { id: 'ice_push', name: 'ice push', value: 0.6, from: 'acceleration x 0.6 on ice (a share, same in both)' },
  { id: 'boost', name: 'boost pad', value: 1.6, from: 'boostK 1.6 x top speed (a share, same in both)' },
  { id: 'boost_ticks', name: 'boost ticks', value: 45 * TICKS, from: 'BOOST_TICKS 45 frames / 2' },
  { id: 'coast', name: 'coasting keeps', value: 0.985 ** 2, from: 'keeps 0.985 of its speed each frame: 0.985 x 0.985 each tick' },
  { id: 'ease', name: 'slow down to top speed', value: 0.05 * ACCEL, from: 'above top speed, 0.05 px/frame^2 x 4' },
  { id: 'grass_ease', name: 'slow down on grass', value: 0.14 * ACCEL, from: 'above the grass speed, 0.14 px/frame^2 x 4' },
  { id: 'reverse_top', name: 'reverse speed', value: 0.4, from: 'reverse up to 0.4 of top speed (a share, same in both)' },
  { id: 'roll', name: 'full steering from', value: 0.35, from: 'steering bites fully from 0.35 of top speed (a share, same in both)' },
  { id: 'reverse_from', name: 'reversing below', value: 0.05 * SPEED, from: 'brakes turn into reverse below 0.05 px/frame x 2' },
  { id: 'side_keep', name: 'barrier keeps sideways', value: 0.85, from: 'a barrier keeps 0.85 of the speed along it (a share, same in both)' },
]

/** The four Build sliders: top speed, acceleration, steering, grip. */
export const CAR_BUILD_KNOB_IDS: readonly string[] = ['top', 'accel', 'steering', 'grip']

/** Working memory, changed every tick. */
const STATE_VARIABLES: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'go', name: 'go' }, // 1 while I may drive: after the countdown, until I finish
  { id: 'steer_in', name: 'steer' }, // -1 left, 0 straight, 1 right
  { id: 'gas', name: 'gas' },
  { id: 'brake_in', name: 'brake' },
  { id: 'fwd', name: 'forward speed' },
  { id: 'side', name: 'sideways speed' },
  { id: 'cap', name: 'top speed now' },
  { id: 'push', name: 'push now' },
  { id: 'grip_now', name: 'grip now' },
  { id: 'ease_now', name: 'slow down now' },
  { id: 'boost_left', name: 'boost left' },
  { id: 'share', name: 'share' },
  { id: 'turn', name: 'turn' },
]

/** Stage (global) variables the race uses: the Car and racers read them, the Stage sets them. */
export const RACE_GLOBALS = { lapsToWin: 'laps_to_win', results: 'results' } as const

/** A Computer racer's own working memory: how far it has to turn to follow the track (parity bucket A). */
const RACER_STATE_VARIABLES: ReadonlyArray<{ id: string; name: string }> = [{ id: 'aim', name: 'turn to follow the track' }]

const LOCAL_KEYS = new Set([...CAR_KNOBS.map((k) => k.id), ...STATE_VARIABLES.map((v) => v.id), ...RACER_STATE_VARIABLES.map((v) => v.id)])

/** A driver's own variables: every knob (the four Build sliders shown in Build), then its working memory. */
function carVariables(prefix: string, knobs: readonly CarKnob[]): VariableDecl[] {
  return [
    ...knobs.map((k): VariableDecl => ({ id: `${prefix}_${k.id}`, name: k.name, value: k.value, ...(CAR_BUILD_KNOB_IDS.includes(k.id) ? { showInBuild: true } : {}) })),
    ...[...STATE_VARIABLES, ...(prefix === 'racer' ? RACER_STATE_VARIABLES : [])].map((v): VariableDecl => ({ id: `${prefix}_${v.id}`, name: v.name, value: 0 })),
  ]
}

/** The variable id of a driver's knob or working memory, e.g. carVariableId('car', 'top') is 'car_top'. */
export const carVariableId = (prefix: 'car' | 'racer', key: string): string => `${prefix}_${key}`

// -----------------------------------------------------------------------------
// Art: an 11 x 11 kart facing right (direction 90), wheels at the corners so its box is square
// -----------------------------------------------------------------------------

const KART_ROWS = [
  'KKK....KKK.',
  'KKKBBBBKKKB',
  '.BBBBBBBBBB',
  '.BBWWBBBBBB',
  '.BBWWBBBYBB',
  '.BBWWBBBYBB',
  '.BBWWBBBYBB',
  '.BBWWBBBBBB',
  '.BBBBBBBBBB',
  'KKKBBBBKKKB',
  'KKK....KKK.',
]

/** The kart's size in steps: its box is CAR_BOX square, whichever way it points (see "drive and bounce off barriers"). */
export const CAR_BOX = 11

function kart(name: string, body: string): Costume {
  return costumeFromImage(name, imageFromRows(KART_ROWS, { '.': '', K: '#111827', B: body, W: '#e0f2fe', Y: '#fde047' }), { x: 5.5, y: 5.5 })
}

// -----------------------------------------------------------------------------
// Blocks
// -----------------------------------------------------------------------------

/**
 * The few blocks blockBuilder doesn't have, on top of it. Variable ids are unique across a design, so each driver's own
 * variables are named `<prefix>_<key>` (car_top, racer_top); the Stage's globals keep their ids.
 */
class CarBlocks extends Blocks {
  constructor(private readonly varPrefix: string) {
    super(varPrefix)
  }
  private local(id: string): string {
    return LOCAL_KEYS.has(id) ? `${this.varPrefix}_${id}` : id
  }
  override v(variableId: string): Conn {
    return super.v(this.local(variableId))
  }
  override set(variableId: string, value: Conn | number): BlockJson {
    return super.set(this.local(variableId), value)
  }
  override change(variableId: string, value: Conn | number): BlockJson {
    return super.change(this.local(variableId), value)
  }
  lt(a: Conn | number, b: Conn | number): Conn {
    return { block: this.blk('operator_lt', { inputs: { OPERAND1: this.as(a), OPERAND2: this.as(b) } }) }
  }
  div(a: Conn | number, b: Conn | number): Conn {
    return { block: this.blk('operator_divide', { inputs: { NUM1: this.as(a), NUM2: this.as(b) } }) }
  }
  and(a: Conn, b: Conn): Conn {
    return { block: this.blk('operator_and', { inputs: { OPERAND1: a, OPERAND2: b } }) }
  }
  mathop(op: 'abs' | 'sin' | 'cos', a: Conn): Conn {
    return { block: this.blk('operator_mathop', { fields: { OPERATOR: op }, inputs: { NUM: a } }) }
  }
  key(k: string): Conn {
    return { block: this.blk('sensing_keypressed', { fields: { KEY_OPTION: k } }) }
  }
  /** A key or its partners (WASD beside the arrows, parity bucket A): the first keeps the Car's old block. */
  keys(first: string, ...more: string[]): Conn {
    const one = this.key(first)
    return this.later(() => more.reduce<Conn>((either, k) => ({ block: this.blk('operator_or', { inputs: { OPERAND1: either, OPERAND2: this.key(k) } }) }), one))
  }
  ground(): Conn {
    return { block: this.blk('race_groundunder') }
  }
  groundIs(name: string): Conn {
    return this.eq(this.ground(), this.text(name))
  }
  ySpeed(): Conn {
    return { block: this.blk('platformer_speed', { fields: { AXIS: 'y' } }) }
  }
  sinDir(): Conn {
    return this.mathop('sin', this.direction())
  }
  cosDir(): Conn {
    return this.mathop('cos', this.direction())
  }
  every(label: string, body: BlockJson[]): BlockJson {
    return this.script(label, this.blk('platformer_everytick'), body)
  }
  turnBy(degrees: Conn): BlockJson {
    return this.blk('motion_turnright', { inputs: { DEGREES: degrees } })
  }
  addToList(listId: string, item: Conn): BlockJson {
    return this.blk('data_addtolist', { fields: { LIST: listId }, inputs: { ITEM: item } })
  }
  join(a: Conn | string, c: Conn | string): Conn {
    const str = (x: Conn | string): Conn => (typeof x === 'string' ? this.text(x) : x)
    return { block: this.blk('operator_join', { inputs: { STRING1: str(a), STRING2: str(c) } }) }
  }
  costumeName(): Conn {
    return { block: this.blk('looks_costumenumbername', { fields: { NUMBER_NAME: 'name' } }) }
  }
  moveUntilHit(axis: 'x' | 'y', by: Conn): BlockJson {
    return this.blk('platformer_moveuntilhit', { fields: { AXIS: axis }, inputs: { DISTANCE: by } })
  }
  hit(): Conn {
    return { block: this.blk('platformer_hitsomething') }
  }
}

export const DRIVE: MyBlock = { proccode: 'drive and bounce off barriers', argumentNames: [] }

/**
 * Everything the Car and a Computer racer share: the basics and feel scripts after the controls, and the My Block.
 * `controls` adds the scripts that set "steer", "gas" and "brake" each tick (keys for the Car, the track for a racer).
 */
function driverWorkspace(prefix: string, controls: (b: CarBlocks) => void): WorkspaceJson {
  const b = new CarBlocks(prefix)
  const v = (id: string) => b.v(id)
  const top = () => v('top')

  b.flag('When the race starts: no gravity, I move myself', [
    b.blk('platformer_setgravity', { fields: { GRAVITY: 'off' } }),
    b.blk('platformer_setmover', { fields: { MOVER: 'self' } }),
    b.rotationStyle('all around'),
    b.setSpeed('x', 0),
    b.setSpeed('y', 0),
  ])
  b.receive('When the countdown says go: I can drive', 'go', [b.set('go', 1)])

  controls(b)

  b.every('Start each tick with the normal numbers: road speed, and on rails (no sliding)', [
    b.set('cap', top()),
    b.set('push', v('accel')),
    b.set('grip_now', 1),
    b.set('ease_now', v('ease')),
  ])

  b.every('Off-road slowdown: grass and dirt are slower than road', [
    b.when(b.groundIs('Grass'), [b.set('cap', b.mul(top(), v('grass'))), b.set('ease_now', v('grass_ease'))]),
    b.when(b.groundIs('Dirt'), [b.set('cap', b.mul(top(), v('dirt')))]),
  ])

  b.every('Grip and drift: my tyres stop only some of a slide each tick, and on ice hardly any', [
    b.set('grip_now', v('grip')),
    b.when(b.groundIs('Ice'), [b.set('grip_now', v('ice_grip')), b.set('push', b.mul(v('push'), v('ice_push')))]),
  ])

  // Forward speed before turning: steering only bites when I'm rolling, and flips when I reverse.
  const forwardNow = (): Conn => b.add(b.mul(b.xSpeed(), b.sinDir()), b.mul(b.ySpeed(), b.cosDir()))
  b.every('Steer: turn when I\'m rolling, the other way when I reverse', [
    b.set('share', b.div(b.mathop('abs', forwardNow()), b.mul(top(), v('roll')))),
    b.when(b.gt(v('share'), 1), [b.set('share', 1)]),
    b.set('turn', b.mul(b.mul(v('steer_in'), v('steering')), v('share'))),
    b.when(b.lt(forwardNow(), b.sub(0, v('reverse_from'))), [b.set('turn', b.sub(0, v('turn')))]),
    b.turnBy(v('turn')),
  ])

  b.every('Split my speed: forward (the way I point) and sideways (sliding)', [
    b.set('fwd', forwardNow()),
    b.set('side', b.sub(b.mul(b.xSpeed(), b.cosDir()), b.mul(b.ySpeed(), b.sinDir()))),
  ])

  // Parity bucket A (2026-11-03): like the classic pad, it boosts only a car going the way its arrow points (the pad
  // faces its way: within about 70 degrees of it, as classic's 0.3).
  const onPad = b.groundIs('Boost pad')
  const goingItsWay = b.later(() =>
    b.and(onPad, b.gt(b.mathop('cos', b.sub(b.direction(), { block: b.blk('sensing_of', { fields: { PROPERTY: 'direction', OBJECT: 'Boost pad' } }) })), 0.3)),
  )
  b.every('Boost pads: a boost pad shoots me forward, then the extra speed fades', [
    b.when(goingItsWay, [
      b.set('boost_left', v('boost_ticks')),
      b.when(b.lt(v('fwd'), b.mul(top(), v('boost'))), [b.set('fwd', b.mul(top(), v('boost')))]),
    ]),
    b.when(b.gt(v('boost_left'), 0), [
      b.change('boost_left', -1),
      b.set('share', b.div(v('boost_left'), v('boost_ticks'))),
      b.set('turn', b.add(b.mul(b.mul(top(), v('boost')), v('share')), b.mul(v('cap'), b.sub(1, v('share'))))),
      b.when(b.gt(v('turn'), v('cap')), [b.set('cap', v('turn'))]),
    ]),
  ])

  b.every('Gas and brakes: gas speeds me up to my top speed, brakes slow me and then reverse, and I coast to a stop', [
    b.either(
      b.eq(v('gas'), 1),
      [
        b.when(b.lt(v('fwd'), v('cap')), [
          b.either(b.lt(v('fwd'), 0), [b.change('fwd', b.mul(v('push'), 2))], [b.change('fwd', v('push'))]),
          b.when(b.gt(v('fwd'), v('cap')), [b.set('fwd', v('cap'))]),
        ]),
      ],
      [
        b.either(
          b.eq(v('brake_in'), 1),
          [b.either(b.gt(v('fwd'), v('reverse_from')), [b.change('fwd', b.sub(0, v('brakes')))], [b.change('fwd', b.sub(0, b.mul(v('push'), 0.6)))])],
          [b.set('fwd', b.mul(v('fwd'), v('coast')))],
        ),
      ],
    ),
    // Faster than I may go here (after a boost, or onto grass): ease back down.
    b.when(b.gt(v('fwd'), v('cap')), [b.change('fwd', b.sub(0, v('ease_now'))), b.when(b.lt(v('fwd'), v('cap')), [b.set('fwd', v('cap'))])]),
    b.when(b.lt(v('fwd'), b.sub(0, b.mul(top(), v('reverse_top')))), [b.set('fwd', b.sub(0, b.mul(top(), v('reverse_top'))))]),
  ])

  b.every('Grip: sideways sliding fades by my grip', [b.set('side', b.mul(v('side'), b.sub(1, v('grip_now'))))])

  b.every('Drive: move, and bounce off barriers (go inside to see how)', [b.call(DRIVE)])

  b.define(DRIVE, 'Drive and bounce off barriers: turn my two speeds into x and y speeds, move, bounce off anything solid', [
    b.setSpeed('x', b.add(b.mul(v('fwd'), b.sinDir()), b.mul(v('side'), b.cosDir()))),
    b.setSpeed('y', b.sub(b.mul(v('fwd'), b.cosDir()), b.mul(v('side'), b.sinDir()))),
    // Upright while I move, so my box is the same size whichever way I point.
    b.rotationStyle("don't rotate"),
    b.moveUntilHit('x', b.xSpeed()),
    b.when(b.hit(), [b.blk('platformer_tellhit'), b.setSpeed('x', b.sub(0, b.mul(b.xSpeed(), v('bounce')))), b.setSpeed('y', b.mul(b.ySpeed(), v('side_keep')))]),
    b.moveUntilHit('y', b.ySpeed()),
    b.when(b.hit(), [b.blk('platformer_tellhit'), b.setSpeed('y', b.sub(0, b.mul(b.ySpeed(), v('bounce')))), b.setSpeed('x', b.mul(b.xSpeed(), v('side_keep')))]),
    b.rotationStyle('all around'),
  ])

  b.script('When I finish my last lap: stop, and put my name on the results', b.blk('race_whenlap'), [
    b.when(b.eq({ block: b.blk('race_lapsdone') }, v(RACE_GLOBALS.lapsToWin)), [
      b.set('go', 0),
      // "1. Red racer", "2. You", ...
      b.addToList(RACE_GLOBALS.results, b.join(b.join(b.add({ block: b.blk('data_lengthoflist', { fields: { LIST: RACE_GLOBALS.results } }) }, 1), '. '), b.costumeName())),
      b.broadcast('finished'),
    ]),
  ])

  return b.workspace(carVariables(prefix, CAR_KNOBS).map((d) => ({ id: d.id, name: d.name })))
}

/** The Car: the arrow keys (or W A S D) drive it. */
export function createCarWorkspace(): WorkspaceJson {
  return driverWorkspace('car', (b) => {
    b.every('Read the arrow keys: left and right steer, up is gas, down is brake', [
      b.set('steer_in', 0),
      b.set('gas', 0),
      b.set('brake_in', 0),
      b.when(b.eq(b.v('go'), 1), [
        b.when(b.keys('right arrow', 'd'), [b.set('steer_in', 1)]),
        b.when(b.keys('left arrow', 'a'), [b.change('steer_in', -1)]),
        b.when(b.keys('up arrow', 'w'), [b.set('gas', 1)]),
        b.when(b.keys('down arrow', 's'), [b.set('brake_in', 1)]),
      ]),
    ])
  })
}

/**
 * A Computer racer: it steers toward the way the track goes and brakes for sharp turns, like the classic computer
 * driver (raceAutopilot.ts: steer by the angle x 3, at most full lock; off the gas and on the brakes when the turn is
 * sharper than 0.9 radians, about 52 degrees, at more than 1.5 px/frame). Before parity bucket A it turned instantly.
 */
export function createRacerWorkspace(): WorkspaceJson {
  return driverWorkspace('racer', (b) => {
    b.every('Drive along the track', b.later(() => [
      // How far to turn, -180 to 180 (right is +).
      b.set('aim', b.sub(b.mod(b.add(b.sub({ block: b.blk('race_trackdirection') }, b.direction()), 540), 360), 180)),
      b.set('steer_in', b.div(b.v('aim'), 19)),
      b.when(b.gt(b.v('steer_in'), 1), [b.set('steer_in', 1)]),
      b.when(b.lt(b.v('steer_in'), -1), [b.set('steer_in', -1)]),
      b.set('gas', b.v('go')),
      b.set('brake_in', 0),
      b.when(b.and(b.gt(b.mathop('abs', b.v('aim')), 52), b.gt(b.v('fwd'), 3)), [b.set('gas', 0), b.set('brake_in', b.v('go'))]),
    ]))
  })
}

export const CAR_BRICK_ID = 'brick_car'
export const RACER_BRICK_ID = 'brick_racer'
/** Computer racers a little slower than the Car, so you can win. */
export const RACER_TOP_SPEED = 5.8

function compileDriver(prefix: string, workspace: WorkspaceJson, knobs: readonly CarKnob[]) {
  return compileWorkspace(workspace, { variables: carVariables(prefix, knobs) })
}

export function createCarBrick(): { brick: BrickDef; workspace: WorkspaceJson; diagnostics: ReturnType<typeof compileWorkspace>['diagnostics'] } {
  const workspace = createCarWorkspace()
  const { program, diagnostics } = compileDriver('car', workspace, CAR_KNOBS)
  return { brick: { id: CAR_BRICK_ID, name: 'Car', costumes: [kart('You', '#22c55e')], sounds: [], program, limit: 1 }, workspace, diagnostics }
}

export function createRacerBrick(): { brick: BrickDef; workspace: WorkspaceJson; diagnostics: ReturnType<typeof compileWorkspace>['diagnostics'] } {
  const workspace = createRacerWorkspace()
  const knobs = CAR_KNOBS.map((k) => (k.id === 'top' ? { ...k, value: RACER_TOP_SPEED, from: `${k.from}, then a little slower` } : k))
  const { program, diagnostics } = compileDriver('racer', workspace, knobs)
  return {
    brick: { id: RACER_BRICK_ID, name: 'Computer racer', costumes: [kart('Red racer', '#ef4444'), kart('Blue racer', '#3b82f6')], sounds: [], program, limit: 3 },
    workspace,
    diagnostics,
  }
}

// -----------------------------------------------------------------------------
// "How I drive": the labels the code editor folds (studio/code/sections.ts)
// -----------------------------------------------------------------------------

/** The hats of a driver's driving scripts: the basics and feel scripts all run "over and over". */
export const CAR_DRIVING_HATS: readonly string[] = ['platformer_everytick']

function drivingLabels(workspace: WorkspaceJson): ReadonlySet<string> {
  const tops = (workspace.blocks as { blocks: Array<{ type: string; data?: string }> }).blocks
  return new Set(tops.filter((b) => CAR_DRIVING_HATS.includes(b.type)).map((b) => readLabel(b.data)).filter(Boolean))
}

let carLabels: ReadonlySet<string> | undefined
let racerLabels: ReadonlySet<string> | undefined

/**
 * The labels of the Car's driving scripts (reading the keys, the basics and the feel scripts), read from
 * `createCarWorkspace` itself so the list can never drift. The code editor folds the scripts with these labels into one
 * "How I drive" entry; the start, countdown and last-lap scripts and the My Block stay on the top view.
 *
 * Saved Cars keep the labels they were made with, so changing a label here drops old Cars' scripts out of the fold:
 * carBrick.test.ts pins them.
 */
export function carDrivingLabels(): ReadonlySet<string> {
  return (carLabels ??= drivingLabels(createCarWorkspace()))
}

/** The same for a Computer racer: "Drive along the track" instead of the arrow keys. */
export function racerDrivingLabels(): ReadonlySet<string> {
  return (racerLabels ??= drivingLabels(createRacerWorkspace()))
}
