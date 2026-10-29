import { createPlatformerDocument, isPlatformerDocument, validatePlatformerDocument, type PlatformerDocument } from '@brick-studio/platformer-core/document'
import { kitOf } from '@brick-studio/platformer-core/engine/kits'
import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { BRICK_STUDIO_FILE_EXTENSION, validateBrickStudioDocument, type BrickStudioDocument } from '../brick/brickDocument'
import { HACKABLE_FILE_MAX_CHARS, HACKABLE_FORMAT, isHackableDocument, type HackableDocument } from '../platformer/lab/studio/persist/hackableProjects'

/*
 * One file for every kind of project: a 3D build, a platformer, a race track or a Hackable Platformer. A `.brickgineers` file says what it
 * is, its name and when it was saved, and holds the same document an account keeps, so opening a file and opening a
 * saved project are the same thing. Older files still open: 3D `.brickstudio.json` builds and the 2D recovery copies
 * rooms hand out (`{ format: 'brickgineers-2d', level }`). Importing always makes a new project; nothing is replaced.
 */

export const PROJECT_FILE_EXTENSION = '.brickgineers'
export const PROJECT_FILE_FORMAT = 'brickgineers'
export const PROJECT_FILE_VERSION = 1
/** Every file the import button accepts. */
export const PROJECT_FILE_ACCEPT = `${PROJECT_FILE_EXTENSION},${BRICK_STUDIO_FILE_EXTENSION},.json,application/json`
/**
 * How big a file may be, in characters of its text, by kind. 3D builds and 2D levels: larger than any an account can
 * hold (2 MB), so a real one always fits. Hackable Platformers: as big as the game itself opens (5 MB, core/save.ts),
 * so every one it can save as a file comes back. No file is read past the bigger of the two.
 */
export const PROJECT_FILE_MAX_BYTES = 3_000_000
export const HACKABLE_FILE_MAX_BYTES = HACKABLE_FILE_MAX_CHARS
const ANY_FILE_MAX_BYTES = Math.max(PROJECT_FILE_MAX_BYTES, HACKABLE_FILE_MAX_BYTES)
const megabytes = (chars: number) => `${Math.floor(chars / 1_000_000)} MB`
const TOO_BIG = `That file is too big to be a project. Project files can be up to ${megabytes(ANY_FILE_MAX_BYTES)}.`
const TOO_BIG_NOT_HACKABLE = `That file is too big to open. 3D builds and 2D projects can be up to ${megabytes(PROJECT_FILE_MAX_BYTES)}.`

export type ProjectKind = '3d' | 'platformer' | 'race' | 'hackable'

export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = { '3d': '3D build', platformer: 'Platformer', race: 'Race track', hackable: 'Hackable Platformer' }

export type ProjectContent =
  | { kind: '3d'; document: BrickStudioDocument }
  | { kind: 'platformer' | 'race'; level: LevelDesign }
  /** Kept as its document: it is only opened (and fully checked) by the Hackable Platformer itself. */
  | { kind: 'hackable'; document: HackableDocument }

export interface Project {
  title: string
  content: ProjectContent
}

export interface ProjectFile {
  format: typeof PROJECT_FILE_FORMAT
  version: typeof PROJECT_FILE_VERSION
  kind: ProjectKind
  title: string
  savedAt: string
  /** A 3D build's BrickStudioDocument, a 2D level's PlatformerDocument, or a Hackable Platformer's document. */
  document: BrickStudioDocument | PlatformerDocument | HackableDocument
}

export const kindOfLevel = (level: LevelDesign): 'platformer' | 'race' => (kitOf(level) === 'race' ? 'race' : 'platformer')

export function projectFile(project: Project, savedAt = new Date()): ProjectFile {
  const { content } = project
  return {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    kind: content.kind,
    title: project.title.trim().slice(0, 80) || 'My project',
    savedAt: savedAt.toISOString(),
    document: content.kind === '3d' || content.kind === 'hackable' ? content.document : createPlatformerDocument(content.level),
  }
}

