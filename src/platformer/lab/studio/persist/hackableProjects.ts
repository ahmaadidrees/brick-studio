import { isKitId, type KitId } from '../../core/contracts'

/*
 * Hackable projects (Hackable Platformer, the kid-facing name for Code Lab, and Hackable Racing): many per browser,
 * and the same project as an account world. Each entry remembers its kit, so My projects names the game and links to
 * its address without opening the save; an entry with no kit is a Platformer (every entry made before kits). In this browser an index lists them and each keeps its save under its own key. The first project is
 * the one Code Lab always kept (CODE_LAB_STORAGE_KEY), so older saves become "project 1" without being moved. In an
 * account a project is a world whose document wraps the same save envelope ({ format: HACKABLE_FORMAT, save }).
 *
 * This module never parses a save, so My projects can list and move projects without loading the game; opening one
 * (hackableSave.ts) does the full check.
 */

export const HACKABLE_FORMAT = 'brickgineers-hackable'
export const HACKABLE_INDEX_KEY = 'code-lab.projects.v1'
/** The one project Code Lab kept before there were many; it stays at this key as the project LEGACY_ID. */
export const LEGACY_KEY = 'code-lab.project.v1'
export const LEGACY_ID = 'main'
export const MAX_HACKABLE_PROJECTS = 30
export const NEW_PROJECT_NAME = 'My platformer'
/** A new project's name in each kit (kitScreens `copy.projectName`; hackableProjects.test.ts checks they agree). */
export const newProjectName = (kit: KitId = 'platformer'): string => (kit === 'race' ? 'My race track' : NEW_PROJECT_NAME)
/** What an account world can hold (the worlds table's own limit). */
export const ACCOUNT_DOCUMENT_MAX_BYTES = 2_000_000
/** The biggest save text the game opens (core/save.ts MAX_SAVE_BYTES, counted in characters; projectIo.test.ts checks they agree). */
export const HACKABLE_SAVE_MAX_CHARS = 5 * 1024 * 1024
/** The biggest Hackable project file read: its save plus a `.brickgineers` wrapper around it. */
export const HACKABLE_FILE_MAX_CHARS = HACKABLE_SAVE_MAX_CHARS + 64 * 1024

export interface HackableEntry {
  id: string
  title: string
  /** Last saved, ms since 1970. */
  updated: number
  /** A small picture of the level (a JPEG data URL), when the studio has taken one. */
  picture?: string
  /**
   * Kept here because the account did not answer when it was first saved: the account world it becomes, made with
   * this id (so trying again never makes a second copy), for the account that made it.
   */
  pendingWorld?: PendingWorld
  /** Which Hackable game it is. Missing means the Platformer, so entries made before kits read unchanged. */
  kit?: Exclude<KitId, 'platformer'>
}

/** An entry's kit: missing is the Platformer. */
export const entryKit = (entry: Pick<HackableEntry, 'kit'>): KitId => entry.kit ?? 'platformer'

export interface PendingWorld {
  /** The account world id chosen on this computer (a UUID). */
  id: string
  /** The account the project belongs to. */
  owner: string
}

export interface HackableDocument {
  format: typeof HACKABLE_FORMAT
  version: 1
  save: unknown
}

export const projectKey = (id: string) => (id === LEGACY_ID ? LEGACY_KEY : `${LEGACY_KEY}:${id}`)

/** All this module needs of localStorage (tests pass a stand-in). With `key` and `length` the list can be rebuilt. */
export type HackableStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & Partial<Pick<Storage, 'key' | 'length'>>

function storage(): HackableStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** The project's name and kit from its save text, without opening it. */
function savedFacts(text: string): { name: string; kit: KitId } {
  try {
    const design = JSON.parse(text)?.design
    const name = design?.name
    return { name: typeof name === 'string' ? name.trim().slice(0, 80) : '', kit: saveKit(design) }
  } catch {
    return { name: '', kit: 'platformer' }
  }
}

/** The kit a save's design names (anything this version does not know counts as the Platformer here; opening says more). */
export function saveKit(design: unknown): KitId {
  const kit = design && typeof design === 'object' ? (design as { kit?: unknown }).kit : undefined
  return isKitId(kit) ? kit : 'platformer'
}

/** `kit` as an entry keeps it: nothing for the Platformer. */
const kitField = (kit: KitId | undefined): Pick<HackableEntry, 'kit'> => (kit && kit !== 'platformer' ? { kit } : {})

/** The list as kept; null when there is none, or it is damaged (it is then rebuilt from the saves themselves). */
function readIndex(store: HackableStorage): HackableEntry[] | null {
  try {
    const raw = store.getItem(HACKABLE_INDEX_KEY)
    if (raw === null) return null
    const list = JSON.parse(raw)
    return Array.isArray(list)
      ? list
        .filter((e) => e && typeof e.id === 'string' && typeof e.title === 'string')
        .map((e) => (typeof e.updated === 'number' ? e : { ...e, updated: 0 }))
        // A kit this version does not know is dropped from the entry (the save itself still says it, and opening it explains).
        .map((e) => (e.kit === undefined || (isKitId(e.kit) && e.kit !== 'platformer') ? e : (({ kit: _kit, ...rest }) => rest)(e)))
      : null
  } catch {
    return null
  }
}

