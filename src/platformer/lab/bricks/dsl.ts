import type {
  BodySetting,
  Costume,
  HeroStat,
  LabColor,
  LabKey,
  LabSound,
  MemScope,
  MemoryName,
  Phrase,
  Place,
  ProbeWhat,
  ProbeWhere,
  SolidMode,
  SpeedDir,
  TouchSide,
  Who,
} from '../program/types'

/*
 * Built-in bricks and examples are written as block programs, in the same JSON `Blockly.serialization.workspaces.save`
 * produces, so opening one shows exactly the blocks that run. This is a small builder for that JSON: ids are the
 * program's prefix and a counter (stable, so recipes can find their own blocks), number slots get the same editable
 * number shadows the toolbox gives, and scripts are laid out one under another.
 */

export type BlockJson = {
  type: string
  id: string
  x?: number
  y?: number
  fields?: Record<string, string | number>
  inputs?: Record<string, { block?: BlockJson; shadow?: BlockJson }>
  next?: { block: BlockJson }
}

export type WorkspaceJson = { blocks: { languageVersion: 0; blocks: BlockJson[] } }

type Ids = { prefix: string; n: number }
export type Node = { build: (ids: Ids) => BlockJson; lines: () => number }
export type Val = number | Node
export type VariableScope = 'my' | 'player' | 'world'

const nextId = (ids: Ids) => `${ids.prefix}-${++ids.n}`

function valueInput(v: Val, ids: Ids): { block?: BlockJson; shadow?: BlockJson } {
  if (typeof v === 'number') return { shadow: { type: 'lab_number', id: nextId(ids), fields: { NUM: v } } }
  return { block: v.build(ids) }
}

function chainInto(list: Node[], ids: Ids): BlockJson | undefined {
  let first: BlockJson | undefined
  let last: BlockJson | undefined
  for (const node of list) {
    const b = node.build(ids)
    if (!first) first = b
    if (last) last.next = { block: b }
    last = b
  }
  return first
}

const linesOf = (list: Node[]) => list.reduce((n, s) => n + s.lines(), 0)

/** A statement or value block. `values` become value inputs; `bodies` statement inputs. */
export function block(type: string, fields: Record<string, string | number> = {}, values: Record<string, Val> = {}, bodies: Record<string, Node[]> = {}): Node {
  return {
    build: (ids) => {
      const b: BlockJson = { type, id: nextId(ids) }
      if (Object.keys(fields).length) b.fields = { ...fields }
      const inputs: NonNullable<BlockJson['inputs']> = {}
      for (const [name, v] of Object.entries(values)) inputs[name] = valueInput(v, ids)
      for (const [name, list] of Object.entries(bodies)) {
        const first = chainInto(list, ids)
        if (first) inputs[name] = { block: first }
      }
      if (Object.keys(inputs).length) b.inputs = inputs
      return b
    },
    lines: () => 1 + Object.values(bodies).reduce((n, list) => n + Math.max(1, linesOf(list)) + 0.6, 0),
  }
}

/** A script: a hat and the blocks under it. */
export type ScriptNode = { hat: Node; body: Node[] }
const hat = (type: string, fields: Record<string, string | number>, body: Node[]): ScriptNode => ({ hat: block(type, fields), body })

/** A whole program, scripts laid out top to bottom. */
export function program(prefix: string, ...scripts: ScriptNode[]): WorkspaceJson {
  const ids: Ids = { prefix, n: 0 }
  let y = 24
  const blocks: BlockJson[] = []
  for (const s of scripts) {
    const top = s.hat.build(ids)
    top.x = 24
    top.y = y
    const first = chainInto(s.body, ids)
    if (first) top.next = { block: first }
    blocks.push(top)
    y += Math.round((1.4 + linesOf(s.body)) * 44) + 36
  }
  return { blocks: { languageVersion: 0, blocks } }
}

/** Add reusable block definitions as top-level roots below the event scripts in a workspace. */
export function addDefinitions(workspace: WorkspaceJson, prefix: string, ...definitions: Node[]): WorkspaceJson {
  if (!definitions.length) return workspace
  const blocks = workspace.blocks.blocks.map((b) => ({ ...b }))
  const bottom = blocks.reduce((y, b) => Math.max(y, (b.y ?? 0) + 220), 24)
  const ids: Ids = { prefix: `${prefix}-definition`, n: 0 }
  let y = bottom
  for (const definition of definitions) {
    const b = definition.build(ids)
    b.x = 24
    b.y = y
    blocks.push(b)
    y += Math.round((1.4 + definition.lines()) * 44) + 36
  }
  return { blocks: { languageVersion: 0, blocks } }
}

