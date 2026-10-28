import {
  ARITHMETIC_OPTIONS,
  BODY_OPTIONS,
  COLOR_OPTIONS,
  COMPARE_OPTIONS,
  COSTUME_OPTIONS,
  DIR_OPTIONS,
  FACE_OPTIONS,
  HAT_TYPES,
  HERO_STAT_OPTIONS,
  KEY_OPTIONS,
  LOGIC_OPTIONS,
  MEMORY_OPTIONS,
  OTHER_OPTIONS,
  PHRASE_OPTIONS,
  PLACE_OPTIONS,
  PROBE_WHAT_OPTIONS,
  PROBE_WHERE_OPTIONS,
  RIDER_OPTIONS,
  SCOPE_OPTIONS,
  SIDE_OPTIONS,
  SOLID_OPTIONS,
  SOUND_OPTIONS,
  THEM_HATS,
  WHOM_OPTIONS,
  WHOSE_OPTIONS,
  isLabBlockType,
  type Option,
} from './catalog'
import {
  LAB_LIMITS,
  TILE_KINDS,
  isSafeIdentifier,
  type BinaryOp,
  type CompileContext,
  type DiagnosticCode,
  type DiagnosticSeverity,
  type Expr,
  type LabDiagnostic,
  type ProgramIR,
  type Procedure,
  type Script,
  type Stmt,
  type Trigger,
  type Who,
  type VariableScope,
} from './types'
import { connectedBlock, isDisabledBlock, isRecord, topBlocks, utf8Bytes, walkBlocks, workspaceText, type WorkspaceBlockJson } from './workspaceJson'

/**
 * Blockly workspace JSON → `ProgramIR`. Defensive first (bytes, block count, nesting), then a walk from each hat.
 * Never throws: every problem is a diagnostic in a kid's words, and `ok` is false only when one is an error. Each
 * block becomes exactly one statement (or expression) carrying the block's id.
 *
 * Besides the IR, a compiled program indexes its statement lists by owner and arm (`<hat id>:body`,
 * `<block id>:do`, `<block id>:else`). The runtime keeps only those keys and positions in its (plain data) state,
 * so a program edited while it runs is picked up where each script stands.
 */

export type ListKey = string
export const listKey = (owner: string, arm: 'body' | 'do' | 'else'): ListKey => `${owner}:${arm}`

export interface CompiledProgram {
  ir: ProgramIR
  /** Statement lists by `listKey`. */
  lists: ReadonlyMap<ListKey, readonly Stmt[]>
  /** Every statement by block id. */
  stmts: ReadonlyMap<string, Stmt>
  /** Scripts by hat block id, in program order. */
  scripts: ReadonlyMap<string, Script>
  procedures: ReadonlyMap<string, Procedure>
  /** A fingerprint of each statement (with everything inside it), to tell what an edit changed. */
  keys: ReadonlyMap<string, string>
  /** A fingerprint of each script's trigger and body. */
  scriptKeys: ReadonlyMap<string, string>
  diagnostics: LabDiagnostic[]
  ok: boolean
}

type Ctx = {
  context: CompileContext
  diagnostics: LabDiagnostic[]
  anonymous: WeakMap<object, string>
  anonymousCount: number
  scriptId?: string
  /** The hat of the script being compiled. */
  hat?: string
  /** Whether the program has any `make` block, so "it" can mean something. */
  makes: boolean
  bricks: Set<string>
  procedureNames: Map<string, string[]>
  currentParams?: Set<string>
  variableNames: Set<string>
}

const FREEDOM_TYPES = new Set(['lab_set_variable', 'lab_change_variable', 'lab_variable', 'lab_define', 'lab_call', 'lab_argument', 'lab_broadcast', 'lab_when_message', 'lab_position', 'lab_move_xy', 'lab_make_xy'])

function named(block: WorkspaceBlockJson, field: string, ctx: Ctx): string {
  const name = fieldString(block, field).trim()
  if (!isSafeIdentifier(name)) report(ctx, 'error', 'program.bad-name', 'Use a short name starting with a letter, using letters, numbers or _.', idOf(block, ctx))
  return name
}

function variable(block: WorkspaceBlockJson, ctx: Ctx): { scope: VariableScope; name: string } {
  const scope = pick<VariableScope>(block, 'SCOPE', new Set(['my', 'player', 'world']), ctx)
  const name = named(block, 'NAME', ctx)
  ctx.variableNames.add(`${scope}:${name}`)
  if (ctx.variableNames.size > LAB_LIMITS.maxNamedVariables) report(ctx, 'error', 'program.too-many-variables', 'This program has too many different variables. Reuse some names.', idOf(block, ctx))
  return { scope, name }
}

