/**
 * "How <block> works in plain Scratch": for every Platformer block, a short explanation plus the blocks you would build
 * in regular Scratch to get the same behavior. The blocks are real Blockly workspace JSON using only Scratch opcodes
 * (no `platformer_*` block appears inside a card), so they compile and a kid could copy them into scratch.mit.edu.
 *
 * The cards show the idea, in Scratch's own terms: a brick's speeds are two variables, "gravity" is a number added to
 * the y speed every tick, "touching" is Scratch's pixel touching. The Platformer blocks do it with boxes and exact
 * landing; the card says where plain Scratch is rougher.
 */
import type { WorkspaceJson } from '../../core/editor/compile'

type Json = Record<string, unknown>
type Conn = { block: Json } | { shadow: Json }

export interface PlainScratchCard {
  /** The Platformer opcode this card explains. */
  opcode: string
  /** Short noun for the title: "How <name> works in plain Scratch". Falls back to the block's own text. */
  name: string
  /** Two or three kid-words sentences. */
  explanation: string
  /** Real Blockly workspace JSON (blocks + variables). */
  workspace: WorkspaceJson
  /** Names the blocks refer to, so the read-only editor can list them as menu choices. */
  extras: { variables: Array<{ id: string; name: string }>; bricks: string[]; messages: string[] }
}

// ---- a tiny builder (ids are per card so two cards never clash) ----

const V = {
  gravityOn: { id: 'ps_gravity_on', name: 'gravity on' },
  xSpeed: { id: 'ps_x_speed', name: 'x speed' },
  ySpeed: { id: 'ps_y_speed', name: 'y speed' },
  solid: { id: 'ps_solid', name: 'solid' },
  onGround: { id: 'ps_on_ground', name: 'on ground' },
} as const

function builder(prefix: string) {
  let n = 0
  const blk = (type: string, extra: Json = {}): Json => ({ type, id: `${prefix}_${++n}`, ...extra })
  const num = (value: number): Conn => ({ shadow: blk('math_number', { fields: { NUM: value } }) })
  const text = (value: string): Conn => ({ shadow: blk('text', { fields: { TEXT: value } }) })
  const as = (c: Conn | number): Conn => (typeof c === 'number' ? num(c) : c)
  const v = (variable: { id: string }): Conn => ({ block: blk('data_variable', { fields: { VARIABLE: variable.id } }) })
  const set = (variable: { id: string }, value: Conn | number): Json =>
    blk('data_setvariableto', { fields: { VARIABLE: variable.id }, inputs: { VALUE: as(value) } })
  const change = (variable: { id: string }, value: Conn | number): Json =>
    blk('data_changevariableby', { fields: { VARIABLE: variable.id }, inputs: { VALUE: as(value) } })
  const op = (type: string, a: Conn | number, b: Conn | number, names: [string, string]): Conn => ({
    block: blk(type, { inputs: { [names[0]]: as(a), [names[1]]: as(b) } }),
  })
  const minus = (a: Conn | number, b: Conn | number) => op('operator_subtract', a, b, ['NUM1', 'NUM2'])
  const lt = (a: Conn | number, b: Conn | number) => op('operator_lt', a, b, ['OPERAND1', 'OPERAND2'])
  const eq = (a: Conn | number, b: Conn | number) => op('operator_equals', a, b, ['OPERAND1', 'OPERAND2'])
  const touching = (menu: string): Conn => ({ block: blk('sensing_touchingobject', { fields: { TOUCHINGOBJECTMENU: menu } }) })
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
  const sub = (blocks: Json[]): Conn | undefined => {
    const head = chain(blocks)
    return head ? { block: head } : undefined
  }
  const sCond = (cond: Conn, then: Json[]): Json =>
    blk('control_if', { inputs: { CONDITION: cond, ...(sub(then) ? { SUBSTACK: sub(then) } : {}) } })
  const sElse = (cond: Conn, then: Json[], otherwise: Json[]): Json =>
    blk('control_if_else', {
      inputs: { CONDITION: cond, ...(sub(then) ? { SUBSTACK: sub(then) } : {}), ...(sub(otherwise) ? { SUBSTACK2: sub(otherwise) } : {}) },
    })
  const forever = (body: Json[]): Json => blk('control_forever', { inputs: sub(body) ? { SUBSTACK: sub(body) } : {} })
  const flag = (body: Json[]): Json => {
    const hat = blk('event_whenflagclicked')
    const first = chain(body)
    if (first) hat.next = { block: first }
    return hat
  }
  const changeX = (dx: Conn | number): Json => blk('motion_changexby', { inputs: { DX: as(dx) } })
  const changeY = (dy: Conn | number): Json => blk('motion_changeyby', { inputs: { DY: as(dy) } })
  return { blk, num, text, v, set, change, minus, lt, eq, touching, sCond, sElse, forever, flag, changeX, changeY, chain }
}