/** More scripts for an existing program (a recipe added to your moves), below what is there. */
export function scriptsJson(prefix: string, startY: number, ...scripts: ScriptNode[]): BlockJson[] {
  const built = program(prefix, ...scripts).blocks.blocks
  for (const b of built) b.y = (b.y ?? 0) + startY
  return built
}

// ---------------------------------------------------------------------------------------------------------------
// Hats

export const when = {
  appear: (...body: Node[]) => hat('lab_when_appear', {}, body),
  key: (key: LabKey, ...body: Node[]) => hat('lab_when_key', { KEY: key }, body),
  touch: (target: string, side: TouchSide, ...body: Node[]) => hat('lab_when_touch', { TARGET: target, SIDE: side }, body),
  stomped: (...body: Node[]) => hat('lab_when_stomped', {}, body),
  land: (...body: Node[]) => hat('lab_when_land', {}, body),
  hurt: (...body: Node[]) => hat('lab_when_hurt', {}, body),
  every: (seconds: number, ...body: Node[]) => hat('lab_every', { SECONDS: seconds }, body),
  message: (message: string, ...body: Node[]) => hat('lab_when_message', { MESSAGE: message }, body),
}

// ---------------------------------------------------------------------------------------------------------------
// Statements

export const heroOn = () => block('lab_hero_on')
export const heroOff = () => block('lab_hero_off')
export const setSpeed = (who: Who, dir: SpeedDir, v: Val) => block('lab_set_speed', { WHO: who, DIR: dir }, { VALUE: v })
export const changeSpeed = (who: Who, dir: SpeedDir, v: Val) => block('lab_change_speed', { WHO: who, DIR: dir }, { BY: v })
export const launch = (who: Who, angle: Val, power: Val) => block('lab_launch', { WHO: who }, { ANGLE: angle, POWER: power })
export const stopMoving = (who: Who) => block('lab_stop_moving', { WHO: who })
export const turnAround = () => block('lab_turn_around')
export const face = (toward: 'left' | 'right' | 'player') => block('lab_face', { TOWARD: toward })
export const moveTo = (who: Who, place: Place) => block('lab_move_to', { WHO: who, PLACE: place })
export const heroStat = (stat: HeroStat, v: Val) => block('lab_hero_stat', { STAT: stat }, { PERCENT: v })
export const make = (brick: string, place: Place) => block('lab_make', { BRICK: brick, PLACE: place })
export const remove = (who: Who) => block('lab_remove', { WHO: who })
export const hurt = (who: Who) => block('lab_hurt', { WHO: who })
export const body = (setting: BodySetting, v: Val) => block('lab_body', { SETTING: setting }, { PERCENT: v })
export const solid = (mode: SolidMode) => block('lab_solid', { MODE: mode })
export const letRide = (who: 'them' | 'player' | 'it') => block('lab_let_ride', { WHO: who })
export const dropRider = () => block('lab_drop_rider')
export const costume = (c: Costume) => block('lab_costume', { COSTUME: c })
export const color = (c: LabColor) => block('lab_color', { COLOR: c })
export const size = (v: Val) => block('lab_size', {}, { PERCENT: v })
export const say = (p: Phrase, seconds: Val) => block('lab_say', { PHRASE: p }, { SECONDS: seconds })
export const show = (scope: MemScope, name: MemoryName) => block('lab_show', { SCOPE: scope, NAME: name })
export const sound = (s: LabSound) => block('lab_sound', { SOUND: s })
export const setMem = (scope: MemScope, name: MemoryName, v: Val) => block('lab_set_memory', { SCOPE: scope, NAME: name }, { VALUE: v })
export const changeMem = (scope: MemScope, name: MemoryName, v: Val) => block('lab_change_memory', { SCOPE: scope, NAME: name }, { BY: v })
export const wait = (seconds: Val) => block('lab_wait', {}, { SECONDS: seconds })
export const waitUntil = (cond: Node) => block('lab_wait_until', {}, { CONDITION: cond })
export const repeat = (times: Val, ...body: Node[]) => block('lab_repeat', {}, { TIMES: times }, { DO: body })
export const forever = (...body: Node[]) => block('lab_forever', {}, {}, { DO: body })
export const ifThen = (cond: Node, ...body: Node[]) => block('lab_if', {}, { CONDITION: cond }, { DO: body })
export const ifElse = (cond: Node, then: Node[], otherwise: Node[]) => block('lab_if_else', {}, { CONDITION: cond }, { DO: then, ELSE: otherwise })
export const stopScript = () => block('lab_stop_script')

// ---------------------------------------------------------------------------------------------------------------
// Values

