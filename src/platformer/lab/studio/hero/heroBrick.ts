/**
 * The Hero in open blocks (Code Lab step 5).
 *
 * Today's Hero is `packages/platformer-core/src/engine/player.ts`, tuned by `feel.ts` (Super Mario Bros. 3 shaped, 60
 * frames per second, speeds in px/frame). This file rebuilds that movement as a plain Blockly workspace made of Scratch
 * blocks plus the Platformer blocks, so a kid can open it and read it. Nothing here touches the engine.
 *
 * How it works, in kid words:
 *   - Platformer gravity is OFF. The Hero keeps its own "y speed" and does its own gravity every tick, so it can pull
 *     gently while you hold jump on the way up and hard when you let go or fall.
 *   - One `forever` loop runs once per tick (30 per second). Each tick it calls these My Blocks in order:
 *       read keys, feel the wall, walk, run meter, jump, fall.
 *   - The Platformer physics step then moves the Hero by its x speed and y speed and stops it at solids.
 *   - Every number you might want to tune is a local variable shown as a Build knob (name, value, why).
 *
 * Units. The old engine is 60 frames per second; Code Lab is 30 ticks per second, so one tick = two old frames:
 *   speed (px/frame -> px/tick)        x 2
 *   acceleration (px/frame^2 -> px/tick^2)  x 4       (two frames of speed change, over two frames of time)
 *   frame counts (frames -> ticks)     / 2
 * feel.ts stores accelerations as decimals (0.0547) but the engine rounds every one to whole 1/256 px, so the table
 * below does the same (`engine`): the values equal what the old Hero really uses.
 *
 * The y axis points up in Code Lab and down in the old engine, so a jump is a positive y speed here.
 */
import type { BrickDef, VariableDecl } from '../../core/contracts'
import { compileWorkspace, type WorkspaceJson } from '../../core/editor/compile'
import { costumeFromImage, imageFromRows } from '../pixels'
import { labelData } from '../code/layers'

// -----------------------------------------------------------------------------
// Art: a 16 x 16 hero whose opaque box is 12 wide x 14 tall, bottom aligned (the old player's collision box)
// -----------------------------------------------------------------------------

const PALETTE: Record<string, string> = {
  '.': '',
  '#': '#0f172a',
  R: '#ef4444',
  r: '#b91c1c',
  S: '#fcd9b6',
  W: '#ffffff',
  K: '#1e1b4b',
  B: '#38bdf8',
  b: '#0284c7',
}

/** Rows 0-1 and columns 0-1 and 14-15 are empty, so the opaque box is columns 2..13 and rows 2..15 (12 x 14). */
const HERO_ROWS = [
  '................',
  '................',
  '...##########...',
  '..#RRRRRRRRRR#..',
  '..#SSSSSSSSSS#..',
  '..#SSWKSSWKSS#..',
  '..#SSSSSSSSSS#..',
  '..#SSSrrrSSSS#..',
  '..#BBBBBBBBBB#..',
  '..#BBBBBBBBBB#..',
  '..#BBBBBBBBBB#..',
  '..#bbbbbbbbbb#..',
  '..#bbbbbbbbbb#..',
  '..#bbbbbbbbbb#..',
  '..#bb##..##bb#..',
  '..############..',
]

/** The Hero's size in steps: the visible costume, and the opaque box the physics uses (the old player is 12 x 14). */
export const HERO_COSTUME_SIZE = 16
export const HERO_BOX = { width: 12, height: 14 } as const

export function createHeroCostume() {
  return costumeFromImage('Hero', imageFromRows(HERO_ROWS, PALETTE), { x: 8, y: 8 })
}

// -----------------------------------------------------------------------------
// The knobs (every tunable number), converted from feel.ts to ticks
// -----------------------------------------------------------------------------

const SPEED = 2 // px/frame -> px/tick
const ACCEL = 4 // px/frame^2 -> px/tick^2
const TICKS = 0.5 // frames -> ticks
/** What the engine really uses: feel.ts decimals rounded to whole 1/256 px (`sub` in engine/constants.ts). */
const engine = (pxPerFrame: number): number => Math.round(pxPerFrame * 256) / 256

export interface HeroKnob {
  id: string
  name: string
  value: number
  /** The conversion, in words, from the feel.ts value. */
  from: string
}

