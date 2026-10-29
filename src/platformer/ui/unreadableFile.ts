import { PLATFORMER_DOCUMENT_VERSION, PLATFORMER_FORMAT } from '@brick-studio/platformer-core/document'
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, projectFileName } from '../../projects/projectFile'
import type { Draft } from './drafts'

/*
 * A 2D level this app cannot read (made by a newer version, or damaged) is never thrown away: the kid can save it,
 * exactly as stored, in a project file. My projects → Import a file opens it once the app can read it.
 */

export interface UnreadableFile {
  name: string
  text: string
}

/** A project file around a stored 2D document, unchanged. */
export function unreadableLevelFile(title: unknown, document: unknown, savedAt?: number): UnreadableFile {
  const name = (typeof title === 'string' && title.trim().slice(0, 80)) || 'My project'
  const level = (document as { level?: { kit?: unknown } } | null)?.level
  const file = {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    kind: level?.kit === 'race' ? 'race' : 'platformer',
    title: name,
    savedAt: new Date(typeof savedAt === 'number' && Number.isFinite(savedAt) ? savedAt : Date.now()).toISOString(),
    document,
  }
  return { name: projectFileName(name), text: JSON.stringify(file) }
}

/** A browser draft (its stored level wrapped as the 2D document an account keeps). */
export function unreadableDraftFile(draft: Draft): UnreadableFile {
  return unreadableLevelFile(draft.title, { format: PLATFORMER_FORMAT, version: PLATFORMER_DOCUMENT_VERSION, level: draft.level }, draft.updated)
}

/** Save a file on this computer. */
export function downloadUnreadable({ name, text }: UnreadableFile) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Some browsers (iPad Safari) read the file after click() returns.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