const COMPARE: Record<string, BinaryOp> = { LT: '<', LTE: '<=', EQ: '==', NEQ: '!=', GTE: '>=', GT: '>' }
const LOGIC: Record<string, BinaryOp> = { AND: 'and', OR: 'or' }
const ARITHMETIC: Record<string, BinaryOp> = { ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/' }

const values = (options: readonly Option[]) => new Set(options.map(([, v]) => v))
const ALLOWED = {
  key: values(KEY_OPTIONS),
  whose: values(WHOSE_OPTIONS),
  whom: values(WHOM_OPTIONS),
  rider: values(RIDER_OPTIONS),
  other: values(OTHER_OPTIONS),
  dir: values(DIR_OPTIONS),
  place: values(PLACE_OPTIONS),
  side: values(SIDE_OPTIONS),
  face: values(FACE_OPTIONS),
  probeWhat: values(PROBE_WHAT_OPTIONS),
  probeWhere: values(PROBE_WHERE_OPTIONS),
  body: values(BODY_OPTIONS),
  solid: values(SOLID_OPTIONS),
  heroStat: values(HERO_STAT_OPTIONS),
  scope: values(SCOPE_OPTIONS),
  memory: values(MEMORY_OPTIONS),
  costume: values(COSTUME_OPTIONS),
  color: values(COLOR_OPTIONS),
  sound: values(SOUND_OPTIONS),
  phrase: values(PHRASE_OPTIONS),
  compare: values(COMPARE_OPTIONS),
  logic: values(LOGIC_OPTIONS),
  arithmetic: values(ARITHMETIC_OPTIONS),
}

function report(ctx: Ctx, severity: DiagnosticSeverity, code: DiagnosticCode, message: string, blockId: string | null) {
  ctx.diagnostics.push({ code, severity, message, blockId, ...(ctx.scriptId ? { scriptId: ctx.scriptId } : {}) })
}

function idOf(block: WorkspaceBlockJson, ctx: Ctx): string {
  if (typeof block.id === 'string' && block.id.length > 0) return block.id
  let id = ctx.anonymous.get(block)
  if (!id) {
    ctx.anonymousCount += 1
    id = `anonymous-${ctx.anonymousCount}`
    ctx.anonymous.set(block, id)
  }
  return id
}

const typeOf = (block: WorkspaceBlockJson): string => (typeof block.type === 'string' ? block.type : '')
const fieldValue = (block: WorkspaceBlockJson, name: string): unknown => (isRecord(block.fields) ? block.fields[name] : undefined)
const fieldString = (block: WorkspaceBlockJson, name: string): string => {
  const value = fieldValue(block, name)
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}
const inputBlock = (block: WorkspaceBlockJson, name: string) => (isRecord(block.inputs) ? connectedBlock(block.inputs[name]) : undefined)

/** A dropdown's value when it is one of the block's own choices; otherwise a diagnostic and the first choice. */
function pick<T extends string>(block: WorkspaceBlockJson, name: string, allowed: Set<string>, ctx: Ctx): T {
  const value = fieldString(block, name)
  if (allowed.has(value)) return value as T
  report(ctx, 'error', 'program.unknown-block', 'Pick a choice from this block’s list.', idOf(block, ctx))
  return allowed.values().next().value as T
}

function who(block: WorkspaceBlockJson, name: string, allowed: Set<string>, ctx: Ctx): Who {
  const value = pick<Who>(block, name, allowed, ctx)
  if (value === 'them' && !(ctx.hat && (THEM_HATS as readonly string[]).includes(ctx.hat))) {
    report(ctx, 'warning', 'program.them-outside-touch', '“them” is who touched me. It only works under “when I touch”, “when I get stomped” or “when I get hurt”.', idOf(block, ctx))
  }
  if (value === 'it' && !ctx.makes) {
    report(ctx, 'warning', 'program.it-without-make', '“it” is the thing I made last. Add a “make a …” block first.', idOf(block, ctx))
  }
  return value
}

function brickChoice(block: WorkspaceBlockJson, ctx: Ctx): string {
  const value = fieldString(block, 'BRICK')
  if (value === 'world') report(ctx, 'error', 'program.unknown-block', 'World rules are shared by the level and cannot be made as a thing.', idOf(block, ctx))
  if (!ctx.bricks.has(value)) report(ctx, 'warning', 'program.brick-missing', 'That brick is not in this level’s bricks. Pick another one.', idOf(block, ctx))
  return value
}

function targetChoice(block: WorkspaceBlockJson, ctx: Ctx): string {
  const value = fieldString(block, 'TARGET')
  if (value === 'player' || value === 'any') return value
  if (value.startsWith('tile:') && (TILE_KINDS as readonly string[]).includes(value.slice(5))) return value
  if (value.startsWith('brick:') && ctx.bricks.has(value.slice(6))) return value
  report(ctx, 'warning', 'program.brick-missing', 'That is not in this level’s bricks. Pick something else to touch.', idOf(block, ctx))
  return value
}

function emptySlot(owner: WorkspaceBlockJson, expected: 'number' | 'boolean', ctx: Ctx): Expr {
  const blockId = idOf(owner, ctx)
  report(ctx, 'warning', 'program.empty-slot', expected === 'number' ? 'This block has an empty slot, so it uses 0.' : 'This block has an empty slot, so it counts as false.', blockId)
  return expected === 'number' ? { kind: 'number', value: 0, blockId } : { kind: 'boolean', value: false, blockId }
}

function input(owner: WorkspaceBlockJson, name: string, expected: 'number' | 'boolean', ctx: Ctx): Expr {
  const child = inputBlock(owner, name)
  return child ? expr(child, ctx) : emptySlot(owner, expected, ctx)
}

function unknownBlock(block: WorkspaceBlockJson, ctx: Ctx, why?: string) {
  const type = typeOf(block)
  report(ctx, 'error', 'program.unknown-block', why ?? (type ? 'This block is not part of the code lab. Take it out.' : 'A block here is broken. Take it out.'), idOf(block, ctx))
}

function expr(block: WorkspaceBlockJson, ctx: Ctx): Expr {
  const blockId = idOf(block, ctx)
  const type = typeOf(block)
  switch (type) {
    case 'lab_number': {
      const raw = fieldValue(block, 'NUM')
      const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : 0
      return { kind: 'number', value: Number.isFinite(value) ? value : 0, blockId }
    }
    case 'lab_compare':
      return { kind: 'binary', op: COMPARE[pick(block, 'OP', ALLOWED.compare, ctx)], left: input(block, 'A', 'number', ctx), right: input(block, 'B', 'number', ctx), blockId }
    case 'lab_arithmetic':
      return { kind: 'binary', op: ARITHMETIC[pick(block, 'OP', ALLOWED.arithmetic, ctx)], left: input(block, 'A', 'number', ctx), right: input(block, 'B', 'number', ctx), blockId }
    case 'lab_and_or':
      return { kind: 'binary', op: LOGIC[pick(block, 'OP', ALLOWED.logic, ctx)], left: input(block, 'A', 'boolean', ctx), right: input(block, 'B', 'boolean', ctx), blockId }
    case 'lab_not':
      return { kind: 'not', operand: input(block, 'VALUE', 'boolean', ctx), blockId }
    case 'lab_random':
      return { kind: 'random', low: input(block, 'LOW', 'number', ctx), high: input(block, 'HIGH', 'number', ctx), blockId }
    case 'lab_key_held':
      return { kind: 'keyHeld', key: pick(block, 'KEY', ALLOWED.key, ctx), blockId }
    case 'lab_on_ground':
      return { kind: 'onGround', blockId }
    case 'lab_probe':
      return { kind: 'probe', what: pick(block, 'WHAT', ALLOWED.probeWhat, ctx), where: pick(block, 'WHERE', ALLOWED.probeWhere, ctx), blockId }
    case 'lab_touching':
      return { kind: 'touching', target: targetChoice(block, ctx), blockId }
    case 'lab_speed':
      return { kind: 'speed', dir: pick(block, 'DIR', ALLOWED.dir, ctx), blockId }
    case 'lab_has_rider':
      return { kind: 'hasRider', blockId }
    case 'lab_is_riding':
      return { kind: 'isRiding', blockId }
    case 'lab_age':
      return { kind: 'age', blockId }
    case 'lab_distance':
      return { kind: 'distance', who: who(block, 'WHO', ALLOWED.other, ctx), blockId }
    case 'lab_memory':
      return { kind: 'memory', scope: pick(block, 'SCOPE', ALLOWED.scope, ctx), name: pick(block, 'NAME', ALLOWED.memory, ctx), blockId }
    case 'lab_variable':
      return { kind: 'variable', ...variable(block, ctx), blockId }
    case 'lab_argument': {
      const name = named(block, 'NAME', ctx)
      if (!ctx.currentParams?.has(name)) report(ctx, 'error', 'program.bad-argument', 'This input is not named in the custom block above.', blockId)
      return { kind: 'argument', name, blockId }
    }
    case 'lab_position': {
      const axis = fieldString(block, 'AXIS')
      if (axis !== 'x' && axis !== 'y') report(ctx, 'error', 'program.unknown-block', 'Choose x or y for this position.', blockId)
      return { kind: 'position', who: who(block, 'WHO', ALLOWED.whom, ctx), axis: axis === 'y' ? 'y' : 'x', blockId }
    }
    default:
      if (isLabBlockType(type)) unknownBlock(block, ctx, 'This block does something. It can’t go in a slot.')
      else unknownBlock(block, ctx)
      return { kind: 'number', value: 0, blockId }
  }
}

function statementInput(owner: WorkspaceBlockJson, name: string, ctx: Ctx): Stmt[] {
  const first = inputBlock(owner, name)
  return first ? chain(first, ctx) : []
}

function statement(block: WorkspaceBlockJson, ctx: Ctx): Stmt | null {
  const blockId = idOf(block, ctx)
  const type = typeOf(block)
  switch (type) {
    case 'lab_hero_on':
      return { op: 'hero', on: true, blockId }
    case 'lab_hero_off':
      return { op: 'hero', on: false, blockId }
    case 'lab_set_controls':
      return { op: 'setControls', who: who(block, 'WHO', ALLOWED.whom, ctx), enabled: pick(block, 'ENABLED', new Set(['true', 'false']), ctx) === 'true', blockId }
    case 'lab_set_physics':
      return { op: 'setPhysics', who: who(block, 'WHO', ALLOWED.whom, ctx), enabled: pick(block, 'ENABLED', new Set(['true', 'false']), ctx) === 'true', blockId }
    case 'lab_show_thing':
    case 'lab_hide_thing':
      return { op: 'setVisible', who: who(block, 'WHO', ALLOWED.whom, ctx), visible: type === 'lab_show_thing', blockId }
    case 'lab_frame':
      return { op: 'frame', frame: input(block, 'FRAME', 'number', ctx), blockId }
    case 'lab_next_frame':
      return { op: 'nextFrame', blockId }
    case 'lab_play_frames':
      return { op: 'playFrames', fps: input(block, 'FPS', 'number', ctx), blockId }
    case 'lab_stop_frames':
      return { op: 'stopFrames', blockId }
    case 'lab_say_text':
      return { op: 'sayText', text: fieldString(block, 'TEXT').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120), seconds: input(block, 'SECONDS', 'number', ctx), blockId }
    case 'lab_set_speed':
      return { op: 'setSpeed', who: who(block, 'WHO', ALLOWED.whose, ctx), dir: pick(block, 'DIR', ALLOWED.dir, ctx), value: input(block, 'VALUE', 'number', ctx), blockId }
    case 'lab_change_speed':
      return { op: 'changeSpeed', who: who(block, 'WHO', ALLOWED.whose, ctx), dir: pick(block, 'DIR', ALLOWED.dir, ctx), by: input(block, 'BY', 'number', ctx), blockId }
    case 'lab_launch':
      return { op: 'launch', who: who(block, 'WHO', ALLOWED.whom, ctx), angle: input(block, 'ANGLE', 'number', ctx), power: input(block, 'POWER', 'number', ctx), blockId }
    case 'lab_stop_moving':
      return { op: 'stopMoving', who: who(block, 'WHO', ALLOWED.whom, ctx), blockId }
    case 'lab_turn_around':
      return { op: 'turnAround', blockId }
    case 'lab_face':
      return { op: 'face', toward: pick(block, 'TOWARD', ALLOWED.face, ctx), blockId }
    case 'lab_move_to':
      return { op: 'moveTo', who: who(block, 'WHO', ALLOWED.whom, ctx), place: pick(block, 'PLACE', ALLOWED.place, ctx), blockId }
    case 'lab_hero_stat':
      return { op: 'heroStat', stat: pick(block, 'STAT', ALLOWED.heroStat, ctx), percent: input(block, 'PERCENT', 'number', ctx), blockId }
    case 'lab_make':
      return { op: 'make', brick: brickChoice(block, ctx), place: pick(block, 'PLACE', ALLOWED.place, ctx), blockId }
    case 'lab_remove':
      return { op: 'remove', who: who(block, 'WHO', ALLOWED.whom, ctx), blockId }
    case 'lab_hurt':
      return { op: 'hurt', who: who(block, 'WHO', ALLOWED.whom, ctx), blockId }
    case 'lab_body':
      return { op: 'body', setting: pick(block, 'SETTING', ALLOWED.body, ctx), percent: input(block, 'PERCENT', 'number', ctx), blockId }
    case 'lab_solid':
      return { op: 'solid', mode: pick(block, 'MODE', ALLOWED.solid, ctx), blockId }
    case 'lab_let_ride':
      return { op: 'letRide', who: who(block, 'WHO', ALLOWED.rider, ctx), blockId }
    case 'lab_drop_rider':
      return { op: 'dropRider', blockId }
    case 'lab_costume':
      return { op: 'costume', costume: pick(block, 'COSTUME', ALLOWED.costume, ctx), blockId }
    case 'lab_color':
      return { op: 'color', color: pick(block, 'COLOR', ALLOWED.color, ctx), blockId }
    case 'lab_size':
      return { op: 'size', percent: input(block, 'PERCENT', 'number', ctx), blockId }
    case 'lab_say':
      return { op: 'say', phrase: pick(block, 'PHRASE', ALLOWED.phrase, ctx), seconds: input(block, 'SECONDS', 'number', ctx), blockId }
    case 'lab_show':
      return { op: 'show', scope: pick(block, 'SCOPE', ALLOWED.scope, ctx), name: pick(block, 'NAME', ALLOWED.memory, ctx), blockId }
    case 'lab_sound':
      return { op: 'sound', sound: pick(block, 'SOUND', ALLOWED.sound, ctx), blockId }
    case 'lab_set_memory': {
      const valueBlock = inputBlock(block, 'VALUE')
      return {
        op: 'setMemory',
        scope: pick(block, 'SCOPE', ALLOWED.scope, ctx),
        name: pick(block, 'NAME', ALLOWED.memory, ctx),
        value: valueBlock ? expr(valueBlock, ctx) : emptySlot(block, 'number', ctx),
        blockId,
      }
    }
    case 'lab_change_memory':
      return { op: 'changeMemory', scope: pick(block, 'SCOPE', ALLOWED.scope, ctx), name: pick(block, 'NAME', ALLOWED.memory, ctx), by: input(block, 'BY', 'number', ctx), blockId }
    case 'lab_set_variable':
      return { op: 'setVariable', ...variable(block, ctx), value: input(block, 'VALUE', 'number', ctx), blockId }
    case 'lab_change_variable':
      return { op: 'changeVariable', ...variable(block, ctx), by: input(block, 'BY', 'number', ctx), blockId }
    case 'lab_call': {
      const name = named(block, 'NAME', ctx)
      const params = ctx.procedureNames.get(name)
      if (!params) report(ctx, 'error', 'program.unknown-procedure', `There is no custom block named ${name}. Make one first.`, blockId)
      if (params) {
        for (let i = 1; i <= 3; i++) {
          const plugged = !!inputBlock(block, `ARG${i}`)
          if (i <= params.length && !plugged) report(ctx, 'error', 'program.bad-argument', `Add a number for ${params[i - 1]} in this custom block call.`, blockId)
          const connection = isRecord(block.inputs) ? block.inputs[`ARG${i}`] : undefined
          if (i > params.length && isRecord(connection) && isRecord(connection.block)) report(ctx, 'error', 'program.bad-argument', 'This custom block call has an extra input.', blockId)
        }
      }
      return { op: 'call', name, args: (params ?? []).map((_, i) => input(block, `ARG${i + 1}`, 'number', ctx)), blockId }
    }
    case 'lab_broadcast':
      return { op: 'broadcast', message: named(block, 'MESSAGE', ctx), blockId }
    case 'lab_move_xy':
      return { op: 'moveXY', who: who(block, 'WHO', ALLOWED.whom, ctx), x: input(block, 'X', 'number', ctx), y: input(block, 'Y', 'number', ctx), blockId }
    case 'lab_make_xy':
      return { op: 'makeXY', brick: brickChoice(block, ctx), x: input(block, 'X', 'number', ctx), y: input(block, 'Y', 'number', ctx), blockId }
    case 'lab_wait':
      return { op: 'wait', seconds: input(block, 'SECONDS', 'number', ctx), blockId }
    case 'lab_wait_until':
      return { op: 'waitUntil', condition: input(block, 'CONDITION', 'boolean', ctx), blockId }
    case 'lab_repeat':
      return { op: 'repeat', count: input(block, 'TIMES', 'number', ctx), body: statementInput(block, 'DO', ctx), blockId }
    case 'lab_forever':
      return { op: 'forever', body: statementInput(block, 'DO', ctx), blockId }
    case 'lab_if':
      return { op: 'if', condition: input(block, 'CONDITION', 'boolean', ctx), then: statementInput(block, 'DO', ctx), blockId }
    case 'lab_if_else':
      return { op: 'if', condition: input(block, 'CONDITION', 'boolean', ctx), then: statementInput(block, 'DO', ctx), else: statementInput(block, 'ELSE', ctx), blockId }
    case 'lab_stop_script':
      return { op: 'stopScript', blockId }
    default:
      if ((HAT_TYPES as readonly string[]).includes(type) || type === 'lab_when_message' || type === 'lab_define') unknownBlock(block, ctx, 'A starting block can only go at the top.')
      else if (isLabBlockType(type)) unknownBlock(block, ctx, 'This block is a value. Put it in a slot.')
      else unknownBlock(block, ctx)
      return null
  }
}

