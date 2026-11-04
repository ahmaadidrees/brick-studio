/**
 * Building together (docs/qa/hackable-rooms M2): an edit to the room's project travels as a few small operations, so
 * two players building at once never overwrite each other. The room checks who may send which (`kindOf`), applies them
 * to its project (`applyEdit`, which also works out how to put them back) and passes them on; every game applies them
 * at the same tick (`applyEditLive`).
 *
 * - Place, move or remove a copy; paint cells; turn a brick's sliders: **building**.
 * - Change a brick's code, costumes or sounds, or the Stage's: **code**. A brick whose code changes restarts its
 *   running scripts with the new code (owner decision, 2026-11-04); every other brick keeps running.
 * - Add a new brick to the level: building (it changes nothing that is already there).
 *
 * Bricks travel as save-file JSON (core/save.ts brickToWire). A brick's blocks (its Blockly workspace) ride along for
 * the editors; the game never reads them.
 */
import { type BrickDef, type CopyPlacement, type LevelDesign, type Target, type TileLayer } from '../core/contracts'
import { bricksOf, cellTarget, targetForCopy } from '../core/project'
import type { Runtime } from '../core/runtime'
import { brickFromWire, brickToWire } from '../core/save'

export type EditOp =
  /** Add a copy, or change the one with this id. `at`: where it goes in the draw order (undo puts it back there). */
  | { op: 'copy'; copy: CopyPlacement; at?: number }
  | { op: 'uncopy'; id: string }
  /** Paint cells: [col, row, char], '.' empties one. */
  | { op: 'cells'; cells: [number, number, string][] }
  /** Add a brick, or replace the one with its id (the Stage too). `brick` is brickToWire JSON; `ws` its blocks. */
  | { op: 'brick'; brick: unknown; ws?: unknown; at?: number }
  | { op: 'unbrick'; id: string }

/** What an edit needs: building (place, paint, tune) or code. */
export type EditKind = 'build' | 'code'

/** At most this many operations in one edit, and cells in one paint. */
export const MAX_EDIT_OPS = 64
export const MAX_EDIT_CELLS = 4096

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64

/** The shape of an edit from a browser (the room's `checkProject` of the result checks everything else). */
export function isEditOps(ops: unknown): ops is EditOp[] {
  if (!Array.isArray(ops) || ops.length === 0 || ops.length > MAX_EDIT_OPS) return false
  return ops.every((o) => {
    if (!isRecord(o)) return false
    switch (o.op) {
      case 'copy':
        return isRecord(o.copy) && isId(o.copy.id) && isId(o.copy.brickId) && (o.at === undefined || Number.isInteger(o.at))
      case 'uncopy':
      case 'unbrick':
        return isId(o.id)
      case 'cells':
        return Array.isArray(o.cells) && o.cells.length > 0 && o.cells.length <= MAX_EDIT_CELLS
          && o.cells.every((c) => Array.isArray(c) && c.length === 3 && Number.isInteger(c[0]) && Number.isInteger(c[1]) && typeof c[2] === 'string' && c[2].length === 1)
      case 'brick':
        return isRecord(o.brick) && isId(o.brick.id) && (o.ws === undefined || isRecord(o.ws)) && (o.at === undefined || Number.isInteger(o.at))
      default:
        return false
    }
  })
}

// ------------------------------------------------------------------------------------------------ diff

/** Stable JSON for comparing (key order does not matter; masks compare by their bytes). */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a, sortKeys) === JSON.stringify(b, sortKeys)
}
function sortKeys(_k: string, v: unknown): unknown {
  if (v instanceof Uint8Array) return Array.from(v)
  if (!isRecord(v)) return v
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]]))
}

/** The parts of a design an edit can't change (only the host's whole project can). */
function outline(design: LevelDesign): unknown {
  const { bricks: _b, copies: _c, tiles, stage: _s, ...rest } = design
  return { ...rest, tiles: tiles ? { cols: tiles.cols, rows: tiles.rows } : null }
}

/**
 * The operations that turn `before` into `after`. A brick whose blocks changed (`afterWs` against `beforeWs`, by brick
 * id) carries them, even when what they do is the same (blocks moved around). `other` is true when something else
 * changed too (the name, the size of the level): only the host's whole project can carry that.
 */
