import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserClassroomClient, type ClassroomClientSurface } from '../../../classroom/client'
import type { ClassroomWorld } from '../../../classroom/contracts'
import { HACKABLE_INDEX_KEY, listHackableProjects, projectKey } from './persist/hackableProjects'
import { saveHackableProject } from './persist/hackableSave'
import { exportProjectJson } from './persist/projectIo'
import { createRaceStarterProject } from './race/raceProject'
import { createStarterProject } from './starter'
import { createStarter3dProject } from './three/project3d'
import type { StudioStore } from './store'
import StudioApp, { SAVE_WORDS, keepNewProject, makeOwnCopy, notKeptMessage, openStudioRoute } from './StudioApp'

vi.mock('./gridBricks', async (orig) => ({ ...(await orig<typeof import('./gridBricks')>()), gridBrickTemplate: (await import('./builder/testGridBricks')).fakeGridTemplate }))
vi.mock('./CodeEditor', () => ({ CodeEditor: () => <div aria-label="Docked code editor">Code editor</div> }))

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear() })

const studio = () => (window as unknown as { __studio: StudioStore }).__studio

describe('/2d/hackable?new=1 in the page', () => {
  it('opens a project without keeping it, then keeps it (and names it in the address) at the first change', async () => {
    window.history.replaceState(null, '', '/2d/hackable?new=1')
    render(<StudioApp route={{ fresh: true }} />)
    await screen.findByRole('radio', { name: 'Build' })
    expect(listHackableProjects()).toEqual([])
    expect(window.location.search).toBe('?new=1')

    await act(async () => { studio().addCopy('brick_coin', 400, 140) })
    // The first keep is quick but not instant; wait for it rather than a fixed delay (a loaded machine can miss 20 ms).
    await waitFor(() => expect(listHackableProjects()[0]?.title).toBe('My platformer'))
    const [entry] = listHackableProjects()
    expect(window.location.search).toBe(`?draft=${entry.id}`)

    // Later changes save under it as usual.
    await act(async () => { studio().addCopy('brick_coin', 420, 140); await new Promise((r) => setTimeout(r, 700)) })
    expect(localStorage.getItem(`code-lab.project.v1:${entry.id}`)).toContain('"x":420')
  })
})

describe('the save chip on this computer (a guest)', () => {
  const chip = (name: string | RegExp) => screen.findByRole('button', { name })
  const explains = async (name: string, words: string) => {
    fireEvent.click(await chip(name))
    expect(screen.getByRole('note').textContent).toContain(words)
    fireEvent.click(await chip(name))
  }

  it('says where a new project will be kept, then Saved, then Saving… and Saved again after each change', async () => {
    window.history.replaceState(null, '', '/2d/hackable?new=1')
    render(<StudioApp route={{ fresh: true }} />)
    await explains('On this computer only', SAVE_WORDS.newLocal)

    await act(async () => { studio().addCopy('brick_coin', 400, 140) })
    await chip('Saved on this computer')
    await explains('Saved on this computer', 'open the ⋯ menu (This project) and press Save File')

    await act(async () => { studio().addCopy('brick_coin', 420, 140) })
    expect(await chip('Saving…')).toBeTruthy()
    expect(await chip('Saved on this computer')).toBeTruthy()
  })

  it('says Couldn’t save when the browser refuses the write, and the banner still says what to do', async () => {
    window.history.replaceState(null, '', '/2d/hackable?new=1')
    render(<StudioApp route={{ fresh: true }} />)
    await screen.findByRole('radio', { name: 'Build' })
    await act(async () => { studio().addCopy('brick_coin', 400, 140) })
    await chip('Saved on this computer')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    await act(async () => { studio().addCopy('brick_coin', 420, 140) })
    await explains('Couldn’t save', SAVE_WORDS.localFailed)
    expect(screen.getByRole('alert').textContent).toContain('could not be saved on this computer')
  })
})