/** Follows `next` links iteratively; nesting recursion happens only through inputs (bounded by the census). */
function chain(first: WorkspaceBlockJson, ctx: Ctx): Stmt[] {
  const out: Stmt[] = []
  for (let current: WorkspaceBlockJson | undefined = first; current; current = connectedBlock(current.next)) {
    if (isDisabledBlock(current)) continue
    const stmt = statement(current, ctx)
    if (stmt) out.push(stmt)
  }
  return out
}

function trigger(block: WorkspaceBlockJson, ctx: Ctx): Trigger {
  switch (typeOf(block)) {
    case 'lab_when_key':
      return { kind: 'key', key: pick(block, 'KEY', ALLOWED.key, ctx) }
    case 'lab_when_touch':
      return { kind: 'touch', target: targetChoice(block, ctx), side: pick(block, 'SIDE', ALLOWED.side, ctx) }
    case 'lab_when_stomped':
      return { kind: 'stomped' }
    case 'lab_when_land':
      return { kind: 'land' }
    case 'lab_when_hurt':
      return { kind: 'hurt' }
    case 'lab_when_message':
      return { kind: 'message', message: named(block, 'MESSAGE', ctx) }
    case 'lab_when_clicked':
      return { kind: 'clicked' }
    case 'lab_every': {
      const raw = Number(fieldValue(block, 'SECONDS'))
      return { kind: 'every', seconds: Number.isFinite(raw) ? Math.min(60, Math.max(0.1, raw)) : 1 }
    }
    default:
      return { kind: 'appear' }
  }
}