export function diffDesigns(
  before: LevelDesign,
  after: LevelDesign,
  beforeWs: Record<string, unknown> = {},
  afterWs: Record<string, unknown> = beforeWs,
  /** Blocks that changed while their brick did not: worth sending? (Not when the editor only tidied them.) */
  blocksMatter: (id: string, before: unknown, after: unknown) => boolean = () => true,
): { ops: EditOp[]; other: boolean } {
  const ops: EditOp[] = []
  const other = !same(outline(before), outline(after))
  // Copies, by id.
  const was = new Map(before.copies.map((c) => [c.id, c]))
  const now = new Set(after.copies.map((c) => c.id))
  for (const c of before.copies) if (!now.has(c.id)) ops.push({ op: 'uncopy', id: c.id })
  after.copies.forEach((c, i) => {
    const old = was.get(c.id)
    if (!old) ops.push({ op: 'copy', copy: c, at: i })
    else if (old !== c && !same(old, c)) ops.push({ op: 'copy', copy: c })
  })
  // Cells.
  if (before.tiles && after.tiles && before.tiles !== after.tiles && before.tiles.cols === after.tiles.cols && before.tiles.rows === after.tiles.rows) {
    const cells: [number, number, string][] = []
    for (let r = 0; r < after.tiles.rows; r++) {
      const a = before.tiles.data[r]!, b = after.tiles.data[r]!
      if (a === b) continue
      for (let c = 0; c < after.tiles.cols; c++) if (a[c] !== b[c]) cells.push([c, r, b[c]!])
    }
    for (let i = 0; i < cells.length; i += MAX_EDIT_CELLS) ops.push({ op: 'cells', cells: cells.slice(i, i + MAX_EDIT_CELLS) })
  }
  // Bricks, and the Stage.
  const oldBricks = new Map(before.bricks.map((b) => [b.id, b]))
  const newIds = new Set(after.bricks.map((b) => b.id))
  for (const b of before.bricks) if (!newIds.has(b.id)) ops.push({ op: 'unbrick', id: b.id })
  const wsChanged = (id: string) => afterWs[id] !== undefined && afterWs[id] !== beforeWs[id]
  const brickOp = (b: BrickDef, at?: number): EditOp => ({ op: 'brick', brick: brickToWire(b), ...(wsChanged(b.id) ? { ws: afterWs[b.id] } : {}), ...(at !== undefined ? { at } : {}) })
  after.bricks.forEach((b, i) => {
    const old = oldBricks.get(b.id)
    if (!old) ops.push(brickOp(b, i))
    else if ((old !== b && !same(old, b)) || (wsChanged(b.id) && blocksMatter(b.id, beforeWs[b.id], afterWs[b.id]))) ops.push(brickOp(b))
  })
  const stageId = after.stage.id
  if ((before.stage !== after.stage && !same(before.stage, after.stage)) || (wsChanged(stageId) && blocksMatter(stageId, beforeWs[stageId], afterWs[stageId]))) ops.push(brickOp(after.stage))
  // Removals of bricks go last, after the copies that used them.
  ops.sort((x, y) => Number(x.op === 'unbrick') - Number(y.op === 'unbrick'))
  return { ops, other }
}

// ------------------------------------------------------------------------------------------------ who may

/** A program without its variables' starting values (what sliders turn). */
const untuned = (p: BrickDef['program']) => ({ ...p, variables: p.variables.map(({ value: _v, ...v }) => v) })

/** A brick change that only turns its sliders (its variables' starting values) is tuning, which is building. */
function onlyTuned(old: BrickDef, next: BrickDef): boolean {
  return same({ ...old, program: untuned(old.program) }, { ...next, program: untuned(next.program) })
}

/** Its scripts changed (not just a slider): its running scripts restart. */
const codeChanged = (old: BrickDef, next: BrickDef): boolean => !same(untuned(old.program), untuned(next.program))