describe('Hackable Racing: /2d/hackable-race', () => {
  const race = (name = 'My race track') => { const p = createRaceStarterProject(); return { ...p, design: { ...p.design, name } } }
  const platformer = (name: string) => { const p = createStarterProject(); return { ...p, design: { ...p.design, name } } }
  const guest = { getSession: () => null } as unknown as ClassroomClientSurface

  it('?new=1 opens "My race track" on the beginner track, kept with its game at the first change', async () => {
    window.history.replaceState(null, '', '/2d/hackable-race?new=1')
    render(<StudioApp route={{ fresh: true, kit: 'race' }} />)
    await screen.findByRole('radio', { name: 'Build' })
    const design = studio().getState().project.design
    expect(design).toMatchObject({ kit: 'race', name: 'My race track' })
    expect(design.copies).toHaveLength(createRaceStarterProject().design.copies.length)
    expect(document.title).toBe('My race track · Hackable Racing · Brickgineers')
    expect(listHackableProjects()).toEqual([])

    await act(async () => { studio().renameProject('Ice ring') })
    await waitFor(() => expect(listHackableProjects()[0]).toMatchObject({ title: 'Ice ring', kit: 'race' }))
    const [entry] = listHackableProjects()
    expect(window.location.pathname + window.location.search).toBe(`/2d/hackable-race?draft=${entry.id}`)
    expect(JSON.parse(localStorage.getItem(`code-lab.project.v1:${entry.id}`)!).design.kit).toBe('race')
  })

  it('keeps a new race track in the account, or this browser, at the race address', async () => {
    const local = await keepNewProject(race(), guest)
    expect(local.href).toMatch(/^\/2d\/hackable-race\?draft=h/)
    expect(listHackableProjects()[0]).toMatchObject({ title: 'My race track', kit: 'race' })
    const createWorld = vi.fn(async (input: { title: string }) => ({ id: 'w-race', title: input.title, revision: 1, format: 'hackable', kit: 'race', ownerId: 'me' }))
    const account = await keepNewProject(race(), { getSession: () => ({ user: { id: 'me' } }), createWorld } as unknown as ClassroomClientSurface)
    expect(account).toMatchObject({ home: { kind: 'account' }, href: '/2d/hackable-race?world=w-race' })
    expect(createWorld.mock.calls[0][0].title).toBe('My race track')
  })

  it('with no project named, each address opens its own game’s newest project', async () => {
    expect(await openStudioRoute({ fresh: false, kit: 'race' })).toMatchObject({ kind: 'new', project: { design: { kit: 'race', name: 'My race track' } } })
    saveHackableProject('r1', race('Older track'))
    saveHackableProject('r2', race('Newer track'))
    saveHackableProject('p1', platformer('Newest platformer'))
    window.history.replaceState(null, '', '/2d/hackable-race')
    expect(await openStudioRoute({ fresh: false, kit: 'race' })).toMatchObject({ kind: 'local', id: 'r2', project: { design: { kit: 'race', name: 'Newer track' } } })
    expect(window.location.search).toBe('?draft=r2')
    window.history.replaceState(null, '', '/2d/hackable')
    expect(await openStudioRoute({ fresh: false })).toMatchObject({ kind: 'local', id: 'p1' })
    expect(window.location.search).toBe('?draft=p1')
  })

  it('an entry made before kits counts as a Platformer', async () => {
    localStorage.setItem(projectKey('old'), exportProjectJson(platformer('Old one')))
    localStorage.setItem(HACKABLE_INDEX_KEY, JSON.stringify([{ id: 'old', title: 'Old one', updated: Date.now() }]))
    expect(await openStudioRoute({ fresh: false })).toMatchObject({ kind: 'local', id: 'old' })
    expect(await openStudioRoute({ fresh: false, kit: 'race' })).toMatchObject({ kind: 'new' })
  })

  it('a race track opened at the Platformer’s address opens as itself, and the address is put right', async () => {
    saveHackableProject('r1', race('Ice ring'))
    window.history.replaceState(null, '', '/2d/hackable?draft=r1')
    expect(await openStudioRoute({ draft: 'r1', fresh: false })).toMatchObject({ kind: 'local', project: { design: { kit: 'race' } } })
    expect(window.location.pathname + window.location.search).toBe('/2d/hackable-race?draft=r1')
  })

  it('opens an account race track, and Make my own copy keeps it a race track', async () => {
    const save = JSON.parse(exportProjectJson(race('Ava’s track')))
    const world = { id: 'w9', title: 'Ava’s track', revision: 2, format: 'hackable', kit: 'race', ownerId: 'ava', ownerName: 'Ava B.', canEdit: true, document: { format: 'brickgineers-hackable', version: 1, save } } as unknown as ClassroomWorld
    vi.spyOn(browserClassroomClient, 'getSession').mockReturnValue({ user: { id: 'ben' } } as never)
    vi.spyOn(browserClassroomClient, 'getWorld').mockResolvedValue(world)
    const opened = await openStudioRoute({ world: 'w9', fresh: false, kit: 'race' })
    expect(opened).toMatchObject({ kind: 'viewer', project: { design: { kit: 'race' } } })

    const createWorld = vi.fn(async (input: { title: string }) => ({ ...world, id: 'mine1', title: input.title, ownerId: 'ben' }))
    const client = { getSession: () => ({ user: { id: 'ben' } }), createWorld } as unknown as ClassroomClientSurface
    const project = opened.kind === 'viewer' ? opened.project : race()
    expect(await makeOwnCopy(world, project, client)).toBe('/2d/hackable-race?world=mine1')
    const sent = createWorld.mock.calls[0][0] as unknown as { document: { save: { design: { kit: string; name: string } } } }
    expect(sent.document.save.design).toMatchObject({ kit: 'race', name: 'Ava’s track (copy)' })

    const full = { getSession: () => ({ user: { id: 'ben' } }), createWorld: vi.fn(async () => { throw Object.assign(new Error('full'), { code: 'world_limit' }) }) } as unknown as ClassroomClientSurface
    expect(await makeOwnCopy(world, project, full)).toMatch(/^\/2d\/hackable-race\?draft=h/)
    expect(listHackableProjects()[0]).toMatchObject({ title: 'Ava’s track (copy)', kit: 'race' })
  })

  it('the shared limit and its words name every game together', async () => {
    for (let i = 0; i < 30; i++) localStorage.setItem(projectKey(`p${i}`), JSON.stringify({ design: { name: `P${i}`, ...(i % 2 ? { kit: 'race' } : {}) } }))
    expect(await openStudioRoute({ fresh: true, kit: 'race' })).toMatchObject({ kind: 'problem', body: expect.stringContaining('keeps 30 Hackable projects') })
    expect(notKeptMessage('full')).toContain('already keeps 30 Hackable projects')
  })
})