/** Every tunable number, as a named local variable. Only HERO_BUILD_KNOB_IDS are shown in Build (`showInBuild`). */
export const HERO_KNOBS: readonly HeroKnob[] = [
  // Running
  { id: 'walk_top', name: 'walk top speed', value: 1.5 * SPEED, from: 'walkMax 1.5 px/frame x 2' },
  { id: 'run_top', name: 'run top speed', value: 2.5 * SPEED, from: 'runMax 2.5 px/frame x 2' },
  { id: 'p_top', name: 'p speed', value: 3.5 * SPEED, from: 'pMax 3.5 px/frame x 2' },
  { id: 'walk_push', name: 'walk push', value: engine(0.0547) * ACCEL, from: 'walkAccel 0.0547 (14/256) px/frame^2 x 4' },
  { id: 'run_push', name: 'run push', value: engine(0.0625) * ACCEL, from: 'runAccel 0.0625 (16/256) px/frame^2 x 4' },
  { id: 'air_push', name: 'air push', value: engine(0.0547) * ACCEL, from: 'airAccel 0.0547 (14/256) px/frame^2 x 4' },
  { id: 'friction', name: 'friction', value: engine(0.0547) * ACCEL, from: 'releaseDecel 0.0547 (14/256) px/frame^2 x 4' },
  { id: 'skid', name: 'skid', value: engine(0.125) * ACCEL, from: 'skidDecel 0.125 (32/256) px/frame^2 x 4' },
  { id: 'air_turn', name: 'air turn', value: engine(0.0938) * ACCEL, from: 'airTurn 0.0938 (24/256) px/frame^2 x 4' },
  { id: 'meter_slack', name: 'meter slack', value: engine(0.0625) * SPEED, from: 'the 0.0625 px/frame under run top speed that still fills the meter x 2' },
  { id: 'meter_fill', name: 'meter fill ticks', value: 8 * TICKS, from: 'pFillFrames 8 frames / 2' },
  { id: 'meter_drain', name: 'meter drain ticks', value: 24 * TICKS, from: 'pDrainFrames 24 frames / 2' },
  { id: 'meter_full', name: 'meter full', value: 7, from: 'P_SEGMENTS 7 (a count, same in both)' },
  // Jumping
  // A tick is two old frames, and the old Hero moved after each frame's gravity. Over a tick it covers the speed we
  // hold now plus a quarter of that gravity (the first frame's pull is already in). Adding that quarter to the jump
  // speed makes every rising tick cover the same distance as the two old frames it replaces.
  { id: 'jump_stand', name: 'jump standing', value: 4.0 * SPEED + (engine(0.125) * ACCEL) / 4, from: 'jump0 4.0 px/frame x 2, plus a quarter of float gravity slow (tick correction)' },
  { id: 'jump_walk', name: 'jump walking', value: 4.25 * SPEED + (engine(0.125) * ACCEL) / 4, from: 'jump1 4.25 px/frame x 2, plus a quarter of float gravity slow (tick correction)' },
  { id: 'jump_run', name: 'jump running', value: 4.75 * SPEED + (engine(0.135) * ACCEL) / 4, from: 'jump2 4.75 px/frame x 2, plus a quarter of float gravity fast (tick correction)' },
  { id: 'jump_p', name: 'jump at p speed', value: 5.0 * SPEED + (engine(0.135) * ACCEL) / 4, from: 'jump3 5.0 px/frame x 2, plus a quarter of float gravity fast (tick correction)' },
  { id: 'walk_jump_from', name: 'walking jump from', value: 1 * SPEED, from: 'speed 1 px/frame (player.ts tier 1) x 2' },
  { id: 'run_jump_from', name: 'running jump from', value: 2.25 * SPEED, from: 'speed 2.25 px/frame (player.ts tier 2) x 2' },
  { id: 'p_jump_from', name: 'p jump from', value: 3.25 * SPEED, from: 'speed 3.25 px/frame (player.ts tier 3) x 2' },
  { id: 'hold_slow', name: 'float gravity slow', value: engine(0.125) * ACCEL, from: 'holdSlow 0.125 (32/256) px/frame^2 x 4' },
  { id: 'hold_fast', name: 'float gravity fast', value: engine(0.135) * ACCEL, from: 'holdFast 0.135 (35/256) px/frame^2 x 4' },
  { id: 'fall_gravity', name: 'fall gravity', value: engine(0.375) * ACCEL, from: 'fallGravity 0.375 (96/256) px/frame^2 x 4' },
  { id: 'max_fall', name: 'top fall speed', value: 4.25 * SPEED, from: 'maxFall 4.25 px/frame x 2' },
  { id: 'late_ticks', name: 'late jump ticks', value: 3, from: 'coyoteFrames 4: the old Hero allows a late jump up to 3 frames (1.5 ticks) after the ledge; 3 here allows 2 ticks' },
  { id: 'early_ticks', name: 'early jump ticks', value: 3, from: 'bufferFrames 5: the old Hero counts a press up to 4 frames (2 ticks) before landing; 3 here counts 2 ticks' },
  // Walls
  { id: 'wall_slide', name: 'wall slide speed', value: 1.0 * SPEED, from: 'wallSlideMax 1.0 px/frame x 2' },
  { id: 'wall_shed', name: 'wall shed', value: 0.75 * SPEED, from: 'least fall speed shed per frame while grabbing a wall, 0.75 px/frame x 2' },
  { id: 'wall_push', name: 'wall jump push', value: 2.0 * SPEED, from: 'wallJumpX 2.0 px/frame x 2' },
  { id: 'wall_up', name: 'wall jump up', value: 4.0 * SPEED, from: 'wallJumpY 4.0 px/frame x 2' },
  { id: 'wall_lock_ticks', name: 'wall jump lock ticks', value: 5, from: 'wallJumpLock 9 frames / 2 = 4.5, rounded up' },
  { id: 'wall_late_ticks', name: 'wall late ticks', value: 2, from: 'WALL_COYOTE 5 frames / 2 = 2.5, rounded down' },
]

