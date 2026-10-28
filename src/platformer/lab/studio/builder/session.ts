import type { Camera } from '../stage/camera'
import type { StudioStore } from '../store'
import { History } from './history'

/**
 * What the builder remembers while the workshop is open (StudioApp swaps the builder out and back): undo history, the
 * Erase tool, the drawer, and where the camera was. One per store, so "Done" returns to exactly where the kid was.
 */
export interface BuilderSession {
  history: History
  erasing: boolean
  drawerOpen: boolean
  camera: Camera | null
  /** The kid moved or zoomed the view, so it is not auto-fitted. */
  viewDirty: boolean
}

const sessions = new WeakMap<StudioStore, BuilderSession>()

export function builderSession(store: StudioStore): BuilderSession {
  let s = sessions.get(store)
  if (!s) {
    s = { history: new History(store), erasing: false, drawerOpen: true, camera: null, viewDirty: false }
    sessions.set(store, s)
  }
  return s
}
