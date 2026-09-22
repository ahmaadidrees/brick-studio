import { useSyncExternalStore } from 'react'
import type { BrickInstance } from '../../brick/types'

/**
 * The one thing the shared build scene needs from the robotics layer: which bricks
 * a running nudge is drawing itself. Kept in a tiny module with no other imports so
 * an unflagged studio pays nothing for it.
 */
let hidden: ReadonlySet<string> | null = null
const listeners = new Set<() => void>()

export function setHiddenBrickIds(next: ReadonlySet<string> | null) {
  hidden = next && next.size > 0 ? next : null
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const snapshot = () => hidden

export function useHiddenBrickIds(): ReadonlySet<string> | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** The bricks the studio should draw: everything, minus what a nudge is animating. */
export function useVisibleBricks(bricks: BrickInstance[]): BrickInstance[] {
  const ids = useHiddenBrickIds()
  return ids ? bricks.filter((brick) => !ids.has(brick.id)) : bricks
}
