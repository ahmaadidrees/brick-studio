import { validatePlatformerDocument } from '@brick-studio/platformer-core/document'
import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { clearLocalBrickStudioProject, loadLocalBrickStudioProject, saveLocalBrickStudioProject, type BrickStudioStorage } from '../brick/documentPersistence'
import type { BrickStudioDocument } from '../brick/brickDocument'
import { browserClassroomClient, type ClassroomClient } from '../classroom/client'
import type { ClassroomWorld } from '../classroom/contracts'
import { createCloudLevel } from '../platformer/ui/cloudLevel'
import { deleteDraft, listDrafts, loadDraft, saveDraft } from '../platformer/ui/drafts'
import { kindOfLevel, type Project, type ProjectKind } from './projectFile'

/*
 * Every project a person has, wherever it lives: on this computer (the 3D build in this browser and the 2D drafts) or
 * in their account. My projects lists them together; this module opens, moves, copies out and removes them, and turns
 * an imported file into a new project. Nothing here ever replaces a project without the caller asking first.
 */

export interface LocalProject {
  where: 'local'
  /** '3d' for the browser's 3D build; a 2D draft's own id otherwise. */
  id: string
  kind: ProjectKind
  title: string
  /** Last saved, ms since 1970 (0 when unknown: the 3D browser build keeps no date). */
  updated: number
  href: string
  /** 2D drafts: the level, for a picture. */
  level?: LevelDesign
  /** The 3D build: how many bricks it has. */
  bricks?: number
}

export const LOCAL_3D_ID = '3d'

export const kindOfWorld = (world: Pick<ClassroomWorld, 'format' | 'kit'>): ProjectKind =>
  world.format === '2d' ? (world.kit === 'race' ? 'race' : 'platformer') : '3d'

export const projectHref = (world: Pick<ClassroomWorld, 'id' | 'format'>) =>
  world.format === '2d' ? `/2d/build?world=${encodeURIComponent(world.id)}` : `/build?world=${encodeURIComponent(world.id)}`

const storage = (): BrickStudioStorage | null => {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function local3d(store: BrickStudioStorage | null): { document: BrickStudioDocument; bricks: number } | null {
  if (!store) return null
  const loaded = loadLocalBrickStudioProject(store)
  if (!loaded.ok || !loaded.document || loaded.document.bricks.length === 0) return null
  return { document: loaded.document, bricks: loaded.document.bricks.length }
}

/** The projects kept in this browser, newest first (the 3D build, which has no date, last). */
export function listLocalProjects(store = storage()): LocalProject[] {
  const out: LocalProject[] = listDrafts().map((d) => {
    const level = loadDraft(d.id)
    return { where: 'local' as const, id: d.id, kind: level ? kindOfLevel(level) : 'platformer', title: d.title, updated: d.updated, href: `/2d/build?draft=${encodeURIComponent(d.id)}`, ...(level ? { level } : {}) }
  })
  const three = local3d(store)
  if (three) out.push({ where: 'local', id: LOCAL_3D_ID, kind: '3d', title: 'My 3D build', updated: 0, href: '/build', bricks: three.bricks })
  return out
}

/** A local project's content, for a download or a move to the account. */
export function localProject(item: LocalProject, store = storage()): Project | null {
  if (item.id === LOCAL_3D_ID) {
    const three = local3d(store)
    return three ? { title: item.title, content: { kind: '3d', document: three.document } } : null
  }
  const level = loadDraft(item.id)
  return level ? { title: item.title, content: { kind: kindOfLevel(level), level } } : null
}

/** An account project's content (one read of the whole document). */
export async function accountProject(world: ClassroomWorld, client: ClassroomClient = browserClassroomClient): Promise<Project> {
  const full = await client.getWorld(world.id)
  if (full.format === '2d' || validatePlatformerDocument(full.document).ok) {
    const checked = validatePlatformerDocument(full.document)
    if (!checked.ok) throw new Error('This project could not be read.')
    return { title: full.title, content: { kind: kindOfLevel(checked.level), level: checked.level } }
  }
  if (!full.document) throw new Error('This project could not be read.')
  return { title: full.title, content: { kind: '3d', document: full.document } }
}

/** Put a project in the account (a new account project) and say where to open it. */
export async function createAccountProject(project: Project, client: ClassroomClient = browserClassroomClient): Promise<{ world: ClassroomWorld; href: string }> {
  const { content } = project
  const world = content.kind === '3d'
    ? await client.createWorld({ title: project.title.slice(0, 80) || 'My 3D build', document: content.document })
    : await createCloudLevel({ ...content.level, title: project.title })
  return { world, href: projectHref(world) }
}

/** Move a project from this computer to the account: the account copy is made first, then the local one goes. */
export async function moveToAccount(item: LocalProject, client: ClassroomClient = browserClassroomClient, store = storage()): Promise<{ world: ClassroomWorld; href: string }> {
  const project = localProject(item, store)
  if (!project) throw new Error('That project is no longer on this computer.')
  const created = await createAccountProject(project, client)
  removeLocalProject(item, store)
  return created
}

export function removeLocalProject(item: LocalProject, store = storage()) {
  if (item.id === LOCAL_3D_ID) {
    if (store) clearLocalBrickStudioProject(store)
  } else deleteDraft(item.id)
}

export type ImportOutcome =
  | { ok: true; href: string; where: 'account' | 'local' }
  /** A guest's 3D import would take the place of the 3D build already in this browser: ask first. */
  | { ok: false; reason: 'replace-3d'; current: LocalProject }
  | { ok: false; reason: 'error'; message: string }

/**
 * Make a new project from an imported file. Signed in: a new account project. A guest: a new project on this
 * computer. The one exception is a guest's 3D build, which this browser keeps one of: if one is there already, the
 * caller asks before `replace3d` is set.
 */
export async function importProject(project: Project, opts: { signedIn: boolean; replace3d?: boolean; client?: ClassroomClient; store?: BrickStudioStorage | null } = { signedIn: false }): Promise<ImportOutcome> {
  const store = opts.store === undefined ? storage() : opts.store
  try {
    if (opts.signedIn) {
      const { href } = await createAccountProject(project, opts.client)
      return { ok: true, href, where: 'account' }
    }
    const { content } = project
    if (content.kind === '3d') {
      const current = listLocalProjects(store).find((p) => p.id === LOCAL_3D_ID)
      if (current && !opts.replace3d) return { ok: false, reason: 'replace-3d', current }
      if (!store) return { ok: false, reason: 'error', message: 'This browser does not let pages save anything, so the build cannot be kept here.' }
      const saved = saveLocalBrickStudioProject(store, content.document)
      return saved.ok ? { ok: true, href: '/build', where: 'local' } : { ok: false, reason: 'error', message: saved.error.message }
    }
    const saved = saveDraft(null, { ...content.level, title: project.title })
    if (!saved.ok) return { ok: false, reason: 'error', message: saved.reason === 'full' ? 'This computer already keeps 30 2D projects. Remove one, or sign in to keep more in your account.' : 'This browser would not save the project.' }
    return { ok: true, href: `/2d/build?draft=${encodeURIComponent(saved.id)}`, where: 'local' }
  } catch (error) {
    const code = (error as { code?: string })?.code
    return { ok: false, reason: 'error', message: code === 'world_limit' ? 'Your account is full. Remove a project you no longer need, then try again.' : error instanceof Error ? error.message : 'The project could not be imported.' }
  }
}