describe('Hackable 3D: /3d/hackable', () => {
  const world3d = (name = 'My 3D world') => { const p = createStarter3dProject(); return { ...p, design: { ...p.design, name } } }
  const race = (name: string) => { const p = createRaceStarterProject(); return { ...p, design: { ...p.design, name } } }
  const platformer = (name: string) => { const p = createStarterProject(); return { ...p, design: { ...p.design, name } } }
  const guest = { getSession: () => null } as unknown as ClassroomClientSurface
  const openMenu = async () => fireEvent.click(await screen.findByRole('button', { name: 'This project' }))

  it('?new=1 opens "My 3D world" on the starter, kept with its game at the first change, with no Play together', async () => {
    window.history.replaceState(null, '', '/3d/hackable?new=1')
    render(<StudioApp route={{ fresh: true, kit: '3d' }} />)
    await screen.findByRole('radio', { name: 'Build' })
    const design = studio().getState().project.design
    expect(design).toMatchObject({ kit: '3d', name: 'My 3D world' })
    expect(design.copies).toHaveLength(createStarter3dProject().design.copies.length)
    expect(document.title).toBe('My 3D world · Hackable 3D · Brickgineers')
    expect(listHackableProjects()).toEqual([])
    // Rooms are D3: This project has Start over and the files, but no Play together.
    await openMenu()
    expect(await screen.findByRole('button', { name: 'Start over with the starter world' })).toBeInTheDocument()
    expect(screen.queryByText('Play together')).toBeNull()

    await act(async () => { studio().renameProject('Sky castle') })
    await waitFor(() => expect(listHackableProjects()[0]).toMatchObject({ title: 'Sky castle', kit: '3d' }))
    const [entry] = listHackableProjects()
    expect(window.location.pathname + window.location.search).toBe(`/3d/hackable?draft=${entry.id}`)
    expect(JSON.parse(localStorage.getItem(`code-lab.project.v1:${entry.id}`)!).design.kit).toBe('3d')

    // Reopened from its address, it is the same 3D world.
    cleanup()
    window.history.replaceState(null, '', `/3d/hackable?draft=${entry.id}`)
    expect(await openStudioRoute({ draft: entry.id, fresh: false, kit: '3d' })).toMatchObject({ kind: 'local', id: entry.id, project: { design: { kit: '3d', name: 'Sky castle' } } })
  })

  it('a Platformer still has Play together in This project', async () => {
    window.history.replaceState(null, '', '/2d/hackable?new=1')
    render(<StudioApp route={{ fresh: true }} />)
    await openMenu()
    expect(await screen.findByText('Play together')).toBeInTheDocument()
  })

  it('keeps a new 3D world in the account, or this browser, at /3d/hackable', async () => {
    const local = await keepNewProject(world3d(), guest)
    expect(local.href).toMatch(/^\/3d\/hackable\?draft=h/)
    expect(listHackableProjects()[0]).toMatchObject({ title: 'My 3D world', kit: '3d' })
    const createWorld = vi.fn(async (input: { title: string }) => ({ id: 'w-3d', title: input.title, revision: 1, format: 'hackable', kit: '3d', ownerId: 'me' }))
    const account = await keepNewProject(world3d(), { getSession: () => ({ user: { id: 'me' } }), createWorld } as unknown as ClassroomClientSurface)
    expect(account).toMatchObject({ home: { kind: 'account' }, href: '/3d/hackable?world=w-3d' })
    expect(createWorld.mock.calls[0][0].title).toBe('My 3D world')
  })

  it('with no project named, /3d/hackable opens the newest 3D world (and the other addresses their own games)', async () => {
    expect(await openStudioRoute({ fresh: false, kit: '3d' })).toMatchObject({ kind: 'new', project: { design: { kit: '3d', name: 'My 3D world' } } })
    saveHackableProject('d1', world3d('Older world'))
    saveHackableProject('d2', world3d('Newer world'))
    saveHackableProject('r1', race('Newest track'))
    saveHackableProject('p1', platformer('Newest platformer'))
    window.history.replaceState(null, '', '/3d/hackable')
    expect(await openStudioRoute({ fresh: false, kit: '3d' })).toMatchObject({ kind: 'local', id: 'd2', project: { design: { kit: '3d', name: 'Newer world' } } })
    expect(window.location.pathname + window.location.search).toBe('/3d/hackable?draft=d2')
    window.history.replaceState(null, '', '/2d/hackable-race')
    expect(await openStudioRoute({ fresh: false, kit: 'race' })).toMatchObject({ kind: 'local', id: 'r1' })
    window.history.replaceState(null, '', '/2d/hackable')
    expect(await openStudioRoute({ fresh: false })).toMatchObject({ kind: 'local', id: 'p1' })
  })

  it('a 3D world opened at another game’s address opens as itself, and the address is put right', async () => {
    saveHackableProject('d1', world3d('Sky castle'))
    window.history.replaceState(null, '', '/2d/hackable?draft=d1')
    expect(await openStudioRoute({ draft: 'd1', fresh: false })).toMatchObject({ kind: 'local', project: { design: { kit: '3d' } } })
    expect(window.location.pathname + window.location.search).toBe('/3d/hackable?draft=d1')
    // And a race track opened at /3d/hackable goes back to its own.
    saveHackableProject('r1', race('Ice ring'))
    window.history.replaceState(null, '', '/3d/hackable?draft=r1')
    expect(await openStudioRoute({ draft: 'r1', fresh: false, kit: '3d' })).toMatchObject({ kind: 'local', project: { design: { kit: 'race' } } })
    expect(window.location.pathname + window.location.search).toBe('/2d/hackable-race?draft=r1')
  })

  it('opens an account 3D world, and Make my own copy keeps it a 3D world', async () => {
    const save = JSON.parse(exportProjectJson(world3d('Ava’s castle')))
    const world = { id: 'w9', title: 'Ava’s castle', revision: 2, format: 'hackable', kit: '3d', ownerId: 'ava', ownerName: 'Ava B.', canEdit: true, document: { format: 'brickgineers-hackable', version: 1, save } } as unknown as ClassroomWorld
    vi.spyOn(browserClassroomClient, 'getSession').mockReturnValue({ user: { id: 'ben' } } as never)
    vi.spyOn(browserClassroomClient, 'getWorld').mockResolvedValue(world)
    window.history.replaceState(null, '', '/3d/hackable?world=w9')
    const opened = await openStudioRoute({ world: 'w9', fresh: false, kit: '3d' })
    expect(opened).toMatchObject({ kind: 'viewer', project: { design: { kit: '3d' } } })

    const createWorld = vi.fn(async (input: { title: string }) => ({ ...world, id: 'mine1', title: input.title, ownerId: 'ben' }))
    const client = { getSession: () => ({ user: { id: 'ben' } }), createWorld } as unknown as ClassroomClientSurface
    const project = opened.kind === 'viewer' ? opened.project : world3d()
    expect(await makeOwnCopy(world, project, client)).toBe('/3d/hackable?world=mine1')
    const sent = createWorld.mock.calls[0][0] as unknown as { document: { save: { design: { kit: string; name: string } } } }
    expect(sent.document.save.design).toMatchObject({ kit: '3d', name: 'Ava’s castle (copy)' })

    const full = { getSession: () => ({ user: { id: 'ben' } }), createWorld: vi.fn(async () => { throw Object.assign(new Error('full'), { code: 'world_limit' }) }) } as unknown as ClassroomClientSurface
    expect(await makeOwnCopy(world, project, full)).toMatch(/^\/3d\/hackable\?draft=h/)
    expect(listHackableProjects()[0]).toMatchObject({ title: 'Ava’s castle (copy)', kit: '3d' })
  })
})
