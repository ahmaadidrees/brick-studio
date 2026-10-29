import { upgradeUntouchedHero } from '../remix'
import type { StudioProject } from '../store'
import { HACKABLE_FORMAT, isHackableDocument, saveHackableText, type HackableDocument, type HackableSaveResult, type HackableStorage } from './hackableProjects'
import { exportProjectJson } from './projectIo'
import { openableSaveText, parseSaveText } from './repairSave'

/* Opening and writing Hackable Platformer projects: the part of hackableProjects.ts that needs the game's own parser. */

/**
 * A project's save text read back, upgraded the way Code Lab always upgrades a save (and with any picture the game
 * refuses put right, persist/repairSave.ts); null when it is unreadable.
 */
export function projectFromText(text: string): StudioProject | null {
  const result = parseSaveText(text)
  return result.ok ? upgradeUntouchedHero({ design: result.save.design, workspaces: result.save.workspaces ?? {} }) : null
}

/** An account world's document as a project; null when it is not a Hackable project or will not open. */
export function projectFromDocument(value: unknown): StudioProject | null {
  if (!isHackableDocument(value) || value.version !== 1) return null
  return projectFromText(JSON.stringify(value.save))
}

export function hackableDocument(project: StudioProject): HackableDocument {
  return { format: HACKABLE_FORMAT, version: 1, save: JSON.parse(exportProjectJson(project)) }
}

/**
 * The account document for a project, checked with the game's own parser (as reopening it does, projectFromDocument:
 * the same JSON, compact instead of indented), so the account never keeps a project that will not open again. A
 * picture the game would refuse is put right first (persist/repairSave.ts). `bytes` is the size the account counts.
 */
export type CheckedDocument = { ok: true; document: HackableDocument; bytes: number } | { ok: false }

export function checkedHackableDocument(project: StudioProject): CheckedDocument {
  const text = openableSaveText(exportProjectJson(project))
  if (text === null) return { ok: false }
  const document: HackableDocument = { format: HACKABLE_FORMAT, version: 1, save: JSON.parse(text) }
  return { ok: true, document, bytes: accountBytes(document) }
}

/**
 * Bytes a document takes in the account. The database measures its own text form of the JSON, which puts a space
 * after every ':' and ',' (worlds table: octet_length(document::text) <= 2,000,000), so count those too.
 */
export function accountBytes(document: unknown): number {
  const compact = JSON.stringify(document)
  let separators = 0
  let inString = false
  for (let i = 0; i < compact.length; i++) {
    const ch = compact.charCodeAt(i)
    if (inString) {
      if (ch === 92) i++ // backslash: skip the escaped character
      else if (ch === 34) inString = false
    } else if (ch === 34) inString = true
    else if (ch === 44 || ch === 58) separators++
  }
  return new TextEncoder().encode(compact).byteLength + separators
}

/** Bytes this project takes in an account world, to say so before the account refuses it. */
export function documentBytes(project: StudioProject): number {
  return accountBytes(hackableDocument(project))
}

export function saveHackableProject(id: string, project: StudioProject, store?: HackableStorage | null, picture?: string): HackableSaveResult {
  return saveHackableText(id, project.design.name, exportProjectJson(project), store ?? undefined, picture)
}
