import { createPlatformerDocument, validatePlatformerDocument } from '@brick-studio/platformer-core/document'
import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { browserClassroomClient, ClassroomError } from '../../classroom/client'
import type { CloudSaveStatus } from '../../classroom/cloudAutosave'
import type { ClassroomWorld } from '../../classroom/contracts'

/*
 * 2D levels saved to an account: ordinary classroom worlds whose document is a 2D level
 * (`{ format: 'brickgineers-2d', … }`), so My worlds, sharing with the class, copies and
 * checkpoints all work as they do for 3D worlds.
 */

/** Thrown when the world exists but is a 3D build (the caller sends it to the 3D studio). */
export class NotALevelError extends Error {
  constructor(readonly worldId: string) {
    super('This world is a 3D build.')
  }
}

export async function loadCloudLevel(id: string): Promise<{ world: ClassroomWorld; level: LevelDesign }> {
  const { world } = await browserClassroomClient.request<{ world: ClassroomWorld }>(`/worlds/${encodeURIComponent(id)}`)
  const checked = validatePlatformerDocument(world.document)
  if (!checked.ok) throw new NotALevelError(world.id)
  return { world, level: checked.level }
}

/** A world's metadata without its document (title, owner, sharing, whether the caller may edit). */
export async function cloudWorldInfo(id: string): Promise<ClassroomWorld> {
  const { world } = await browserClassroomClient.request<{ world: ClassroomWorld }>(`/worlds/${encodeURIComponent(id)}`)
  return world
}

export async function createCloudLevel(level: LevelDesign): Promise<ClassroomWorld> {
  const { world } = await browserClassroomClient.request<{ world: ClassroomWorld }>('/worlds', 'POST', {
    kind: 'personal',
    title: level.title.trim().slice(0, 80) || 'My level',
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
        const { world } = await browserClassroomClient.request<{ world: ClassroomWorld }>(`/worlds/${this.world.id}`, 'PUT', {
          expectedRevision: this.world.revision,
          title: level.title.trim().slice(0, 80) || 'My level',
          document: createPlatformerDocument(level),
        })
        this.world = { ...this.world, ...world }
        this.error = ''
        this.set(this.pending ? 'pending' : 'saved')
      } catch (error) {
        this.pending ??= level
        this.error = error instanceof ClassroomError && error.code === 'revision_conflict'
          ? 'A newer version of this level was saved somewhere else. Reload to get it.'
          : error instanceof Error ? error.message : 'Saving did not work. Your level is still here.'
        this.set('error')
      }
    })()
    await this.running
    this.running = null
    if (this.pending && this.status !== 'error') this.schedule(this.pending)
  }
}
