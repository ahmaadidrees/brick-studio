/**
 * Level design → a Play session (docs/CODE-LAB-BRICK-MODEL.md, decision 1).
 *
 * `instantiate` rebuilds a world from the saved design: stage globals, one non-clone
 * target per painted copy, knob overrides, seeded RNG. It deep-copies, so a session
 * cannot mutate the design. Calling it again is a new Play. It does not fire hats.
 *
 * Assumes `validateDesign(design)` returned `[]` (or that `save.parse` already ran it).
 *
 * Green flag is different (H01, scheduler lane): inside a session the flag keeps
 * positions and variable values. Play is the reload that flag deliberately is not.
 * Painted copies get their own local variables and list arrays (C11, D02). They do
 * not count toward CLONE_LIMIT.
 *
 * y up, (0, 0) = bottom-left of the level, direction 90 = right.
 */
import { EFFECT_NAMES } from './contracts'
import type {
  BrickDef,
  BrickProgram,
  CopyPlacement,
  Costume,
  EffectName,
  Expr,
  Fields,
  HatOpcode,
  Inputs,
  LevelDesign,
  ListDecl,
  Procedure,
  RotationStyle,
  Script,
  Sound,
  StageBounds,
  Stmt,
  Target,
  Value,
  VariableDecl,
  World,
} from './contracts'
import { seedState } from './rng'
import { wrapDirection } from './motion'

export const DESIGN_LIMITS = {
  maxBricks: 400,
  maxCopies: 2_000,
  maxCostumes: 300,
  maxSounds: 100,
  maxScripts: 2_000,
  maxStatements: 5_000,
  maxProcedures: 200,
  maxVariables: 500,
  maxListItems: 20_000,
  maxName: 80,
  maxProccode: 200,
  maxId: 64,
  maxStringValue: 20_000,
  maxAssetChars: 200_000,
  maxCoord: 10_000_000,
  maxCostumeEdge: 4_096,
  maxMaskPixels: 1_000_000,
  maxSeed: 0x1_0000_0000 - 1,
  maxProblems: 200,
  maxExprDepth: 64,
} as const

/** JSON keys that must never be copied onto an object map. */
export const FORBIDDEN_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype']

const HAT_OPCODES: readonly HatOpcode[] = [
  'event_whenflagclicked',
  'event_whenkeypressed',
  'event_whenthisspriteclicked',
  'event_whenstageclicked',
  'event_whenbroadcastreceived',
  'event_whenbackdropswitchesto',
  'event_whengreaterthan',
  'control_start_as_clone',
]

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/
const OPCODE_RE = /^[a-z][a-z0-9_]{0,63}$/
const FIELD_RE = /^[A-Za-z][A-Za-z0-9_]{0,40}$/

export type DesignProblemCode =
  | 'unknown-brick'
  | 'duplicate-id'
  | 'duplicate-name'
  | 'bad-costume'
  | 'unsafe-name'
  | 'unsafe-id'
  | 'bad-bounds'
  | 'bad-seed'
  | 'bad-stage'
  | 'bad-knob'
  | 'bad-value'
  | 'limit'

export interface DesignProblem {
  code: DesignProblemCode
  path: string
  message: string
}

export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && id.length <= DESIGN_LIMITS.maxId && ID_RE.test(id) && !FORBIDDEN_KEYS.includes(id)
}

/** Kid-facing name: letters, spaces, and other visible characters. No control characters. */
export function isSafeName(name: unknown, max: number = DESIGN_LIMITS.maxName): name is string {
  if (typeof name !== 'string' || name.length < 1 || name.length > max) return false
  if (name !== name.trim()) return false
  if (FORBIDDEN_KEYS.includes(name)) return false
  return !hasControlChar(name)
}