/** What one operation needs, against the project as it is now. */
export function kindOf(design: LevelDesign, op: EditOp): EditKind {
  if (op.op === 'unbrick') return 'code'
  if (op.op !== 'brick') return 'build'
  // Blocks are code, even blocks that do the same as before.
  if (op.ws !== undefined) return 'code'
  const next = brickFromWire(op.brick)
  if (!next) return 'code'
  const old = next.id === design.stage.id ? design.stage : design.bricks.find((b) => b.id === next.id)
  if (!old) return next.isStage ? 'code' : 'build'
  return onlyTuned(old, next) ? 'build' : 'code'
}

export function kindOfEdit(design: LevelDesign, ops: readonly EditOp[]): EditKind {
  return ops.some((o) => kindOf(design, o) === 'code') ? 'code' : 'build'
}

// ------------------------------------------------------------------------------------------------ apply

export interface Applied {
  design: LevelDesign
  /** The operations that put it back as it was. */
  undo: EditOp[]
  /** Bricks whose code changed (their running scripts restart). */
  restarted: string[]
  /** A short line for the history and the notices: "placed Coin", "changed Walker's code". */
  summary: string
}

/**
 * Apply an edit to a project. Never changes `design` or anything in it. Throws on an operation that can't apply (a
 * brick that can't be read, cells off the grid). `workspaces`: the blocks kept now, so undo can put them back.
 */
export function applyEdit(design: LevelDesign, ops: readonly EditOp[], workspaces: Record<string, unknown> = {}): Applied {
  let copies = design.copies
  let bricks = design.bricks
  let stage = design.stage
  let tiles = design.tiles
  const undo: EditOp[] = []
  const restarted: string[] = []
  const said: string[] = []
  const nameOf = (id: string) => (id === stage.id ? 'the Stage' : bricks.find((b) => b.id === id)?.name ?? 'a brick')
  for (const op of ops) {
    switch (op.op) {
      case 'copy': {
        const i = copies.findIndex((c) => c.id === op.copy.id)
        copies = [...copies]
        if (i >= 0) {
          const old = copies[i]!
          undo.push({ op: 'copy', copy: old })
          copies[i] = op.copy
          said.push(old.brickId === op.copy.brickId && (old.x !== op.copy.x || old.y !== op.copy.y) ? `moved ${nameOf(op.copy.brickId)}` : `changed ${nameOf(op.copy.brickId)}`)
        } else {
          const at = op.at !== undefined && op.at >= 0 && op.at <= copies.length ? op.at : copies.length
          copies.splice(at, 0, op.copy)
          undo.push({ op: 'uncopy', id: op.copy.id })
          said.push(`placed ${nameOf(op.copy.brickId)}`)
        }
        break
      }
      case 'uncopy': {
        const i = copies.findIndex((c) => c.id === op.id)
        if (i < 0) break
        undo.push({ op: 'copy', copy: copies[i]!, at: i })
        said.push(`removed ${nameOf(copies[i]!.brickId)}`)
        copies = copies.filter((_, j) => j !== i)
        break
      }
      case 'cells': {
        if (!tiles) throw new Error('This level has no grid.')
        const data = [...tiles.data]
        const back: [number, number, string][] = []
        for (const [c, r, ch] of op.cells) {
          if (r < 0 || r >= tiles.rows || c < 0 || c >= tiles.cols) throw new Error('A cell is off the grid.')
          const row = data[r]!
          back.push([c, r, row[c]!])
          data[r] = row.slice(0, c) + ch + row.slice(c + 1)
        }
        tiles = { ...tiles, data }
        undo.push({ op: 'cells', cells: back.reverse() })
        said.push(op.cells.every((x) => x[2] === '.') ? `erased ${op.cells.length === 1 ? 'a cell' : `${op.cells.length} cells`}` : `painted ${op.cells.length === 1 ? 'a cell' : `${op.cells.length} cells`}`)
        break
      }
      case 'brick': {
        const next = brickFromWire(op.brick)
        if (!next) throw new Error('That brick could not be read.')
        const keep = (b: BrickDef): EditOp => ({ op: 'brick', brick: brickToWire(b), ...(workspaces[b.id] !== undefined ? { ws: workspaces[b.id] } : {}) })
        if (next.id === stage.id) {
          undo.push(keep(stage))
          if (codeChanged(stage, next)) restarted.push(next.id)
          said.push(onlyTuned(stage, next) ? 'tuned the Stage' : 'changed the Stage’s code')
          stage = next
          break
        }
        const i = bricks.findIndex((b) => b.id === next.id)
        bricks = [...bricks]
        if (i >= 0) {
          const old = bricks[i]!
          undo.push(keep(old))
          if (codeChanged(old, next)) restarted.push(next.id)
          said.push(
            codeChanged(old, next) ? `changed ${old.name}’s code`
              : old.name !== next.name ? `renamed ${old.name} to ${next.name}`
                : same(old, next) ? `moved ${next.name}’s blocks around`
                  : onlyTuned(old, next) ? `tuned ${next.name}` : `changed ${next.name}’s look`,
          )
          bricks[i] = next
        } else {
          const at = op.at !== undefined && op.at >= 0 && op.at <= bricks.length ? op.at : bricks.length
          bricks.splice(at, 0, next)
          undo.push({ op: 'unbrick', id: next.id })
          said.push(`added ${next.name}`)
        }
        break
      }
      case 'unbrick': {
        const i = bricks.findIndex((b) => b.id === op.id)
        if (i < 0) break
        const old = bricks[i]!
        undo.push({ op: 'brick', brick: brickToWire(old), at: i, ...(workspaces[old.id] !== undefined ? { ws: workspaces[old.id] } : {}) })
        said.push(`removed ${old.name} from the level`)
        bricks = bricks.filter((_, j) => j !== i)
        break
      }
    }
  }
  const summary = [...new Set(said)].slice(0, 2).join(', ') || 'changed the level'
  return { design: { ...design, copies, bricks, stage, ...(tiles ? { tiles } : {}) }, undo: undo.reverse(), restarted, summary }
}

