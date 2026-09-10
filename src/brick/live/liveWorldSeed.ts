import { parseBrickStudioDocument, serializeBrickStudioDocument, type BrickStudioDocument } from '../brickDocument'
import { loadLocalBrickStudioProject } from '../documentPersistence'

export const LIVE_WORLD_SEED_KEY = 'brick-studio.live-world-seed.v1'

/** Separate from the local project so sharing a cloud world never replaces a guest build. */
export function saveLiveWorldSeed(document: BrickStudioDocument, storage: Storage = window.sessionStorage): void {
  storage.setItem(LIVE_WORLD_SEED_KEY, serializeBrickStudioDocument(document))
}

export function loadLiveWorldSeed(): BrickStudioDocument | null {
  try {
    const raw = window.sessionStorage.getItem(LIVE_WORLD_SEED_KEY)
    if (raw) {
      const parsed = parseBrickStudioDocument(raw)
      if (parsed.ok) return parsed.document
    }
    const local = loadLocalBrickStudioProject(window.localStorage)
    return local.ok ? local.document : null
  } catch {
    return null
  }
}