export function validateDesign(design: LevelDesign): DesignProblem[] {
  const problems: DesignProblem[] = []
  const push = (code: DesignProblemCode, path: string, message: string) => {
    if (problems.length >= DESIGN_LIMITS.maxProblems) return
    problems.push({ code, path, message })
  }
  if (!design || typeof design !== 'object') {
    push('bad-value', '', 'Design must be an object.')
    return problems
  }

  checkId(design.id, 'id', push)
  checkName(design.name, 'name', push)
  checkSeed(design.seed, push)
  checkBounds(design.bounds, push)

  const dataIds = new Set<string>()
  if (!design.stage || typeof design.stage !== 'object') {
    push('bad-stage', 'stage', 'Design needs a stage brick.')
  } else {
    if (design.stage.isStage !== true) push('bad-stage', 'stage.isStage', 'The stage brick must be marked isStage.')
    checkBrick(design.stage, 'stage', push, true, dataIds)
  }

  const bricks = Array.isArray(design.bricks) ? design.bricks : null
  if (!bricks) push('bad-value', 'bricks', 'Bricks must be an array.')
  else if (bricks.length > DESIGN_LIMITS.maxBricks) {
    push('limit', 'bricks', `A level can hold ${DESIGN_LIMITS.maxBricks} bricks.`)
  }

  const ids = new Set<string>()
  if (design.stage && typeof design.stage.id === 'string') ids.add(design.stage.id)
  const brickIds = new Set<string>()
  const brickNames = new Map<string, string>()
  if (design.stage && typeof design.stage.name === 'string') brickNames.set(design.stage.name, 'stage')

  if (bricks) {
    bricks.forEach((brick, i) => {
      const path = `bricks[${i}]`
      if (!brick || typeof brick !== 'object') {
        push('bad-value', path, 'A brick must be an object.')
        return
      }
      if (brick.isStage === true) push('bad-stage', `${path}.isStage`, 'Only the stage brick is the stage.')
      checkBrick(brick, path, push, false, dataIds)
      if (typeof brick.id === 'string') {
        if (ids.has(brick.id)) push('duplicate-id', `${path}.id`, `Duplicate id "${brick.id}".`)
        else ids.add(brick.id)
        brickIds.add(brick.id)
      }
      if (typeof brick.name === 'string') {
        const prior = brickNames.get(brick.name)
        if (prior) push('duplicate-name', `${path}.name`, `Duplicate brick name "${brick.name}" (also at ${prior}).`)
        else brickNames.set(brick.name, path)
      }
    })
  }

  const copies = Array.isArray(design.copies) ? design.copies : null
  if (!copies) push('bad-value', 'copies', 'Copies must be an array.')
  else if (copies.length > DESIGN_LIMITS.maxCopies) {
    push('limit', 'copies', `A level can hold ${DESIGN_LIMITS.maxCopies} painted copies.`)
  }

  const copyIds = new Set<string>()
  if (copies) {
    copies.forEach((copy, i) => checkCopy(copy, i, brickIds, ids, copyIds, bricks ?? [], push))
  }

  return problems
}

type Push = (code: DesignProblemCode, path: string, message: string) => void

function checkId(id: unknown, path: string, push: Push) {
  if (!isSafeId(id)) push('unsafe-id', path, 'Id must be 1–64 letters, digits, "_" or "-", and not a reserved key.')
}

function checkName(name: unknown, path: string, push: Push, max: number = DESIGN_LIMITS.maxName) {
  if (!isSafeName(name, max)) push('unsafe-name', path, 'Name is empty, too long, or has control characters or a reserved key.')
}

function checkSeed(seed: unknown, push: Push) {
  if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0 || seed > DESIGN_LIMITS.maxSeed) {
    push('bad-seed', 'seed', 'Seed must be an integer from 0 through 4294967295.')
  }
}

function checkBounds(bounds: StageBounds, push: Push) {
  if (!bounds || typeof bounds !== 'object') {
    push('bad-bounds', 'bounds', 'Bounds must be an object.')
    return
  }
  for (const edge of ['left', 'right', 'bottom', 'top'] as const) {
    const n = bounds[edge]
    if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > DESIGN_LIMITS.maxCoord) {
      push('bad-bounds', `bounds.${edge}`, 'Bound must be a finite coordinate.')
    }
  }
  if (typeof bounds.left === 'number' && typeof bounds.right === 'number' && bounds.left >= bounds.right) {
    push('bad-bounds', 'bounds', 'Left must be less than right.')
  }
  if (typeof bounds.bottom === 'number' && typeof bounds.top === 'number' && bounds.bottom >= bounds.top) {
    push('bad-bounds', 'bounds', 'Bottom must be less than top.')
  }
}

