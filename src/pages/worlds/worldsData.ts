import { BUILD_PLATE_SIZES, DEFAULT_BUILD_PLATE_SIZE, type BuildPlateSize } from '@brick-studio/core'
import { browserClassroomClient, type ClassroomClient } from '../../classroom/client'
import type { ClassroomAuthResult, ClassroomCheckpoint, ClassroomClass, ClassroomWorld } from '../../classroom/contracts'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from '../../brick/localProjectKeys'

/**
 * `/worlds` data contract. The sharing fields come from the flows v2 worker
 * (docs/flows/CONTRACTS-V2.md → "Client"); until W1 lands them on
 * `ClassroomWorld` they are declared here so the page compiles and the fake
 * client below can serve the same shapes.
 */
export type WorldsWorld = ClassroomWorld & {
  visibility?: 'private' | 'class'
  /** What the CALLER may do with this world; an owner is always true. */
  canEdit?: boolean
  /**
   * What the owner let classmates do (`brick_worlds.class_can_edit`). The owner's
   * own `canEdit` cannot answer that, so the card and the share sheet read this;
   * it falls back to `canEdit` for a caller who is not the owner.
   */
  classCanEdit?: boolean
  ownerName?: string
  sharedAt?: string | null
  hiddenByTeacher?: boolean
}

export type WorldsClass = ClassroomClass & {
  studentsCanShare?: boolean
  /** Display name of the class teacher; nullable, so copy falls back to "Your teacher". */
  teacherName?: string | null
}

export type WorldSharing = { visibility: 'private' | 'class'; canEdit: boolean }

/**
 * Everything the page asks of the server. `browserWorldsClient` implements it
 * over the real classroom client; tests and the dev preview pass a fake with
 * the same shapes (W1's `src/classroom/mockClient.ts` drops in here unchanged).
 */
export type WorldsClient = {
  getSession: () => ClassroomAuthResult | null
  subscribe: (listener: () => void) => () => void
  listWorlds: () => Promise<WorldsWorld[]>
  listClasses: () => Promise<WorldsClass[]>
  renameWorld: (id: string, title: string) => Promise<WorldsWorld>
  duplicateWorld: (world: WorldsWorld) => Promise<WorldsWorld>
  listCheckpoints: (id: string) => Promise<ClassroomCheckpoint[]>
  restoreCheckpoint: (id: string, checkpointId: string) => Promise<WorldsWorld>
  setWorldSharing: (id: string, sharing: WorldSharing) => Promise<WorldsWorld>
  setWorldHidden: (id: string, hidden: boolean) => Promise<WorldsWorld>
  copyWorld: (id: string) => Promise<WorldsWorld>
  createSharedWorld: (classId: string, title: string, kind: 'class' | 'group') => Promise<WorldsWorld>
  signOut: () => Promise<void>
}

/** Live client: the same REST calls ClassroomPanel makes, plus the flows v2 sharing routes. */
export function createWorldsClient(client: ClassroomClient = browserClassroomClient): WorldsClient {
  const world = (result: { world: WorldsWorld }) => result.world
  return {
    getSession: client.getSession,
    subscribe: client.subscribe,
    listWorlds: () => client.request<{ worlds: WorldsWorld[] }>('/worlds').then(result => result.worlds),
    listClasses: () => client.request<{ classes: WorldsClass[] }>('/classes').then(result => result.classes),
    renameWorld: (id, title) => client.request<{ world: WorldsWorld }>(`/worlds/${id}`, 'PATCH', { title }).then(world),
    duplicateWorld: async source => {
      const full = await client.request<{ world: WorldsWorld }>(`/worlds/${source.id}`)
      return world(await client.request<{ world: WorldsWorld }>('/worlds', 'POST', { title: `${source.title} copy`, document: full.world.document, kind: 'personal' }))
    },
    listCheckpoints: id => client.request<{ checkpoints: ClassroomCheckpoint[] }>(`/worlds/${id}/checkpoints`).then(result => result.checkpoints),
    restoreCheckpoint: async (id, checkpointId) => {
      const current = await client.request<{ world: WorldsWorld }>(`/worlds/${id}`)
      return world(await client.request<{ world: WorldsWorld }>(`/worlds/${id}/restore`, 'POST', { checkpointId, expectedRevision: current.world.revision }))
    },
    setWorldSharing: (id, sharing) => client.request<{ world: WorldsWorld }>(`/worlds/${id}/sharing`, 'PATCH', sharing).then(world),
    setWorldHidden: (id, hidden) => client.request<{ world: WorldsWorld }>(`/worlds/${id}/visibility`, 'PATCH', { hiddenByTeacher: hidden }).then(world),
    copyWorld: id => client.request<{ world: WorldsWorld }>(`/worlds/${id}/copy`, 'POST').then(world),
    createSharedWorld: (classId, title, kind) => client.request<{ world: WorldsWorld }>('/worlds', 'POST', { title, classId, kind }).then(world),
    signOut: () => client.signOut(),
  }
}