export const keyHeld = (key: LabKey) => block('lab_key_held', { KEY: key })
export const onGround = () => block('lab_on_ground')
export const probe = (what: ProbeWhat, where: ProbeWhere) => block('lab_probe', { WHAT: what, WHERE: where })
export const touching = (target: string) => block('lab_touching', { TARGET: target })
export const speed = (dir: SpeedDir) => block('lab_speed', { DIR: dir })
export const hasRider = () => block('lab_has_rider')
export const isRiding = () => block('lab_is_riding')
export const age = () => block('lab_age')
export const distance = (who: Who) => block('lab_distance', { WHO: who })
export const mem = (scope: MemScope, name: MemoryName) => block('lab_memory', { SCOPE: scope, NAME: name })
const COMPARE = { '<': 'LT', '<=': 'LTE', '=': 'EQ', '!=': 'NEQ', '>=': 'GTE', '>': 'GT' } as const
export const compare = (a: Val, op: keyof typeof COMPARE, b: Val) => block('lab_compare', { OP: COMPARE[op] }, { A: a, B: b })
export const and = (a: Node, b: Node) => block('lab_and_or', { OP: 'AND' }, { A: a, B: b })
export const or = (a: Node, b: Node) => block('lab_and_or', { OP: 'OR' }, { A: a, B: b })
export const not = (a: Node) => block('lab_not', {}, { VALUE: a })
const ARITH = { '+': 'ADD', '-': 'MINUS', '*': 'MULTIPLY', '/': 'DIVIDE' } as const
export const arith = (a: Val, op: keyof typeof ARITH, b: Val) => block('lab_arithmetic', { OP: ARITH[op] }, { A: a, B: b })
export const random = (lo: Val, hi: Val) => block('lab_random', {}, { LOW: lo, HIGH: hi })

// ---------------------------------------------------------------------------------------------------------------
// Freedom blocks: named variables, messages, coordinates and reusable procedures.

export const setVariable = (scope: VariableScope, name: string, value: Val) => block('lab_set_variable', { SCOPE: scope, NAME: name }, { VALUE: value })
export const changeVariable = (scope: VariableScope, name: string, by: Val) => block('lab_change_variable', { SCOPE: scope, NAME: name }, { BY: by })
export const variable = (scope: VariableScope, name: string) => block('lab_variable', { SCOPE: scope, NAME: name })
export const broadcast = (message: string) => block('lab_broadcast', { MESSAGE: message })
export const position = (who: Who, axis: 'x' | 'y') => block('lab_position', { WHO: who, AXIS: axis })
export const moveXY = (who: Who, x: Val, y: Val) => block('lab_move_xy', { WHO: who }, { X: x, Y: y })
export const makeXY = (brick: string, x: Val, y: Val) => block('lab_make_xy', { BRICK: brick }, { X: x, Y: y })
export const call = (name: string, arg1: Val = 0, arg2: Val = 0, arg3: Val = 0) => block('lab_call', { NAME: name }, { ARG1: arg1, ARG2: arg2, ARG3: arg3 })
export const argument = (name: string) => block('lab_argument', { NAME: name })
export const define = (name: string, args: readonly string[], ...body: Node[]) =>
  block('lab_define', { NAME: name, ARG1: args[0] ?? '', ARG2: args[1] ?? '', ARG3: args[2] ?? '' }, {}, { DO: body })

// ---------------------------------------------------------------------------------------------------------------
// Student-authored characters and control handoff.

/** Give or take control of a thing's own keys. */
export const setControls = (who: Who, enabled: boolean) => block('lab_set_controls', { WHO: who, ENABLED: enabled ? 'true' : 'false' })
/** Turn ordinary gravity and collision-driven movement on or off for a thing. */
export const setPhysics = (who: Who, enabled: boolean) => block('lab_set_physics', { WHO: who, ENABLED: enabled ? 'true' : 'false' })
export const showThing = (who: Who) => block('lab_show_thing', { WHO: who })
export const hideThing = (who: Who) => block('lab_hide_thing', { WHO: who })
/** Select one of the student's drawn costume frames (FRAME is a one-based frame number). */
export const frame = (index: Val) => block('lab_frame', {}, { FRAME: index })
export const nextFrame = () => block('lab_next_frame')
export const playFrames = (fps: Val) => block('lab_play_frames', {}, { FPS: fps })
export const stopFrames = () => block('lab_stop_frames')
export const sayText = (text: string, seconds: Val) => block('lab_say_text', { TEXT: text }, { SECONDS: seconds })
export const whenClicked = (...body: Node[]): ScriptNode => hat('lab_when_clicked', {}, body)