/** Place a script in the card's grid: each card is a few short stacks side by side or stacked. */
function place(top: Json | undefined, x: number, y: number): Json {
  return { ...(top as Json), x, y }
}

function workspace(blocks: Json[], variables: Array<{ id: string; name: string }>): WorkspaceJson {
  return {
    blocks: { languageVersion: 0, blocks: blocks as never },
    variables: variables.map((x) => ({ id: x.id, name: x.name, type: '' })),
  }
}

const NO_EXTRAS = { variables: [] as Array<{ id: string; name: string }>, bricks: [] as string[], messages: [] as string[] }

// ---- the cards ----

function gravityCard(): PlainScratchCard {
  const b = builder('grav')
  const fall = b.flag([
    b.set(V.gravityOn, 1),
    b.forever([
      b.sCond(b.eq(b.v(V.gravityOn), 1), [
        b.change(V.ySpeed, -1),
        b.sCond(b.lt(b.v(V.ySpeed), -16), [b.set(V.ySpeed, -16)]),
      ]),
      b.changeY(b.v(V.ySpeed)),
    ]),
  ])
  return {
    opcode: 'platformer_setgravity',
    name: 'turn gravity on',
    explanation:
      'Gravity is a number added to your y speed every tick, so a falling brick drops faster and faster until it reaches a top speed. ' +
      'Scratch has no gravity, so you keep a "gravity on" variable and a forever loop that does the falling. ' +
      '"turn gravity off" is the same, with "gravity on" set to 0.',
    workspace: workspace([place(fall, 20, 20)], [V.gravityOn, V.ySpeed]),
    extras: { ...NO_EXTRAS, variables: [V.gravityOn, V.ySpeed] },
  }
}

function solidCard(): PlainScratchCard {
  const b = builder('solid')
  const mark = b.flag([b.set(V.solid, 1)])
  const mover = b.flag([
    b.forever([b.changeX(b.v(V.xSpeed)), b.sCond(b.touching('Platform'), [b.changeX(b.minus(0, b.v(V.xSpeed))), b.set(V.xSpeed, 0)])]),
  ])
  return {
    opcode: 'platformer_setsolid',
    name: 'solid',
    explanation:
      'A solid brick is one that other bricks cannot walk through. Scratch has no solid, so the brick you want to be solid keeps a "solid" note, ' +
      'and every mover checks "touching" and steps back out each tick. In Scratch that touching is by pixels; the Platformer blocks use the brick\'s box, so landing and wall stops are exact.',
    workspace: workspace([place(mark, 20, 20), place(mover, 20, 120)], [V.solid, V.xSpeed]),
    extras: { ...NO_EXTRAS, variables: [V.solid, V.xSpeed], bricks: ['Platform'] },
  }
}

function setSpeedCard(): PlainScratchCard {
  const b = builder('setspeed')
  const s = b.flag([b.set(V.xSpeed, 5), b.forever([b.changeX(b.v(V.xSpeed))])])
  return {
    opcode: 'platformer_setspeed',
    name: 'set x speed',
    explanation:
      'A speed is just a variable. "set x speed to 5" stores a 5; something has to move you by it, so plain Scratch adds a forever loop that changes x by your x speed every tick. ' +
      'The y speed works the same way, with "change y by". The Platformer blocks run that moving loop for you, once per tick.',
    workspace: workspace([place(s, 20, 20)], [V.xSpeed]),
    extras: { ...NO_EXTRAS, variables: [V.xSpeed] },
  }
}

function changeSpeedCard(): PlainScratchCard {
  const b = builder('changespeed')
  const s = b.flag([b.change(V.xSpeed, 1), b.forever([b.changeX(b.v(V.xSpeed))])])
  return {
    opcode: 'platformer_changespeed',
    name: 'change x speed',
    explanation:
      '"change x speed by 1" adds 1 to the speed you already have, which is how you speed up a little at a time. In plain Scratch it is "change [x speed] by 1" on a variable, plus the loop that moves you by that speed.',
    workspace: workspace([place(s, 20, 20)], [V.xSpeed]),
    extras: { ...NO_EXTRAS, variables: [V.xSpeed] },
  }
}