/** The blocks an edit brings, by brick id (for the editors; the game never reads them). */
export function workspacesIn(ops: readonly EditOp[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const op of ops) if (op.op === 'brick' && op.ws !== undefined && isRecord(op.brick) && isId(op.brick.id)) out[op.brick.id] = op.ws
  return out
}

// ------------------------------------------------------------------------------------------------ the game

/** A copy's own target (not a clone, and not a player's Hero: the painted Hero is only where Heroes start). */
const copyTargetIn = (runtime: Runtime, id: string): Target | undefined =>
  runtime.world.targets.find((t) => !t.isClone && t.copyId === id && t.player === undefined)

function dropTarget(runtime: Runtime, target: Target): void {
  const world = runtime.world
  for (const clone of world.targets.filter((t) => t.isClone && t.copyId === target.copyId && t.brickId === target.brickId)) runtime.removeClone(clone)
  runtime.stopTarget(target)
  const i = world.targets.indexOf(target)
  if (i >= 0) world.targets.splice(i, 1)
}

/** A brick's running scripts start again with its new code: its clones go, and its copies start from the green flag. */
function restartBrick(runtime: Runtime, brickId: string): void {
  const world = runtime.world
  const running = !!world.everyTick
  const targets = brickId === world.stage.id ? [world.stage] : world.targets.filter((t) => t.brickId === brickId)
  for (const t of targets) if (t.isClone) runtime.removeClone(t)
  for (const t of targets) {
    if (t.isClone) continue
    runtime.stopTarget(t)
    if (running) runtime.startHats('event_whenflagclicked', { target: t })
  }
}

/** Start a new target the way the green flag started everyone else, if the round is going. */
function startTarget(runtime: Runtime, target: Target): void {
  if (runtime.world.everyTick) runtime.startHats('event_whenflagclicked', { target })
}

/**
 * An edit lands in a running game: copies appear, move or go; painted cells change; a brick whose code changed restarts
 * its scripts. `applied` is `applyEdit` of the game's project. The Heroes (players' copies of the player brick) stay
 * where they are: moving the painted Hero changes where Heroes start next round.
 */
