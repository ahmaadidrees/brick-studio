/*
 * Hackable Platformer projects (the kid-facing name for Code Lab): many per browser, and the same project as an
 * account world. In this browser an index lists them and each keeps its save under its own key. The first project is
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
/** What an account world can hold (the worlds table's own limit). */
export const ACCOUNT_DOCUMENT_MAX_BYTES = 2_000_000

export interface HackableEntry {
  id: string
  title: string
  /** Last saved, ms since 1970. */
  updated: number
  /** A small picture of the level (a JPEG data URL), when the studio has taken one. */
  picture?: string
}

export interface HackableDocument {
  format: typeof HACKABLE_FORMAT
  version: 1
  save: unknown
}

export const projectKey = (id: string) => (id === LEGACY_ID ? LEGACY_KEY : `${LEGACY_KEY}:${id}`)

/** All this module needs of localStorage (tests pass a stand-in). */
export type HackableStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function storage(): HackableStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** The project's name from its save text, without opening it. */
function savedName(text: string): string {
  try {
    const name = JSON.parse(text)?.design?.name
    return typeof name === 'string' ? name.trim().slice(0, 80) : ''
  } catch {
    return ''
  }
}

function readIndex(store: HackableStorage): HackableEntry[] | null {
  try {
    const raw = store.getItem(HACKABLE_INDEX_KEY)
    if (raw === null) return null
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string' && typeof e.title === 'string') : []
  } catch {
    return []
  }
}

function writeIndex(store: HackableStorage, list: HackableEntry[]): boolean {
  try {
    store.setItem(HACKABLE_INDEX_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** The projects in this browser, newest first. A browser with only the older single save lists it as one project. */
export function listHackableProjects(store = storage()): HackableEntry[] {
  if (!store) return []
  let list = readIndex(store)
  if (list === null) {
    list = []
    let legacy: string | null = null
    try { legacy = store.getItem(LEGACY_KEY) } catch { /* blocked */ }
    if (legacy) {
      list.push({ id: LEGACY_ID, title: savedName(legacy) || NEW_PROJECT_NAME, updated: Date.now() })
    }
    writeIndex(store, list)
  }
  return [...list].sort((a, b) => b.updated - a.updated)
}

export function loadHackableText(id: string, store = storage()): string | null {
  try {
    return store?.getItem(projectKey(id)) ?? null
  } catch {
    return null
  }
}

export type HackableSaveResult = { ok: true } | { ok: false; reason: 'full' | 'storage' }

/** Keep a project's save text and list it (a new id is refused, never squeezed in, once the browser keeps the most). */
export function saveHackableText(id: string, title: string, text: string, store = storage(), picture?: string): HackableSaveResult {
  if (!store) return { ok: false, reason: 'storage' }
  const list = listHackableProjects(store)
  if (!list.some((e) => e.id === id) && list.length >= MAX_HACKABLE_PROJECTS) return { ok: false, reason: 'full' }
  try {
    store.setItem(projectKey(id), text)
  } catch {
    return { ok: false, reason: 'storage' }
  }
  return touchHackableEntry(id, title, store, picture) ? { ok: true } : { ok: false, reason: 'storage' }
}

/** After the studio saved a project under projectKey(id): put it first in the list with its name and picture. */
export function touchHackableEntry(id: string, title: string, store = storage(), picture?: string): boolean {
  if (!store) return false
  const list = listHackableProjects(store)
  const at = list.findIndex((e) => e.id === id)
  const kept = at >= 0 ? list[at].picture : undefined
  const shown = picture ?? kept
  const entry: HackableEntry = { id, title: title.trim().slice(0, 80) || NEW_PROJECT_NAME, updated: Date.now(), ...(shown ? { picture: shown } : {}) }
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

export const hackableHref = {
  local: (id: string) => `/2d/hackable?draft=${encodeURIComponent(id)}`,
  world: (id: string) => `/2d/hackable?world=${encodeURIComponent(id)}`,
  fresh: '/2d/hackable?new=1',
}