/** The ids of every project save kept in this browser, listed or not. */
function storedIds(store: HackableStorage): string[] {
  const ids: string[] = []
  const prefix = `${LEGACY_KEY}:`
  try {
    if (typeof store.key === 'function' && typeof store.length === 'number') {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i)
        if (key === LEGACY_KEY) ids.push(LEGACY_ID)
        else if (key?.startsWith(prefix) && key.length > prefix.length) ids.push(key.slice(prefix.length))
      }
    } else if (store.getItem(LEGACY_KEY) !== null) ids.push(LEGACY_ID)
  } catch {
    /* blocked */
  }
  return ids
}

/** True when a storage write failed because the browser's space for this site is full (not because saving is off). */
export function isQuotaError(err: unknown): boolean {
  if (!err) return false
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014
    )
  }
  if (typeof err === 'object' && err !== null) {
    const errorRecord = err as Record<string, unknown>
    if (errorRecord.name === 'QuotaExceededError' || errorRecord.code === 22) {
      return true
    }
  }
  return false
}

/**
 * Saves written before 2026-10-31 were indented JSON, about 3.5 times the size of the same save written compactly
 * (a starter project: 596,000 characters against 166,000), so a guest's browser filled after about 8 projects. Each
 * such save is rewritten compactly: the same JSON, so nothing in it changes. A save that is not JSON, or that changed
 * while it was being read, is left as it is. Returns how many characters were freed.
 */
export function compactHackableSaves(store = storage()): number {
  if (!store) return 0
  let freed = 0
  for (const id of storedIds(store)) {
    const key = projectKey(id)
    let text: string | null = null
    try { text = store.getItem(key) } catch { continue }
    if (!text || !text.includes('\n')) continue
    let compact: string
    try { compact = JSON.stringify(JSON.parse(text)) } catch { continue }
    if (compact.length >= text.length) continue
    try {
      // Only over the very text read just now (another tab may have saved since).
      if (store.getItem(key) !== text) continue
      store.setItem(key, compact)
      freed += text.length - compact.length
    } catch { /* full or blocked: the save stays as it was */ }
  }
  return freed
}

/** About what one more project takes (a starter project is about 166,000 characters, plus its picture). */
export const NEW_PROJECT_ROOM_CHARS = 200_000

/**
 * Whether this browser has room to keep `chars` more characters: 'room', 'full' (its space for this site is used up,
 * even after older saves were made smaller) or 'blocked' (saving is turned off).
 */
export function roomFor(chars = NEW_PROJECT_ROOM_CHARS, store = storage()): 'room' | 'full' | 'blocked' {
  if (!store) return 'blocked'
  const probe = 'code-lab.room-check'
  const tryWrite = (): 'room' | 'full' | 'blocked' => {
    try {
      store.setItem(probe, 'x'.repeat(chars))
      return 'room'
    } catch (err) {
      return isQuotaError(err) ? 'full' : 'blocked'
    } finally {
      try { store.removeItem(probe) } catch { /* blocked */ }
    }
  }
  const first = tryWrite()
  if (first !== 'full' || compactHackableSaves(store) === 0) return first
  return tryWrite()
}