function result(ir: ProgramIR, ctx: Ctx): CompiledProgram {
  const seen = new Set<string>()
  const diagnostics = ctx.diagnostics.filter((d) => {
    const key = `${d.code}|${d.blockId ?? ''}|${d.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const lists = new Map<ListKey, Stmt[]>()
  const stmts = new Map<string, Stmt>()
  const keys = new Map<string, string>()
  const scripts = new Map<string, Script>()
  const procedures = new Map<string, Procedure>()
  const scriptKeys = new Map<string, string>()
  const index = (list: Stmt[]) => {
    for (const stmt of list) {
      stmts.set(stmt.blockId, stmt)
      keys.set(stmt.blockId, JSON.stringify(stmt))
      if (stmt.op === 'repeat' || stmt.op === 'forever') {
        lists.set(listKey(stmt.blockId, 'do'), stmt.body)
        index(stmt.body)
      } else if (stmt.op === 'if') {
        lists.set(listKey(stmt.blockId, 'do'), stmt.then)
        index(stmt.then)
        if (stmt.else) {
          lists.set(listKey(stmt.blockId, 'else'), stmt.else)
          index(stmt.else)
        }
      }
    }
  }
  for (const script of ir.scripts) {
    scripts.set(script.id, script)
    scriptKeys.set(script.id, JSON.stringify([script.trigger, script.body]))
    lists.set(listKey(script.id, 'body'), script.body)
    index(script.body)
  }
  for (const procedure of ir.procedures ?? []) {
    procedures.set(procedure.name, procedure)
    lists.set(listKey(procedure.blockId, 'do'), procedure.body)
    index(procedure.body)
  }
  return { ir, lists, stmts, scripts, procedures, keys, scriptKeys, diagnostics, ok: !diagnostics.some((d) => d.severity === 'error') }
}

const EMPTY_IR = (): ProgramIR => ({ irVersion: 1, scripts: [] })

export function compileProgram(workspace: unknown, context: CompileContext): CompiledProgram {
  const ctx: Ctx = { context, diagnostics: [], anonymous: new WeakMap(), anonymousCount: 0, makes: false, bricks: new Set(context.bricks.map((b) => b.id)), procedureNames: new Map(), variableNames: new Set() }
  const text = typeof workspace === 'string' ? workspace : workspaceText(workspace ?? {})
  if (text === null) {
    report(ctx, 'error', 'program.unknown-block', 'This program could not be read. Start a new one.', null)
    return result(EMPTY_IR(), ctx)
  }
  if (utf8Bytes(text) > LAB_LIMITS.maxWorkspaceBytes) {
    report(ctx, 'error', 'program.too-big', 'This program is too big. Take some blocks out.', null)
    return result(EMPTY_IR(), ctx)
  }
  let parsed: unknown = workspace
  if (typeof workspace === 'string') {
    try {
      parsed = JSON.parse(workspace) as unknown
    } catch {
      report(ctx, 'error', 'program.unknown-block', 'This program could not be read. Start a new one.', null)
      return result(EMPTY_IR(), ctx)
    }
  }

  // Census before any recursion: how many blocks, how deep.
  let nodes = 0
  let tooDeep: WorkspaceBlockJson | null = null
  walkBlocks(
    parsed,
    (block, depth) => {
      nodes += 1
      if (typeOf(block) === 'lab_make' || typeOf(block) === 'lab_make_xy') ctx.makes = true
      if (depth > LAB_LIMITS.maxDepth && !tooDeep) tooDeep = block
    },
    LAB_LIMITS.maxBlocks + 1,
  )
  if (nodes > LAB_LIMITS.maxBlocks) {
    report(ctx, 'error', 'program.too-big', `This program has more than ${LAB_LIMITS.maxBlocks} blocks. Take some out.`, null)
    return result(EMPTY_IR(), ctx)
  }
  if (tooDeep) {
    report(ctx, 'error', 'program.too-big', 'These blocks are tucked inside each other too deeply. Take some out.', idOf(tooDeep, ctx))
    return result(EMPTY_IR(), ctx)
  }

  const scripts: Script[] = []
  const procedures: Procedure[] = []
  const used = new Set<string>()
  for (const block of topBlocks(parsed)) {
    if (isDisabledBlock(block) || typeOf(block) !== 'lab_define') continue
    const name = named(block, 'NAME', ctx)
    const rawParams = [1, 2, 3].map((i) => fieldString(block, `ARG${i}`).trim())
    const params = rawParams.filter(Boolean)
    rawParams.forEach((param, i) => { if (param) named(block, `ARG${i + 1}`, ctx) })
    if (rawParams.some((param, i) => !param && rawParams.slice(i + 1).some(Boolean))) report(ctx, 'error', 'program.bad-argument', 'Fill custom block inputs from left to right.', idOf(block, ctx))
    if (new Set(params).size !== params.length || ctx.procedureNames.has(name)) report(ctx, 'error', 'program.bad-argument', 'Each custom block and its inputs need different names.', idOf(block, ctx))
    if (ctx.procedureNames.size >= LAB_LIMITS.maxProcedures) report(ctx, 'error', 'program.too-big', 'This program has too many custom blocks.', idOf(block, ctx))
    else ctx.procedureNames.set(name, params)
  }
  for (const block of topBlocks(parsed)) {
    if (isDisabledBlock(block)) continue
    const blockId = idOf(block, ctx)
    const type = typeOf(block)
    if (type === 'lab_define') {
      const name = fieldString(block, 'NAME').trim()
      if (procedures.some((p) => p.name === name) || procedures.length >= LAB_LIMITS.maxProcedures) continue
      ctx.scriptId = blockId
      ctx.currentParams = new Set(ctx.procedureNames.get(name) ?? [])
      procedures.push({ name, params: ctx.procedureNames.get(name) ?? [], body: statementInput(block, 'DO', ctx), blockId })
      ctx.currentParams = undefined
      ctx.scriptId = undefined
      continue
    }
    if (!(HAT_TYPES as readonly string[]).includes(type) && type !== 'lab_when_message') {
      if (!isLabBlockType(type) && !FREEDOM_TYPES.has(type)) unknownBlock(block, ctx)
      report(ctx, 'info', 'program.loose-blocks', 'These blocks are not under a “when” block, so they don’t run. Snap them under one.', blockId)
      continue
    }
    if (scripts.length >= LAB_LIMITS.maxScripts) {
      report(ctx, 'error', 'program.too-big', `A brick can have ${LAB_LIMITS.maxScripts} scripts. Take this one out.`, blockId)
      continue
    }
    if (used.has(blockId)) continue
    used.add(blockId)
    ctx.scriptId = blockId
    ctx.hat = type
    const when = trigger(block, ctx)
    const first = connectedBlock(block.next)
    scripts.push({ id: blockId, trigger: when, body: first ? chain(first, ctx) : [], hatBlockId: blockId })
    ctx.scriptId = undefined
    ctx.hat = undefined
  }
  if (!scripts.length && !ctx.diagnostics.some((d) => d.severity === 'error')) {
    report(ctx, 'info', 'program.no-scripts', 'Add a “when” block to start a script.', null)
  }
  return result({ irVersion: 1, scripts, ...(procedures.length ? { procedures } : {}) }, ctx)
}

/** Readable pseudo-code for tests and the text views. Not a source of truth. */
export function describeIR(ir: ProgramIR): string {
  const lines: string[] = []
  const show = (e: Expr): string => {
    switch (e.kind) {
      case 'number':
        return String(e.value)
      case 'boolean':
        return e.value ? 'true' : 'false'
      case 'binary':
        return `(${show(e.left)} ${e.op} ${show(e.right)})`
      case 'not':
        return `not ${show(e.operand)}`
      case 'random':
        return `random(${show(e.low)}, ${show(e.high)})`
      case 'keyHeld':
        return `held(${e.key})`
      case 'onGround':
        return 'onGround'
      case 'touching':
        return `touching(${e.target})`
      case 'probe':
        return `probe(${e.what}, ${e.where})`
      case 'speed':
        return `speed(${e.dir})`
      case 'hasRider':
        return 'hasRider'
      case 'isRiding':
        return 'isRiding'
      case 'age':
        return 'age'
      case 'distance':
        return `distance(${e.who})`
      case 'memory':
        return `${e.scope}.${e.name}`
      case 'variable':
        return `${e.scope}.${e.name}`
      case 'argument':
        return `arg(${e.name})`
      case 'position':
        return `${e.who}.${e.axis}`
    }
  }
  const block = (list: readonly Stmt[], indent: string) => {
    for (const s of list) line(s, indent)
  }
  const line = (s: Stmt, indent: string) => {
    switch (s.op) {
      case 'repeat':
        lines.push(`${indent}repeat ${show(s.count)}`)
        block(s.body, `${indent}  `)
        return
      case 'forever':
        lines.push(`${indent}forever`)
        block(s.body, `${indent}  `)
        return
      case 'if':
        lines.push(`${indent}if ${show(s.condition)}`)
        block(s.then, `${indent}  `)
        if (s.else) {
          lines.push(`${indent}else`)
          block(s.else, `${indent}  `)
        }
        return
      default: {
        const { op, blockId: _id, ...rest } = s
        const parts = Object.entries(rest).map(([k, v]) => `${k}=${Array.isArray(v) ? v.map((arg) => show(arg as Expr)).join(',') : typeof v === 'object' ? show(v as Expr) : String(v)}`)
        lines.push(`${indent}${op}${parts.length ? ' ' + parts.join(' ') : ''}`)
      }
    }
  }
  for (const script of ir.scripts) {
    const t = script.trigger
    const extra = t.kind === 'key' ? ` ${t.key}` : t.kind === 'touch' ? ` ${t.target} ${t.side}` : t.kind === 'every' ? ` ${t.seconds}s` : t.kind === 'message' ? ` ${t.message}` : ''
    lines.push(`when ${t.kind}${extra}`)
    block(script.body, '  ')
  }
  for (const procedure of ir.procedures ?? []) {
    lines.push(`define ${procedure.name}(${procedure.params.join(', ')})`)
    block(procedure.body, '  ')
  }
  return lines.join('\n')
}
