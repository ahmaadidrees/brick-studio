import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { browserClassroomClient, type ClassroomClientSurface } from '../../../classroom/client'
import type { ClassroomWorld } from '../../../classroom/contracts'
import { exportProjectJson } from './persist/projectIo'
import { HACKABLE_INDEX_KEY, listHackableProjects, projectKey } from './persist/hackableProjects'
import { projectFromDocument } from './persist/hackableSave'
import { createStarterProject } from './starter'
import { designSignature, keepNewProject, makeOwnCopy, openStudioRoute } from './StudioApp'

beforeEach(() => localStorage.clear())

const named = (name: string) => ({ ...createStarterProject(), design: { ...createStarterProject().design, name } })

describe('opening /2d/hackable?draft=', () => {
  it('opens a project whose save is here even when the list lost it', async () => {
    localStorage.setItem(projectKey('h1'), exportProjectJson(named('Rocket run')))
    localStorage.setItem(HACKABLE_INDEX_KEY, '[]')
    const opened = await openStudioRoute({ draft: 'h1', fresh: false })
    expect(opened).toMatchObject({ kind: 'local', id: 'h1' })
    expect(opened.kind === 'local' && opened.project.design.name).toBe('Rocket run')
  })

  it('says so when the save is not on this computer', async () => {
    const opened = await openStudioRoute({ draft: 'gone', fresh: false })
    expect(opened).toMatchObject({ kind: 'problem', title: 'That project isn’t on this computer' })
  })
})

describe('“Make my own copy” of a classmate’s project', () => {
  const classmates = { id: 'w9', title: 'Ava’s level', revision: 2, format: 'hackable', ownerId: 'ava', canEdit: false } as unknown as ClassroomWorld

  function client(createWorld = vi.fn(async (input: { title: string; document: unknown }) => ({ ...classmates, id: 'mine1', title: input.title, ownerId: 'me' }))) {
    const copyWorld = vi.fn()
    return { surface: { getSession: () => ({ user: { id: 'me' } }), createWorld, copyWorld } as unknown as ClassroomClientSurface, createWorld, copyWorld }
  }

  it('copies the project as it is on screen, with what the kid tried, under a new name', async () => {
    const tried = named('Ava’s level')
    tried.design.copies = [...tried.design.copies, { id: 'my_coin', brickId: 'brick_coin', x: 500, y: 120 }]
    const { surface, createWorld, copyWorld } = client()
    const href = await makeOwnCopy(classmates, tried, surface)
    expect(href).toBe('/2d/hackable?world=mine1')
    expect(copyWorld).not.toHaveBeenCalled()
    const sent = createWorld.mock.calls[0][0] as { title: string; document: unknown }
    expect(sent.title).toBe('Ava’s level (copy)')
    const project = projectFromDocument(JSON.parse(JSON.stringify(sent.document)))!
    expect(project.design.copies.some((c) => c.id === 'my_coin')).toBe(true)
    expect(project.design.name).toBe('Ava’s level (copy)')
  })

  it('keeps the copy in this browser when the account is full', async () => {
    const { surface } = client(vi.fn(async () => { throw Object.assign(new Error('full'), { code: 'world_limit' }) }))
    const href = await makeOwnCopy(classmates, named('Ava’s level'), surface)
    expect(href).toMatch(/^\/2d\/hackable\?draft=/)
    expect(listHackableProjects().map((e) => e.title)).toEqual(['Ava’s level (copy)'])
  })
})

