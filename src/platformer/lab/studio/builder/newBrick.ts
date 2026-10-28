/**
 * "+ New brick" in one step (docs/qa/code-lab-on-main/UX-AUDIT.md): an empty brick named "My brick N" opens in Code
 * with its name selected. Its empty script area offers "Start from…" a brick that works (BRICK_TEMPLATES).
 */
import { createEmptyBrick } from '../starter'
import type { StudioStore } from '../store'
import type { BrickTemplate } from '../templates'

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
