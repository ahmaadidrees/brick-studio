import type { DerivedCreation, DerivedDevice } from '../model/creations'
import { AXIS_OPTIONS, BUILTIN_ALIASES, CONTROLLER_HAT_TYPES, HAT_BLOCK_TYPES, KEY_OPTIONS, NO_DEVICE, isRoboBlockType, type DeviceMenuKind } from './catalog/blocks'
import { DEVICE_KIND_WORDS } from './devices'
import {
  IR_LIMITS, LIGHT_COLORS, PROGRAM_LIMITS,
  type BinaryOp, type BlockDiagnostic, type CompileResult, type DeviceId, type DiagnosticCode, type DiagnosticSeverity, type Expr, type JoystickAxis, type LightColor,
  type ProgramIR, type ProgramKey, type RoboticsProgram, type Script, type ScriptTrigger, type Stmt,
} from './types'
import { connectedBlock, isDisabledBlock, isRecord, topBlocks, utf8Bytes, variableNames, walkBlocks, workspaceText, type WorkspaceBlockJson } from './workspaceJson'

/**
 * Blockly workspace JSON → `ProgramIR` (contract §6, CP2-PLAN §5). Defensive first (bytes,
 * block count, nesting), then a walk from each hat. Never throws: every problem is a
 * diagnostic in a student's words naming their parts, and `ok` is false only when one of
 * them is an error. Every IR node carries the id of the block it came from.
 *
 * Helper blocks are lowered here onto the creation's drive pair with each motor's
 * reversal folded into the sign, so the IR and the runtime never need to know what a
 * drive pair is.
 */

export type CompileDeviceKind = 'motor' | 'hinge' | 'sensor' | 'light' | 'button'

export type CompileDevice = {
  id: DeviceId
  name: string
  kind: CompileDeviceKind
  plugged: boolean
  /** `A`–`D` when plugged in. */
  port: string | null
}

export type CompileContext = {
  creationName: string
  /** The creation's devices by brick id (motors, hinge motors, sensors, lights, buttons). */
  devices: Readonly<Record<DeviceId, CompileDevice>>
  /** The configured drive pair, if the creation has one. `reversedIds` flip the sign of their power. */
  drivePair: { leftId: DeviceId; rightId: DeviceId; reversedIds: readonly DeviceId[] } | null
  /** Last known names, for blocks naming a device that is gone (`program.deviceNames`). */
  deviceNames: Readonly<Record<DeviceId, string>>
  /**
   * Every brick id in the world, when known. It tells "the brick is gone" (`device.missing`)
   * from "the brick is in another creation" (`device.not-in-creation`); without it an
   * unknown id reads as missing.
   */
  worldBrickIds?: ReadonlySet<string>
}

/** The compile context for a creation as derived from the build, with a program's remembered names. */
export function compileContextFor(creation: DerivedCreation, program?: Pick<RoboticsProgram, 'deviceNames'> | null, worldBrickIds?: ReadonlySet<string>): CompileContext {
  const devices: Record<DeviceId, CompileDevice> = {}
  const add = (kind: CompileDeviceKind, device: DerivedDevice) => {
    devices[device.brickId] = { id: device.brickId, name: device.name, kind, plugged: device.plugged, port: device.port?.port ?? null }
  }
  for (const motor of creation.motors) add('motor', motor)
  for (const hinge of creation.hinges) add('hinge', hinge)
  for (const sensor of creation.sensors) add('sensor', sensor)
  for (const light of creation.lights) add('light', light)
  for (const button of creation.buttons) add('button', button)
  const pair = creation.drivePair
  return {
    creationName: creation.name,
    devices,
    drivePair: pair ? { leftId: pair.leftId, rightId: pair.rightId, reversedIds: [...pair.reversedIds] } : null,
    deviceNames: { ...(program?.deviceNames ?? {}) },
    ...(worldBrickIds ? { worldBrickIds } : {}),
  }
}

type Ctx = {
  context: CompileContext
  diagnostics: BlockDiagnostic[]
  variableNames: Map<string, string>
  variables: Set<string>
  anonymous: WeakMap<object, string>
  anonymousCount: number
  scriptId?: string
}

