import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClassroomClientSurface } from '../../../../classroom/client'
import type { ClassroomWorld } from '../../../../classroom/contracts'
import { createStarterProject } from '../starter'
import { exportProjectJson } from './projectIo'
import { HackableCloudSaver } from './hackableCloud'
import {
  ACCOUNT_DOCUMENT_MAX_BYTES, HACKABLE_INDEX_KEY, LEGACY_ID, LEGACY_KEY, MAX_HACKABLE_PROJECTS, NEW_PROJECT_ROOM_CHARS, compactHackableSaves, deleteHackableProject,
  listHackableProjects, loadHackableText, newHackableId, pendingWorldOf, projectKey, roomFor, saveHackableText, setPendingWorld, touchHackableEntry,
} from './hackableProjects'
import { documentBytes, hackableDocument, projectFromDocument, projectFromText, saveHackableProject } from './hackableSave'


beforeEach(() => localStorage.clear())

describe('Hackable Platformer projects in this browser', () => {
  it('lists the one project Code Lab kept before as project "main", without moving it', () => {
    const project = createStarterProject()
    project.design.name = 'Ana’s level'
    localStorage.setItem(LEGACY_KEY, exportProjectJson(project))
    expect(listHackableProjects().map((e) => [e.id, e.title])).toEqual([[LEGACY_ID, 'Ana’s level']])
    expect(projectKey(LEGACY_ID)).toBe(LEGACY_KEY)
    expect(projectFromText(loadHackableText(LEGACY_ID)!)?.design.name).toBe('Ana’s level')
  })

  it('keeps many, newest first, each under its own key, and removes exactly one', () => {
    const a = newHackableId()
    const b = `${a}b`
    expect(saveHackableProject(a, { ...createStarterProject(), design: { ...createStarterProject().design, name: 'First' } })).toEqual({ ok: true })
    expect(saveHackableProject(b, { ...createStarterProject(), design: { ...createStarterProject().design, name: 'Second' } })).toEqual({ ok: true })
    expect(listHackableProjects().map((e) => e.title)).toEqual(['Second', 'First'])
    expect(localStorage.getItem(projectKey(a))).toContain('"First"')
    deleteHackableProject(b)
    expect(listHackableProjects().map((e) => e.id)).toEqual([a])
    expect(localStorage.getItem(projectKey(b))).toBeNull()
  })

  it('refuses a new project once the browser keeps the most, but always saves one it already has', () => {
    for (let i = 0; i < MAX_HACKABLE_PROJECTS; i++) expect(saveHackableText(`p${i}`, `P${i}`, '{}').ok).toBe(true)
    expect(saveHackableText('one-more', 'Nope', '{}')).toEqual({ ok: false, reason: 'full' })
    expect(saveHackableText('p3', 'P3 again', '{}')).toEqual({ ok: true })
  })

  it('keeps the last picture when a save brings none', () => {
    touchHackableEntry('x', 'X', undefined, 'data:image/jpeg;base64,AAA')
    touchHackableEntry('x', 'X renamed')
    expect(listHackableProjects()[0]).toMatchObject({ title: 'X renamed', picture: 'data:image/jpeg;base64,AAA' })
  })

  it('treats a damaged list as empty rather than failing', () => {
    localStorage.setItem(HACKABLE_INDEX_KEY, '{not json')
    expect(listHackableProjects()).toEqual([])
  })
})