/** A safe file name from a project's title: letters, digits and dashes, then the extension. */
export function projectFileName(title: string): string {
  const slug = title.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return `${slug || 'my-project'}${PROJECT_FILE_EXTENSION}`
}

export type ReadResult = { ok: true; project: Project } | { ok: false; message: string }

const titleFromName = (fileName: string) =>
  fileName.replace(/\.(brickgineers|brickstudio\.json|json)$/i, '').replace(/[-_]+/g, ' ').trim().slice(0, 80) || 'Imported project'

function read3d(document: unknown, title: string): ReadResult {
  const checked = validateBrickStudioDocument(document)
  return checked.ok ? { ok: true, project: { title, content: { kind: '3d', document: checked.document } } } : { ok: false, message: `That 3D build could not be opened: ${checked.error.message}` }
}

function read2d(document: unknown, title: string | null): ReadResult {
  const checked = validatePlatformerDocument(document)
  if (!checked.ok) return { ok: false, message: 'That 2D project could not be opened: the file is damaged or from a newer version.' }
  const level = checked.level
  return { ok: true, project: { title: title ?? level.title, content: { kind: kindOfLevel(level), level: title ? { ...level, title } : level } } }
}

/** A Hackable Platformer's file in either of its shapes (the `.brickgineers` file, or its own "Save File"). */
function hackableShaped(v: Record<string, unknown>): boolean {
  if (v.format === PROJECT_FILE_FORMAT) return v.kind === 'hackable'
  return typeof v.schemaVersion === 'number' && !!v.design && typeof v.design === 'object' && !Array.isArray(v.design)
}

/** Read any project file this app has ever written. `fileName` names projects whose files carry no title. */
export function readProjectFile(text: string, fileName = ''): ReadResult {
  if (text.length > ANY_FILE_MAX_BYTES) return { ok: false, message: TOO_BIG }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, message: 'That file is not a project file.' }
  }
  if (!value || typeof value !== 'object') return { ok: false, message: 'That file is not a project file.' }
  const v = value as Record<string, unknown>
  // 3D builds and 2D levels keep their own, smaller limit.
  if (text.length > PROJECT_FILE_MAX_BYTES && !hackableShaped(v)) return { ok: false, message: TOO_BIG_NOT_HACKABLE }
  if (v.format === PROJECT_FILE_FORMAT) {
    if (typeof v.version !== 'number' || v.version > PROJECT_FILE_VERSION) return { ok: false, message: 'That project was made with a newer version. Refresh the page and try again.' }
    const title = typeof v.title === 'string' && v.title.trim() ? v.title.trim().slice(0, 80) : titleFromName(fileName)
    if (v.kind === '3d') return read3d(v.document, title)
    if (v.kind === 'platformer' || v.kind === 'race') return read2d(v.document, title)
    if (v.kind === 'hackable') {
      return isHackableDocument(v.document) && v.document.version === 1 && v.document.save && typeof v.document.save === 'object'
        ? { ok: true, project: { title, content: { kind: 'hackable', document: v.document } } }
        : { ok: false, message: 'That Hackable Platformer could not be opened: the file is damaged or from a newer version.' }
    }
    return { ok: false, message: 'That project is a kind this app does not know yet.' }
  }
  // A room's 2D recovery copy, or any bare 2D document.
  if (isPlatformerDocument(v)) return read2d(v, null)
  // A Hackable Platformer's own "Save file" (its bare save envelope).
  if (typeof v.schemaVersion === 'number' && v.design && typeof v.design === 'object' && !Array.isArray(v.design)) {
    const named = (v.design as { name?: unknown }).name
    const title = typeof named === 'string' && named.trim() ? named.trim().slice(0, 80) : titleFromName(fileName)
    return { ok: true, project: { title, content: { kind: 'hackable', document: { format: HACKABLE_FORMAT, version: 1, save: v } } } }
  }
  // An older 3D file (.brickstudio.json): a bare BrickStudioDocument.
  return read3d(v, titleFromName(fileName))
}

/** Save a project as a file on this computer. */
export function downloadProjectFile(project: Project) {
  const blob = new Blob([JSON.stringify(projectFile(project))], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = projectFileName(project.title)
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
