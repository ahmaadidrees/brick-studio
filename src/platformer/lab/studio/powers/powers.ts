/**
 * Power bricks (docs/qa/code-lab-layers): a few scripts someone made, with their own variables and a credit line, that
 * snap onto any brick they fit. Snapping copies the scripts in with fresh block ids, gives the power's variables ids of
 * their own (and a new name when one clashes), and records on the brick which blocks and variables came from which
 * power. Taking it off removes exactly those. Everything here is pure: it takes a project and returns a new one.
 */
import type { BrickDef, SnappedPower, VariableDecl } from '../../core/contracts'
import { Blocks, type BlockJson } from '../blockBuilder'
import { STAGE_ID, type StudioProject } from '../store'

export const POWER_FILE_KIND = 'brickgineers-power'

/** A power's own variable or list. */
export interface PowerVariable {
  id: string
  name: string
  value: VariableDecl['value'] | VariableDecl['value'][]
  /** A list instead of a variable. */
  list?: boolean
  /** Shown as a slider in Build. */
  showInBuild?: boolean
}

export interface PowerBrick {
  kind: typeof POWER_FILE_KIND
  version: 1
  id: string
  name: string
  /** Who made it, then who remixed it, oldest first. */
  credits: string[]
  /** One line: what it lets a brick do. */
  what: string
  /** "brick": any brick but the Stage. "stage": only the Stage (rules for the whole level). */
  fits: 'brick' | 'stage'
  /** Top-level blocks: scripts (hats and their stacks) and My Block definitions, as Blockly saves them. */
  blocks: BlockJson[]
  variables: PowerVariable[]
}

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

// ------------------------------------------------------------------------------------------------ workspace helpers

interface WorkspaceShape {
  blocks?: { languageVersion?: unknown; blocks?: unknown[] }
  variables?: Array<{ id: string; name: string; type?: string }>
  [key: string]: unknown
}

function workspaceOf(project: StudioProject, brickId: string): WorkspaceShape {
  const raw = project.workspaces[brickId]
  const ws = typeof raw === 'string' ? JSON.parse(raw) : raw
  return isRecord(ws) ? (structuredClone(ws) as WorkspaceShape) : { blocks: { languageVersion: 0, blocks: [] }, variables: [] }
}

function topBlocks(ws: WorkspaceShape): Json[] {
  if (!ws.blocks) ws.blocks = { languageVersion: 0, blocks: [] }
  if (!Array.isArray(ws.blocks.blocks)) ws.blocks.blocks = []
  return ws.blocks.blocks as Json[]
}

/** A variable field is a plain id (our builders) or `{ id }` (Blockly's own save). */
function fieldId(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (isRecord(value) && typeof value.id === 'string') return value.id
  return undefined
}

const VARIABLE_FIELDS = ['VARIABLE', 'LIST']

/** Every variable or list id a stack of blocks refers to. */
function referencedVariables(block: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(block)) {
    for (const b of block) referencedVariables(b, out)
    return out
  }
  if (!isRecord(block)) return out
  if (isRecord(block.fields)) for (const k of VARIABLE_FIELDS) { const id = fieldId(block.fields[k]); if (id) out.add(id) }
  for (const v of Object.values(block)) if (isRecord(v) || Array.isArray(v)) referencedVariables(v, out)
  return out
}

/** A deep copy with every block id replaced by a fresh one, and variable references renamed through `vars`. */
function remap(block: unknown, nextId: () => string, vars: Map<string, string>): unknown {
  if (Array.isArray(block)) return block.map((b) => remap(b, nextId, vars))
  if (!isRecord(block)) return block
  const out: Json = {}
  for (const [k, v] of Object.entries(block)) {
    if (k === 'id' && typeof v === 'string' && typeof block.type === 'string') out.id = nextId()
    else if (k === 'fields' && isRecord(v)) {
      const fields: Json = {}
      for (const [fk, fv] of Object.entries(v)) {
        const id = VARIABLE_FIELDS.includes(fk) ? fieldId(fv) : undefined
        fields[fk] = id && vars.has(id) ? (typeof fv === 'string' ? vars.get(id) : { ...(fv as Json), id: vars.get(id) }) : fv
      }
      out.fields = fields
    } else out[k] = remap(v, nextId, vars)
  }
  return out
}