function checkBrick(brick: BrickDef, path: string, push: Push, isStage: boolean, dataIds: Set<string>) {
  checkId(brick.id, `${path}.id`, push)
  checkName(brick.name, `${path}.name`, push)
  if (!Array.isArray(brick.costumes)) push('bad-value', `${path}.costumes`, 'Costumes must be an array.')
  else {
    if (brick.costumes.length > DESIGN_LIMITS.maxCostumes) {
      push('limit', `${path}.costumes`, `A brick can hold ${DESIGN_LIMITS.maxCostumes} costumes.`)
    }
    const names = new Set<string>()
    brick.costumes.forEach((costume, i) => checkCostume(costume, `${path}.costumes[${i}]`, names, push))
  }
  if (!Array.isArray(brick.sounds)) push('bad-value', `${path}.sounds`, 'Sounds must be an array.')
  else {
    if (brick.sounds.length > DESIGN_LIMITS.maxSounds) {
      push('limit', `${path}.sounds`, `A brick can hold ${DESIGN_LIMITS.maxSounds} sounds.`)
    }
    const names = new Set<string>()
    brick.sounds.forEach((sound, i) => checkSound(sound, `${path}.sounds[${i}]`, names, push))
  }
  if (!brick.program || typeof brick.program !== 'object') {
    push('bad-value', `${path}.program`, 'Brick needs a program.')
    return
  }
  checkProgram(brick.program, `${path}.program`, push, isStage, dataIds)
}

function checkCostume(costume: Costume, path: string, names: Set<string>, push: Push) {
  if (!costume || typeof costume !== 'object') {
    push('bad-value', path, 'A costume must be an object.')
    return
  }
  checkName(costume.name, `${path}.name`, push)
  if (typeof costume.name === 'string') {
    if (names.has(costume.name)) push('duplicate-name', `${path}.name`, `Duplicate costume name "${costume.name}".`)
    else names.add(costume.name)
  }
  checkPositiveInt(costume.width, `${path}.width`, 'Costume width', push)
  checkPositiveInt(costume.height, `${path}.height`, 'Costume height', push)
  if (
    typeof costume.width === 'number' &&
    typeof costume.height === 'number' &&
    (costume.width > DESIGN_LIMITS.maxCostumeEdge || costume.height > DESIGN_LIMITS.maxCostumeEdge)
  ) {
    push('limit', path, `Costume edges must be at most ${DESIGN_LIMITS.maxCostumeEdge} pixels.`)
  }
  checkFinite(costume.rotationCenterX, `${path}.rotationCenterX`, 'Rotation center', push)
  checkFinite(costume.rotationCenterY, `${path}.rotationCenterY`, 'Rotation center', push)
  if (costume.opaque !== undefined) checkOpaque(costume.opaque, `${path}.opaque`, push)
  if (costume.mask !== undefined) checkMask(costume, path, push)
  if (costume.asset !== undefined && !isAsset(costume.asset)) {
    push('bad-value', `${path}.asset`, 'Costume asset must be a short asset id or data URL.')
  }
}

function checkOpaque(opaque: NonNullable<Costume['opaque']>, path: string, push: Push) {
  if (!opaque || typeof opaque !== 'object') {
    push('bad-value', path, 'Opaque bounds must be an object.')
    return
  }
  for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
    checkFinite(opaque[edge], `${path}.${edge}`, 'Opaque bound', push)
  }
  if (typeof opaque.left === 'number' && typeof opaque.right === 'number' && opaque.left >= opaque.right) {
    push('bad-value', path, 'Opaque left must be less than right.')
  }
  if (typeof opaque.top === 'number' && typeof opaque.bottom === 'number' && opaque.top >= opaque.bottom) {
    push('bad-value', path, 'Opaque top must be less than bottom.')
  }
}

function checkMask(costume: Costume, path: string, push: Push) {
  const mask = costume.mask
  if (!mask || typeof mask !== 'object') {
    push('bad-value', `${path}.mask`, 'Costume mask must be an object.')
    return
  }
  checkPositiveInt(mask.width, `${path}.mask.width`, 'Mask width', push)
  checkPositiveInt(mask.height, `${path}.mask.height`, 'Mask height', push)
  if (mask.width !== costume.width || mask.height !== costume.height) {
    push('bad-value', `${path}.mask`, 'Mask size must match the costume.')
  }
  const pixels = mask.width * mask.height
  if (!Number.isFinite(pixels) || pixels > DESIGN_LIMITS.maxMaskPixels) {
    push('limit', `${path}.mask`, `A mask can hold ${DESIGN_LIMITS.maxMaskPixels} pixels.`)
    return
  }
  const data = mask.data
  if (!(data instanceof Uint8Array) || data.length !== pixels) {
    push('bad-value', `${path}.mask.data`, 'Mask data length must equal width times height.')
    return
  }
  for (let i = 0; i < data.length; i++) {
    if (data[i] !== 0 && data[i] !== 1) {
      push('bad-value', `${path}.mask.data`, 'Mask bytes must be 0 or 1.')
      return
    }
  }
}

