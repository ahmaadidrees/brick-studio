import { createPlatformerDocument, isPlatformerDocument, validatePlatformerDocument } from '@brick-studio/platformer-core/document'
import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { browserClassroomClient, ClassroomError } from '../../classroom/client'
import type { CloudSaveStatus } from '../../classroom/cloudAutosave'
import type { ClassroomWorld } from '../../classroom/contracts'

/*
 * 2D levels saved to an account: ordinary classroom worlds whose document is a 2D level
 * (`{ format: 'brickgineers-2d', … }`), so My worlds, sharing with the class, copies and
 * checkpoints all work as they do for 3D worlds.
 */

/** Thrown when the world exists but is another kind of project (the caller sends it to its own page). */
export class NotALevelError extends Error {
  constructor(
    readonly worldId: string,
    readonly format?: ClassroomWorld['format'],
  ) {
    super('This world is not a 2D level.')
  }
}

/**
 * Thrown when the world is a 2D level this app cannot read (a newer version, or damaged). It must not go to the 3D
 * studio: that sends every 2D level straight back here, and the page would bounce between the two for ever.
 */
export class UnreadableLevelError extends Error {
  constructor(
    readonly world: ClassroomWorld,
    readonly reason: string,
  ) {
    super('This project could not be opened.')
  }
}

export async function loadCloudLevel(id: string): Promise<{ world: ClassroomWorld; level: LevelDesign }> {
  const { world } = await browserClassroomClient.request<{ world: ClassroomWorld }>(`/worlds/${encodeURIComponent(id)}`)
  const checked = validatePlatformerDocument(world.document)
  if (checked.ok) return { world, level: checked.level }
  if (world.format === '2d' || isPlatformerDocument(world.document)) throw new UnreadableLevelError(world, checked.reason)
  throw new NotALevelError(world.id, world.format)
}

/** A world's metadata without its document (title, owner, sharing, whether the caller may edit). */
export async function cloudWorldInfo(id: string): Promise<ClassroomWorld> {
  const { world } = await browserClassroomClient.request<{ world: ClassroomWorld }>(`/worlds/${encodeURIComponent(id)}`)
  return world
}

export async function createCloudLevel(level: LevelDesign): Promise<ClassroomWorld> {
  const { world } = await browserClassroomClient.request<{ world: ClassroomWorld }>('/worlds', 'POST', {
    kind: 'personal',
    title: level.title.trim().slice(0, 80) || 'My world',
    document: createPlatformerDocument(level),
  })
  return world
}

const SAVE_DELAY_MS = 800

/**
 * Saves an account level a moment after each change: one save at a time, the latest level wins, and a save that
 * failed keeps the level to try again. `status` follows the shared SaveStatus vocabulary.
 */
export class CloudLevelSaver {
  status: CloudSaveStatus = 'saved'
  error = ''
  private pending: LevelDesign | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private running: Promise<void> | null = null
  private readonly accountId = browserClassroomClient.getSession()?.user.id

  private assertAccount() {
    if (browserClassroomClient.getSession()?.user.id !== this.accountId) throw new Error('Your account changed. Sign in to the original account again to save. Your edits are still in this tab; download a copy before leaving.')
  }

  constructor(
    public world: ClassroomWorld,
    private readonly onChange: () => void,
  ) {}

  schedule(level: LevelDesign) {
    this.pending = level
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

  private set(status: CloudSaveStatus) {
    this.status = status
    this.onChange()
  }

  private async run(): Promise<void> {
    if (this.running) await this.running
    const level = this.pending
    if (!level) return
    this.pending = null
    this.set('saving')
    this.running = (async () => {
      try {
        this.assertAccount()
        const { world } = await browserClassroomClient.request<{ world: ClassroomWorld }>(`/worlds/${this.world.id}`, 'PUT', {
          expectedRevision: this.world.revision,
          title: level.title.trim().slice(0, 80) || 'My world',
          document: createPlatformerDocument(level),
        })
        this.assertAccount()
        this.world = { ...this.world, ...world }
        this.error = ''
        this.set(this.pending ? 'pending' : 'saved')
      } catch (error) {
        this.pending ??= level
        this.error = error instanceof ClassroomError && error.code === 'revision_conflict'
          ? 'A newer version of this world was saved somewhere else. Reload to get it.'
          : error instanceof Error ? error.message : 'Saving did not work. Your world is still here.'
        this.set('error')
      }
    })()
    await this.running
    this.running = null
    if (this.pending && this.status !== 'error') this.schedule(this.pending)
  }
}