describe('the list never loses a project kept in this browser', () => {
  const named = (name: string) => ({ ...createStarterProject(), design: { ...createStarterProject().design, name } })

  it('a damaged list is rebuilt from the saves themselves, and the next save keeps them all', () => {
    saveHackableProject('ha', named('Castle'))
    saveHackableProject('hb', named('Volcano'))
    saveHackableProject(LEGACY_ID, named('First one'))
    localStorage.setItem(HACKABLE_INDEX_KEY, '{not json')
    expect(listHackableProjects().map((e) => [e.id, e.title]).sort()).toEqual([['ha', 'Castle'], ['hb', 'Volcano'], [LEGACY_ID, 'First one']])
    // The studio saves one of them: the others stay listed (before, the list was rewritten with this one alone).
    touchHackableEntry('ha', 'Castle 2')
    expect(listHackableProjects().map((e) => e.id).sort()).toEqual(['ha', 'hb', LEGACY_ID])
    expect(JSON.parse(localStorage.getItem(HACKABLE_INDEX_KEY)!)).toHaveLength(3)
  })

  it('My projects shows them again', async () => {
    saveHackableProject('ha', named('Castle'))
    localStorage.setItem(HACKABLE_INDEX_KEY, 'garbage')
    const { listLocalProjects } = await import('../../../../projects/projects')
    expect(listLocalProjects().filter((p) => p.kind === 'hackable').map((p) => [p.title, p.href])).toEqual([['Castle', '/2d/hackable?draft=ha']])
  })

  it('a list that is not a list is rebuilt too', () => {
    saveHackableProject('ha', named('Castle'))
    localStorage.setItem(HACKABLE_INDEX_KEY, '{"oops":true}')
    expect(listHackableProjects().map((e) => e.title)).toEqual(['Castle'])
  })

  it('a save whose list entry could not be written is listed again', () => {
    saveHackableProject('ha', named('Castle'))
    const real = localStorage.setItem.bind(localStorage)
    const full = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === HACKABLE_INDEX_KEY) throw new DOMException('full', 'QuotaExceededError')
      real(key, value)
    })
    expect(saveHackableProject('hb', named('Volcano'))).toEqual({ ok: false, reason: 'storage' })
    full.mockRestore()
    expect(loadHackableText('hb')).toContain('Volcano')
    expect(listHackableProjects().map((e) => e.title).sort()).toEqual(['Castle', 'Volcano'])
  })

  it('other keys are not projects', () => {
    localStorage.setItem('code-lab.project.backup.v1', '{"design":{"name":"Backup"}}')
    localStorage.setItem('brick-studio.project.v1', '{}')
    expect(listHackableProjects()).toEqual([])
  })
})

describe('Hackable Platformer projects in an account', () => {
  it('a project becomes an account document and back, unchanged, and the starter fits easily', () => {
    const project = createStarterProject()
    const document = hackableDocument(project)
    expect(document).toMatchObject({ format: 'brickgineers-hackable', version: 1 })
    expect(exportProjectJson(projectFromDocument(JSON.parse(JSON.stringify(document)))!)).toBe(exportProjectJson(project))
    expect(documentBytes(project)).toBeLessThan(ACCOUNT_DOCUMENT_MAX_BYTES / 4)
    expect(projectFromDocument({ format: 'brickgineers-2d', version: 1 })).toBeNull()
    expect(projectFromDocument({ format: 'brickgineers-hackable', version: 2, save: {} })).toBeNull()
  })

  it('saves a moment after a change with the world’s revision, and says so when someone else saved first', async () => {
    vi.useFakeTimers()
    const world = { id: 'w1', title: 'Mine', revision: 3, format: 'hackable' } as ClassroomWorld
    const saveWorld = vi.fn(async (_id: string, input: { expectedRevision: number }) => ({ ...world, revision: input.expectedRevision + 1 }))
    const client = { getSession: () => ({ user: { id: 'u1' } }), saveWorld } as unknown as ClassroomClientSurface
    const changes: string[] = []
    const saver = new HackableCloudSaver(world, () => changes.push(saver.status), client)
    const project = createStarterProject()
    saver.schedule(project)
    expect(saver.status).toBe('pending')
    await vi.advanceTimersByTimeAsync(1500)
    expect(saveWorld).toHaveBeenCalledWith('w1', expect.objectContaining({ expectedRevision: 3, title: project.design.name, document: hackableDocument(project) }))
    expect(saver.status).toBe('saved')
    expect(saver.world.revision).toBe(4)

    const { ClassroomError } = await import('../../../../classroom/client')
    saveWorld.mockRejectedValueOnce(new ClassroomError('conflict', 409, 'revision_conflict'))
    saver.schedule(project)
    await vi.advanceTimersByTimeAsync(1500)
    expect(saver.status).toBe('error')
    expect(saver.error).toMatch(/newer version/)
    expect(saver.dirty).toBe(true)
    vi.useRealTimers()
  })
})

