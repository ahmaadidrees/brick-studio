import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClassroomClientSurface } from '../../../classroom/client'
import type { ClassroomWorld } from '../../../classroom/contracts'
import { exportProjectJson } from './persist/projectIo'
import { HACKABLE_INDEX_KEY, listHackableProjects, projectKey } from './persist/hackableProjects'
import { projectFromDocument } from './persist/hackableSave'
import { createStarterProject } from './starter'
import { makeOwnCopy, openStudioRoute } from './StudioApp'

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
