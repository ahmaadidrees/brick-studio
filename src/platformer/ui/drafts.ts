import { levelFromJson, levelToJson, type LevelDesign, type LevelJson } from '@brick-studio/platformer-core/engine/level'

/* The player's own levels, kept in this browser. */

const KEY = 'brick-studio.2d.drafts.v1'
const MAX_DRAFTS = 30

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

function writeAll(list: Draft[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_DRAFTS)))
  } catch {
    // Out of space or storage blocked: the level is still in memory and in share links.
  }
}

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

export function saveDraft(id: string | null, level: LevelDesign): string {
  const list = readAll()
  const draftId = id ?? `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`
  const entry: Draft = { id: draftId, title: level.title, updated: Date.now(), level: levelToJson(level) }
  const i = list.findIndex((x) => x.id === draftId)
  if (i >= 0) list[i] = entry
  else list.unshift(entry)
  writeAll(list)
  return draftId
}

export function deleteDraft(id: string) {
  writeAll(readAll().filter((x) => x.id !== id))
}
