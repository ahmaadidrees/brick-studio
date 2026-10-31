import { describe, expect, it, vi } from 'vitest'
import { ClassroomError, type ClassroomClientSurface } from '../../../../classroom/client'
import type { ClassroomWorld } from '../../../../classroom/contracts'
import { oldCostume } from '../assets/oldPictures.testkit'
import { blankImage } from '../pixels'
import { createStarterProject } from '../starter'
import type { StudioProject } from '../store'
import { ACCOUNT_CHANGED, HackableCloudSaver, NOT_REACHED, NOT_RIGHT, RETRY_DELAYS_MS, TOO_BIG, createHackableWorld, loadHackableWorld, mayWorkLater, newWorldId } from './hackableCloud'
import { ACCOUNT_DOCUMENT_MAX_BYTES } from './hackableProjects'
import { accountBytes, checkedHackableDocument, hackableDocument, projectFromDocument } from './hackableSave'

const world = { id: 'w1', title: 'Mine', revision: 3, format: 'hackable' } as ClassroomWorld

function fakeClient() {
  const saveWorld = vi.fn(async (_id: string, input: { expectedRevision: number; document: unknown }) => ({ ...world, revision: input.expectedRevision + 1 }))
  const createWorld = vi.fn(async (input: { title: string; document: unknown }) => ({ ...world, id: 'w2', title: input.title }))
  const client = { getSession: () => ({ user: { id: 'u1' } }), saveWorld, createWorld } as unknown as ClassroomClientSurface
  return { client, saveWorld, createWorld }
}

/** A project the game would refuse to open: a copy of a brick that is not in the level. */
function brokenProject(): StudioProject {
  const project = createStarterProject()
  project.design.copies = [...project.design.copies, { id: 'ghost', brickId: 'no_such_brick', x: 0, y: 0 }]
  return project
}

/** A project holding the old 922,000-character blank backdrop, as an open tab may still have it. */
function oldBackdropProject(): StudioProject {
  const project = createStarterProject()
  const sky = oldCostume('Sky', blankImage(480, 360))
  project.design.stage = { ...project.design.stage, costumes: [{ ...sky, mask: undefined }] }
  return project
}

async function saveOnce(saver: HackableCloudSaver, project: StudioProject) {
  vi.useFakeTimers()
  saver.schedule(project)
  await vi.advanceTimersByTimeAsync(1500)
  vi.useRealTimers()
}

describe('saving a Hackable Platformer to the account', () => {
  it('never sends a project that would not open again, and tells the kid', async () => {
    const { client, saveWorld } = fakeClient()
    const saver = new HackableCloudSaver(world, () => {}, client)
    await saveOnce(saver, brokenProject())
    expect(saveWorld).not.toHaveBeenCalled()
    expect(saver.status).toBe('error')
    expect(saver.error).toBe(NOT_RIGHT)
    // The next good change saves as usual.
    await saveOnce(saver, createStarterProject())
    expect(saveWorld).toHaveBeenCalledTimes(1)
    expect(saver.status).toBe('saved')
  })

  it('puts an oversized picture right and sends a project that reopens', async () => {
    const { client, saveWorld } = fakeClient()
    const saver = new HackableCloudSaver(world, () => {}, client)
    await saveOnce(saver, oldBackdropProject())
    expect(saver.status).toBe('saved')
    const sent = saveWorld.mock.calls[0][1].document
    expect(projectFromDocument(JSON.parse(JSON.stringify(sent)))).not.toBeNull()
  })

  it('a new account project is checked the same way', async () => {
    const { client, createWorld } = fakeClient()
    await expect(createHackableWorld(brokenProject(), client)).rejects.toThrow(NOT_RIGHT)
    expect(createWorld).not.toHaveBeenCalled()
    await createHackableWorld(createStarterProject(), client)
    expect(createWorld).toHaveBeenCalledTimes(1)
  })

  it('says “too big” in kid words when the account refuses the size', async () => {
    const { client, saveWorld } = fakeClient()
    saveWorld.mockRejectedValueOnce(new ClassroomError('This world exceeds the storage size limit.', 413, 'too_large'))
    const saver = new HackableCloudSaver(world, () => {}, client)
    await saveOnce(saver, createStarterProject())
    expect(saver.error).toBe(TOO_BIG)
  })

  it('counts size the way the account does (a space after every “:” and “,” outside text)', () => {
    expect(accountBytes({ a: 1, b: [1, 2], c: 'x, y: z' })).toBe(JSON.stringify({ a: 1, b: [1, 2], c: 'x, y: z' }).length + 6)
    const checked = checkedHackableDocument(createStarterProject())
    expect(checked.ok && checked.bytes).toBeLessThan(ACCOUNT_DOCUMENT_MAX_BYTES / 2)
  })
})