/**
 * The only Hero knobs shown in Build and on top of the workshop's Knobs card: walk speed, run speed, jump power,
 * gravity. Every other tuning number stays a normal variable in the code, grouped under "More tuning".
 * ("jump power" is the standing jump; the walking, running and p-speed jumps are under Jumping.)
 */
export const HERO_BUILD_KNOB_IDS: readonly string[] = ['walk_top', 'run_top', 'jump_stand', 'fall_gravity']

/** The rest of the tuning numbers, in the groups the workshop's "More tuning" section shows. Every non-build knob appears once. */
export const HERO_KNOB_GROUPS: ReadonlyArray<{ id: string; label: string; knobIds: readonly string[] }> = [
  { id: 'walking', label: 'Walking', knobIds: ['walk_push', 'friction', 'skid', 'air_push', 'air_turn'] },
  { id: 'running', label: 'Running', knobIds: ['p_top', 'run_push', 'meter_slack', 'meter_fill', 'meter_drain', 'meter_full'] },
  {
    id: 'jumping',
    label: 'Jumping',
    knobIds: ['jump_walk', 'jump_run', 'jump_p', 'walk_jump_from', 'run_jump_from', 'p_jump_from', 'hold_slow', 'hold_fast', 'late_ticks', 'early_ticks'],
  },
  { id: 'falling', label: 'Falling', knobIds: ['max_fall'] },
  { id: 'walls', label: 'Walls', knobIds: ['wall_slide', 'wall_shed', 'wall_push', 'wall_up', 'wall_lock_ticks', 'wall_late_ticks'] },
]

/** How many tuning numbers are tucked under "More tuning". */
export const HERO_MORE_TUNING_COUNT = HERO_KNOB_GROUPS.reduce((n, g) => n + g.knobIds.length, 0)

/** Where "hero hurt" sends the Hero: the level start (copy center; the 16 x 16 costume stands on the ground at y 24). */
export const HERO_START = { x: 60, y: 24 } as const