function speedCard(): PlainScratchCard {
  const b = builder('speed')
  const say = b.flag([b.blk('looks_say', { inputs: { MESSAGE: b.v(V.xSpeed) } })])
  return {
    opcode: 'platformer_speed',
    name: 'x speed',
    explanation:
      'The speed reporter hands you the number the brick is moving by right now. In plain Scratch that number is just your own "x speed" or "y speed" variable, which you can say, add to, or compare.',
    workspace: workspace([place(say, 20, 20)], [V.xSpeed]),
    extras: { ...NO_EXTRAS, variables: [V.xSpeed] },
  }
}

function onGroundCard(): PlainScratchCard {
  const b = builder('ground')
  const loop = b.flag([
    b.forever([
      b.change(V.ySpeed, -1),
      b.changeY(b.v(V.ySpeed)),
      b.sElse(
        b.touching('Platform'),
        [b.changeY(b.minus(0, b.v(V.ySpeed))), b.set(V.ySpeed, 0), b.set(V.onGround, 1)],
        [b.set(V.onGround, 0)],
      ),
    ]),
  ])
  return {
    opcode: 'platformer_onground',
    name: 'on ground?',
    explanation:
      '"on ground?" is true when the brick is standing on something solid. Scratch has no such block, so you keep your own "on ground" note: ' +
      'after you fall into a platform, step back up, stop falling, and write down a 1; when you are not touching, write down a 0. A jump script then asks "on ground = 1".',
    workspace: workspace([place(loop, 20, 20)], [V.ySpeed, V.onGround]),
    extras: { ...NO_EXTRAS, variables: [V.ySpeed, V.onGround], bricks: ['Platform'] },
  }
}

function whenBumpCard(): PlainScratchCard {
  const b = builder('bump')
  const watch = b.flag([
    b.forever([
      b.sCond(b.touching('Wall'), [
        b.blk('event_broadcast', { inputs: { BROADCAST_INPUT: b.text('bumped') } }),
        b.blk('control_wait', { inputs: { DURATION: b.num(0.1) } }),
      ]),
    ]),
  ])
  const hat = b.blk('event_whenbroadcastreceived', { fields: { BROADCAST_OPTION: 'bumped' } })
  hat.next = { block: b.changeX(-5) }
  return {
    opcode: 'platformer_whenbump',
    name: 'when I bump',
    explanation:
      'This hat runs its blocks when the brick runs into something. In plain Scratch you watch for it yourself: a forever loop checks "touching", and when it is true you broadcast a message, with a hat that listens for it. ' +
      'The Platformer hat also tells you which side was hit and by what, once per tick, without the loop.',
    workspace: workspace([place(watch, 20, 20), place(hat, 20, 190)], []),
    extras: { ...NO_EXTRAS, bricks: ['Wall'], messages: ['bumped'] },
  }
}

function touchingTileCard(): PlainScratchCard {
  const b = builder('tile')
  const color: Conn = b.text('#d9423a')
  const watch = b.flag([
    b.forever([
      b.sCond({ block: b.blk('sensing_touchingcolor', { inputs: { COLOR: color } }) }, [
        b.blk('motion_gotoxy', { inputs: { X: b.num(0), Y: b.num(0) } }),
      ]),
    ]),
  ])
  return {
    opcode: 'platformer_touchingtile',
    name: 'touching tile',
    explanation:
      'Tiles are painted squares, not bricks, so Scratch cannot name them. The usual Scratch trick is a colour: paint spikes red and ask "touching color red?". ' +
      'The Platformer block asks the level\'s tile layer directly, so it works by the brick\'s box, not by pixels.',
    workspace: workspace([place(watch, 20, 20)], []),
    extras: { ...NO_EXTRAS },
  }
}

/** One card for every Platformer opcode. Keep in step with `createBlockDefinitions` (a test checks it). */
export const PLAIN_SCRATCH: Readonly<Record<string, PlainScratchCard>> = Object.fromEntries(
  [
    gravityCard(),
    solidCard(),
    setSpeedCard(),
    changeSpeedCard(),
    speedCard(),
    onGroundCard(),
    whenBumpCard(),
    touchingTileCard(),
  ].map((c) => [c.opcode, c]),
)

export function plainScratchFor(opcode: string): PlainScratchCard | undefined {
  return PLAIN_SCRATCH[opcode]
}