const COMPARE: Record<string, BinaryOp> = { LT: '<', LTE: '<=', EQ: '==', NEQ: '!=', GTE: '>=', GT: '>' }
const LOGIC: Record<string, BinaryOp> = { AND: 'and', OR: 'or' }
const ARITHMETIC: Record<string, BinaryOp> = { ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/' }
const MIN_MAX: Record<string, BinaryOp> = { MIN: 'min', MAX: 'max' }
const KEYS = new Set(KEY_OPTIONS.map(([, value]) => value))
const AXES = new Set(AXIS_OPTIONS.map(([, value]) => value))

const HAT_WORDS: Record<string, string> = {
  robo_when_joystick_moves: '“when joystick moves”',
  robo_when_controls_update: '“when controls update”',
}

function report(ctx: Ctx, severity: DiagnosticSeverity, code: DiagnosticCode, message: string, blockId: string | null, deviceId?: DeviceId) {
  ctx.diagnostics.push({ code, severity, message, blockId, ...(deviceId !== undefined ? { deviceId } : {}), ...(ctx.scriptId ? { scriptId: ctx.scriptId } : {}) })
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

/** The catalog type a block compiles as (built-in aliases resolved), or '' for a block with no type. */
function typeOf(block: WorkspaceBlockJson): string {
  const type = typeof block.type === 'string' ? block.type : ''
  return BUILTIN_ALIASES[type] ?? type
}

const fieldValue = (block: WorkspaceBlockJson, name: string): unknown => (isRecord(block.fields) ? block.fields[name] : undefined)
const fieldString = (block: WorkspaceBlockJson, name: string): string => {
  const value = fieldValue(block, name)
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}
const inputBlock = (block: WorkspaceBlockJson, name: string) => (isRecord(block.inputs) ? connectedBlock(block.inputs[name]) : undefined)

function variableOf(block: WorkspaceBlockJson, ctx: Ctx): string {
  const raw = fieldValue(block, 'VAR')
  let name = 'count'
  if (isRecord(raw)) {
    if (typeof raw.name === 'string' && raw.name) name = raw.name
    else if (typeof raw.id === 'string') name = ctx.variableNames.get(raw.id) ?? raw.id
  } else if (typeof raw === 'string' && raw) {
    name = ctx.variableNames.get(raw) ?? raw
  }
  ctx.variables.add(name)
  return name
}

function deviceName(ctx: Ctx, deviceId: DeviceId): string {
  return ctx.context.devices[deviceId]?.name ?? ctx.context.deviceNames[deviceId] ?? 'This part'
}

/**
 * Checks the device a block names. Missing, foreign and wrong-kind devices are errors;
 * an unplugged one is a warning (the program runs, that block does nothing).
 */
function checkDevice(ctx: Ctx, blockId: string, deviceId: DeviceId, kind: DeviceMenuKind) {
  const { context } = ctx
  const word = DEVICE_KIND_WORDS[kind]
  if (deviceId === NO_DEVICE) {
    const has = Object.values(context.devices).some((device) => (kind === 'motor' ? device.kind === 'motor' || device.kind === 'hinge' : device.kind === kind))
    report(ctx, 'error', 'device.not-in-creation', has ? `Pick a ${word} for this block` : `${context.creationName} has no ${word} yet`, blockId)
    return
  }
  const device = context.devices[deviceId]
  if (!device) {
    const elsewhere = context.worldBrickIds?.has(deviceId) ?? false
    if (elsewhere) report(ctx, 'error', 'device.not-in-creation', `${deviceName(ctx, deviceId)} is not part of ${context.creationName}`, blockId, deviceId)
    else report(ctx, 'error', 'device.missing', `${deviceName(ctx, deviceId)} is missing`, blockId, deviceId)
    return
  }
  const fits = kind === 'motor' ? device.kind === 'motor' || device.kind === 'hinge' : device.kind === kind
  if (!fits) {
    report(ctx, 'error', 'device.not-in-creation', `${device.name} is not a ${word}`, blockId, deviceId)
    return
  }
  if (!device.plugged) report(ctx, 'warning', 'device.unplugged', `${device.name} is not plugged in`, blockId, deviceId)
}

function device(block: WorkspaceBlockJson, field: string, kind: DeviceMenuKind, ctx: Ctx): DeviceId {
  const deviceId = fieldString(block, field)
  checkDevice(ctx, idOf(block, ctx), deviceId, kind)
  return deviceId
}

function emptySlot(owner: WorkspaceBlockJson, expected: 'number' | 'boolean', ctx: Ctx): Expr {
  const blockId = idOf(owner, ctx)
  report(ctx, 'warning', 'program.empty-slot', expected === 'number' ? 'This block has an empty slot, so it uses 0' : 'This block has an empty slot, so it counts as false', blockId)
  return expected === 'number' ? { kind: 'number', value: 0, blockId } : { kind: 'boolean', value: false, blockId }
}

function input(owner: WorkspaceBlockJson, name: string, expected: 'number' | 'boolean', ctx: Ctx): Expr {
  const child = inputBlock(owner, name)
  return child ? expr(child, ctx) : emptySlot(owner, expected, ctx)
}

function negate(value: Expr, blockId: string): Expr {
  if (value.kind === 'number') return { kind: 'number', value: value.value === 0 ? 0 : -value.value, blockId: value.blockId ?? blockId }
  return { kind: 'binary', op: '-', left: { kind: 'number', value: 0, blockId }, right: value, blockId }
}

function unknownBlock(block: WorkspaceBlockJson, ctx: Ctx, why?: string) {
  const type = typeof block.type === 'string' ? block.type : ''
  report(ctx, 'error', 'program.unknown-block', why ?? (type ? `This block (${type}) is not part of the Robot Workshop. Remove it.` : 'A block here has no type. Remove it.'), idOf(block, ctx))
}

function expr(block: WorkspaceBlockJson, ctx: Ctx): Expr {
  const blockId = idOf(block, ctx)
  const type = typeOf(block)
  switch (type) {
    case 'robo_number': {
      const raw = fieldValue(block, 'NUM')
      const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : 0
      return { kind: 'number', value: Number.isFinite(value) ? value : 0, blockId }
    }
    case 'robo_compare': case 'robo_arithmetic': case 'robo_min_max': case 'robo_and_or': {
      const table = type === 'robo_compare' ? COMPARE : type === 'robo_arithmetic' ? ARITHMETIC : type === 'robo_min_max' ? MIN_MAX : LOGIC
      const op = table[fieldString(block, 'OP')]
      const operand = type === 'robo_and_or' ? 'boolean' : 'number'
      if (!op) {
        unknownBlock(block, ctx, 'Pick an operation from this block’s list')
        return operand === 'boolean' ? { kind: 'boolean', value: false, blockId } : { kind: 'number', value: 0, blockId }
      }
      return { kind: 'binary', op, left: input(block, 'A', operand, ctx), right: input(block, 'B', operand, ctx), blockId }
    }
    case 'robo_not':
      return { kind: 'not', operand: input(block, 'VALUE', 'boolean', ctx), blockId }
    case 'robo_variable':
      return { kind: 'variable', name: variableOf(block, ctx), blockId }
    case 'robo_sensor_distance':
      return { kind: 'sensorDistance', deviceId: device(block, 'SENSOR', 'sensor', ctx), blockId }
    case 'robo_sensor_sees':
      return { kind: 'sensorSees', deviceId: device(block, 'SENSOR', 'sensor', ctx), withinStuds: input(block, 'STUDS', 'number', ctx), blockId }
    case 'robo_motor_position':
      return { kind: 'motorPosition', deviceId: device(block, 'MOTOR', 'motor', ctx), blockId }
    case 'robo_motor_speed':
      return { kind: 'motorSpeed', deviceId: device(block, 'MOTOR', 'motor', ctx), blockId }
    case 'robo_button_pressed':
      return { kind: 'buttonPressed', deviceId: device(block, 'BUTTON', 'button', ctx), blockId }
    case 'robo_timer':
      return { kind: 'timer', blockId }
    case 'robo_joystick': {
      const axis = fieldString(block, 'AXIS')
      if (!AXES.has(axis)) unknownBlock(block, ctx, 'Pick “up” or “right” on this block')
      return { kind: 'joystick', axis: (AXES.has(axis) ? axis : 'up') as JoystickAxis, blockId }
    }
    case 'robo_key_held': {
      const key = fieldString(block, 'KEY')
      if (!KEYS.has(key)) unknownBlock(block, ctx, 'Pick a key from this block’s list')
      return { kind: 'keyHeld', key: (KEYS.has(key) ? key : 'up') as ProgramKey, blockId }
    }
    default:
      if (isRoboBlockType(type)) unknownBlock(block, ctx, 'This block does something; it can’t go in a slot')
      else unknownBlock(block, ctx)
      return { kind: 'number', value: 0, blockId }
  }
}

function statementInput(owner: WorkspaceBlockJson, name: string, ctx: Ctx): Stmt[] {
  const first = inputBlock(owner, name)
  return first ? chain(first, ctx) : []
}

/** Helper blocks run on the drive pair; without one they say so and compile to nothing. */
function drivePair(block: WorkspaceBlockJson, ctx: Ctx): CompileContext['drivePair'] {
  const blockId = idOf(block, ctx)
  const pair = ctx.context.drivePair
  if (!pair) {
    report(ctx, 'error', 'drive.no-pair', 'Choose two drive motors first', blockId)
    return null
  }
  for (const motorId of [pair.leftId, pair.rightId]) checkDevice(ctx, blockId, motorId, 'motor')
  return pair
}

function onPair(pair: NonNullable<CompileContext['drivePair']>, left: Expr, right: Expr, blockId: string): Stmt[] {
  const signed = (motorId: DeviceId, value: Expr) => (pair.reversedIds.includes(motorId) ? negate(value, blockId) : value)
  return [
    { op: 'runMotor', deviceId: pair.leftId, percent: signed(pair.leftId, left), blockId },
    { op: 'runMotor', deviceId: pair.rightId, percent: signed(pair.rightId, right), blockId },
  ]
}

function statement(block: WorkspaceBlockJson, ctx: Ctx): Stmt[] {
  const blockId = idOf(block, ctx)
  const type = typeOf(block)
  switch (type) {
    case 'robo_drive': {
      const power = input(block, 'POWER', 'number', ctx)
      const pair = drivePair(block, ctx)
      if (!pair) return []
      const signed = fieldString(block, 'DIRECTION') === 'backward' ? negate(power, blockId) : power
      return onPair(pair, signed, signed, blockId)
    }
    case 'robo_turn': {
      const power = input(block, 'POWER', 'number', ctx)
      const seconds = input(block, 'SECONDS', 'number', ctx)
      const pair = drivePair(block, ctx)
      if (!pair) return []
      // Spin in place: turning left runs the left side backward and the right side forward.
      const toRight = fieldString(block, 'DIRECTION') === 'right'
      return [
        ...onPair(pair, toRight ? power : negate(power, blockId), toRight ? negate(power, blockId) : power, blockId),
        { op: 'wait', seconds, blockId },
        { op: 'stopMotor', deviceId: pair.leftId, blockId },
        { op: 'stopMotor', deviceId: pair.rightId, blockId },
      ]
    }
    case 'robo_drive_joystick': {
      const pair = drivePair(block, ctx)
      if (!pair) return []
      // Arcade mix; the controller clamps each side to ±100.
      const up = (): Expr => ({ kind: 'joystick', axis: 'up', blockId })
      const right = (): Expr => ({ kind: 'joystick', axis: 'right', blockId })
      return onPair(pair, { kind: 'binary', op: '+', left: up(), right: right(), blockId }, { kind: 'binary', op: '-', left: up(), right: right(), blockId }, blockId)
    }
    case 'robo_stop_motors':
      return [{ op: 'stopAllMotors', blockId }]
    case 'robo_run_motor':
      return [{ op: 'runMotor', deviceId: device(block, 'MOTOR', 'motor', ctx), percent: input(block, 'POWER', 'number', ctx), blockId }]
    case 'robo_turn_motor_to':
      return [{ op: 'turnMotorTo', deviceId: device(block, 'MOTOR', 'motor', ctx), degrees: input(block, 'DEGREES', 'number', ctx), blockId }]
    case 'robo_stop_motor':
      return [{ op: 'stopMotor', deviceId: device(block, 'MOTOR', 'motor', ctx), blockId }]
    case 'robo_set_light': {
      const deviceId = device(block, 'LIGHT', 'light', ctx)
      const color = fieldString(block, 'COLOR')
      const known = (LIGHT_COLORS as readonly string[]).includes(color)
      if (!known) unknownBlock(block, ctx, 'Pick a colour from this block’s list')
      return [{ op: 'setLight', deviceId, color: known ? (color as LightColor) : null, blockId }]
    }
    case 'robo_light_off':
      return [{ op: 'setLight', deviceId: device(block, 'LIGHT', 'light', ctx), color: null, blockId }]
    case 'robo_wait':
      return [{ op: 'wait', seconds: input(block, 'SECONDS', 'number', ctx), blockId }]
    case 'robo_wait_until':
      return [{ op: 'waitUntil', condition: input(block, 'CONDITION', 'boolean', ctx), blockId }]
    case 'robo_repeat':
      return [{ op: 'repeat', count: input(block, 'TIMES', 'number', ctx), body: statementInput(block, 'DO', ctx), blockId }]
    case 'robo_forever':
      return [{ op: 'forever', body: statementInput(block, 'DO', ctx), blockId }]
    case 'robo_if':
      return [{ op: 'if', condition: input(block, 'CONDITION', 'boolean', ctx), then: statementInput(block, 'DO', ctx), blockId }]
    case 'robo_if_else':
      return [{ op: 'if', condition: input(block, 'CONDITION', 'boolean', ctx), then: statementInput(block, 'DO', ctx), else: statementInput(block, 'ELSE', ctx), blockId }]
    case 'robo_stop_script':
      return [{ op: 'stopScript', blockId }]
    case 'robo_set_variable': {
      const name = variableOf(block, ctx)
      const valueBlock = inputBlock(block, 'VALUE')
      return [{ op: 'setVariable', name, value: valueBlock ? expr(valueBlock, ctx) : emptySlot(block, 'number', ctx), blockId }]
    }
    case 'robo_change_variable':
      // Blockly's own `math_change` names its slot DELTA.
      return [{ op: 'changeVariable', name: variableOf(block, ctx), by: input(block, inputBlock(block, 'DELTA') ? 'DELTA' : 'BY', 'number', ctx), blockId }]
    default:
      if ((HAT_BLOCK_TYPES as readonly string[]).includes(type)) unknownBlock(block, ctx, 'A “when” block can only start a script, at the top')
      else if (isRoboBlockType(type)) unknownBlock(block, ctx, 'This block is a value; put it in a slot')
      else unknownBlock(block, ctx)
      return []
  }
}

/** Follows `next` links iteratively; nesting recursion happens only through inputs (bounded by the census). */
function chain(first: WorkspaceBlockJson, ctx: Ctx): Stmt[] {
  const out: Stmt[] = []
  for (let current: WorkspaceBlockJson | undefined = first; current; current = connectedBlock(current.next)) {
    if (!isDisabledBlock(current)) out.push(...statement(current, ctx))
  }
  return out
}

function trigger(block: WorkspaceBlockJson, ctx: Ctx): ScriptTrigger | null {
  switch (typeOf(block)) {
    case 'robo_when_run': return { kind: 'run' }
    case 'robo_when_sensor_sees': return { kind: 'sensorSees', deviceId: device(block, 'SENSOR', 'sensor', ctx) }
    case 'robo_when_button_pressed': return { kind: 'buttonPressed', deviceId: device(block, 'BUTTON', 'button', ctx) }
    case 'robo_when_key_pressed': {
      const key = fieldString(block, 'KEY')
      if (!KEYS.has(key)) unknownBlock(block, ctx, 'Pick a key from this block’s list')
      return { kind: 'keyPressed', key: (KEYS.has(key) ? key : 'up') as ProgramKey }
    }
    case 'robo_when_joystick_moves': return { kind: 'joystickMoves' }
    case 'robo_when_controls_update': return { kind: 'controlsUpdate' }
    default: return null
  }
}

/** A controller script runs to completion every tick (contract §8): no waits, no forever. */
function checkController(body: Stmt[], hatType: string, ctx: Ctx) {
  const hat = HAT_WORDS[hatType] ?? 'This script'
  const visit = (list: Stmt[]) => {
    for (const stmt of list) {
      if (stmt.op === 'wait' || stmt.op === 'waitUntil') {
        report(ctx, 'error', 'program.controller-waits', `${hat} runs all at once, many times a second, so it can’t wait. Use “if” instead, or move this block under “when run”.`, stmt.blockId ?? null)
      } else if (stmt.op === 'forever') {
        report(ctx, 'error', 'program.controller-waits', `${hat} already runs again and again, so it can’t loop forever. Take the blocks out of “forever”.`, stmt.blockId ?? null)
      }
      if (stmt.op === 'repeat' || stmt.op === 'forever') visit(stmt.body)
      if (stmt.op === 'if') { visit(stmt.then); if (stmt.else) visit(stmt.else) }
    }
  }
  visit(body)
}

function dedupe(diagnostics: BlockDiagnostic[]): BlockDiagnostic[] {
  const seen = new Set<string>()
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.code}|${diagnostic.blockId ?? ''}|${diagnostic.deviceId ?? ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const EMPTY_IR = (): ProgramIR => ({ irVersion: 1, scripts: [] })

function result(ir: ProgramIR, diagnostics: BlockDiagnostic[]): CompileResult {
  const unique = dedupe(diagnostics)
  return { ir, diagnostics: unique, ok: !unique.some((diagnostic) => diagnostic.severity === 'error') }
}

/** Parses a workspace given as a JSON string, or returns it as is. */
function readWorkspace(workspace: unknown, ctx: Ctx): unknown | null {
  if (typeof workspace !== 'string') return workspace
  try {
    return JSON.parse(workspace) as unknown
  } catch {
    report(ctx, 'error', 'program.unknown-block', 'This program could not be read. Start a new one.', null)
    return null
  }
}

export function compileProgram(workspace: unknown, context: CompileContext): CompileResult {
  const ctx: Ctx = { context, diagnostics: [], variableNames: new Map(), variables: new Set(), anonymous: new WeakMap(), anonymousCount: 0 }
  const text = typeof workspace === 'string' ? workspace : workspaceText(workspace ?? {})
  if (text === null) {
    report(ctx, 'error', 'program.unknown-block', 'This program could not be read. Start a new one.', null)
    return result(EMPTY_IR(), ctx.diagnostics)
  }
  if (utf8Bytes(text) > PROGRAM_LIMITS.maxWorkspaceBytes) {
    report(ctx, 'error', 'program.too-big', `This program is too big (over ${Math.round(PROGRAM_LIMITS.maxWorkspaceBytes / 1000)} KB). Split it into two programs.`, null)
    return result(EMPTY_IR(), ctx.diagnostics)
  }
  const parsed = readWorkspace(workspace, ctx)
  if (parsed === null) return result(EMPTY_IR(), ctx.diagnostics)

  // Census before any recursion: node count and nesting depth.
  const census = { nodes: 0, tooDeep: null as WorkspaceBlockJson | null }
  walkBlocks(parsed, (block, depth) => {
    census.nodes += 1
    if (depth > IR_LIMITS.maxDepth && !census.tooDeep) census.tooDeep = block
  }, IR_LIMITS.maxNodes + 1)
  const { tooDeep } = census
  if (census.nodes > IR_LIMITS.maxNodes) {
    report(ctx, 'error', 'program.too-big', `This program has more than ${IR_LIMITS.maxNodes} blocks. Split it into two programs.`, null)
    return result(EMPTY_IR(), ctx.diagnostics)
  }
  if (tooDeep) {
    report(ctx, 'error', 'program.too-big', 'These blocks are nested too deeply. Take some out of the blocks around them.', idOf(tooDeep, ctx))
    return result(EMPTY_IR(), ctx.diagnostics)
  }
  ctx.variableNames = variableNames(parsed)

  const scripts: Script[] = []
  const usedIds = new Set<string>()
  let hats = 0
  for (const block of topBlocks(parsed)) {
    if (isDisabledBlock(block)) continue
    const blockId = idOf(block, ctx)
    const type = typeOf(block)
    if (!(HAT_BLOCK_TYPES as readonly string[]).includes(type)) {
      if (!isRoboBlockType(type)) unknownBlock(block, ctx)
      report(ctx, 'info', 'program.loose-blocks', 'These blocks are not under a “when” block, so they don’t run. Snap them under one.', blockId)
      continue
    }
    hats += 1
    if (hats > IR_LIMITS.maxScripts) {
      report(ctx, 'error', 'program.too-big', `A program can have ${IR_LIMITS.maxScripts} scripts. Remove this one or split the program.`, blockId)
      continue
    }
    let id = blockId
    for (let suffix = 2; usedIds.has(id); suffix += 1) id = `${blockId}#${suffix}`
    usedIds.add(id)
    ctx.scriptId = id
    const when = trigger(block, ctx)!
    const first = connectedBlock(block.next)
    const body = first ? chain(first, ctx) : []
    if ((CONTROLLER_HAT_TYPES as readonly string[]).includes(type)) checkController(body, type, ctx)
    scripts.push({ id, trigger: when, body, hatBlockId: blockId })
    ctx.scriptId = undefined
  }
  if (ctx.variables.size > IR_LIMITS.maxVariables) {
    report(ctx, 'error', 'program.too-big', `A program can use ${IR_LIMITS.maxVariables} variables. Reuse some.`, null)
  }
  if (!scripts.length && !ctx.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    report(ctx, 'warning', 'program.no-scripts', 'Add a “when run” block to start a script.', null)
  }
  return result({ irVersion: 1, scripts }, ctx.diagnostics)
}

/** Readable pseudo-code for tests and evidence. Not a source of truth. */
export function describeIR(ir: ProgramIR): string {
  const lines: string[] = []
  const show = (value: Expr): string => {
    switch (value.kind) {
      case 'number': return String(value.value)
      case 'boolean': return value.value ? 'true' : 'false'
      case 'binary': return `(${show(value.left)} ${value.op} ${show(value.right)})`
      case 'not': return `not ${show(value.operand)}`
      case 'sensorDistance': return `distance(${value.deviceId})`
      case 'sensorSees': return `sees(${value.deviceId} < ${show(value.withinStuds)})`
      case 'motorPosition': return `position(${value.deviceId})`
      case 'motorSpeed': return `speed(${value.deviceId})`
      case 'buttonPressed': return `pressed(${value.deviceId})`
      case 'joystick': return `joystick.${value.axis}`
      case 'keyHeld': return `held(${value.key})`
      case 'timer': return 'timer'
      case 'variable': return value.name
    }
  }
  const block = (list: Stmt[], indent: string) => { for (const stmt of list) line(stmt, indent) }
  const line = (stmt: Stmt, indent: string) => {
    switch (stmt.op) {
      case 'runMotor': lines.push(`${indent}run ${stmt.deviceId} at ${show(stmt.percent)}`); return
      case 'turnMotorTo': lines.push(`${indent}turn ${stmt.deviceId} to ${show(stmt.degrees)}`); return
      case 'stopMotor': lines.push(`${indent}stop ${stmt.deviceId}`); return
      case 'stopAllMotors': lines.push(`${indent}stop motors`); return
      case 'setLight': lines.push(`${indent}light ${stmt.deviceId} ${stmt.color ?? 'off'}`); return
      case 'wait': lines.push(`${indent}wait ${show(stmt.seconds)}`); return
      case 'waitUntil': lines.push(`${indent}wait until ${show(stmt.condition)}`); return
      case 'repeat': lines.push(`${indent}repeat ${show(stmt.count)}`); block(stmt.body, `${indent}  `); return
      case 'forever': lines.push(`${indent}forever`); block(stmt.body, `${indent}  `); return
      case 'if':
        lines.push(`${indent}if ${show(stmt.condition)}`)
        block(stmt.then, `${indent}  `)
        if (stmt.else) { lines.push(`${indent}else`); block(stmt.else, `${indent}  `) }
        return
      case 'setVariable': lines.push(`${indent}set ${stmt.name} = ${show(stmt.value)}`); return
      case 'changeVariable': lines.push(`${indent}change ${stmt.name} by ${show(stmt.by)}`); return
      case 'stopScript': lines.push(`${indent}stop script`); return
    }
  }
  for (const script of ir.scripts) {
    const trigger = script.trigger
    lines.push(`when ${trigger.kind}${'deviceId' in trigger ? ` ${trigger.deviceId}` : ''}${'key' in trigger ? ` ${trigger.key}` : ''}`)
    block(script.body, '  ')
  }
  return lines.join('\n')
}