/** The Hero's own working memory. Not knobs: they change every tick. */
const STATE_VARIABLES: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'steer', name: 'steer' }, // -1 left, 0 none, 1 right (with the wall-jump lock applied)
  { id: 'raw_steer', name: 'arrow' }, // -1 left, 0 none, 1 right (just the arrow keys)
  { id: 'running', name: 'running' }, // 1 while x is held
  { id: 'way', name: 'way' }, // sign of x speed
  { id: 'speed', name: 'speed' }, // |x speed|, then the new speed
  { id: 'cap', name: 'top speed now' },
  { id: 'push', name: 'push now' },
  { id: 'meter', name: 'run meter' }, // 0..7; 7 = p speed
  { id: 'meter_timer', name: 'meter timer' },
  { id: 'coyote', name: 'late jump left' },
  { id: 'buffer', name: 'early jump left' },
  { id: 'space_down', name: 'space was down' },
  { id: 'jumping', name: 'jumping' }, // 1 from takeoff until the Hero stops rising
  { id: 'hold', name: 'float gravity now' },
  { id: 'p_jump', name: 'p jump' }, // 1 when the jump started with a full run meter
  { id: 'wall_hit', name: 'wall hit' }, // set by the bump hats: +1 wall on the right, -1 on the left
  { id: 'wall_side', name: 'wall side' }, // the wall we are sliding on right now
  { id: 'wall_last', name: 'last wall side' },
  { id: 'wall_late', name: 'wall late left' },
  { id: 'wall_lock', name: 'wall lock left' },
  { id: 'wall_lock_side', name: 'wall lock side' },
  { id: 'limit', name: 'fall limit now' },
  { id: 'excess', name: 'fall excess' },
  { id: 'pressed', name: 'space just pressed' },
  { id: 'jump_now', name: 'jump now' }, // the takeoff speed this tick (the feel scripts can raise it)
  { id: 'float_now', name: 'float gravity for this jump' },
  { id: 'gravity_now', name: 'gravity now' },
]

export function heroVariables(): VariableDecl[] {
  return [
    ...HERO_KNOBS.map((k): VariableDecl => ({ id: k.id, name: k.name, value: k.value, ...(HERO_BUILD_KNOB_IDS.includes(k.id) ? { showInBuild: true } : {}) })),
    ...STATE_VARIABLES.map((v): VariableDecl => ({ id: v.id, name: v.name, value: 0 })),
  ]
}

// -----------------------------------------------------------------------------
// A tiny block builder: real Blockly workspace JSON, so the program opens in the editor
// -----------------------------------------------------------------------------

type Json = Record<string, unknown>
type Conn = { block: Json } | { shadow: Json }

interface Ids {
  next: () => string
}

function makeIds(): Ids {
  let n = 0
  return { next: () => `hero_${++n}` }
}

/** A script's one-line label, in the format the editor reads (studio/code/layers.ts: block `data` = "label:<text>"). */
export function withLabel<T extends Json>(block: T, text: string): T {
  ;(block as Json).data = labelData(text)
  return block
}