function checkSound(sound: Sound, path: string, names: Set<string>, push: Push) {
  if (!sound || typeof sound !== 'object') {
    push('bad-value', path, 'A sound must be an object.')
    return
  }
  checkName(sound.name, `${path}.name`, push)
  if (typeof sound.name === 'string') {
    if (names.has(sound.name)) push('duplicate-name', `${path}.name`, `Duplicate sound name "${sound.name}".`)
    else names.add(sound.name)
  }
  if (typeof sound.durationMs !== 'number' || !Number.isFinite(sound.durationMs) || sound.durationMs < 0) {
    push('bad-value', `${path}.durationMs`, 'Sound duration must be a finite number of milliseconds, zero or more.')
  }
  if (sound.asset !== undefined && !isAsset(sound.asset)) {
    push('bad-value', `${path}.asset`, 'Sound asset must be a short asset id or data URL.')
  }
}

function isAsset(asset: unknown): boolean {
  return typeof asset === 'string' && asset.length > 0 && asset.length <= DESIGN_LIMITS.maxAssetChars && !hasControlChar(asset)
}

function checkProgram(program: BrickProgram, path: string, push: Push, isStage: boolean, dataIds: Set<string>) {
  if (!Array.isArray(program.variables)) push('bad-value', `${path}.variables`, 'Variables must be an array.')
  else {
    if (program.variables.length > DESIGN_LIMITS.maxVariables) {
      push('limit', `${path}.variables`, `A brick can declare ${DESIGN_LIMITS.maxVariables} variables.`)
    }
    const names = new Set<string>()
    program.variables.forEach((decl, i) => checkVariable(decl, `${path}.variables[${i}]`, dataIds, names, isStage, push))
  }
  if (!Array.isArray(program.lists)) push('bad-value', `${path}.lists`, 'Lists must be an array.')
  else {
    if (program.lists.length > DESIGN_LIMITS.maxVariables) {
      push('limit', `${path}.lists`, `A brick can declare ${DESIGN_LIMITS.maxVariables} lists.`)
    }
    const names = new Set<string>()
    program.lists.forEach((decl, i) => checkList(decl, `${path}.lists[${i}]`, dataIds, names, push))
  }

  let statements = 0
  let limitReported = false
  const countBlock = (subPath: string): boolean => {
    statements++
    if (statements > DESIGN_LIMITS.maxStatements) {
      if (!limitReported) {
        limitReported = true
        push('limit', subPath, `A brick can hold ${DESIGN_LIMITS.maxStatements} blocks.`)
      }
      return true
    }
    return false
  }

  if (!Array.isArray(program.scripts)) push('bad-value', `${path}.scripts`, 'Scripts must be an array.')
  else {
    if (program.scripts.length > DESIGN_LIMITS.maxScripts) {
      push('limit', `${path}.scripts`, `A brick can hold ${DESIGN_LIMITS.maxScripts} scripts.`)
    }
    const scriptIds = new Set<string>()
    program.scripts.forEach((script, i) => {
      checkScript(script, `${path}.scripts[${i}]`, scriptIds, push, countBlock)
    })
  }
  if (!Array.isArray(program.procedures)) push('bad-value', `${path}.procedures`, 'Procedures must be an array.')
  else {
    if (program.procedures.length > DESIGN_LIMITS.maxProcedures) {
      push('limit', `${path}.procedures`, `A brick can hold ${DESIGN_LIMITS.maxProcedures} custom blocks.`)
    }
    const procodes = new Set<string>()
    program.procedures.forEach((proc, i) => {
      checkProcedure(proc, `${path}.procedures[${i}]`, procodes, push, countBlock)
    })
  }
}

function checkVariable(decl: VariableDecl, path: string, scope: Set<string>, names: Set<string>, isStage: boolean, push: Push) {
  if (!decl || typeof decl !== 'object') {
    push('bad-value', path, 'A variable must be an object.')
    return
  }
  checkId(decl.id, `${path}.id`, push)
  checkName(decl.name, `${path}.name`, push)
  if (typeof decl.id === 'string') {
    if (scope.has(decl.id)) push('duplicate-id', `${path}.id`, `Duplicate variable or list id "${decl.id}".`)
    else scope.add(decl.id)
  }
  if (typeof decl.name === 'string') {
    if (names.has(decl.name)) push('duplicate-name', `${path}.name`, `Duplicate variable name "${decl.name}".`)
    else names.add(decl.name)
  }
  if (!isValue(decl.value)) push('bad-value', `${path}.value`, 'Variable value must be a number, string, or boolean.')
  if (decl.showInBuild !== undefined && typeof decl.showInBuild !== 'boolean') {
    push('bad-value', `${path}.showInBuild`, 'showInBuild must be a boolean.')
  }
  if (isStage && decl.showInBuild === true) {
    push('bad-knob', `${path}.showInBuild`, 'Stage variables are globals. They cannot show in Build.')
  }
}

