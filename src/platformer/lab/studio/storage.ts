import { emptyProject, type StudioProject, type StudioStore } from './store'

/** Stub. Owned by the wave 2 "persistence" lane: load the saved project (or the starter project). */
export function loadProject(): StudioProject {
  return emptyProject()
}

/** Stub. Owned by the wave 2 "persistence" lane: save on change. Returns an unsubscribe function. */
export function watchAndSave(_store: StudioStore): () => void {
  return () => {}
}