export function createHeroWorkspace(): WorkspaceJson {
  const ids = makeIds()
  const blk = (type: string, extra: Json = {}): Json => ({ type, id: ids.next(), ...extra })

  // ---- values
  const num = (value: number): Conn => ({ shadow: { type: 'math_number', id: ids.next(), fields: { NUM: value } } })
  const as = (c: Conn | number): Conn => (typeof c === 'number' ? num(c) : c)
  const v = (id: string): Conn => ({ block: blk('data_variable', { fields: { VARIABLE: id } }) })
  const op = (type: string, a: Conn | number, b: Conn | number, names: [string, string] = ['NUM1', 'NUM2']): Conn => ({
    block: blk(type, { inputs: { [names[0]]: as(a), [names[1]]: as(b) } }),
  })
  const add = (a: Conn | number, b: Conn | number) => op('operator_add', a, b)
  const sub = (a: Conn | number, b: Conn | number) => op('operator_subtract', a, b)
  const mul = (a: Conn | number, b: Conn | number) => op('operator_multiply', a, b)
  const div = (a: Conn | number, b: Conn | number) => op('operator_divide', a, b)
  const lt = (a: Conn | number, b: Conn | number) => op('operator_lt', a, b, ['OPERAND1', 'OPERAND2'])
  const gt = (a: Conn | number, b: Conn | number) => op('operator_gt', a, b, ['OPERAND1', 'OPERAND2'])
  const eq = (a: Conn | number, b: Conn | number) => op('operator_equals', a, b, ['OPERAND1', 'OPERAND2'])
  const and = (a: Conn, b: Conn) => op('operator_and', a, b, ['OPERAND1', 'OPERAND2'])
  const or = (a: Conn, b: Conn) => op('operator_or', a, b, ['OPERAND1', 'OPERAND2'])
  const not = (a: Conn): Conn => ({ block: blk('operator_not', { inputs: { OPERAND: a } }) })
  const abs = (a: Conn): Conn => ({ block: blk('operator_mathop', { fields: { OPERATOR: 'abs' }, inputs: { NUM: a } }) })
  const key = (k: string): Conn => ({ block: blk('sensing_keypressed', { fields: { KEY_OPTION: k } }) })
  const onGround = (): Conn => ({ block: blk('platformer_onground') })
  const xSpeed = (): Conn => ({ block: blk('platformer_speed', { fields: { AXIS: 'x' } }) })
  const ySpeed = (): Conn => ({ block: blk('platformer_speed', { fields: { AXIS: 'y' } }) })

  // ---- stack blocks
  const set = (id: string, value: Conn | number): Json => blk('data_setvariableto', { fields: { VARIABLE: id }, inputs: { VALUE: as(value) } })
  const change = (id: string, value: Conn | number): Json => blk('data_changevariableby', { fields: { VARIABLE: id }, inputs: { VALUE: as(value) } })
  const setX = (value: Conn | number): Json => blk('platformer_setspeed', { fields: { AXIS: 'x' }, inputs: { SPEED: as(value) } })
  const setY = (value: Conn | number): Json => blk('platformer_setspeed', { fields: { AXIS: 'y' }, inputs: { SPEED: as(value) } })
  const changeX = (value: Conn | number): Json => blk('platformer_changespeed', { fields: { AXIS: 'x' }, inputs: { SPEED: as(value) } })
  const changeY = (value: Conn | number): Json => blk('platformer_changespeed', { fields: { AXIS: 'y' }, inputs: { SPEED: as(value) } })
  const call = (proccode: string): Json => blk('procedures_call', { extraState: { proccode, argumentNames: [] } })
  const chain = (blocks: Json[]): Json | undefined => {
    const [first, ...rest] = blocks
    if (!first) return undefined
    let tail = first
    for (const b of rest) {
      tail.next = { block: b }
      tail = b
    }
    return first
  }
  const sub1 = (blocks: Json[]): Conn | undefined => {
    const head = chain(blocks)
    return head ? { block: head } : undefined
  }
  const when = (cond: Conn, then: Json[]): Json => blk('control_if', { inputs: { CONDITION: cond, ...(sub1(then) ? { SUBSTACK: sub1(then) } : {}) } })
  const either = (cond: Conn, then: Json[], otherwise: Json[]): Json =>
    blk('control_if_else', {
      inputs: { CONDITION: cond, ...(sub1(then) ? { SUBSTACK: sub1(then) } : {}), ...(sub1(otherwise) ? { SUBSTACK2: sub1(otherwise) } : {}) },
    })

  // ---- scripts: the basics plus feel scripts, each "every tick", no My Blocks to go inside
  //
  // "every tick" scripts run once per tick in the order they are listed here (the program order). The basics start each
  // tick with plain numbers (walking speed, a normal jump, normal gravity); each feel script, placed just before the
  // basic that uses it, changes one of those numbers. With every feel script on, the arithmetic is exactly the old
  // Hero's. Turn one off and the Hero still works, just without that bit of polish.
  // Rendered height, generously: a row with a condition in it is up to ~56 px, a C mouth adds its own top and bottom.
  // Scripts that overlap make the editor tidy them into one column, so err on the tall side.
  const stackHeight = (b: Json | undefined): number => {
    let h = 0
    for (let n: Json | undefined = b; n; n = (n.next as { block?: Json } | undefined)?.block) {
      h += 56
      const inputs = (n.inputs ?? {}) as Record<string, { block?: Json }>
      for (const k of ['SUBSTACK', 'SUBSTACK2']) if (k in inputs || (k === 'SUBSTACK2' && n.type === 'control_if_else')) h += 40 + stackHeight(inputs[k]?.block)
    }
    return h
  }
  const columns = { basics: 20, feel: 20 }
  const order: Json[] = []
  const labels: Array<[Json, string]> = []
  const place = (column: keyof typeof columns, top: Json, label: string): Json => {
    top.x = column === 'basics' ? 20 : 900
    top.y = columns[column]
    columns[column] += 150 + stackHeight(top.next ? (top.next as { block: Json }).block : undefined)
    order.push(top)
    labels.push([top, label])
    return top
  }
  const tick = (column: keyof typeof columns, label: string, body: Json[]): Json =>
    place(column, blk('platformer_everytick', { next: sub1(body) }), label)
  const bump = (column: keyof typeof columns, label: string, side: 'left' | 'right', body: Json[]): Json =>
    place(column, blk('platformer_whenbump', { fields: { SIDE: side, BRICK: '_any_' }, next: sub1(body) }), label)

  place(
    'basics',
    blk('event_whenflagclicked', {
      next: sub1([blk('platformer_setgravity', { fields: { GRAVITY: 'off' } }), blk('motion_setrotationstyle', { fields: { STYLE: 'left-right' } }), setX(0), setY(0)]),
    }),
    'When the level starts: I do my own gravity, so turn the Platformer one off',
  )

  tick('basics', 'Read the arrow keys, x and space', [
    set('raw_steer', 0),
    when(key('right arrow'), [set('raw_steer', 1)]),
    when(key('left arrow'), [change('raw_steer', -1)]), // both arrows cancel out
    set('steer', v('raw_steer')),
    set('running', 0),
    when(key('x'), [set('running', 1)]),
    // "space just pressed" is only true on the first tick space is down, so holding it never jumps twice.
    set('pressed', 0),
    either(key('space'), [when(eq(v('space_down'), 0), [set('pressed', 1)]), set('space_down', 1)], [set('space_down', 0)]),
    when(eq(v('pressed'), 1), [set('buffer', 1)]),
  ])

  tick('basics', 'Start each tick with the normal numbers: walking speed, a normal jump, normal gravity', [
    set('speed', abs(xSpeed())),
    set('way', 0),
    when(gt(xSpeed(), 0), [set('way', 1)]),
    when(lt(xSpeed(), 0), [set('way', -1)]),
    set('cap', v('walk_top')),
    set('push', v('air_push')),
    when(onGround(), [set('push', v('walk_push'))]),
    set('jump_now', v('jump_stand')),
    set('float_now', v('hold_slow')),
    set('gravity_now', v('fall_gravity')),
    set('limit', v('max_fall')),
  ])

  tick('feel', 'Wall jump (part 1): just after pushing off a wall, I can\'t steer back into it', [
    when(gt(v('wall_lock'), 0), [change('wall_lock', -1), when(eq(v('steer'), v('wall_lock_side')), [set('steer', 0)])]),
  ])

  // Only the bump hats can tell us there is a wall, so they leave a note in "wall hit".
  tick('feel', 'Wall slide (part 1): notice a wall beside me while I fall and push into it', [
    set('wall_side', 0),
    either(
      and(and(not(onGround()), not(gt(ySpeed(), 0))), and(not(eq(v('raw_steer'), 0)), eq(v('wall_hit'), v('raw_steer')))),
      [set('wall_side', v('raw_steer')), set('wall_last', v('raw_steer')), set('wall_late', v('wall_late_ticks'))],
      [when(gt(v('wall_late'), 0), [change('wall_late', -1)])],
    ),
    set('wall_hit', 0), // the bump hats set it again later this tick if we are still pushing
  ])

  tick('feel', 'Run with x: a higher top speed and a stronger push, and p speed once the run meter is full', [
    when(eq(v('running'), 1), [
      either(
        onGround(),
        [either(not(lt(v('meter'), v('meter_full'))), [set('cap', v('p_top'))], [set('cap', v('run_top'))])],
        [either(eq(v('p_jump'), 1), [set('cap', v('p_top'))], [set('cap', v('run_top'))])],
      ),
      when(onGround(), [set('push', v('run_push'))]),
    ]),
  ])

  tick('feel', 'Skid: pushing against the way I\'m going slows me down hard on the ground, and turns me in the air', [
    when(and(not(eq(v('steer'), 0)), and(not(eq(v('way'), 0)), not(eq(v('way'), v('steer'))))), [
      either(onGround(), [set('push', v('skid'))], [set('push', v('air_turn'))]),
    ]),
  ])

  tick('basics', 'Walk: speed up toward my top speed, slow down when I let go, face the way I walk', [
    either(
      eq(v('steer'), 0),
      [
        // no arrow: friction, on the ground only
        when(onGround(), [set('speed', sub(v('speed'), v('friction'))), when(lt(v('speed'), 0), [set('speed', 0)]), setX(mul(v('way'), v('speed')))]),
      ],
      [
        either(
          or(eq(v('way'), 0), eq(v('way'), v('steer'))),
          [
            either(
              lt(v('speed'), v('cap')),
              [set('speed', add(v('speed'), v('push'))), when(gt(v('speed'), v('cap')), [set('speed', v('cap'))])],
              [
                when(and(onGround(), gt(v('speed'), v('cap'))), [
                  set('speed', sub(v('speed'), v('friction'))),
                  when(lt(v('speed'), v('cap')), [set('speed', v('cap'))]),
                ]),
              ],
            ),
            setX(mul(v('steer'), v('speed'))),
          ],
          [changeX(mul(v('steer'), v('push')))],
        ),
        blk('motion_pointindirection', { inputs: { DIRECTION: as(mul(v('steer'), 90)) } }),
      ],
    ),
  ])

  tick('feel', 'Run meter: fills while I run flat out on the ground; full means p speed', [
    when(onGround(), [
      either(
        and(and(eq(v('running'), 1), gt(mul(v('steer'), xSpeed()), 0)), not(lt(abs(xSpeed()), sub(v('run_top'), v('meter_slack'))))),
        [
          change('meter_timer', 1),
          when(not(lt(v('meter_timer'), v('meter_fill'))), [set('meter_timer', 0), when(lt(v('meter'), v('meter_full')), [change('meter', 1)])]),
        ],
        [
          either(
            gt(v('meter'), 0),
            [change('meter_timer', 1), when(not(lt(v('meter_timer'), v('meter_drain'))), [set('meter_timer', 0), change('meter', -1)])],
            [set('meter_timer', 0)],
          ),
        ],
      ),
    ]),
  ])

  tick('feel', 'Coyote time: I can still jump for a moment after running off a ledge', [
    either(onGround(), [set('coyote', v('late_ticks'))], [when(gt(v('coyote'), 0), [change('coyote', -1)])]),
  ])

  tick('feel', 'Jump buffer: pressing jump just before I land still counts', [
    when(eq(v('pressed'), 1), [set('buffer', add(v('early_ticks'), 1))]),
  ])

  tick('feel', 'Faster jumps go higher: walking, running and p speed each jump a bit higher', [
    set('speed', abs(xSpeed())),
    when(not(lt(v('speed'), v('walk_jump_from'))), [
      either(
        lt(v('speed'), v('run_jump_from')),
        [set('jump_now', v('jump_walk'))],
        [either(lt(v('speed'), v('p_jump_from')), [set('jump_now', v('jump_run'))], [set('jump_now', v('jump_p'))]), set('float_now', v('hold_fast'))],
      ),
    ]),
  ])

  tick('basics', 'Jump: space jumps when I\'m on the ground', [
    when(and(gt(v('buffer'), 0), or(onGround(), gt(v('coyote'), 0))), [
      setY(v('jump_now')),
      set('hold', v('float_now')),
      set('jumping', 1),
      set('coyote', 0),
      set('buffer', 0),
      set('p_jump', 0),
      when(not(lt(v('meter'), v('meter_full'))), [set('p_jump', 1)]),
    ]),
  ])

  tick('feel', 'Wall jump (part 2): jumping while I slide down a wall pushes me off it', [
    when(and(gt(v('buffer'), 0), or(not(eq(v('wall_side'), 0)), gt(v('wall_late'), 0))), [
      when(not(eq(v('wall_side'), 0)), [set('wall_last', v('wall_side'))]),
      setX(mul(sub(0, v('wall_last')), v('wall_push'))),
      setY(v('wall_up')),
      set('hold', v('hold_slow')),
      set('jumping', 1),
      set('p_jump', 0),
      set('wall_lock', v('wall_lock_ticks')),
      set('wall_lock_side', v('wall_last')),
      blk('motion_pointindirection', { inputs: { DIRECTION: as(mul(sub(0, v('wall_last')), 90)) } }),
      set('wall_side', 0),
      set('wall_late', 0),
      set('buffer', 0),
    ]),
  ])

  tick('basics', 'Forget an old jump press, one tick at a time', [when(gt(v('buffer'), 0), [change('buffer', -1)])])

  tick('feel', 'Hold to jump higher: gravity is lighter while I rise with space held', [
    when(and(and(eq(v('jumping'), 1), gt(ySpeed(), 0)), key('space')), [set('gravity_now', v('hold'))]),
  ])

  tick('basics', 'Gravity: pull me down every tick', [changeY(sub(0, v('gravity_now'))), when(not(gt(ySpeed(), 0)), [set('jumping', 0)])])

  tick('feel', 'Wall slide (part 2): sliding down a wall is slow, and grabbing one sheds speed fast', [
    when(not(eq(v('wall_side'), 0)), [
      set('limit', v('wall_slide')),
      when(lt(ySpeed(), sub(0, v('limit'))), [
        // half the extra fall speed, but at least "wall shed", and never slower than the slide speed
        set('excess', sub(0, ySpeed())),
        set('speed', div(sub(v('excess'), v('limit')), 2)),
        when(lt(v('speed'), v('wall_shed')), [set('speed', v('wall_shed'))]),
        set('excess', sub(v('excess'), v('speed'))),
        when(lt(v('excess'), v('limit')), [set('excess', v('limit'))]),
        setY(sub(0, v('excess'))),
        set('limit', v('excess')), // this tick's fall speed is the limit, so the next script leaves it alone
      ]),
    ]),
  ])

  tick('basics', 'Top fall speed: never fall faster than this', [when(lt(ySpeed(), sub(0, v('limit'))), [setY(sub(0, v('limit')))])])

  bump('feel', 'Wall slide (part 3): a wall on my right', 'left', [set('wall_hit', 1)])
  bump('feel', 'Wall slide (part 3): a wall on my left', 'right', [set('wall_hit', -1)])
  const meterLoss = [when(and(onGround(), gt(v('meter'), 0)), [change('meter', -2), when(lt(v('meter'), 0), [set('meter', 0)])])]
  bump('feel', 'Run meter: running into a wall on my right drops it', 'left', meterLoss)
  bump('feel', 'Run meter: running into a wall on my left drops it', 'right', JSON.parse(JSON.stringify(meterLoss), (k, val) => (k === 'id' ? ids.next() : val)))

  // Step 6: how the Hero answers the rest of the level. Messages come from the Spring, Walkers, Spikes, Lava and Bounce blocks.
  const goTo = (x: number, y: number): Json => blk('motion_gotoxy', { inputs: { X: as(x), Y: as(y) } })
  const receive = (message: string, label: string, body: Json[]): Json =>
    place('basics', blk('event_whenbroadcastreceived', { fields: { BROADCAST_OPTION: message }, next: sub1(body) }), label)
  // The Spring: one big upward speed (gravity keeps pulling it down).
  receive('boing', 'When a Spring says boing: fly up', [setY(14)])
  // A stomped Walker: a small bounce.
  receive('stomped', 'When I stomp a Walker: bounce', [setY(8)])
  // Hurt (by a Walker, Spikes or Lava): back to the start, standing still.
  receive('hero hurt', 'When I get hurt: go back to the start', [goTo(HERO_START.x, HERO_START.y), setX(0), setY(0)])
  // A Bounce block under me says bounce: launch again, higher when jump is held (the old bounceHigh 5.5 / bounceLow 3.25
  // px/frame, times 2 for ticks: 11 and 6.5).
  receive('bounce', 'When a Bounce block says bounce: launch again, higher if I hold jump', [either(key('space'), [setY(11)], [setY(6.5)])])

  for (const [block, text] of labels) withLabel(block, text)

  return {
    variables: heroVariables().map((d) => ({ id: d.id, name: d.name })),
    blocks: { blocks: order as never },
  }
}

export const HERO_BRICK_ID = 'brick_hero'


/** The Hero brick and the workspace it was compiled from (so the editor opens the very same blocks). */
export function createHeroBrick(): { brick: BrickDef; workspace: WorkspaceJson; diagnostics: ReturnType<typeof compileWorkspace>['diagnostics'] } {
  const workspace = createHeroWorkspace()
  const variables = heroVariables()
  const { program, diagnostics } = compileWorkspace(workspace, { variables })
  return {
    brick: { id: HERO_BRICK_ID, name: 'Hero', costumes: [createHeroCostume()], sounds: [], program, limit: 1 },
    workspace,
    diagnostics,
  }
}