function checkList(decl: ListDecl, path: string, scope: Set<string>, names: Set<string>, push: Push) {
  if (!decl || typeof decl !== 'object') {
    push('bad-value', path, 'A list must be an object.')
    return
  }
  checkId(decl.id, `${path}.id`, push)
  checkName(decl.name, `${path}.name`, push)
  if (typeof decl.id === 'string') {
    if (scope.has(decl.id)) push('duplicate-id', `${path}.id`, `Duplicate variable or list id "${decl.id}".`)
    else scope.add(decl.id)
  }
  if (typeof decl.name === 'string') {
    if (names.has(decl.name)) push('duplicate-name', `${path}.name`, `Duplicate list name "${decl.name}".`)
    else names.add(decl.name)
  }
  if (!Array.isArray(decl.value)) {
    push('bad-value', `${path}.value`, 'List value must be an array.')
    return
  }
  if (decl.value.length > DESIGN_LIMITS.maxListItems) {
    push('limit', `${path}.value`, `A saved list can hold ${DESIGN_LIMITS.maxListItems} items.`)
  }
  decl.value.forEach((item, i) => {
    if (!isValue(item)) push('bad-value', `${path}.value[${i}]`, 'List items must be numbers, strings, or booleans.')
  })
}

function checkScript(script: Script, path: string, ids: Set<string>, push: Push, count: (subPath: string) => boolean) {
  if (!script || typeof script !== 'object') {
    push('bad-value', path, 'A script must be an object.')
    return
  }
  checkId(script.id, `${path}.id`, push)
  if (typeof script.id === 'string') {
    if (ids.has(script.id)) push('duplicate-id', `${path}.id`, `Duplicate script id "${script.id}".`)
    else ids.add(script.id)
  }
  const hat = script.hat
  if (!hat || typeof hat !== 'object') {
    push('bad-value', `${path}.hat`, 'A script needs a hat.')
  } else {
    if (!HAT_OPCODES.includes(hat.opcode as HatOpcode)) {
      push('bad-value', `${path}.hat.opcode`, 'Unknown hat.')
    }
    checkFields(hat.fields, `${path}.hat.fields`, push)
    checkInputs(hat.inputs, `${path}.hat.inputs`, push, count, 0)
  }
  if (!Array.isArray(script.body)) push('bad-value', `${path}.body`, 'Script body must be an array.')
  else script.body.forEach((stmt, i) => checkStmt(stmt, `${path}.body[${i}]`, push, count, 0))
}

function checkProcedure(proc: Procedure, path: string, procodes: Set<string>, push: Push, count: (subPath: string) => boolean) {
  if (!proc || typeof proc !== 'object') {
    push('bad-value', path, 'A procedure must be an object.')
    return
  }
  checkName(proc.proccode, `${path}.proccode`, push, DESIGN_LIMITS.maxProccode)
  if (typeof proc.proccode === 'string') {
    if (procodes.has(proc.proccode)) push('duplicate-id', `${path}.proccode`, `Duplicate custom block "${proc.proccode}".`)
    else procodes.add(proc.proccode)
  }
  if (!Array.isArray(proc.argumentNames)) push('bad-value', `${path}.argumentNames`, 'Argument names must be an array.')
  else {
    const args = new Set<string>()
    proc.argumentNames.forEach((name, i) => {
      checkName(name, `${path}.argumentNames[${i}]`, push)
      if (typeof name === 'string') {
        if (args.has(name)) push('duplicate-name', `${path}.argumentNames[${i}]`, `Duplicate argument "${name}".`)
        else args.add(name)
      }
    })
  }
  if (typeof proc.warp !== 'boolean') push('bad-value', `${path}.warp`, 'Warp must be a boolean.')
  if (!Array.isArray(proc.body)) push('bad-value', `${path}.body`, 'Procedure body must be an array.')
  else proc.body.forEach((stmt, i) => checkStmt(stmt, `${path}.body[${i}]`, push, count, 0))
}