describe('when an account save fails', () => {
  const unreachable = () => new ClassroomError('Could not connect.', 0, 'unreachable')

  it('keeps trying on its own, a little later each time, until it works; “Try again” tries now', async () => {
    vi.useFakeTimers()
    try {
      const { client, saveWorld } = fakeClient()
      saveWorld.mockRejectedValueOnce(unreachable()).mockRejectedValueOnce(unreachable()).mockRejectedValueOnce(unreachable())
      const saver = new HackableCloudSaver(world, () => {}, client)
      saver.schedule(createStarterProject())
      await vi.advanceTimersByTimeAsync(1500)
      expect(saver.status).toBe('error')
      expect(saver.error).toBe(NOT_REACHED)
      expect(saver.error).not.toMatch(/reload/i)
      expect(saver.dirty).toBe(true)
      // A change made meanwhile waits for the retry, which saves the latest project.
      saver.schedule({ ...createStarterProject(), design: { ...createStarterProject().design, name: 'Latest' } })
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])
      expect(saveWorld).toHaveBeenCalledTimes(2)
      // "Try again" does not wait for the next retry time.
      await saver.retry()
      expect(saveWorld).toHaveBeenCalledTimes(3)
      expect(saver.status).toBe('error')
      await saver.retry()
      expect(saveWorld).toHaveBeenCalledTimes(4)
      expect(saver.status).toBe('saved')
      expect(saver.saves).toBe(1)
      expect(saveWorld.mock.calls[3][1]).toMatchObject({ title: 'Latest' })
      await vi.advanceTimersByTimeAsync(120_000)
      expect(saveWorld).toHaveBeenCalledTimes(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it('a project saved somewhere else since is never saved over: the caller keeps this tab’s project as a copy', async () => {
    const { client, saveWorld } = fakeClient()
    saveWorld.mockRejectedValue(new ClassroomError('conflict', 409, 'revision_conflict'))
    const onConflict = vi.fn()
    const saver = new HackableCloudSaver(world, () => {}, client, onConflict)
    const mine = { ...createStarterProject(), design: { ...createStarterProject().design, name: 'Mine here' } }
    await saveOnce(saver, mine)
    expect(onConflict).toHaveBeenCalledWith(mine)
    expect(saver.conflicted).toBe(true)
    expect(saver.dirty).toBe(true)
    await saveOnce(saver, createStarterProject())
    expect(saveWorld).toHaveBeenCalledTimes(1)
  })

  it('a signed-out kid is told plainly, and saving goes on once they are back', async () => {
    vi.useFakeTimers()
    try {
      const { saveWorld } = fakeClient()
      let user: { id: string } | null = { id: 'u1' }
      const client = { getSession: () => (user ? { user } : null), saveWorld } as unknown as ClassroomClientSurface
      const saver = new HackableCloudSaver(world, () => {}, client)
      user = null
      saver.schedule(createStarterProject())
      await vi.advanceTimersByTimeAsync(1500)
      expect(saver.error).toBe(ACCOUNT_CHANGED)
      user = { id: 'u1' }
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0])
      expect(saver.status).toBe('saved')
      expect(saveWorld).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not keep trying what will never work (too big)', () => {
    expect(mayWorkLater(new ClassroomError('too big', 413, 'too_large'))).toBe(false)
    expect(mayWorkLater(new ClassroomError('full', 409, 'world_limit'))).toBe(false)
    expect(mayWorkLater(new Error(NOT_RIGHT))).toBe(false)
    expect(mayWorkLater(unreachable())).toBe(true)
    expect(mayWorkLater(new ClassroomError('busy', 502, 'service_unavailable'))).toBe(true)
  })
})

describe('the first save and opening', () => {
  it('a new account project carries the id chosen here, so trying again never makes two', async () => {
    const { client, createWorld } = fakeClient()
    const id = newWorldId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    await createHackableWorld(createStarterProject(), client, 'Mine', id)
    expect(createWorld.mock.calls[0][0]).toMatchObject({ title: 'Mine', id })
  })

  it('opens with the title as the name, so Rename and copies in My projects stick', async () => {
    const inside = { ...createStarterProject(), design: { ...createStarterProject().design, name: 'Alpha' } }
    const renamed = { ...world, title: 'Beta', document: hackableDocument(inside) } as unknown as ClassroomWorld
    const client = { getWorld: vi.fn(async () => renamed) } as unknown as ClassroomClientSurface
    const { project } = await loadHackableWorld('w1', client)
    expect(project.design.name).toBe('Beta')
    // So the first save sends the title it already has.
    const { client: saving, saveWorld } = fakeClient()
    await saveOnce(new HackableCloudSaver(renamed, () => {}, saving), project)
    expect(saveWorld.mock.calls[0][1]).toMatchObject({ title: 'Beta' })
  })
})