export const browserWorldsClient = createWorldsClient()

// Local draft -------------------------------------------------------------------------------------

export type LocalDraft = { bricks: number; plateSize: BuildPlateSize }

/**
 * Presence-only read of the guest build in this browser, exactly like the
 * landing page: the key is never created, replaced or removed here. A
 * malformed or unreadable value still counts as a draft (there is something to
 * continue) with an unknown brick count.
 */
export function readLocalDraft(storage: Pick<Storage, 'getItem'> = globalThis.localStorage): LocalDraft | null {
  let raw: string | null = null
  try { raw = storage?.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY) ?? null } catch { return null }
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    const record = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {}
    return {
      bricks: Array.isArray(record.bricks) ? record.bricks.length : 0,
      plateSize: BUILD_PLATE_SIZES.find(size => size === record.plateSize) ?? DEFAULT_BUILD_PLATE_SIZE,
    }
  } catch { return { bricks: 0, plateSize: DEFAULT_BUILD_PLATE_SIZE } }
}

// Shared helpers ----------------------------------------------------------------------------------

/** Opening one of your own worlds hands it to the editor (W6 owns `/build?world=`). */
export const buildHref = (world: Pick<WorldsWorld, 'id'>) => `/build?world=${encodeURIComponent(world.id)}`
/**
 * Joining or visiting someone else's world goes through the live room, the way
 * shared worlds are joined today: the room id is the world id without dashes
 * (`LiveWorldPage`), and the Worker's `canEdit` decides viewer or editor there.
 */
export const liveHref = (world: Pick<WorldsWorld, 'id'>) => `/live/${world.id.replaceAll('-', '')}`
export const SAVE_DRAFT_HREF = '/build?classroom=save'
export const CONTINUE_DRAFT_HREF = '/build'
export const signInHref = (next = '/worlds') => `/join?mode=signin&next=${encodeURIComponent(next)}`

export const isMine = (world: WorldsWorld, userId: string) => world.kind === 'personal' && world.ownerId === userId
export const isShared = (world: WorldsWorld) => world.visibility === 'class'
/** True when classmates may build in this world, from the owner's point of view. */
export const sharedForBuilding = (world: WorldsWorld) => world.classCanEdit ?? Boolean(world.canEdit)
export const plateSizeOf = (world: WorldsWorld): BuildPlateSize =>
  BUILD_PLATE_SIZES.find(size => size === world.document?.plateSize) ?? DEFAULT_BUILD_PLATE_SIZE

/** Newest first, the order every list on this page uses. */
export const byNewest = (a: WorldsWorld, b: WorldsWorld) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)

export const matchesSearch = (world: WorldsWorld, search: string) => {
  const needle = search.trim().toLocaleLowerCase()
  if (!needle) return true
  return `${world.title} ${world.ownerName ?? ''}`.toLocaleLowerCase().includes(needle)
}