const proccodeOf = (b: Json): string | undefined =>
  b.type === 'procedures_definition' && isRecord(b.extraState) && typeof b.extraState.proccode === 'string' ? b.extraState.proccode : undefined

// ------------------------------------------------------------------------------------------------ fitting

export function fits(power: PowerBrick, brick: BrickDef): boolean {
  return power.fits === 'stage' ? brick.id === STAGE_ID || !!brick.isStage : brick.id !== STAGE_ID && !brick.isStage && !brick.grid
}

export function whyNot(power: PowerBrick, brick: BrickDef): string | null {
  if (fits(power, brick)) return null
  if (power.fits === 'stage') return `${power.name} changes the whole level, so it snaps onto the Stage.`
  if (brick.grid) return `${brick.name} is painted on the grid; powers snap onto bricks you place.`
  return `${power.name} snaps onto a brick, not the Stage.`
}

// ------------------------------------------------------------------------------------------------ snap on, take off

const brickOf = (project: StudioProject, brickId: string): BrickDef | undefined =>
  brickId === STAGE_ID ? project.design.stage : project.design.bricks.find((b) => b.id === brickId)

function withBrick(project: StudioProject, brickId: string, fn: (b: BrickDef) => BrickDef, workspace: WorkspaceShape): StudioProject {
  const d = project.design
  const design = brickId === STAGE_ID ? { ...d, stage: fn(d.stage) } : { ...d, bricks: d.bricks.map((b) => (b.id === brickId ? fn(b) : b)) }
  return { design, workspaces: { ...project.workspaces, [brickId]: workspace } }
}

/**
 * Snap `power` onto a brick. Returns the new project (its workspace and declarations updated, not yet compiled: the
 * store compiles it with setWorkspace) and the snap record. The power's scripts go to the right of the brick's own.
 */
export function snapPower(project: StudioProject, brickId: string, power: PowerBrick): { project: StudioProject; snap: SnappedPower } {
  const brick = brickOf(project, brickId)
  if (!brick) throw new Error(`No brick ${brickId}`)
  const taken = new Set((brick.powers ?? []).map((p) => p.id))
  let n = 1
  while (taken.has(`pw${n}`)) n++
  const snapId = `pw${n}`
  const ws = workspaceOf(project, brickId)
  const tops = topBlocks(ws)

  // The power's variables get ids of their own; a name already in the brick gets the power's name after it.
  const names = new Set([...brick.program.variables, ...brick.program.lists].map((v) => v.name.toLowerCase()))
  const vars = new Map<string, string>()
  const declared: PowerVariable[] = []
  for (const v of power.variables) {
    const id = `${snapId}_${v.id}`.slice(0, 60)
    let name = v.name
    if (names.has(name.toLowerCase())) name = `${v.name} (${power.name})`
    for (let m = 2; names.has(name.toLowerCase()); m++) name = `${v.name} (${power.name} ${m})`
    names.add(name.toLowerCase())
    vars.set(v.id, id)
    declared.push({ ...v, id, name })
  }

  // Fresh block ids, unique in this brick; a My Block name already in the brick gets a number.
  const ids = new Set<string>()
  const collect = (b: unknown): void => {
    if (Array.isArray(b)) return b.forEach(collect)
    if (!isRecord(b)) return
    if (typeof b.id === 'string') ids.add(b.id)
    Object.values(b).forEach(collect)
  }
  collect(tops)
  let k = 0
  const nextId = () => {
    let id: string
    do id = `${snapId}_${++k}`
    while (ids.has(id))
    ids.add(id)
    return id
  }
  const procs = new Set(tops.map(proccodeOf).filter((p): p is string => !!p))
  const renamedProcs = new Map<string, string>()
  for (const b of power.blocks) {
    const code = proccodeOf(b)
    if (!code || !procs.has(code)) continue
    let m = 2
    while (procs.has(`${code} ${m}`)) m++
    renamedProcs.set(code, `${code} ${m}`)
    procs.add(`${code} ${m}`)
  }
  const renameProcs = (b: unknown): unknown => {
    if (Array.isArray(b)) return b.map(renameProcs)
    if (!isRecord(b)) return b
    const out: Json = {}
    for (const [key, v] of Object.entries(b)) out[key] = key === 'extraState' && isRecord(v) && typeof v.proccode === 'string' && renamedProcs.has(v.proccode) ? { ...v, proccode: renamedProcs.get(v.proccode) } : renameProcs(v)
    return out
  }

  const right = tops.reduce((m, b) => Math.max(m, typeof b.x === 'number' ? b.x : 0), 0) + 700
  let y = 20
  const added = power.blocks.map((b) => {
    const copy = renameProcs(remap(b, nextId, vars)) as Json
    copy.x = right
    copy.y = y
    y += 400
    return copy
  })
  ws.blocks!.blocks = [...tops, ...added]
  ws.variables = [...(ws.variables ?? []), ...declared.map((v) => ({ id: v.id, name: v.name, type: v.list ? 'list' : '' }))]

  const snap: SnappedPower = { id: snapId, name: power.name, credits: [...power.credits], blockIds: added.map((b) => b.id as string), variableIds: declared.map((v) => v.id) }
  const next = withBrick(project, brickId, (b) => ({
    ...b,
    powers: [...(b.powers ?? []), snap],
    program: {
      ...b.program,
      variables: [...b.program.variables, ...declared.filter((v) => !v.list).map((v): VariableDecl => ({ id: v.id, name: v.name, value: Array.isArray(v.value) ? 0 : v.value, ...(v.showInBuild ? { showInBuild: true } : {}) }))],
      lists: [...b.program.lists, ...declared.filter((v) => v.list).map((v) => ({ id: v.id, name: v.name, value: Array.isArray(v.value) ? v.value : [] }))],
    },
  }), ws)
  return { project: next, snap }
}