function checkStmt(stmt: Stmt, path: string, push: Push, count: (subPath: string) => boolean, depth: number) {
  if (count(path)) return
  if (!stmt || typeof stmt !== 'object') {
    push('bad-value', path, 'A block must be an object.')
    return
  }
  if (typeof stmt.opcode !== 'string' || !OPCODE_RE.test(stmt.opcode)) {
    push('bad-value', `${path}.opcode`, 'Block opcode is not a safe token.')
  }
  checkFields(stmt.fields, `${path}.fields`, push)
  checkInputs(stmt.inputs, `${path}.inputs`, push, count, depth + 1)
  if (stmt.id !== undefined) checkId(stmt.id, `${path}.id`, push)
  if (stmt.call !== undefined) {
    if (!stmt.call || typeof stmt.call !== 'object' || !isSafeName(stmt.call.proccode, DESIGN_LIMITS.maxProccode)) {
      push('bad-value', `${path}.call`, 'A procedure call needs a safe proccode.')
    }
  }
  if (stmt.branches !== undefined) {
    if (!Array.isArray(stmt.branches) || stmt.branches.length > 4) {
      push('bad-value', `${path}.branches`, 'A block can have at most 4 branches.')
      return
    }
    stmt.branches.forEach((branch, i) => {
      if (!Array.isArray(branch)) {
        push('bad-value', `${path}.branches[${i}]`, 'A branch must be an array of blocks.')
        return
      }
      branch.forEach((child, j) => checkStmt(child, `${path}.branches[${i}][${j}]`, push, count, depth + 1))
    })
  }
}

function checkFields(fields: Fields, path: string, push: Push) {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    push('bad-value', path, 'Fields must be an object.')
    return
  }
  for (const key of Object.keys(fields)) {
    if (!FIELD_RE.test(key) || FORBIDDEN_KEYS.includes(key)) push('unsafe-id', `${path}.${key}`, 'Field name is not a safe token.')
    const value = fields[key]
    if (typeof value !== 'string' || value.length > DESIGN_LIMITS.maxStringValue || hasControlChar(value)) {
      push('bad-value', `${path}.${key}`, 'Field value must be a string without control characters.')
    }
  }
}

function checkInputs(inputs: Inputs, path: string, push: Push, count: (subPath: string) => boolean, depth: number) {
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
    push('bad-value', path, 'Inputs must be an object.')
    return
  }
  for (const key of Object.keys(inputs)) {
    if (!FIELD_RE.test(key) || FORBIDDEN_KEYS.includes(key)) push('unsafe-id', `${path}.${key}`, 'Input name is not a safe token.')
    checkExpr(inputs[key], `${path}.${key}`, push, count, depth)
  }
}

function checkExpr(expr: Expr, path: string, push: Push, count: (subPath: string) => boolean, depth: number) {
  if (depth > DESIGN_LIMITS.maxExprDepth) {
    push('limit', path, `Expression nesting exceeds ${DESIGN_LIMITS.maxExprDepth} levels.`)
    return
  }
  if (!expr || typeof expr !== 'object') {
    push('bad-value', path, 'An input must be a literal, reporter, or parameter.')
    return
  }
  if (expr.kind === 'lit') {
    if (!isValue(expr.value)) push('bad-value', `${path}.value`, 'Literal must be a number, string, or boolean.')
    return
  }
  if (expr.kind === 'param') {
    checkName(expr.name, `${path}.name`, push)
    if (expr.boolean !== undefined && typeof expr.boolean !== 'boolean') {
      push('bad-value', `${path}.boolean`, 'Parameter boolean flag must be a boolean.')
    }
    return
  }
  if (expr.kind === 'block') {
    if (count(path)) return
    if (typeof expr.opcode !== 'string' || !OPCODE_RE.test(expr.opcode)) {
      push('bad-value', `${path}.opcode`, 'Reporter opcode is not a safe token.')
    }
    checkFields(expr.fields, `${path}.fields`, push)
    checkInputs(expr.inputs, `${path}.inputs`, push, count, depth + 1)
    if (expr.id !== undefined) checkId(expr.id, `${path}.id`, push)
    return
  }
  push('bad-value', path, 'Unknown input kind.')
}

