import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBlankLevel } from '@brick-studio/platformer-core/engine/level'
import { brickSpeedway } from '@brick-studio/platformer-core/levels/raceCourses'
import { createBrickStudioDocument } from '../brick/brickDocument'
import { saveLocalBrickStudioProject } from '../brick/documentPersistence'
import type { ClassroomClient } from '../classroom/client'
import type { ClassroomWorld } from '../classroom/contracts'
import { listDrafts, saveDraft } from '../platformer/ui/drafts'
import { LOCAL_3D_ID, importProject, kindOfWorld, listLocalProjects, moveToAccount } from './projects'

const created = vi.hoisted(() => ({ levels: [] as unknown[] }))
vi.mock('../platformer/ui/cloudLevel', () => ({
  createCloudLevel: vi.fn(async (level: { title: string }) => {
    created.levels.push(level)
    return { id: 'w2d', title: level.title, format: '2d' }
  }),
}))

const brick = { id: 'brick-a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#ffffff' }
const doc3d = () => createBrickStudioDocument([brick as never])
const fakeClient = () => ({ createWorld: vi.fn(async ({ title }: { title: string }) => ({ id: 'w3d', title, format: 'brick' }) as ClassroomWorld) }) as unknown as ClassroomClient & { createWorld: ReturnType<typeof vi.fn> }

beforeEach(() => {
  localStorage.clear()
  created.levels = []
})

describe('projects on this computer', () => {
  it('lists the 2D drafts (platformers and race tracks) and the 3D build together', () => {
    saveDraft(null, createBlankLevel(40, 20, 'Jumps'))
    saveDraft(null, { ...brickSpeedway(), title: 'Speedy' })
    saveLocalBrickStudioProject(localStorage, doc3d())
    const list = listLocalProjects()
    expect(list.map((p) => [p.title, p.kind])).toEqual([['Speedy', 'race'], ['Jumps', 'platformer'], ['My 3D build', '3d']])
    expect(list.find((p) => p.id === LOCAL_3D_ID)?.bricks).toBe(1)
  })

  it('an empty 3D plate is not a project', () => {
    saveLocalBrickStudioProject(localStorage, createBrickStudioDocument([]))
    expect(listLocalProjects()).toEqual([])
  })

  it('moving to the account makes the account copy first, then removes the one here', async () => {
    saveDraft(null, createBlankLevel(40, 20, 'Jumps'))
    const [draft] = listLocalProjects()
    const result = await moveToAccount(draft, fakeClient())
    expect(result.href).toBe('/2d/build?world=w2d')
    expect(listDrafts()).toEqual([])
    saveLocalBrickStudioProject(localStorage, doc3d())
    const client = fakeClient()
    const three = listLocalProjects().find((p) => p.id === LOCAL_3D_ID)!
    expect((await moveToAccount(three, client)).href).toBe('/build?world=w3d')
    expect(client.createWorld).toHaveBeenCalledWith(expect.objectContaining({ title: 'My 3D build' }))
    expect(listLocalProjects()).toEqual([])
  })
})

describe('importing a file makes a new project', () => {
  it('signed in: a new account project of the right kind', async () => {
    const client = fakeClient()
    expect(await importProject({ title: 'Castle', content: { kind: '3d', document: doc3d() } }, { signedIn: true, client })).toEqual({ ok: true, href: '/build?world=w3d', where: 'account' })
    expect(await importProject({ title: 'Track', content: { kind: 'race', level: brickSpeedway() } }, { signedIn: true, client })).toMatchObject({ ok: true, href: '/2d/build?world=w2d' })
    expect(created.levels).toEqual([expect.objectContaining({ title: 'Track', kit: 'race' })])
  })

  it('a guest: a new 2D draft; a 3D build asks before taking the place of the one already here', async () => {
    const two = await importProject({ title: 'Jumps', content: { kind: 'platformer', level: createBlankLevel(40, 20) } }, { signedIn: false })
    expect(two).toMatchObject({ ok: true, where: 'local' })
    expect(listDrafts()[0].title).toBe('Jumps')
    expect(await importProject({ title: 'First', content: { kind: '3d', document: doc3d() } }, { signedIn: false })).toEqual({ ok: true, href: '/build', where: 'local' })
    expect(await importProject({ title: 'Second', content: { kind: '3d', document: doc3d() } }, { signedIn: false })).toMatchObject({ ok: false, reason: 'replace-3d' })
    expect(await importProject({ title: 'Second', content: { kind: '3d', document: doc3d() } }, { signedIn: false, replace3d: true })).toMatchObject({ ok: true })
  })

  it('a full account says so', async () => {
    const client = { createWorld: vi.fn().mockRejectedValue(Object.assign(new Error('limit'), { code: 'world_limit' })) } as unknown as ClassroomClient
    expect(await importProject({ title: 'X', content: { kind: '3d', document: doc3d() } }, { signedIn: true, client })).toMatchObject({ ok: false, message: expect.stringContaining('account is full') })
  })
})

it('says what kind an account project is', () => {
  expect(kindOfWorld({ format: 'brick' })).toBe('3d')
  expect(kindOfWorld({ format: '2d' })).toBe('platformer')
  expect(kindOfWorld({ format: '2d', kit: 'race' })).toBe('race')
  expect(kindOfWorld({})).toBe('3d')
})