function writeIndex(store: HackableStorage, list: HackableEntry[]): boolean {
  try {
    store.setItem(HACKABLE_INDEX_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/**
 * The projects in this browser, newest first. The list is kept apart from the saves, so a save is never lost to it:
 * a save the list does not name (the list was damaged, or could not be written after the save was) is listed again
 * with the name inside it. A browser with only the older single save lists it as one project.
 */
export function listHackableProjects(store = storage()): HackableEntry[] {
  if (!store) return []
  const kept = readIndex(store)
  const list = kept ?? []
  const listed = new Set(list.map((e) => e.id))
  const now = Date.now()
  let found = 0
  for (const id of storedIds(store)) {
    if (listed.has(id)) continue
    let text: string | null = null
    try { text = store.getItem(projectKey(id)) } catch { /* blocked */ }
    if (!text) continue
    listed.add(id)
    // Found again just now; keep the order they are kept in.
    const { name, kit } = savedFacts(text)
    list.push({ id, title: name || newProjectName(kit), updated: now - found++, ...kitField(kit) })
  }
  if (kept === null || found > 0) writeIndex(store, list)
  return [...list].sort((a, b) => b.updated - a.updated)
}

export function loadHackableText(id: string, store = storage()): string | null {
  try {
    return store?.getItem(projectKey(id)) ?? null
  } catch {
    return null
  }
}

/**
 * Why a project was not kept: 'full' (this browser already keeps MAX_HACKABLE_PROJECTS), 'space' (its space for this
 * site is used up) or 'storage' (saving is turned off, or failed some other way).
 */
export type HackableSaveResult = { ok: true } | { ok: false; reason: 'full' | 'space' | 'storage' }

/**
 * Write one save; when the browser's space is full, older saves are made smaller (compactHackableSaves) and it is
 * tried once more. Throws what the last write threw.
 */
export function writeHackableText(key: string, text: string, store: HackableStorage): void {
  try {
    store.setItem(key, text)
  } catch (err) {
    if (!isQuotaError(err) || compactHackableSaves(store) === 0) throw err
    store.setItem(key, text)
  }
}

/**
 * Keep a project's save text and list it (a new id is refused, never squeezed in, once the browser keeps the most). The
 * limit counts every kit together. `kit` is the project's (read from the save text when not given).
 */
export function saveHackableText(id: string, title: string, text: string, store = storage(), picture?: string, pendingWorld?: PendingWorld, kit?: KitId): HackableSaveResult {
  if (!store) return { ok: false, reason: 'storage' }
  const list = listHackableProjects(store)
  if (!list.some((e) => e.id === id) && list.length >= MAX_HACKABLE_PROJECTS) return { ok: false, reason: 'full' }
  try {
    writeHackableText(projectKey(id), text, store)
  } catch (err) {
    return { ok: false, reason: isQuotaError(err) ? 'space' : 'storage' }
  }
  if (pendingWorld) setPendingWorld(id, pendingWorld, store)
  return touchHackableEntry(id, title, store, picture, kit ?? savedFacts(text).kit) ? { ok: true } : { ok: false, reason: 'storage' }
}

/** Mark (or, with undefined, unmark) a project as waiting to become the account world `pending.id`. */
export function setPendingWorld(id: string, pending: PendingWorld | undefined, store = storage()): boolean {
  if (!store) return false
  const list = listHackableProjects(store)
  const at = list.findIndex((e) => e.id === id)
  if (at < 0) {
    if (!pending) return true
    list.unshift({ id, title: NEW_PROJECT_NAME, updated: Date.now(), pendingWorld: pending })
  } else {
    const { pendingWorld: _old, ...rest } = list[at]
    list[at] = pending ? { ...rest, pendingWorld: pending } : rest
  }
  return writeIndex(store, list)
}

/** The account world this project is waiting to become, if any. */
export function pendingWorldOf(id: string, store = storage()): PendingWorld | undefined {
  if (!store) return undefined
  const pending = listHackableProjects(store).find((e) => e.id === id)?.pendingWorld
  return pending && typeof pending.id === 'string' && typeof pending.owner === 'string' ? pending : undefined
}

/**
 * After the studio saved a project under projectKey(id): put it first in the list with its name, picture and kit (the
 * entry's own kit when `kit` is not given).
 */
export function touchHackableEntry(id: string, title: string, store = storage(), picture?: string, kit?: KitId): boolean {
  if (!store) return false
  const list = listHackableProjects(store)
  const at = list.findIndex((e) => e.id === id)
  const kept = at >= 0 ? list[at].picture : undefined
  const pending = at >= 0 ? list[at].pendingWorld : undefined
  const shown = picture ?? kept
  const which = kit ?? (at >= 0 ? entryKit(list[at]) : 'platformer')
  const entry: HackableEntry = { id, title: title.trim().slice(0, 80) || newProjectName(which), updated: Date.now(), ...(shown ? { picture: shown } : {}), ...(pending ? { pendingWorld: pending } : {}), ...kitField(which) }
  if (at >= 0) list.splice(at, 1)
  return writeIndex(store, [entry, ...list])
}

export function deleteHackableProject(id: string, store = storage()): void {
  if (!store) return
  try { store.removeItem(projectKey(id)) } catch { /* blocked */ }
  writeIndex(store, listHackableProjects(store).filter((e) => e.id !== id))
}

export function newHackableId(): string {
  return `h${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
}

// ------------------------------------------------------------ account worlds and files

export function isHackableDocument(value: unknown): value is HackableDocument {
  return !!value && typeof value === 'object' && (value as { format?: unknown }).format === HACKABLE_FORMAT
}

/** A save's text as an account document (null when the text is not even JSON). */
export function documentFromText(text: string): HackableDocument | null {
  try {
    const save = JSON.parse(text)
    return save && typeof save === 'object' ? { format: HACKABLE_FORMAT, version: 1, save } : null
  } catch {
    return null
  }
}

/**
 * Each kit's studio address (kits.ts `route`; hackableProjects.test.ts checks they agree). Hackable 3D has no address in
 * the 2D studio yet, so its projects open at the Platformer's, which says what they are.
 */
export const hackableRoute = (kit: KitId | undefined = 'platformer'): string => (kit === 'race' ? '/2d/hackable-race' : '/2d/hackable')

/** Where a Hackable project opens: at its own kit's address (the Platformer's when the kit is not known). */
export const hackableHref = {
  local: (id: string, kit?: KitId) => `${hackableRoute(kit)}?draft=${encodeURIComponent(id)}`,
  world: (id: string, kit?: KitId) => `${hackableRoute(kit)}?world=${encodeURIComponent(id)}`,
  fresh: (kit?: KitId) => `${hackableRoute(kit)}?new=1`,
  /** The owner's account project with its class room open at once (after inviting classmates to play). */
  together: (id: string, kit?: KitId) => `${hackableRoute(kit)}?world=${encodeURIComponent(id)}&together=1`,
}