/** Take a snapped power off: its blocks and variables go, nothing else changes. */
export function takeOffPower(project: StudioProject, brickId: string, snapId: string): StudioProject {
  const brick = brickOf(project, brickId)
  const snap = brick?.powers?.find((p) => p.id === snapId)
  if (!brick || !snap) return project
  const ws = workspaceOf(project, brickId)
  const drop = new Set(snap.blockIds)
  ws.blocks!.blocks = topBlocks(ws).filter((b) => !drop.has(b.id as string))
  // A variable the kid has since used in the brick's own scripts stays.
  const stillUsed = referencedVariables(ws.blocks!.blocks)
  const gone = new Set(snap.variableIds.filter((id) => !stillUsed.has(id)))
  ws.variables = (ws.variables ?? []).filter((v) => !gone.has(v.id))
  return withBrick(project, brickId, (b) => ({
    ...b,
    powers: (b.powers ?? []).filter((p) => p.id !== snapId),
    program: { ...b.program, variables: b.program.variables.filter((v) => !gone.has(v.id)), lists: b.program.lists.filter((v) => !gone.has(v.id)) },
  }), ws)
}

/** Is any of the power's scripts on? */
export function isPowerOn(project: StudioProject, brickId: string, snapId: string): boolean {
  const snap = brickOf(project, brickId)?.powers?.find((p) => p.id === snapId)
  if (!snap) return false
  const ids = new Set(snap.blockIds)
  return topBlocks(workspaceOf(project, brickId)).some((b) => ids.has(b.id as string) && !turnedOff(b))
}

const turnedOff = (b: Json): boolean => b.enabled === false || (Array.isArray(b.disabledReasons) && b.disabledReasons.length > 0)

/** Turn all of a power's scripts on or off (Blockly's own disabled state, which the compiler skips). */
export function setPowerOn(project: StudioProject, brickId: string, snapId: string, on: boolean): StudioProject {
  const brick = brickOf(project, brickId)
  const snap = brick?.powers?.find((p) => p.id === snapId)
  if (!brick || !snap) return project
  const ws = workspaceOf(project, brickId)
  const ids = new Set(snap.blockIds)
  for (const b of topBlocks(ws)) {
    if (!ids.has(b.id as string) || typeof b.type !== 'string' || b.type === 'procedures_definition') continue
    delete b.enabled
    if (on) delete b.disabledReasons
    else b.disabledReasons = ['MANUALLY_DISABLED']
  }
  return { ...project, workspaces: { ...project.workspaces, [brickId]: ws } }
}

// ------------------------------------------------------------------------------------------------ making a power

/**
 * Make a power from some of a brick's top-level scripts (and the My Block definitions they call). The variables they
 * use come along as the power's own, with the brick's current values. A brick's own powers keep their credits: making a
 * power from scripts that came from Ana's power credits Ana first.
 */
