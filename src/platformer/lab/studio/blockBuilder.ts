/**
 * A small builder for Blockly workspace JSON (real Scratch + Platformer blocks), shared by the starter's bricks, the
 * standard grid bricks (gridBricks.ts) and the brick templates. Block ids are `<prefix>_<n>`, so they never repeat
 * inside a brick. Each top script's hat carries a `label:<text>` (see `withLabel`).
 */
import type { WorkspaceJson } from '../core/editor/compile'
import { withLabel } from './hero/heroBrick'

export type BlockJson = Record<string, unknown>
export type Conn = { block: BlockJson } | { shadow: BlockJson }

/** A My Block: its definition and calls share this. `proccode` uses %s for each number input, as in Scratch. */
export interface MyBlock {
  proccode: string
  argumentNames: string[]
}

/** Builds one brick's workspace JSON. Block ids are `<prefix>_<n>`, so they never repeat inside a brick. */
export class Blocks {
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
  /** `when I bump [side] of [brick]`: side is the side of the other thing that was hit (or, for the one hit, the mover's side that touched). */
  bump(label: string, side: string, body: BlockJson[], brick = '_any_'): BlockJson {
    return this.script(label, this.blk('platformer_whenbump', { fields: { SIDE: side, BRICK: brick } }), body)
  }
  startAsClone(label: string, body: BlockJson[]): BlockJson {
    return this.script(label, this.blk('control_start_as_clone'), body)
  }
  switchCostume(name: string): BlockJson {
    return this.blk('looks_switchcostumeto', { fields: { COSTUME: name } })
  }
  nextCostume(): BlockJson {
    return this.blk('looks_nextcostume')
  }
  setSolid(value: string): BlockJson {
    return this.blk('platformer_setsolid', { fields: { SOLID: value } })
  }
  changeY(dy: number): BlockJson {
    return this.blk('motion_changeyby', { inputs: { DY: this.num(dy) } })
  }
  wait(seconds: number): BlockJson {
    return this.blk('control_wait', { inputs: { DURATION: this.num(seconds) } })
  }
  repeat(times: number, body: BlockJson[]): BlockJson {
    return this.blk('control_repeat', { inputs: { TIMES: this.num(times), SUBSTACK: { block: chain(body) } } })
  }
  setYTo(y: Conn | number): BlockJson {
    return this.blk('motion_sety', { inputs: { Y: this.as(y) } })
  }
  cloneMyself(): BlockJson {
    return this.blk('control_create_clone_of', { fields: { CLONE_OPTION: '_myself_' } })
  }
  deleteThisClone(): BlockJson {
    return this.blk('control_delete_this_clone')
  }
  setSize(percent: number): BlockJson {
    return this.blk('looks_setsizeto', { inputs: { SIZE: this.num(percent) } })
  }
  eq(a: Conn | number, b: Conn | number): Conn {
    return { block: this.blk('operator_equals', { inputs: { OPERAND1: this.as(a), OPERAND2: this.as(b) } }) }
  }
  mod(a: Conn | number, b: Conn | number): Conn {
    return { block: this.blk('operator_mod', { inputs: { NUM1: this.as(a), NUM2: this.as(b) } }) }
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
export function chain(blocks: BlockJson[]): BlockJson {
  const [first, ...rest] = blocks
  if (!first) throw new Error('chain needs at least one block')
  let tail = first
  for (const block of rest) {
    tail.next = { block }
    tail = block
  }
  return first
}

