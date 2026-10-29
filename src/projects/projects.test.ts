import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBlankLevel } from '@brick-studio/platformer-core/engine/level'
import { brickSpeedway } from '@brick-studio/platformer-core/levels/raceCourses'
import { createBrickStudioDocument } from '../brick/brickDocument'
import { saveLocalBrickStudioProject } from '../brick/documentPersistence'
import type { ClassroomClient } from '../classroom/client'
import type { ClassroomWorld } from '../classroom/contracts'
import { listDrafts, saveDraft } from '../platformer/ui/drafts'
import { listHackableProjects, saveHackableText, touchHackableEntry } from '../platformer/lab/studio/persist/hackableProjects'
import { LOCAL_3D_ID, importProject, kindOfWorld, listLocalProjects, localProject, localProjectAge, moveToAccount, projectHref, removeLocalProject } from './projects'

const created = vi.hoisted(() => ({ levels: [] as unknown[] }))
vi.mock('../platformer/ui/cloudLevel', () => ({
  createCloudLevel: vi.fn(async (level: { title: string }) => {
    created.levels.push(level)
    return { id: 'w2d', title: level.title, format: '2d' }
  }),
}))

const brick = { id: 'brick-a', partId: 'brick_2x4', x: 10, y: 0, z: 10, rotation: 0, color: '#ffffff' }
const doc3d = () => createBrickStudioDocument([brick as never])
type ClientWithCreate = ClassroomClient & { createWorld: ReturnType<typeof vi.fn> }
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

describe('Hackable Platformers in My projects', () => {
  const save = { schemaVersion: 1, design: { name: 'Hacky' }, workspaces: {} }
  const hackableClient = () => ({ createWorld: vi.fn(async ({ title }: { title: string }) => ({ id: 'wh', title, format: 'hackable' }) as ClassroomWorld) }) as unknown as ClientWithCreate

  it('lists them with the rest, with their picture, opening in the Hackable Platformer', () => {
    saveHackableText('h1', 'Hacky', JSON.stringify(save))
    touchHackableEntry('h1', 'Hacky', undefined, 'data:image/jpeg;base64,AAA')
    saveDraft(null, createBlankLevel(40, 20, 'Jumps'))
    const hack = listLocalProjects().find((p) => p.kind === 'hackable')!
    expect(hack).toMatchObject({ id: 'h1', title: 'Hacky', href: '/2d/hackable?draft=h1', picture: 'data:image/jpeg;base64,AAA' })
    expect(localProject(hack)).toEqual({ title: 'Hacky', content: { kind: 'hackable', document: { format: 'brickgineers-hackable', version: 1, save } } })
    removeLocalProject(hack)
    expect(listHackableProjects()).toEqual([])
    expect(listDrafts()).toHaveLength(1)
  })

  it('moves one to the account as a Hackable world, then removes the one here', async () => {
    saveHackableText('h1', 'Hacky', JSON.stringify(save))
    const client = hackableClient()
    const [hack] = listLocalProjects()
    expect((await moveToAccount(hack, client)).href).toBe('/2d/hackable?world=wh')
    expect(client.createWorld).toHaveBeenCalledWith({ title: 'Hacky', document: { format: 'brickgineers-hackable', version: 1, save } })
    expect(listHackableProjects()).toEqual([])
  })

  it('imports one: into the account when signed in, into this browser for a guest', async () => {
    const project = { title: 'Hacky', content: { kind: 'hackable' as const, document: { format: 'brickgineers-hackable' as const, version: 1 as const, save } } }
    expect(await importProject(project, { signedIn: true, client: hackableClient() })).toEqual({ ok: true, href: '/2d/hackable?world=wh', where: 'account' })
    const local = await importProject(project, { signedIn: false })
    expect(local).toMatchObject({ ok: true, where: 'local', href: expect.stringMatching(/^\/2d\/hackable\?draft=h/) })
    expect(listHackableProjects()[0].title).toBe('Hacky')
  })

  it('says what kind an account one is, and where it opens', () => {
    expect(kindOfWorld({ format: 'hackable' })).toBe('hackable')
    expect(projectHref({ id: 'abc', format: 'hackable' })).toBe('/2d/hackable?world=abc')
  })
})

describe('how old a project on this computer is', () => {
  const now = new Date(2026, 9, 28, 15, 0).getTime()
  const at = (days: number, hour = 9) => new Date(2026, 9, 28 - days, hour, 0).getTime()
  it('counts calendar days, then weeks, then names the date', () => {
    expect(localProjectAge({ updated: at(0) }, now)).toBe('saved today')
    expect(localProjectAge({ updated: new Date(2026, 9, 27, 23, 50).getTime() }, now)).toBe('saved yesterday')
    expect(localProjectAge({ updated: at(3) }, now)).toBe('saved 3 days ago')
    expect(localProjectAge({ updated: at(7) }, now)).toBe('saved 1 week ago')
    expect(localProjectAge({ updated: at(20) }, now)).toBe('saved 2 weeks ago')
    expect(localProjectAge({ updated: at(60) }, now)).toMatch(/^saved Aug 29, 2026$/)
  })
  it('the 3D build keeps no date, so it says how big it is', () => {
    expect(localProjectAge({ updated: 0, bricks: 12 }, now)).toBe('12 bricks, no date')
    expect(localProjectAge({ updated: 0, bricks: 1 }, now)).toBe('1 brick, no date')
    expect(localProjectAge({ updated: 0 }, now)).toBe('no date')
  })
})