export function applyEditLive(runtime: Runtime, ops: readonly EditOp[], applied: Applied): void {
  const world = runtime.world
  const design = applied.design
  const before = world.bricks
  // Bricks are replaced, never changed in place, so a rewind's copy keeps the ones it had.
  world.bricks = Object.assign(Object.create(null) as typeof world.bricks, world.bricks, bricksOf(design))
  world.design = design
  const brickOf = (id: string) => world.bricks[id]
  for (const op of ops) {
    switch (op.op) {
      case 'copy': {
        const copy = design.copies.find((c) => c.id === op.copy.id)
        if (!copy) break
        const old = copyTargetIn(runtime, copy.id)
        const painted = world.targets.find((t) => !t.isClone && t.copyId === copy.id && t.player !== undefined)
        if (painted) break
        if (old && old.brickId === copy.brickId) {
          const fresh = targetForCopy(copy, brickOf(copy.brickId))
          old.x = fresh.x
          old.y = fresh.y
          old.direction = fresh.direction
          old.size = fresh.size
          old.visible = fresh.visible
          old.costumeIndex = fresh.costumeIndex
          for (const id of Object.keys(copy.knobs ?? {})) if (id in fresh.variables) old.variables[id] = fresh.variables[id]!
          break
        }
        if (old) dropTarget(runtime, old)
        const target = targetForCopy(copy, brickOf(copy.brickId))
        world.targets.push(target)
        startTarget(runtime, target)
        break
      }
      case 'uncopy': {
        const old = copyTargetIn(runtime, op.id)
        if (old) dropTarget(runtime, old)
        break
      }
      case 'cells': {
        const tiles = design.tiles as TileLayer
        world.tiles = tiles
        const byChar = new Map(design.bricks.filter((b) => b.grid).map((b) => [b.grid!.char, b]))
        // Cells sit behind every copy: new ones go after the last cell already there.
        const touched = new Set<string>()
        for (const [c, r] of op.cells) {
          touched.add(`${c}:${r}`)
          if (r > 0) touched.add(`${c}:${r - 1}`)
        }
        const painted = new Set(op.cells.map(([c, r]) => `${c}:${r}`))
        const cellsById = new Map<string, Target>()
        for (const t of world.targets) if (!t.isClone && t.copyId?.startsWith('cell:')) cellsById.set(t.copyId, t)
        const fresh: Target[] = []
        for (const key of touched) {
          const [c, r] = key.split(':').map(Number) as [number, number]
          const old = cellsById.get(`cell:${c}:${r}`)
          const ch = tiles.data[r]?.[c] ?? '.'
          const brick = ch === '.' ? undefined : brickOf(byChar.get(ch)?.id ?? '')
          if (!painted.has(key)) {
            // The cell below a painted one only changes its look (autotile).
            if (old && brick && old.brickId === brick.id) old.costumeIndex = cellTarget(design, brick, tiles, c, r).costumeIndex
            continue
          }
          if (old) dropTarget(runtime, old)
          if (brick) fresh.push(cellTarget(design, brick, tiles, c, r))
        }
        if (fresh.length) {
          let at = 0
          world.targets.forEach((t, i) => { if (!t.isClone && t.copyId?.startsWith('cell:')) at = i + 1 })
          world.targets.splice(at, 0, ...fresh)
          for (const t of fresh) startTarget(runtime, t)
        }
        break
      }
      case 'brick': {
        // A slider turned on a brick (a variable's starting value) takes effect at once, as it does in Play alone.
        const id = (op.brick as { id?: string }).id
        const old = id ? before[id] : undefined
        const next = id ? world.bricks[id] : undefined
        if (!old || !next || applied.restarted.includes(next.id)) break
        const changed = next.program.variables.filter((v) => !same(old.program.variables.find((o) => o.id === v.id)?.value, v.value))
        if (!changed.length) break
        const targets = next.id === world.stage.brickId ? [world.stage] : world.targets.filter((t) => t.brickId === next.id)
        for (const t of targets) for (const v of changed) if (v.id in t.variables) t.variables[v.id] = v.value
        break
      }
      case 'unbrick':
        break
    }
  }
  for (const id of applied.restarted) restartBrick(runtime, id)
  runtime.syncThreadsToWorld()
}
