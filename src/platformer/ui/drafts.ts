import { levelFromJson, levelToJson, type LevelDesign, type LevelJson } from '@brick-studio/platformer-core/engine/level'

/* The player's own levels, kept in this browser. Nothing here ever drops a level on its own: a full list or a
   failed write is reported to the caller, which tells the player and keeps the level in memory. */

const KEY = 'brick-studio.2d.drafts.v1'
export const MAX_DRAFTS = 30

export interface Draft {
  id: string
  title: string
  updated: number
  level: LevelJson
}

function readAll(): Draft[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? (JSON.parse(raw) as Draft[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

/** False when the browser refused the write (out of space, or storage blocked). */
function writeAll(list: Draft[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** Why a level could not be kept in this browser: the list is full, or the browser refused to store it. */
export type DraftSaveFailure = 'full' | 'storage'

export type DraftSaveResult = { ok: true; id: string } | { ok: false; reason: DraftSaveFailure }

export function listDrafts(): Draft[] {
  return readAll().sort((a, b) => b.updated - a.updated)
}

export function loadDraft(id: string): LevelDesign | null {
  const d = readAll().find((x) => x.id === id)
  if (!d) return null
  try {
    return levelFromJson(d.level)
  } catch {
    return null
  }
}

/**
 * Save a level (a new one when `id` is null). The newest save goes to the front. A new level is refused, never
 * squeezed in by dropping an old one, once MAX_DRAFTS are kept; saving an existing level always fits.
 */
export function saveDraft(id: string | null, level: LevelDesign): DraftSaveResult {
  const list = readAll()
  const i = id ? list.findIndex((x) => x.id === id) : -1
  if (i < 0 && list.length >= MAX_DRAFTS) return { ok: false, reason: 'full' }
  const draftId = i >= 0 ? id! : id ?? `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
  const entry: Draft = { id: draftId, title: level.title, updated: Date.now(), level: levelToJson(level) }
  if (i >= 0) list.splice(i, 1)
  list.unshift(entry)
  return writeAll(list) ? { ok: true, id: draftId } : { ok: false, reason: 'storage' }
}

export function deleteDraft(id: string): boolean {
  return writeAll(readAll().filter((x) => x.id !== id))
}

/** What to tell the player when a level could not be kept in this browser. */
export function draftSaveMessage(reason: DraftSaveFailure): string {
  return reason === 'full'
    ? `This browser already keeps ${MAX_DRAFTS} worlds, so this one is not saved. Delete one on the 2D worlds page, or copy a link to keep it.`
    : 'This browser would not save your world (it may be out of space). Copy a link to keep it.'
}
