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

/**
 * A new account world holding the project. With `id` (newWorldId()), asking again after an answer was lost returns
 * the world already made with that id, never a second copy.
 */
export async function createHackableWorld(project: StudioProject, client: ClassroomClientSurface = browserClassroomClient, title = titleOf(project), id?: string): Promise<ClassroomWorld> {
  const { document } = accountDocument(project)
  return client.createWorld({ title: title.slice(0, 80), document: document as never, ...(id ? { id } : {}) })
}

/** A new account world id, chosen here so a first save that is tried again never makes two copies. */
export function newWorldId(): string {
  const c = globalThis.crypto as Crypto | undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** True when trying again later may work (offline, a timeout, the server busy); false for answers that will not change. */
export function mayWorkLater(error: unknown): boolean {
  if (error instanceof ClassroomError) {
    if (['revision_conflict', 'too_large', 'world_limit', 'invalid_document', 'wrong_world_kind', 'owner_required', 'not_found', 'forbidden'].includes(error.code)) return false
    return error.status === 0 || error.status === 401 || error.status === 408 || error.status === 429 || error.status >= 500 || !error.status
  }
  if (error instanceof Error && (error.message === NOT_RIGHT || error.message === TOO_BIG)) return false
  return true
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
  const opened = projectFromDocument(world.document)
  if (!opened) throw new Error('This project could not be opened. It may be from a newer version: refresh the page and try again.')
  // The title is the project's name: Rename and copies in My projects change only the title, and the first save
  // would otherwise write the old name inside the project back over it.
  const title = typeof world.title === 'string' ? world.title.trim().slice(0, 80) : ''
  const project = title && title !== opened.design.name ? { ...opened, design: { ...opened.design, name: title } } : opened
  return { world, project }
}

/** Waits before trying a failed save again: a little longer each time, then once a minute. */
export const RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 30_000, 60_000]

/** Said when the account changed under the open project (sign-out, or "Not me" and another kid). */
export const ACCOUNT_CHANGED = 'You are signed out of the account this project belongs to, so changes are not saved. Sign in to it again, or press This project, then Save File, so you do not lose them.'
/** Said while a save keeps failing for a reason that may pass (offline, the server busy). */
export const NOT_REACHED = 'We couldn’t reach your account, so your latest changes aren’t saved yet. We keep trying. Your project is still here; do not close this tab.'

/**
 * Saves a moment after each change: one save at a time, the latest project wins, and a save that failed keeps the
 * project and tries again a little later (RETRY_DELAYS_MS), until it works. `retry()` tries now. A save refused
 * because the project was saved somewhere else since (another tab) is never tried again over it: `onConflict` is
 * told, and the caller keeps this tab's project as a copy. Same behaviour as the 2D builder's CloudLevelSaver.
 */
export class HackableCloudSaver {
  status: CloudSaveStatus = 'saved'
  error = ''
  /** Failed saves in a row (the next retry waits RETRY_DELAYS_MS[failures - 1]). */
  failures = 0
  /** Saving here stopped: the project was saved somewhere else since, and this tab's changes went to a copy. */
  conflicted = false
  /** Saves the account confirmed. */
  saves = 0
  private pending: StudioProject | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private running: Promise<void> | null = null
  private readonly accountId: string | undefined
  private stopped = false

  constructor(
    public world: ClassroomWorld,
    private readonly onChange: () => void,
    private readonly client: ClassroomClientSurface = browserClassroomClient,
    private readonly onConflict?: (project: StudioProject) => void,
  ) {
    this.accountId = client.getSession()?.user.id
  }

  schedule(project: StudioProject) {
    if (this.conflicted) return
    this.pending = project
    // While a failed save waits to be tried again, a new change waits with it (the chip keeps saying why).
    if (this.status === 'error' && this.retryTimer !== undefined) return
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

  /** "Try again": a failed save is tried now instead of at its next retry time. */
  async retry(): Promise<boolean> {
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    return this.flush()
  }

  /** Stop trying again in the background (the project closed). */
  stop() {
    this.stopped = true
    clearTimeout(this.timer)
    clearTimeout(this.retryTimer)
  }

  /** Changes the account does not have yet (also while a conflict's copy is still being made). */
  get dirty() {
    return this.conflicted || this.pending !== null || this.status === 'saving' || this.status === 'error'
  }

  private set(status: CloudSaveStatus) {
    this.status = status
    this.onChange()
  }

  private async run(): Promise<void> {
    if (this.running) await this.running
    const project = this.pending
    if (!project || this.conflicted) return
    this.pending = null
    this.set('saving')
    this.running = (async () => {
      try {
        if (this.client.getSession()?.user.id !== this.accountId) throw new Error(ACCOUNT_CHANGED)
        const { document } = accountDocument(project)
        const world = await this.client.saveWorld(this.world.id, { expectedRevision: this.world.revision, title: titleOf(project), document: document as never })
        this.world = { ...this.world, ...world, document: undefined }
        this.error = ''
        this.failures = 0
        this.saves += 1
        clearTimeout(this.retryTimer)
        this.retryTimer = undefined
        this.set(this.pending ? 'pending' : 'saved')
      } catch (error) {
        this.pending ??= project
        if (error instanceof ClassroomError && error.code === 'revision_conflict' && this.onConflict) {
          // Never saved over the newer version: this tab's project is kept as a copy instead.
          this.conflicted = true
          this.error = 'A newer version of this project was saved somewhere else.'
          const mine = this.pending
          this.pending = null
          this.set('error')
          this.onConflict(mine)
          return
        }
        this.failures += 1
        const later = mayWorkLater(error)
        this.error = error instanceof ClassroomError && error.code === 'revision_conflict'
          ? 'A newer version of this project was saved somewhere else. Press This project, then Save File to keep your changes here.'
          : error instanceof ClassroomError && error.code === 'too_large'
            ? TOO_BIG
            : error instanceof Error && error.message === ACCOUNT_CHANGED
              ? ACCOUNT_CHANGED
              : later
                ? NOT_REACHED
                : error instanceof Error ? error.message : 'Saving did not work. Your project is still here.'
        this.set('error')
        // Offline, busy, or signed out: try again a little later, and keep trying.
        if ((later || this.error === ACCOUNT_CHANGED) && !this.stopped) {
          clearTimeout(this.retryTimer)
          const delay = RETRY_DELAYS_MS[Math.min(this.failures, RETRY_DELAYS_MS.length) - 1]
          this.retryTimer = setTimeout(() => { this.retryTimer = undefined; void this.flush() }, delay)
        }
      }
    })()
    await this.running
    this.running = null
    if (this.pending && this.status !== 'error' && !this.conflicted) this.schedule(this.pending)
  }
}
