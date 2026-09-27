import { levelFromJson, type LabDoc } from './doc'

/** The lab is kept in this browser only (a proof of concept: no account, no rooms). */
export const LAB_STORAGE_KEY = 'brick-studio.2d.lab.v1'

export function loadLabDoc(): LabDoc | null {
  try {
    const raw = localStorage.getItem(LAB_STORAGE_KEY)
    if (!raw) return null
    const doc = JSON.parse(raw) as LabDoc
    if (!doc || doc.v !== 1 || typeof doc.bricks !== 'object' || !doc.level) return null
    // Throws on a level this build cannot read.
    levelFromJson(doc.level)
    return doc
  } catch {
    return null
  }
}

export function saveLabDoc(doc: LabDoc): boolean {
  try {
    localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(doc))
    return true
  } catch {
    return false
  }
}

export function clearLabDoc() {
  try {
    localStorage.removeItem(LAB_STORAGE_KEY)
  } catch {
    // Nothing kept, nothing to clear.
  }
}
