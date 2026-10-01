import type { DesignProblem } from '../../core/project'
import {
  CURRENT_EDITOR_VERSION,
  CURRENT_ENGINE_SEMANTICS_VERSION,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_PLUGIN_VERSIONS,
  parse,
  serialize,
  type SavedProjectEnvelope,
} from '../../core/save'
import type { StudioProject } from '../store'

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

/**
 * Parses and validates an untrusted JSON string into a StudioProject.
 */
export function importProjectJson(text: string): ImportResult {
  const result = parse(text)
  if (!result.ok) {
    const errorMsg =
      result.problems.length > 0
        ? result.problems.map((p) => p.message).join('; ')
        : 'Invalid project format'
    return {
      ok: false,
      error: errorMsg,
      problems: result.problems,
    }
  }

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
    return {
      ok: false,
      error: `Could not read file: ${(err as Error).message}`,
    }
  }
}
