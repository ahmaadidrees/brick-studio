import { browserClassroomClient, ClassroomError, type ClassroomClientSurface } from '../../../../classroom/client'
import type { CloudSaveStatus } from '../../../../classroom/cloudAutosave'
import type { ClassroomWorld } from '../../../../classroom/contracts'
import type { StudioProject } from '../store'
import { ACCOUNT_DOCUMENT_MAX_BYTES } from './hackableProjects'
import { checkedHackableDocument, projectFromDocument, type CheckedDocument } from './hackableSave'

/*
 * Hackable Platformer projects in an account: ordinary classroom worlds whose document wraps the project's save, so
 * My projects, copies, checkpoints and sharing with the class work as they do for the other kinds. No live rooms yet.
 */

const SAVE_DELAY_MS = 1200
export const TOO_BIG = 'This project is too big for your account. Save it as a file from the ⋯ menu so you do not lose it.'
/** The account never keeps a project that would not open again (the same promise as saving on this computer). */
export const NOT_RIGHT = 'We could not save your last change because something in this project is not right. Your earlier save is safe. Try undoing your last change.'

const titleOf = (project: StudioProject) => project.design.name.trim().slice(0, 80) || 'My platformer'

/** The document to send, or the kid's reason it cannot be sent. */
function accountDocument(project: StudioProject): Extract<CheckedDocument, { ok: true }> {
  const checked = checkedHackableDocument(project)
  if (!checked.ok) throw new Error(NOT_RIGHT)
  if (checked.bytes > ACCOUNT_DOCUMENT_MAX_BYTES) throw new Error(TOO_BIG)
  return checked
}

export async function createHackableWorld(project: StudioProject, client: ClassroomClientSurface = browserClassroomClient, title = titleOf(project)): Promise<ClassroomWorld> {
  const { document } = accountDocument(project)
  return client.createWorld({ title: title.slice(0, 80), document: document as never })
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
        const { document } = accountDocument(project)
        const world = await this.client.saveWorld(this.world.id, { expectedRevision: this.world.revision, title: titleOf(project), document: document as never })
        this.world = { ...this.world, ...world, document: undefined }
        this.error = ''
        this.set(this.pending ? 'pending' : 'saved')
      } catch (error) {
        this.pending ??= project
        this.error = error instanceof ClassroomError && error.code === 'revision_conflict'
          ? 'A newer version of this project was saved somewhere else. Reload to get it.'
          : error instanceof ClassroomError && error.code === 'too_large'
            ? TOO_BIG
            : error instanceof Error ? error.message : 'Saving did not work. Your project is still here.'
        this.set('error')
      }
    })()
    await this.running
    this.running = null
    if (this.pending && this.status !== 'error') this.schedule(this.pending)
  }
}
