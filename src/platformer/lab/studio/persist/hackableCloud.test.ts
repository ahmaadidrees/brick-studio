import { describe, expect, it, vi } from 'vitest'
import { ClassroomError, type ClassroomClientSurface } from '../../../../classroom/client'
import type { ClassroomWorld } from '../../../../classroom/contracts'
import { oldCostume } from '../assets/oldPictures.testkit'
import { blankImage } from '../pixels'
import { createStarterProject } from '../starter'
import type { StudioProject } from '../store'
import { HackableCloudSaver, NOT_RIGHT, TOO_BIG, createHackableWorld } from './hackableCloud'
import { ACCOUNT_DOCUMENT_MAX_BYTES } from './hackableProjects'
import { accountBytes, checkedHackableDocument, projectFromDocument } from './hackableSave'

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
