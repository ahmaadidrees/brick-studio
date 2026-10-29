import { browserClassroomClient, ClassroomError, type ClassroomClientSurface } from '../../../../classroom/client'
import type { CloudSaveStatus } from '../../../../classroom/cloudAutosave'
import type { ClassroomWorld } from '../../../../classroom/contracts'
import type { StudioProject } from '../store'
import { ACCOUNT_DOCUMENT_MAX_BYTES } from './hackableProjects'
import { documentBytes, hackableDocument, projectFromDocument } from './hackableSave'

/*
 * Hackable Platformer projects in an account: ordinary classroom worlds whose document wraps the project's save, so
 * My projects, copies, checkpoints and sharing with the class work as they do for the other kinds. No live rooms yet.
 */

const SAVE_DELAY_MS = 1200
const TOO_BIG = 'This project is too big for your account. Save it as a file from the ⋯ menu so you do not lose it.'

const titleOf = (project: StudioProject) => project.design.name.trim().slice(0, 80) || 'My platformer'

export async function createHackableWorld(project: StudioProject, client: ClassroomClientSurface = browserClassroomClient): Promise<ClassroomWorld> {
  if (documentBytes(project) > ACCOUNT_DOCUMENT_MAX_BYTES) throw new Error(TOO_BIG)
  return client.createWorld({ title: titleOf(project), document: hackableDocument(project) as never })
}

/** Thrown when the world opens but holds another kind of project (the caller sends it to that kind's page). */
export class NotHackableError extends Error {
  constructor(readonly world: ClassroomWorld) {
    super('This project is not a Hackable Platformer.')
  }
}

export async function loadHackableWorld(id: string, client: ClassroomClientSurface = browserClassroomClient): Promise<{ world: ClassroomWorld; project: StudioProject }> {
  const world = await client.getWorld(id)
  if (world.format !== 'hackable') throw new NotHackableError(world)
  const project = projectFromDocument(world.document)
  if (!project) throw new Error('This project could not be opened. It may be from a newer version: refresh the page and try again.')
  return { world, project }
}

/**
 * Saves a moment after each change: one save at a time, the latest project wins, and a save that failed keeps the
 * project to try again. Same behaviour as the 2D builder's CloudLevelSaver.
 */
export class HackableCloudSaver {
  status: CloudSaveStatus = 'saved'
  error = ''
  private pending: StudioProject | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private running: Promise<void> | null = null
  private readonly accountId: string | undefined

  constructor(
    public world: ClassroomWorld,
    private readonly onChange: () => void,
    private readonly client: ClassroomClientSurface = browserClassroomClient,
  ) {
    this.accountId = client.getSession()?.user.id
  }

  schedule(project: StudioProject) {
    this.pending = project
    if (this.status !== 'saving') this.set('pending')
    clearTimeout(this.timer)
    this.timer = setTimeout(() => void this.run(), SAVE_DELAY_MS)
  }

  /** Save now; resolves true once everything is saved. */
  async flush(): Promise<boolean> {
    clearTimeout(this.timer)
    await this.run()
    return this.status === 'saved'
  }

  get dirty() {
    return this.pending !== null || this.status === 'saving' || this.status === 'error'
  }

  private set(status: CloudSaveStatus) {
    this.status = status
    this.onChange()
  }

  private async run(): Promise<void> {
    if (this.running) await this.running
    const project = this.pending
    if (!project) return
    this.pending = null
    this.set('saving')
    this.running = (async () => {
      try {
        if (this.client.getSession()?.user.id !== this.accountId) throw new Error('Your account changed. Sign in to the original account again to save. Your changes are still in this tab; save a file from the ⋯ menu before leaving.')
        if (documentBytes(project) > ACCOUNT_DOCUMENT_MAX_BYTES) throw new Error(TOO_BIG)
        const world = await this.client.saveWorld(this.world.id, { expectedRevision: this.world.revision, title: titleOf(project), document: hackableDocument(project) as never })
        this.world = { ...this.world, ...world, document: undefined }
        this.error = ''
        this.set(this.pending ? 'pending' : 'saved')
      } catch (error) {
        this.pending ??= project
        this.error = error instanceof ClassroomError && error.code === 'revision_conflict'
          ? 'A newer version of this project was saved somewhere else. Reload to get it.'
          : error instanceof Error ? error.message : 'Saving did not work. Your project is still here.'
        this.set('error')
      }
    })()
    await this.running
    this.running = null
    if (this.pending && this.status !== 'error') this.schedule(this.pending)
  }
}
