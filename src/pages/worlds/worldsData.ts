import { BUILD_PLATE_SIZES, DEFAULT_BUILD_PLATE_SIZE, createBrickStudioDocument, type BuildPlateSize } from '@brick-studio/core'
import { createPlatformerDocument } from '@brick-studio/platformer-core/document'
import { createBlankLevel } from '@brick-studio/platformer-core/engine/level'
import { browserClassroomClient, type ClassroomClient } from '../../classroom/client'
import type { ClassroomAuthResult, ClassroomCheckpoint, ClassroomClass, ClassroomClassmate, ClassroomWorld, ClassroomWorldSharing } from '../../classroom/contracts'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY } from '../../brick/localProjectKeys'

/**
 * `/worlds` data contract: the shared classroom shapes (docs/flows/CONTRACTS-V2.md → "Client"). `visibility` is
 * `private`, `class` (everyone in the owner's class) or `members` (only the classmates in `members`); `canEdit` is
 * what the CALLER may do (an owner is always true) while `classCanEdit` is what the owner let others do.
 */
export type WorldsWorld = ClassroomWorld

export type WorldsClass = ClassroomClass & {
  studentsCanShare?: boolean
  /** Display name of the class teacher; nullable, so copy falls back to "Your teacher". */
  teacherName?: string | null
}

export type WorldSharing = ClassroomWorldSharing
export type Classmate = ClassroomClassmate

/**
 * Everything the page asks of the server. `browserWorldsClient` implements it
 * over the real classroom client; tests and the dev preview pass a fake with
 * the same shapes (W1's `src/classroom/mockClient.ts` drops in here unchanged).
 */
export type WorldsClient = {
  getSession: () => ClassroomAuthResult | null
  subscribe: (listener: () => void) => () => void
  /**
   * Every world the account can open. `{ presence: true }` asks for build-together presence
   * (`GET /worlds?presence=1` → `buildingNow` / `buildingNames` on shared worlds); a server or a
   * mock that does not answer it simply leaves the fields off, so callers must render without them.
   */
  listWorlds: (options?: { presence?: boolean }) => Promise<WorldsWorld[]>
  listClasses: () => Promise<WorldsClass[]>
  /** Active classmates for the invite picker (the caller is not listed). */
  listClassmates: (classId: string) => Promise<Classmate[]>
  renameWorld: (id: string, title: string) => Promise<WorldsWorld>
  duplicateWorld: (world: WorldsWorld) => Promise<WorldsWorld>
  listCheckpoints: (id: string) => Promise<ClassroomCheckpoint[]>
  restoreCheckpoint: (id: string, checkpointId: string) => Promise<WorldsWorld>
  setWorldSharing: (id: string, sharing: WorldSharing) => Promise<WorldsWorld>
  setWorldHidden: (id: string, hidden: boolean) => Promise<WorldsWorld>
  copyWorld: (id: string) => Promise<WorldsWorld>
  /** A class or group world for the teacher: a 3D build (the default) or a 2D level. */
  createSharedWorld: (classId: string, title: string, kind: 'class' | 'group', format?: 'brick' | '2d') => Promise<WorldsWorld>
  signOut: () => Promise<void>
}

/** Live client: the same REST calls ClassroomPanel makes, plus the flows v2 sharing routes. */
export function createWorldsClient(client: ClassroomClient = browserClassroomClient): WorldsClient {
  const world = (result: { world: WorldsWorld }) => result.world
  return {
    getSession: client.getSession,
    subscribe: client.subscribe,
    listWorlds: options => client.request<{ worlds: WorldsWorld[] }>(options?.presence ? '/worlds?presence=1' : '/worlds').then(result => result.worlds),
    listClasses: () => client.request<{ classes: WorldsClass[] }>('/classes').then(result => result.classes),
    listClassmates: classId => client.request<{ classmates: Classmate[] }>(`/classes/${classId}/classmates`).then(result => result.classmates),
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
    createSharedWorld: (classId, title, kind, format = 'brick') => client.request<{ world: WorldsWorld }>('/worlds', 'POST', { title, classId, kind, document: emptyDocument(format, title) }).then(world),
    signOut: () => client.signOut(),
  }
}

