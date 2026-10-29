import { upgradeUntouchedHero } from '../remix'
import type { StudioProject } from '../store'
import { HACKABLE_FORMAT, isHackableDocument, saveHackableText, type HackableDocument, type HackableSaveResult, type HackableStorage } from './hackableProjects'
import { exportProjectJson } from './projectIo'
import { parseSaveText } from './repairSave'

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

/** Bytes this project takes in an account world, to say so before the account refuses it. */
export function documentBytes(project: StudioProject): number {
  return new TextEncoder().encode(JSON.stringify(hackableDocument(project))).byteLength
}

export function saveHackableProject(id: string, project: StudioProject, store?: HackableStorage | null, picture?: string): HackableSaveResult {
  return saveHackableText(id, project.design.name, exportProjectJson(project), store ?? undefined, picture)
}