describe('opening an account project from a link or an invite', () => {
  const save = () => JSON.parse(exportProjectJson(named('Ava’s level')))
  const world = (over: Partial<ClassroomWorld>) => ({ id: 'w9', title: 'Ava’s level', revision: 2, format: 'hackable', ownerId: 'ava', canEdit: true, document: { format: 'brickgineers-hackable', version: 1, save: save() }, ...over }) as unknown as ClassroomWorld

  afterEach(() => vi.restoreAllMocks())

  it('a classmate who may build in it still opens it look-only, so nobody saves over the owner', async () => {
    vi.spyOn(browserClassroomClient, 'getSession').mockReturnValue({ user: { id: 'ben' } } as never)
    vi.spyOn(browserClassroomClient, 'getWorld').mockResolvedValue(world({ canEdit: true }))
    expect(await openStudioRoute({ world: 'w9', fresh: false })).toMatchObject({ kind: 'viewer' })
  })

  it('the owner opens it to edit and save', async () => {
    vi.spyOn(browserClassroomClient, 'getSession').mockReturnValue({ user: { id: 'ava' } } as never)
    vi.spyOn(browserClassroomClient, 'getWorld').mockResolvedValue(world({ canEdit: true }))
    expect(await openStudioRoute({ world: 'w9', fresh: false })).toMatchObject({ kind: 'account' })
  })
})

describe('a new project (?new=1) is kept only once the kid changes something', () => {
  const projectKeys = () => Object.keys(localStorage).filter((k) => k.startsWith('code-lab.project.v1'))

  it('opening one stores nothing', async () => {
    const opened = await openStudioRoute({ fresh: true })
    expect(opened.kind).toBe('new')
    expect(projectKeys()).toEqual([])
    expect(listHackableProjects()).toEqual([])
  })

  it('a guest’s is kept in this browser at the first change', async () => {
    const kept = await keepNewProject(named('My platformer'), { getSession: () => null } as unknown as ClassroomClientSurface)
    expect(kept.home.kind).toBe('local')
    expect(kept.href).toMatch(/^\/2d\/hackable\?draft=/)
    expect(listHackableProjects().map((e) => e.title)).toEqual(['My platformer'])
  })

  it('a signed-in kid’s goes to the account', async () => {
    const createWorld = vi.fn(async (input: { title: string }) => ({ id: 'w-new', title: input.title, revision: 1, format: 'hackable', ownerId: 'me' }))
    const kept = await keepNewProject(named('My platformer'), { getSession: () => ({ user: { id: 'me' } }), createWorld } as unknown as ClassroomClientSurface)
    expect(kept).toMatchObject({ home: { kind: 'account' }, href: '/2d/hackable?world=w-new' })
    expect(projectKeys()).toEqual([])
  })

  it('with the account full (50 projects) it is kept in this browser instead, and the kid is told', async () => {
    const createWorld = vi.fn(async () => { throw Object.assign(new Error('full'), { code: 'world_limit' }) })
    const kept = await keepNewProject(named('My platformer'), { getSession: () => ({ user: { id: 'me' } }), createWorld } as unknown as ClassroomClientSurface)
    expect(kept.home.kind).toBe('local')
    expect(kept.notice?.message).toMatch(/Your account is full, so this project is saved on this computer/)
    expect(listHackableProjects()).toHaveLength(1)
  })

  it('a guest whose browser already keeps the most hears so before building', async () => {
    for (let i = 0; i < 30; i++) localStorage.setItem(projectKey(`p${i}`), JSON.stringify({ design: { name: `P${i}` } }))
    expect(await openStudioRoute({ fresh: true })).toMatchObject({ kind: 'problem', title: 'This computer is full of projects' })
  })
})

describe('what counts as the first change', () => {
  it('the same level with its scripts in another order is no change; a moved coin is', () => {
    const project = named('Mine')
    const hero = project.design.bricks[0]
    const reordered = { ...project.design, bricks: [{ ...hero, program: { ...hero.program, scripts: [...hero.program.scripts].reverse() } }, ...project.design.bricks.slice(1)] }
    expect(designSignature(reordered)).toBe(designSignature(project.design))
    const moved = { ...project.design, copies: project.design.copies.map((c, i) => (i === 0 ? { ...c, x: c.x + 16 } : c)) }
    expect(designSignature(moved)).not.toBe(designSignature(project.design))
  })
})