/** What a new shared world starts as: an empty plate, or a 2D level with a start, a floor and a flag. */
export function emptyDocument(format: 'brick' | '2d', title: string) {
  return format === '2d' ? createPlatformerDocument(createBlankLevel(160, 27, title.slice(0, 60))) : createBrickStudioDocument([])
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

/** A 2D level (the `/2d` builder and rooms) rather than a 3D brick build. */
export const isLevel2d = (world: Pick<WorldsWorld, 'format'>) => world.format === '2d'
/** Opening one of your own worlds hands it to its editor: the 3D studio (`/build?world=`) or the 2D builder. */
export const buildHref = (world: Pick<WorldsWorld, 'id' | 'format'>) =>
  isLevel2d(world) ? `/2d/build?world=${encodeURIComponent(world.id)}` : `/build?world=${encodeURIComponent(world.id)}`
/**
 * Joining or visiting someone else's world goes through the live room, the way
 * shared worlds are joined today: the room id is the world id without dashes
 * (`LiveWorldPage`, or `/2d/w/` for a 2D level), and the Worker's `canEdit` decides viewer or editor there.
 */
export const liveHref = (world: Pick<WorldsWorld, 'id' | 'format'>) => `${isLevel2d(world) ? '/2d/w' : '/live'}/${world.id.replaceAll('-', '')}`
/** A new 2D level, next to "New build". */
export const NEW_LEVEL_2D_HREF = '/2d/build?new=1'
export const SAVE_DRAFT_HREF = '/build?classroom=save'
export const CONTINUE_DRAFT_HREF = '/build'
export const signInHref = (next = '/worlds') => `/join?mode=signin&next=${encodeURIComponent(next)}`

export const isMine = (world: WorldsWorld, userId: string) => world.kind === 'personal' && world.ownerId === userId
/** Shared with the whole class or with invited classmates: anything a classmate might see. */
export const isShared = (world: WorldsWorld) => world.visibility === 'class' || world.visibility === 'members'
/** Shared with invited classmates only (a quiet invite). */
export const isInviteOnly = (world: WorldsWorld) => world.visibility === 'members'
/** "3 classmates" / "1 classmate" for a members-only world; the owner and the teacher get the list, an invitee only the state. */
export const classmatesLabel = (count: number) => `${count} ${count === 1 ? 'classmate' : 'classmates'}`
/** True when classmates may build in this world, from the owner's point of view. */
export const sharedForBuilding = (world: WorldsWorld) => world.classCanEdit ?? Boolean(world.canEdit)
export const plateSizeOf = (world: WorldsWorld): BuildPlateSize =>
  BUILD_PLATE_SIZES.find(size => size === world.document?.plateSize) ?? DEFAULT_BUILD_PLATE_SIZE

/**
 * "Ava P.", "Ava P. and Ben K.", "Ava P., Ben K. and Chloe M." — the live line under an invite and
 * anywhere else this page reads a handful of classmate names out loud.
 */
export const nameList = (names: string[]) =>
  names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

/** "Finn O." → "FO": the initials on an invite's owner disc. Decorative, so it never has to be perfect. */
export const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0).toLocaleUpperCase()).join('') || '?'

/** How many accounts are in this world's live room right now; 0 when presence was not asked for or could not be read. */
export const buildingCount = (world: WorldsWorld) => world.buildingNow ?? 0

/** Newest first, the order every list on this page uses. */
export const byNewest = (a: WorldsWorld, b: WorldsWorld) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)

export const matchesSearch = (world: WorldsWorld, search: string) => {
  const needle = search.trim().toLocaleLowerCase()
  if (!needle) return true
  return `${world.title} ${world.ownerName ?? ''}`.toLocaleLowerCase().includes(needle)
}
