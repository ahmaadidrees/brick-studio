/**
 * "+ New brick". In Build it never needs Code (screen/NewBrickSheet.tsx): pick a picture (or draw one), name it, and
 * the new brick is armed in Build, ready to place. In Code's "In this level" it is one step (docs/qa/code-lab-on-main/
 * UX-AUDIT.md): an empty brick named "My brick N" opens in Code with its name selected, and its empty script area
 * offers "Start from…" a brick that works (BRICK_TEMPLATES).
 */
import type { Costume } from '../../core/contracts'
import { createCostumes, createEmptyBrick } from '../starter'
import { nextBrickName, type StudioStore } from '../store'
import type { BrickTemplate } from '../templates'
import type { GridBrickKey } from '../gridBricks'
import { standardTemplate } from './catalog'

/** Counts the bricks made in this project, so each make() gets block ids it has not used before. */
const serials = new WeakMap<StudioStore, number>()
const serial = (store: StudioStore) => {
  const n = (serials.get(store) ?? 0) + 1
  serials.set(store, n)
  return n
}

/** Make "My brick N", open it in Code and return its id. */
export function createNewBrick(store: StudioStore): string {
  const n = serial(store)
  return store.newBrick((_id, name) => {
    const { brick, workspace } = createEmptyBrick(`new_${n}`, name)
    const { id: _ignored, ...rest } = brick
    return { brick: rest, workspace }
  })
}

/** A ready-made picture for a new brick: the starter level's own art and the grid bricks'. */
export interface BrickLook {
  id: string
  /** Shown under the picture, and the new brick's first name ("Blob", then "Blob 2"). */
  name: string
  costume: Costume
}

const STARTER_LOOKS = [['blob', 'Blob', 'walkerCostume'], ['gold', 'Gold', 'coinCostume'], ['coil', 'Coil', 'springCostume'], ['flag', 'Flag', 'goalCostume']] as const
const GRID_LOOKS: ReadonlyArray<[GridBrickKey, string]> = [['brick', 'Brick'], ['hard', 'Stone'], ['qblock', 'Mystery'], ['bounce', 'Bouncy']]

/** The pictures + New brick offers, in order. A grid brick whose art cannot be made is left out. */
export function brickLooks(): BrickLook[] {
  const costumes = createCostumes()
  const looks: BrickLook[] = STARTER_LOOKS.map(([id, name, key]) => ({ id, name, costume: { ...costumes[key], name } }))
  for (const [key, name] of GRID_LOOKS) {
    const costume = standardTemplate(key)?.brick.costumes[0]
    if (costume) looks.push({ id: key, name, costume: { ...costume, name } })
  }
  return looks
}

/** A name no other brick in the level has: "Walker" stays "Walker", or becomes "Walker 2" when that is taken. */
export function freeBrickName(name: string, others: readonly string[]): string {
  const clean = name.trim()
  return nameTaken(clean, others) ? suggestName(clean, others) : clean
}

/**
 * + New brick in Build: an empty brick (the same flag hat as Code's) with these costumes, named "My brick N" for now.
 * It is not armed: `finishNewBrick` names it and arms it. Drawing starts with no costume; the costume editor adds one.
 */
export function startNewBrick(store: StudioStore, costumes: Costume[]): string {
  const n = serial(store)
  const name = nextBrickName(store.getState().project.design.bricks.map((b) => b.name))
  const { brick, workspace } = createEmptyBrick(`new_${n}`, name)
  const { id: _ignored, ...rest } = brick
  const s = store.getState()
  const brush = { brushBrickId: s.brushBrickId, brushTile: s.brushTile }
  const id = store.addBrickFrom({ ...rest, costumes }, workspace)
  // addBrickFrom arms the brick; it is armed once it has its name.
  if (brush.brushTile) store.setTileBrush(brush.brushTile)
  else store.setBrush(brush.brushBrickId)
  store.selectBrick(id)
  return id
}

/** Give the new brick its name (made unique) and arm it in Build, so the next tap places it. Code is never opened. */
export function finishNewBrick(store: StudioStore, brickId: string, typed: string): void {
  const others = store.getState().project.design.bricks.filter((b) => b.id !== brickId).map((b) => b.name)
  const name = freeBrickName(typed, others)
  if (name && name !== store.brick(brickId)?.name) store.renameBrick(brickId, name)
  if (store.getState().mode === 'play' || store.getState().cardTab === 'code') store.setScreen('build')
  store.setBrush(brickId)
  store.selectBrick(brickId)
}

/** Give a brick a template's blocks, costumes and sounds. It keeps its own name. */
export function startBrickFromTemplate(store: StudioStore, brickId: string, template: BrickTemplate) {
  const brick = store.brick(brickId)
  if (!brick) return
  const { brick: made, workspace } = template.make(`${template.id}_${serial(store)}`, brick.name)
  const { id: _ignored, ...rest } = made
  store.startBrickFrom(brickId, { brick: rest, workspace })
}

/** A brick is still fresh (offer "Start from…") while its only script is the empty starter hat. */
export function isFreshBrick(brick: { program: { scripts: ReadonlyArray<{ body: readonly unknown[] }>; procedures: readonly unknown[] } } | undefined): boolean {
  if (!brick) return false
  const { scripts, procedures } = brick.program
  return procedures.length === 0 && scripts.length <= 1 && scripts.every((s) => s.body.length === 0)
}

/** Names already used in the level, for the gentle "there's already a Walker here" hint. */
export function nameTaken(name: string, others: readonly string[]): boolean {
  const n = name.trim().toLowerCase()
  return n.length > 0 && others.some((o) => o.trim().toLowerCase() === n)
}

/** "Walker" → "Walker 2" (the first free number). */
export function suggestName(name: string, others: readonly string[]): string {
  const base = name.trim()
  for (let n = 2; ; n++) if (!nameTaken(`${base} ${n}`, others)) return `${base} ${n}`
}
