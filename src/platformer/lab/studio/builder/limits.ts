/**
 * One-per-level bricks (STEP6B.md): the Hero and the Goal have `BrickDef.limit = 1`. Placing one when it is already in
 * the level MOVES the existing copy (like Start in the real /2d/build) instead of adding another.
 *
 * The Stage places copies through `store.addCopy`, which is the shared store's and has no idea about limits, so the
 * builder hands the Stage a thin wrapper (`limitedStore`) whose `addCopy` enforces the limit and records the move in the
 * undo history. Nothing else about the store changes.
 */
import type { BrickDef, CopyPlacement, LevelDesign } from '../../core/contracts'
import { DESIGN_LIMITS } from '../../core/project'
import { setStorageNotice } from '../persist/notice'
import type { StudioStore } from '../store'
import { moveCopyEdit, type History } from './history'

/** How many copies this brick may have, or undefined for no limit. */
export function limitOf(brick: Pick<BrickDef, 'limit'> | undefined): number | undefined {
  const n = brick?.limit
  return typeof n === 'number' && n >= 1 ? Math.floor(n) : undefined
}

/** True for bricks with a limit of 1: they have no per-copy knobs, their knobs live in the workshop. */
export function isSingleton(brick: Pick<BrickDef, 'limit'> | undefined): boolean {
  return limitOf(brick) === 1
}

/** The copy a new placement of this brick would move (instead of adding), or undefined when there is room. */
export function copyToMove(design: LevelDesign, brickId: string): CopyPlacement | undefined {
  const brick = design.bricks.find((b) => b.id === brickId)
  const limit = limitOf(brick)
  if (limit === undefined) return undefined
  const existing = design.copies.filter((c) => c.brickId === brickId)
  return existing.length >= limit ? existing[existing.length - 1] : undefined
}

/** What the kid reads when the level already holds as many bricks as a level may keep (DESIGN_LIMITS.maxCopies). */
export const LEVEL_FULL = `This level is full: it holds ${DESIGN_LIMITS.maxCopies.toLocaleString('en-US')} bricks. Erase some to make room for new ones.`

/** True when the level holds as many placed bricks as it may save; one more would make every later save fail. */
export function levelIsFull(design: LevelDesign): boolean {
  return design.copies.length >= DESIGN_LIMITS.maxCopies
}

/**
 * A view of the store for the Stage whose `addCopy` obeys `limit` and the level's brick limit. When the level already holds the limit, it moves the
 * existing copy to the clicked spot, puts that move on the undo history, and returns '' (no new copy was made, so the
 * Stage records nothing more). A level already holding DESIGN_LIMITS.maxCopies bricks takes no more (the save would be
 * refused, and everything after it lost); the kid is told, and '' is returned. Every other member is the real store's.
 */
export function limitedStore(store: StudioStore, history: History): StudioStore {
  const bound = new Map<PropertyKey, unknown>()
  return new Proxy(store, {
    get(target, prop) {
      if (prop === 'addCopy') {
        return (brickId: string, x: number, y: number): string => {
          const design = target.getState().project.design
          const existing = copyToMove(design, brickId)
          if (!existing) {
            if (levelIsFull(design)) {
              setStorageNotice({ id: 'level-full', type: 'info', message: LEVEL_FULL })
              return ''
            }
            return target.addCopy(brickId, x, y)
          }
          if (existing.x !== x || existing.y !== y) {
            history.push(moveCopyEdit(history, existing.id, { x: existing.x, y: existing.y }, { x, y }))
            target.updateCopy(existing.id, { x, y })
          }
          return ''
        }
      }
      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function') return value
      let fn = bound.get(prop)
      if (!fn) {
        fn = (value as (...args: unknown[]) => unknown).bind(target)
        bound.set(prop, fn)
      }
      return fn
    },
  })
}