export function makePower(project: StudioProject, brickId: string, opts: { name: string; by: string; what: string; blockIds: string[] }): PowerBrick {
  const brick = brickOf(project, brickId)
  if (!brick) throw new Error(`No brick ${brickId}`)
  const tops = topBlocks(workspaceOf(project, brickId))
  const chosen = new Set(opts.blockIds)
  const picked = tops.filter((b) => chosen.has(b.id as string))
  // My Blocks the picked scripts call come too, and the My Blocks those call, all the way down. Each definition comes
  // once, so My Blocks that call each other cannot loop here.
  const definitions = new Map<string, Json>()
  for (const b of tops) {
    const code = proccodeOf(b)
    if (code && !definitions.has(code)) definitions.set(code, b)
  }
  const pickedIds = new Set(picked.map((b) => b.id))
  const followed = new Set<string>()
  const follow = (b: unknown): void => {
    if (Array.isArray(b)) return b.forEach(follow)
    if (!isRecord(b)) return
    const code = b.type === 'procedures_call' && isRecord(b.extraState) ? b.extraState.proccode : undefined
    if (typeof code === 'string' && !followed.has(code)) {
      followed.add(code)
      const definition = definitions.get(code)
      if (definition) {
        if (!pickedIds.has(definition.id)) {
          pickedIds.add(definition.id)
          picked.push(definition)
        }
        follow(definition)
      }
    }
    Object.values(b).forEach(follow)
  }
  follow([...picked])
  const used = referencedVariables(picked)
  const variables: PowerVariable[] = [
    ...brick.program.variables.filter((v) => used.has(v.id)).map((v) => ({ id: v.id, name: v.name, value: v.value, ...(v.showInBuild ? { showInBuild: true } : {}) })),
    ...brick.program.lists.filter((v) => used.has(v.id)).map((v) => ({ id: v.id, name: v.name, value: v.value, list: true })),
  ]
  // Credit every power whose blocks come along, including My Blocks it brought that the picked scripts call.
  const fromPowers = (brick.powers ?? []).filter((p) => p.blockIds.some((id) => pickedIds.has(id)))
  const credits = [...new Set([...fromPowers.flatMap((p) => p.credits), opts.by.trim() || 'someone'])]
  const blocks = picked.map((b) => {
    const { x: _x, y: _y, ...rest } = structuredClone(b)
    return rest as BlockJson
  })
  return {
    kind: POWER_FILE_KIND,
    version: 1,
    id: `${slug(opts.name)}-${Date.now().toString(36)}`,
    name: opts.name.trim() || 'My power',
    credits,
    what: opts.what.trim(),
    fits: brickId === STAGE_ID ? 'stage' : 'brick',
    blocks,
    variables,
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'power'

// ------------------------------------------------------------------------------------------------ files

export function powerToFile(power: PowerBrick): string {
  return JSON.stringify(power, null, 2)
}

/** Read a power file. Returns null for anything that is not one (kids open all sorts of files). */
export function powerFromFile(text: string): PowerBrick | null {
  let v: unknown
  try { v = JSON.parse(text) } catch { return null }
  if (!isRecord(v) || v.kind !== POWER_FILE_KIND || v.version !== 1) return null
  if (typeof v.name !== 'string' || !v.name.trim() || !Array.isArray(v.blocks) || !Array.isArray(v.variables) || !Array.isArray(v.credits)) return null
  if (v.fits !== 'brick' && v.fits !== 'stage') return null
  if (!v.blocks.every((b) => isRecord(b) && typeof b.type === 'string')) return null
  if (!v.variables.every((x) => isRecord(x) && typeof x.id === 'string' && typeof x.name === 'string')) return null
  return {
    kind: POWER_FILE_KIND,
    version: 1,
    id: typeof v.id === 'string' ? v.id : slug(v.name),
    name: v.name.trim().slice(0, 40),
    credits: v.credits.filter((c): c is string => typeof c === 'string').map((c) => c.slice(0, 40)),
    what: typeof v.what === 'string' ? v.what.slice(0, 200) : '',
    fits: v.fits,
    blocks: v.blocks as BlockJson[],
    variables: v.variables as PowerVariable[],
  }
}

// ------------------------------------------------------------------------------------------------ built-in powers

/**
 * Powers that come with Code Lab, so snapping is there to try before anyone has shared one. They only use their own
 * variables and the Platformer blocks, so they fit any brick that moves: the Hero, or a Walker for a hopping enemy.
 */
export function builtInPowers(): PowerBrick[] {
  return [doubleJump(), dash(), hop()]
}

function doubleJump(): PowerBrick {
  const b = new Blocks('dj')
  const keyDown = (key: string) => ({ block: b.blk('sensing_keypressed', { fields: { KEY_OPTION: key } }) })
  const and = (x: unknown, y: unknown) => ({ block: b.blk('operator_and', { inputs: { OPERAND1: x, OPERAND2: y } }) })
  // "in the air" is remembered from the last tick: on the tick I jump off the ground, this press is the first jump.
  const tick = b.script('Double jump: press space again in the air to jump a second time', b.blk('platformer_everytick'), [
    b.either(keyDown('space'), [
      b.when(and(and(b.eq(b.v('was_down'), 0), b.eq(b.v('in_air'), 1)), b.gt(b.v('left'), 0)), [b.setSpeed('y', b.v('power')), b.change('left', -1)]),
      b.set('was_down', 1),
    ], [b.set('was_down', 0)]),
    b.either({ block: b.blk('platformer_onground') }, [b.set('in_air', 0)], [b.set('in_air', 1)]),
  ])
  const land = b.script('Double jump: get it back when I land', b.blk('platformer_whenland'), [b.set('left', 1)])
  return builtIn('double-jump', 'Double jump', 'Press space again in the air to jump a second time.', [tick, land], [
    { id: 'left', name: 'jumps left', value: 1 },
    { id: 'was_down', name: 'space was down', value: 1 },
    { id: 'in_air', name: 'was in the air', value: 0 },
    { id: 'power', name: 'second jump power', value: 9, showInBuild: true },
  ])
}

function dash(): PowerBrick {
  const b = new Blocks('dash')
  const keyDown = (key: string) => ({ block: b.blk('sensing_keypressed', { fields: { KEY_OPTION: key } }) })
  const and = (x: unknown, y: unknown) => ({ block: b.blk('operator_and', { inputs: { OPERAND1: x, OPERAND2: y } }) })
  const facing = { block: b.blk('motion_direction') }
  const tick = b.script('Dash: press z for a quick burst of speed the way I face, then wait a moment', b.blk('platformer_everytick'), [
    b.when(b.gt(b.v('wait'), 0), [b.change('wait', -1)]),
    b.when(and(keyDown('z'), b.eq(b.v('wait'), 0)), [b.setSpeed('x', b.mul(b.v('speed'), { block: b.blk('operator_divide', { inputs: { NUM1: facing, NUM2: b.num(90) } }) })), b.set('wait', b.v('cooldown'))]),
  ])
  return builtIn('dash', 'Dash', 'Press z for a quick burst of speed, then wait a moment before the next one.', [tick], [
    { id: 'wait', name: 'dash wait', value: 0 },
    { id: 'speed', name: 'dash speed', value: 14, showInBuild: true },
    { id: 'cooldown', name: 'dash cooldown ticks', value: 20 },
  ])
}

function hop(): PowerBrick {
  const b = new Blocks('hop')
  const tick = b.script('Hop: every so often, jump while standing on something', b.blk('platformer_everytick'), [
    b.change('count', 1),
    b.when(b.gt(b.v('count'), b.v('every')), [b.set('count', 0), b.when({ block: b.blk('platformer_onground') }, [b.setSpeed('y', b.v('height'))])]),
  ])
  return builtIn('hop', 'Hop', 'Every so often, jump. Snap it onto a Walker for a hopping enemy.', [tick], [
    { id: 'count', name: 'hop count', value: 0 },
    { id: 'every', name: 'hop every ticks', value: 45 },
    { id: 'height', name: 'hop height', value: 8, showInBuild: true },
  ])
}

function builtIn(id: string, name: string, what: string, blocks: BlockJson[], variables: PowerVariable[]): PowerBrick {
  const strip = (b: BlockJson) => {
    const { x: _x, y: _y, ...rest } = b
    return rest as BlockJson
  }
  return { kind: POWER_FILE_KIND, version: 1, id, name, credits: ['Brickgineers'], what, fits: 'brick', blocks: blocks.map(strip), variables }
}