describe('room for projects in this browser', () => {
  const named = (name: string) => ({ ...createStarterProject(), design: { ...createStarterProject().design, name } })

  /** A browser that keeps at most `limit` characters in all (keys and values), like the real ~5 million. */
  function smallBrowser(limit: number) {
    const map = new Map<string, string>()
    const used = () => [...map].reduce((n, [k, v]) => n + k.length + v.length, 0)
    return {
      map,
      get length() { return map.size },
      key: (i: number) => [...map.keys()][i] ?? null,
      getItem: (k: string) => map.get(k) ?? null,
      removeItem: (k: string) => { map.delete(k) },
      setItem: (k: string, v: string) => {
        const before = map.get(k)
        if (used() - (before ? k.length + before.length : 0) + k.length + v.length > limit) throw new DOMException('full', 'QuotaExceededError')
        map.set(k, String(v))
      },
    }
  }

  it('keeps a starter project in about 166,000 characters, not 596,000', () => {
    saveHackableProject('h1', createStarterProject())
    const kept = localStorage.getItem(projectKey('h1'))!
    expect(kept.length).toBeLessThan(200_000)
    expect(projectFromText(kept)).not.toBeNull()
  })

  it('makes older indented saves compact without changing them, and leaves alone what is not JSON', () => {
    const pretty = exportProjectJson(named('Old one'))
    localStorage.setItem(projectKey('old'), pretty)
    localStorage.setItem(projectKey('broken'), '{ not json\n')
    const freed = compactHackableSaves()
    expect(freed).toBeGreaterThan(pretty.length / 2)
    const after = localStorage.getItem(projectKey('old'))!
    expect(JSON.parse(after)).toEqual(JSON.parse(pretty))
    expect(projectFromText(after)?.design.name).toBe('Old one')
    expect(localStorage.getItem(projectKey('broken'))).toBe('{ not json\n')
    expect(compactHackableSaves()).toBe(0)
  })

  it('when the browser is full, makes older saves smaller and saves after all; says “space” only when that is not enough', () => {
    const browser = smallBrowser(1_400_000)
    for (const id of ['a', 'b']) browser.map.set(projectKey(id), exportProjectJson(named(id)))
    // Two indented starters (about 1.2 million) leave no room for a third as they are.
    expect(saveHackableProject('c', named('c'), browser)).toEqual({ ok: true })
    expect(listHackableProjects(browser).map((e) => e.id).sort()).toEqual(['a', 'b', 'c'])
    for (const id of ['a', 'b', 'c']) expect(projectFromText(browser.getItem(projectKey(id))!)?.design.name).toBe(id)
    const tiny = smallBrowser(100_000)
    expect(saveHackableProject('d', named('d'), tiny)).toEqual({ ok: false, reason: 'space' })
    expect(roomFor(NEW_PROJECT_ROOM_CHARS, tiny)).toBe('full')
    expect(roomFor(NEW_PROJECT_ROOM_CHARS, smallBrowser(1_000_000))).toBe('room')
  })

  it('remembers the account world a project is waiting to become, through later saves, until it is cleared', () => {
    saveHackableProject('p1', named('Waiting'), undefined, undefined, { id: 'world-uuid', owner: 'me' })
    expect(pendingWorldOf('p1')).toEqual({ id: 'world-uuid', owner: 'me' })
    touchHackableEntry('p1', 'Waiting, renamed')
    expect(pendingWorldOf('p1')).toEqual({ id: 'world-uuid', owner: 'me' })
    setPendingWorld('p1', undefined)
    expect(pendingWorldOf('p1')).toBeUndefined()
    expect(listHackableProjects()[0].title).toBe('Waiting, renamed')
  })
})
