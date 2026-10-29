import type { DesignProblem } from '../../core/project'
import {
  CURRENT_EDITOR_VERSION,
  CURRENT_ENGINE_SEMANTICS_VERSION,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PLUGIN_VERSIONS,
  serialize,
  type SavedProjectEnvelope,
} from '../../core/save'
import type { StudioProject } from '../store'
import { HACKABLE_FILE_MAX_CHARS, HACKABLE_SAVE_MAX_CHARS, isHackableDocument } from './hackableProjects'
import { parseSaveText } from './repairSave'

export function createProjectEnvelope(project: StudioProject): SavedProjectEnvelope {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    engineSemanticsVersion: CURRENT_ENGINE_SEMANTICS_VERSION,
    editorVersion: CURRENT_EDITOR_VERSION,
    pluginVersions: { ...DEFAULT_PLUGIN_VERSIONS },
    design: project.design,
    workspaces: project.workspaces ?? {},
  }
}

/**
 * Deterministically serializes a StudioProject into a JSON string via the core save envelope.
 */
export function exportProjectJson(project: StudioProject): string {
  const envelope = createProjectEnvelope(project)
  return serialize(envelope)
}

/**
 * Initiates a browser download of the project as a `.json` file.
 */
export function exportProjectFile(project: StudioProject, filename?: string): void {
  const json = exportProjectJson(project)
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') {
    return
  }

  const cleanName = (project.design.name || 'project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const name = cleanName || 'my-project'
  const finalFilename = filename || `${name}.json`

  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = finalFilename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export type ImportResult =
  | { ok: true; project: StudioProject }
  | { ok: false; error: string; problems?: DesignProblem[] }

/** What the kid reads when a file will not open. */
export const FILE_ERRORS = {
  notProject: 'That file is not a project file.',
  tooBig: `That file is too big to open. A Hackable Platformer file can be up to ${Math.floor(HACKABLE_SAVE_MAX_CHARS / 1024 / 1024)} MB.`,
  newer: 'That project was made with a newer version of Brickgineers. Refresh the page and try again.',
  damaged: 'That file is damaged, so it could not be opened.',
  power: 'That file is a power. Open it with + Power in Code.',
  otherKind: (kind: string) => `That file is ${kind}. Open it from My projects.`,
} as const

/** What My projects calls each kind (src/projects/projectFile.ts), for "That file is a 3D build". */
const OTHER_KINDS: Record<string, string> = { '3d': 'a 3D build', platformer: 'a Platformer', race: 'a race track' }
/** The `.brickgineers` file every project downloads as (src/projects/projectFile.ts PROJECT_FILE_FORMAT). */
const PROJECT_FILE_FORMAT = 'brickgineers'
const POWER_FILE_KIND = 'brickgineers-power'

/**
 * The save text inside any file this app writes for a Hackable Platformer: its own "Save File" (the bare save), the
 * `.brickgineers` file My projects downloads, or an account document. Other files get the kid's reason.
 */
function saveTextOf(text: string): { ok: true; text: string } | { ok: false; error: string } {
  if (typeof text !== 'string') return { ok: false, error: FILE_ERRORS.notProject }
  if (text.length > HACKABLE_FILE_MAX_CHARS) return { ok: false, error: FILE_ERRORS.tooBig }
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return { ok: false, error: FILE_ERRORS.notProject }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: FILE_ERRORS.notProject }
  const v = value as Record<string, unknown>
  if (v.format === PROJECT_FILE_FORMAT) {
    if (typeof v.version !== 'number' || v.version > 1) return { ok: false, error: FILE_ERRORS.newer }
    if (typeof v.kind === 'string' && OTHER_KINDS[v.kind]) return { ok: false, error: FILE_ERRORS.otherKind(OTHER_KINDS[v.kind]) }
    if (v.kind !== 'hackable') return { ok: false, error: FILE_ERRORS.newer }
    return documentSave(v.document)
  }
  if (isHackableDocument(v)) return documentSave(v)
  if (v.kind === POWER_FILE_KIND) return { ok: false, error: FILE_ERRORS.power }
  return { ok: true, text }
}

function documentSave(document: unknown): { ok: true; text: string } | { ok: false; error: string } {
  if (!isHackableDocument(document)) return { ok: false, error: FILE_ERRORS.damaged }
  if (document.version !== 1) return { ok: false, error: FILE_ERRORS.newer }
  return document.save && typeof document.save === 'object' ? { ok: true, text: JSON.stringify(document.save) } : { ok: false, error: FILE_ERRORS.damaged }
}

/** The kid's reason the game refused a save (the problems stay on the result for whoever debugs it). */
function reasonFor(problems: DesignProblem[]): string {
  if (problems.some((p) => p.path === 'schemaVersion' && p.message.includes('Unsupported future schema version'))) return FILE_ERRORS.newer
  if (problems.some((p) => p.path === '' && p.code === 'limit' && p.message.startsWith('Save exceeds'))) return FILE_ERRORS.tooBig
  if (problems.some((p) => p.path === '' && p.message.startsWith('Invalid JSON'))) return FILE_ERRORS.notProject
  return FILE_ERRORS.damaged
}

/**
 * Parses and validates an untrusted file's text into a StudioProject.
 */
export function importProjectJson(text: string): ImportResult {
  const unwrapped = saveTextOf(text)
  if (!unwrapped.ok) return { ok: false, error: unwrapped.error }
  // Step 6/6b files painted engine tiles; give them the standard grid bricks first (step 7). A file holding a
  // picture the game refuses (the old blank Stage backdrop) opens with that picture put right.
  const result = parseSaveText(unwrapped.text)
  if (!result.ok) return { ok: false, error: reasonFor(result.problems), problems: result.problems }

  return {
    ok: true,
    project: {
      design: result.save.design,
      workspaces: result.save.workspaces ?? {},
    },
  }
}

/**
 * Reads a File / Blob object and imports it into a StudioProject.
 * Supports modern `file.text()`, `FileReader`, and `Response(file).text()` fallbacks.
 */
export async function importProjectFile(file: File | Blob): Promise<ImportResult> {
  try {
    let text: string
    if (typeof (file as { text?: unknown }).text === 'function') {
      text = await (file as { text: () => Promise<string> }).text()
    } else if (typeof FileReader !== 'undefined') {
      text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
        reader.readAsText(file)
      })
    } else if (typeof Response !== 'undefined') {
      text = await new Response(file).text()
    } else {
      throw new Error('No file reading API available')
    }
    return importProjectJson(text)
  } catch (err) {
    console.warn('Code Lab: could not read the file:', err)
    return { ok: false, error: 'That file could not be read. Try choosing it again.' }
  }
}