function checkCopy(
  copy: CopyPlacement,
  index: number,
  brickIds: Set<string>,
  ids: Set<string>,
  copyIds: Set<string>,
  bricks: BrickDef[],
  push: Push,
) {
  const path = `copies[${index}]`
  if (!copy || typeof copy !== 'object') {
    push('bad-value', path, 'A copy must be an object.')
    return
  }
  checkId(copy.id, `${path}.id`, push)
  if (typeof copy.id === 'string') {
    if (copyIds.has(copy.id) || ids.has(copy.id)) push('duplicate-id', `${path}.id`, `Duplicate id "${copy.id}".`)
    else copyIds.add(copy.id)
  }
  const brick = isSafeId(copy.brickId) ? bricks.find((b) => b && b.id === copy.brickId) : undefined
  if (!isSafeId(copy.brickId)) push('unsafe-id', `${path}.brickId`, 'Brick id must be a safe id.')
  else if (!brick) push('unknown-brick', `${path}.brickId`, `Unknown brick "${copy.brickId}".`)
  checkCoord(copy.x, `${path}.x`, push)
  checkCoord(copy.y, `${path}.y`, push)
  if (copy.direction !== undefined && (typeof copy.direction !== 'number' || !Number.isFinite(copy.direction))) {
    push('bad-value', `${path}.direction`, 'Direction must be a finite number.')
  }
  if (copy.size !== undefined && (typeof copy.size !== 'number' || !Number.isFinite(copy.size))) {
    push('bad-value', `${path}.size`, 'Size must be a finite number.')
  }
  if (copy.visible !== undefined && typeof copy.visible !== 'boolean') {
    push('bad-value', `${path}.visible`, 'Visible must be a boolean.')
  }
  const costumeCount = brick?.costumes?.length ?? 0
  if (copy.costume === undefined) {
    if (brick && costumeCount === 0) push('bad-costume', `${path}.costume`, 'This brick has no costumes.')
  } else if (!Number.isInteger(copy.costume) || copy.costume < 0 || copy.costume >= costumeCount) {
    push('bad-costume', `${path}.costume`, 'Costume index is outside this brick\'s costumes.')
  }
  if (copy.knobs !== undefined) checkKnobs(copy.knobs, brick, `${path}.knobs`, push)
}

function checkKnobs(knobs: Record<string, Value>, brick: BrickDef | undefined, path: string, push: Push) {
  if (!knobs || typeof knobs !== 'object' || Array.isArray(knobs)) {
    push('bad-knob', path, 'Knobs must be an object.')
    return
  }
  const decls = new Map<string, VariableDecl>()
  for (const decl of brick?.program?.variables ?? []) {
    if (decl && typeof decl.id === 'string' && !decls.has(decl.id)) decls.set(decl.id, decl)
  }
  for (const key of Object.keys(knobs)) {
    if (FORBIDDEN_KEYS.includes(key)) {
      push('unsafe-id', `${path}.${key}`, 'Knob id is reserved.')
      continue
    }
    const decl = decls.get(key)
    if (!decl) {
      push('bad-knob', `${path}.${key}`, `No variable "${key}" on this brick.`)
      continue
    }
    if (decl.showInBuild !== true) push('bad-knob', `${path}.${key}`, `Variable "${decl.name}" is not shown in Build.`)
    if (!isValue(knobs[key])) push('bad-value', `${path}.${key}`, 'Knob value must be a number, string, or boolean.')
  }
}

function checkCoord(n: unknown, path: string, push: Push) {
  if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > DESIGN_LIMITS.maxCoord) {
    push('bad-value', path, 'Coordinate must be a finite number inside the level limit.')
  }
}

function checkFinite(n: unknown, path: string, label: string, push: Push) {
  if (typeof n !== 'number' || !Number.isFinite(n)) push('bad-value', path, `${label} must be a finite number.`)
}

function checkPositiveInt(n: unknown, path: string, label: string, push: Push) {
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) push('bad-value', path, `${label} must be a positive integer.`)
}

function isValue(value: unknown): value is Value {
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.length <= DESIGN_LIMITS.maxStringValue && !hasControlChar(value)
  return false
}

function hasControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 32 || c === 127) return true
  }
  return false
}

/**
 * Build a fresh world from the saved design. Does not mutate `design`.
 * Assumes `validateDesign(design)` returned `[]` (or that `save.parse` already ran it).
 * Throws only when the design has no stage, bounds, bricks array, or copies array.
 */
