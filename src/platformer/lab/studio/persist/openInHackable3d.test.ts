import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClassroomClientSurface } from '../../../../classroom/client'
import { createBrickStudioDocument } from '../../../../brick/brickDocument'
import { listHackableProjects, loadHackableText } from './hackableProjects'
import { projectFromText } from './hackableSave'
import { NOT_KEPT_3D, keepClassicAsHackable3d } from './openInHackable3d'

vi.mock('../gridBricks', async (orig) => ({ ...(await orig<typeof import('../gridBricks')>()), gridBrickTemplate: (await import('../builder/testGridBricks')).fakeGridTemplate }))

afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })

const guest = { getSession: () => null } as unknown as ClassroomClientSurface
const signedIn = (createWorld: ReturnType<typeof vi.fn>) => ({ getSession: () => ({ user: { id: 'me' } }), createWorld }) as unknown as ClassroomClientSurface

/** A classic 3D build: a few bricks on the plate, in a scene. */
function classicBuild() {
  return createBrickStudioDocument(
    [
      { id: 'a', partId: 'brick_2x4', x: 30, y: 0, z: 30, rotation: 0, color: '#e7473c' },
      { id: 'b', partId: 'brick_2x4', x: 30, y: 3, z: 30, rotation: 1, color: '#3e83d7' },
      { id: 'c', partId: 'plate_6x8', x: 10, y: 0, z: 12, rotation: 0, color: '#65b85a' },
    ],
    { environmentId: 'sky-island' },
  )
}

describe('Open in Hackable 3D (the classic 3D builder)', () => {
  it('keeps a copy as a new Hackable 3D project in this browser for a guest, and leaves the classic build exactly as it was', async () => {
    const classic = classicBuild()
    const before = structuredClone(classic)
    const href = await keepClassicAsHackable3d(classic, 'Castle', guest)

    expect(href).toMatch(/^\/3d\/hackable\?draft=h/)
    const id = new URL(href, 'https://brickgineers.test').searchParams.get('draft')!
    expect(listHackableProjects()).toEqual([expect.objectContaining({ id, title: 'Castle', kit: '3d' })])
    const kept = projectFromText(loadHackableText(id)!)!
    expect(kept.design).toMatchObject({ kit: '3d', name: 'Castle' })
    const scenery = (kept.design as { scenery3d?: unknown[] }).scenery3d
    expect(scenery).toEqual(classic.bricks.map(({ partId, x, y, z, rotation, color }) => ({ partId, x, y, z, rotation, color })))
    // The classic build is untouched: same bricks, same everything.
    expect(classic).toEqual(before)
  })

  it('an untitled build becomes "My 3D world"', async () => {
    await keepClassicAsHackable3d(classicBuild(), '   ', guest)
    expect(listHackableProjects()[0]).toMatchObject({ title: 'My 3D world', kit: '3d' })
  })

  it('signed in, the copy goes to the account and opens at /3d/hackable', async () => {
    const createWorld = vi.fn(async (input: { title: string }) => ({ id: 'w-3d', title: input.title, revision: 1, format: 'hackable', kit: '3d', ownerId: 'me' }))
    const classic = classicBuild()
    const before = structuredClone(classic)
    expect(await keepClassicAsHackable3d(classic, 'Castle', signedIn(createWorld))).toBe('/3d/hackable?world=w-3d')
    const sent = createWorld.mock.calls[0][0] as unknown as { title: string; document: { format: string; save: { design: { kit: string; name: string; scenery3d: unknown[] } } } }
    expect(sent.title).toBe('Castle')
    expect(sent.document.format).toBe('brickgineers-hackable')
    expect(sent.document.save.design).toMatchObject({ kit: '3d', name: 'Castle' })
    expect(sent.document.save.design.scenery3d).toHaveLength(3)
    expect(listHackableProjects()).toEqual([])
    expect(classic).toEqual(before)
  })

  it('with the account full, the copy is kept in this browser instead', async () => {
    const createWorld = vi.fn(async () => { throw Object.assign(new Error('full'), { code: 'world_limit' }) })
    expect(await keepClassicAsHackable3d(classicBuild(), 'Castle', signedIn(createWorld))).toMatch(/^\/3d\/hackable\?draft=h/)
    expect(listHackableProjects()[0]).toMatchObject({ title: 'Castle', kit: '3d' })
  })

  it('says plainly when it could not be kept anywhere', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    await expect(keepClassicAsHackable3d(classicBuild(), 'Castle', guest)).rejects.toThrow(NOT_KEPT_3D)
  })
})