export function instantiate(design: LevelDesign): World {
  if (!design?.stage || !design.bounds || !Array.isArray(design.bricks) || !Array.isArray(design.copies)) {
    throw new Error('instantiate: design is missing stage, bounds, bricks, or copies')
  }

  const stageBrick: BrickDef = structuredClone(design.stage)
  stageBrick.isStage = true

  const bricks: Record<string, BrickDef> = Object.create(null)
  bricks[stageBrick.id] = stageBrick
  for (const brick of design.bricks) {
    const cloned = structuredClone(brick)
    cloned.isStage = false
    bricks[cloned.id] = cloned
  }

  const stageLocals = localsFrom(stageBrick.program, undefined)
  const stage = newTarget({
    id: stageBrick.id,
    brickId: stageBrick.id,
    isStage: true,
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    costumeIndex: 0,
    variables: stageLocals.variables,
    lists: stageLocals.lists,
  })

  const targets = design.copies.map((placement, index) => copyTarget(placement, index, bricks[placement.brickId]))

  let nextTargetId = 1
  const consider = (id: string) => {
    if (!/^[0-9]+$/.test(id)) return
    const n = Number(id)
    if (Number.isSafeInteger(n) && n >= nextTargetId) nextTargetId = n + 1
  }
  consider(stage.id)
  for (const target of targets) consider(target.id)

  return {
    tick: 0,
    timerStartTick: 0,
    bounds: {
      left: finite(design.bounds.left, 0),
      right: finite(design.bounds.right, 0),
      bottom: finite(design.bounds.bottom, 0),
      top: finite(design.bounds.top, 0),
    },
    stage,
    targets,
    bricks,
    keysDown: new Set(),
    mouse: { x: 0, y: 0, down: false },
    answer: '',
    rngState: seedState(typeof design.seed === 'number' ? design.seed : 0),
    cloneCount: 0,
    nextTargetId,
    askQueue: [],
    nextAskId: 1,
    hostClock: null,
  }
}

function copyTarget(placement: CopyPlacement, index: number, brick: BrickDef | undefined): Target {
  const locals = brick ? localsFrom(brick.program, placement.knobs) : { variables: {}, lists: {} }
  const costumeCount = brick?.costumes?.length ?? 0
  const requested = placement.costume
  const costumeIndex =
    typeof requested === 'number' && Number.isInteger(requested) && requested >= 0 && requested < costumeCount ? requested : 0
  const target = newTarget({
    id: typeof placement.id === 'string' ? placement.id : `copy-${index}`,
    brickId: typeof placement.brickId === 'string' ? placement.brickId : '',
    isStage: false,
    x: finite(placement.x, 0),
    y: finite(placement.y, 0),
    direction: typeof placement.direction === 'number' && Number.isFinite(placement.direction) ? wrapDirection(placement.direction) : 90,
    size: typeof placement.size === 'number' && Number.isFinite(placement.size) ? placement.size : 100,
    visible: typeof placement.visible === 'boolean' ? placement.visible : true,
    costumeIndex,
    variables: locals.variables,
    lists: locals.lists,
  })
  target.copyId = target.id
  return target
}

function newTarget(over: {
  id: string
  brickId: string
  isStage: boolean
  x: number
  y: number
  direction: number
  size: number
  visible: boolean
  costumeIndex: number
  variables: Record<string, Value>
  lists: Record<string, Value[]>
}): Target {
  return {
    id: over.id,
    brickId: over.brickId,
    isStage: over.isStage,
    isClone: false,
    x: over.x,
    y: over.y,
    direction: over.direction,
    size: over.size,
    visible: over.visible,
    draggable: false,
    costumeIndex: over.costumeIndex,
    rotationStyle: 'all around' satisfies RotationStyle,
    effects: zeroEffects(),
    volume: 100,
    soundEffects: { pitch: 0, pan: 0 },
    variables: over.variables,
    lists: over.lists,
    bubble: null,
    edgeHatState: {},
  }
}

/**
 * Local declarations become this target's own records. Globals are not copied
 * onto sprites: they live only on the stage, so every copy reads one array (D02).
 * showInBuild knobs replace that copy's starting value and leave the brick default.
 * List arrays are sliced, so copies do not share elements (C11).
 */
function localsFrom(program: BrickProgram, knobs: Record<string, Value> | undefined): { variables: Record<string, Value>; lists: Record<string, Value[]> } {
  const variables: Record<string, Value> = Object.create(null)
  for (const decl of program.variables ?? []) {
    if (!decl || typeof decl.id !== 'string' || Object.hasOwn(variables, decl.id)) continue
    const useKnob = knobs !== undefined && decl.showInBuild === true && Object.hasOwn(knobs, decl.id) && isValue(knobs[decl.id])
    variables[decl.id] = useKnob ? knobs[decl.id] : decl.value
  }
  const lists: Record<string, Value[]> = Object.create(null) as Record<string, Value[]>
  for (const decl of program.lists ?? []) {
    if (!decl || typeof decl.id !== 'string' || Object.hasOwn(lists, decl.id)) continue
    lists[decl.id] = Array.isArray(decl.value) ? decl.value.slice() : []
  }
  return { variables, lists }
}

function zeroEffects(): Record<EffectName, number> {
  const effects = {} as Record<EffectName, number>
  for (const name of EFFECT_NAMES) effects[name] = 0
  return effects
}


function finite(n: unknown, fallback: number): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}
