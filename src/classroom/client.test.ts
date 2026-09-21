import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClassroomClient } from './client'
import type { ClassroomAuthResult } from './contracts'
const auth: ClassroomAuthResult = { user: { id: 'student1', username: 'builder', rosterName: 'Alex', role: 'student', resetRequired: false }, classes: [], session: { accessToken: 'access1', refreshToken: 'refresh1', expiresIn: 3600 } }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
beforeEach(() => sessionStorage.clear())
describe('classroom account boundaries', () => {
  it('does not claim a login succeeded when the service rejects it', async () => {
    const client = new ClassroomClient('https://classroom.test', vi.fn().mockResolvedValue(json({ error: 'Class enrollment is closed.' }, 403)))
    await expect(client.authenticate('register', {})).rejects.toThrow('Class enrollment is closed')
    expect(client.getSession()).toBeNull()
  })
  it('refreshes an expired access token and retries the requested world operation', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ ...auth, session: { ...auth.session, accessToken: 'access2' } })).mockResolvedValueOnce(json({ worlds: [] }))
    const client = new ClassroomClient('https://classroom.test', fetcher); client.setSession(auth)
    expect(await client.request('/worlds')).toEqual({ worlds: [] })
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer access2')
  })
  it('clears local account access even when logout cannot reach the server', async () => {
    const client = new ClassroomClient('', vi.fn().mockRejectedValue(new Error('offline'))); client.setSession(auth)
    await expect(client.signOut()).rejects.toThrow('Could not connect')
    expect(client.getSession()).toBeNull(); expect(sessionStorage.length).toBe(0)
  })
  it('does not replace a switched account with a delayed refresh', async () => {
    let resolveRefresh!: (response: Response) => void
    const fetcher = vi.fn().mockResolvedValueOnce(json({}, 401)).mockImplementationOnce(() => new Promise<Response>(resolve => { resolveRefresh = resolve }))
    const client = new ClassroomClient('', fetcher); client.setSession(auth)
    const pending = client.request('/worlds'); await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    client.setSession(null); resolveRefresh(json(auth))
    await expect(pending).rejects.toThrow('account changed'); expect(client.getSession()).toBeNull()
  })
})

it.each([200, 401])('rejects a delayed account A response (%s) after switching to B without retrying as B', async status => {
  let finish!: (response: Response) => void
  const fetcher = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve }))
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  const pending = client.request('/worlds/private-a', 'PUT', { document: 'private A data' })
  const other = { ...auth, user: { ...auth.user, id: 'student2' }, session: { ...auth.session, accessToken: 'accessB' } }
  client.setSession(other); finish(json({ world: 'A' }, status))
  await expect(pending).rejects.toThrow('account changed')
  expect(fetcher).toHaveBeenCalledTimes(1); expect(client.getSession()).toEqual(other)
})
it('does not clear B when delayed A logout finishes', async () => {
  let finish!: (response: Response) => void
  const client = new ClassroomClient('', vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve })))
  client.setSession(auth); const pending = client.signOut()
  const other = { ...auth, user: { ...auth.user, id: 'student2' } }; client.setSession(other)
  finish(json({ ok: true })); await expect(pending).rejects.toThrow('account changed')
  expect(client.getSession()).toEqual(other)
})
it('coalesces concurrent expired-token refreshes in the same login context', async () => {
  let finish!: (response: Response) => void
  const fetcher = vi.fn().mockImplementation((url: string, init: RequestInit) => {
    if (url.endsWith('/auth/refresh')) return new Promise<Response>(resolve => { finish = resolve })
    return Promise.resolve(json({ worlds: [] }, (init.headers as Record<string,string>).Authorization === 'Bearer access1' ? 401 : 200))
  })
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  const first = client.request('/worlds'), second = client.request('/worlds')
  await vi.waitFor(() => expect(finish).toBeDefined())
  finish(json({ ...auth, session: { ...auth.session, accessToken: 'access2' } }))
  await expect(Promise.all([first, second])).resolves.toEqual([{ worlds: [] }, { worlds: [] }])
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/auth/refresh'))).toHaveLength(1)
})
it('invokes native-style fetch with the global receiver', async () => {
  const fetcher = function(this: unknown) { if (this !== globalThis) throw new TypeError('Illegal invocation'); return Promise.resolve(json({ worlds: [] })) } as typeof fetch
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  await expect(client.request('/worlds')).resolves.toEqual({ worlds: [] })
})
it.each([0, 429, 502])('keeps the account available for retry when token renewal temporarily fails (%s)', async status => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({}, 401))
  if (status === 0) fetcher.mockRejectedValueOnce(new Error('offline'))
  else fetcher.mockResolvedValueOnce(json({ error: 'Please retry.' }, status))
  fetcher.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ ...auth, session: { ...auth.session, accessToken: 'access2' } })).mockResolvedValueOnce(json({ worlds: [] }))
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  await expect(client.request('/worlds')).rejects.toThrow()
  expect(client.getSession()).toEqual(auth)
  await expect(client.request('/worlds')).resolves.toEqual({ worlds: [] })
  expect(client.getSession()?.session.accessToken).toBe('access2')
})
it.each([401, 403])('still clears an invalid or revoked refresh session (%s)', async status => {
  const fetcher = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({ error: 'Your session ended.' }, status))
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  await expect(client.request('/worlds')).rejects.toThrow('Your session ended')
  expect(client.getSession()).toBeNull()
})
it('keeps the refreshed login when access to one world has been removed', async () => {
  const refreshed = { ...auth, session: { ...auth.session, accessToken: 'access2' } }
  const fetcher = vi.fn().mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json(refreshed)).mockResolvedValueOnce(json({ error: 'Access to this world ended.' }, 403))
  const client = new ClassroomClient('', fetcher); client.setSession(auth)
  await expect(client.request('/worlds/removed-world')).rejects.toThrow('Access to this world ended')
  expect(client.getSession()).toEqual(refreshed)
})

describe('username-only sign-in and the join roster', () => {
  it('signs in with username and password alone and adds the class code only when given', async () => {
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json(auth)))
    const client = new ClassroomClient('https://classroom.test', fetcher)
    await client.login({ username: ' builder ', password: 'orbit7' })
    expect(fetcher.mock.calls[0][0]).toBe('https://classroom.test/classroom/auth/login')
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ username: 'builder', password: 'orbit7' })
    await client.login({ username: 'builder', password: 'orbit7', classCode: ' room42 ' })
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ username: 'builder', password: 'orbit7', classCode: 'ROOM42' })
    await client.login({ username: 'builder', password: 'orbit7', classCode: '' })
    expect(JSON.parse(fetcher.mock.calls[2][1].body)).not.toHaveProperty('classCode')
    expect(client.getSession()).toEqual(auth)
  })
  it('exposes the server code and details on a rejection, such as username suggestions', async () => {
    const client = new ClassroomClient('', vi.fn().mockResolvedValue(json({ error: 'That username is already taken.', code: 'username_taken', suggestions: ['ava2', 'ava3', 'ava7'] }, 409)))
    const failure = await client.authenticate('register', { classCode: 'ROOM42', username: 'ava', password: 'remember-this' }).catch(error => error)
    expect(failure).toMatchObject({ message: 'That username is already taken.', status: 409, code: 'username_taken', details: { suggestions: ['ava2', 'ava3', 'ava7'] } })
    const ambiguous = await new ClassroomClient('', vi.fn().mockResolvedValue(json({ error: 'Add your class code.', code: 'class_code_required' }, 409))).login({ username: 'ava', password: 'orbit7' }).catch(error => error)
    expect(ambiguous).toMatchObject({ status: 409, code: 'class_code_required', details: {} })
    expect(client.getSession()).toBeNull()
  })
  it('fetches the public roster for a class code without a session', async () => {
    const roster = { name: 'Studio 5', canEnroll: true, showNames: true, students: [{ username: 'ava', displayName: 'Ava R.' }] }
    const fetcher = vi.fn().mockResolvedValue(json(roster))
    const client = new ClassroomClient('https://classroom.test', fetcher)
    await expect(client.classRoster(' room42 ')).resolves.toEqual(roster)
    expect(fetcher.mock.calls[0][0]).toBe('https://classroom.test/classroom/auth/roster')
    expect(fetcher.mock.calls[0][1].headers).not.toHaveProperty('Authorization')
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ classCode: 'ROOM42' })
  })
})

describe('mock client fixture (flows v2 pages build against this until the Worker lands)', async () => {
  const { createMockClient, MOCK_IDS, MOCK_CLASS_CODE, MOCK_PASSWORD } = await import('./mockClient')
  it('starts as a guest, a student (Ava R.) or the teacher and publishes session changes', async () => {
    expect(createMockClient().getSession()).toBeNull()
    const student = createMockClient({ as: 'student' })
    expect(student.getSession()?.user).toMatchObject({ role: 'student', rosterName: 'Ava Rivera' })
    expect(student.getSession()?.classes[0]).toMatchObject({ name: 'Period 3 Makers', studentsCanShare: true, showNamesOnJoin: true, teacherName: 'Mr. Idrees', buildingNow: null })
    expect((await student.listClasses())[0].buildingNow).toBeNull()
    expect(student.getSession()?.classes[0]).not.toHaveProperty('code')
    const teacher = createMockClient({ as: 'teacher' })
    expect(teacher.getSession()?.user).toMatchObject({ role: 'teacher', rosterName: 'Mr. Idrees' })
    expect(teacher.getSession()?.classes[0].code).toBe(MOCK_CLASS_CODE)
    expect((await teacher.listClasses())[0]).toMatchObject({ buildingNow: 3, teacherName: 'Mr. Idrees' })
    const changes = vi.fn(); const off = student.subscribe(changes)
    await student.signOut(); expect(student.getSession()).toBeNull(); expect(changes).toHaveBeenCalledTimes(1)
    off()
    expect((await student.listStudents(MOCK_IDS.classId).catch(e => e)).code).toBe('sign_in_required')
  })
  it('lists own, class, group and classmates shared worlds for a student with the contract fields', async () => {
    const client = createMockClient({ as: 'student' })
    const worlds = await client.listWorlds()
    expect(worlds.map(w => w.title)).toEqual(['Treehouse Hideout', 'Rainbow Rocket', 'Lava Maze', 'Our Town', 'Bridge Team', 'Sky Bridge', 'Pixel Arcade', 'Crystal Castle'])
    expect(worlds.find(w => w.title === 'Sky Bridge')).toMatchObject({ visibility: 'class', canEdit: true, classCanEdit: true, ownerName: 'Ben K.', ownerClassId: MOCK_IDS.classId, kind: 'personal' })
    expect(worlds.find(w => w.title === 'Crystal Castle')).toMatchObject({ visibility: 'class', canEdit: false, classCanEdit: false, ownerName: 'Chloe M.' })
    expect(worlds.find(w => w.title === 'Treehouse Hideout')).toMatchObject({ visibility: 'private', canEdit: true, classCanEdit: false, ownerName: 'Ava R.', ownerClassId: MOCK_IDS.classId, sharedAt: null })
    expect(worlds.find(w => w.title === 'Rainbow Rocket')).toMatchObject({ canEdit: true, classCanEdit: false })
    expect(worlds.find(w => w.title === 'Rainbow Rocket')?.sharedAt).toEqual(expect.any(String))
    expect(worlds.find(w => w.title === 'Our Town')).toMatchObject({ kind: 'class', ownerName: 'Teacher', canEdit: true, classCanEdit: true, ownerClassId: MOCK_IDS.classId })
    expect(worlds.every(w => !('hiddenByTeacher' in w))).toBe(true)
    // Finn invited Ava and Chloe only: Ava sees it as an invitee (never the list); Ben does not see it at all.
    expect(worlds.find(w => w.title === 'Pixel Arcade')).toMatchObject({ visibility: 'members', canEdit: true, classCanEdit: true, ownerName: 'Finn O.', sharedAt: expect.any(String) })
    expect(worlds.find(w => w.title === 'Pixel Arcade')).not.toHaveProperty('members')
    await client.login({ username: 'ben_k', password: MOCK_PASSWORD })
    expect((await client.listWorlds()).map(w => w.title)).not.toContain('Pixel Arcade')
    await expect(client.getWorld(MOCK_IDS.worlds.arcade)).rejects.toMatchObject({ status: 404 })
  })
  it('shows the teacher every shared student world including hidden ones with the flag', async () => {
    const client = createMockClient({ as: 'teacher' })
    const worlds = await client.listWorlds()
    expect(worlds.filter(w => w.kind === 'personal' && w.ownerId !== MOCK_IDS.teacherId).map(w => [w.title, w.hiddenByTeacher])).toEqual([['Sky Bridge', false], ['Moon Base', true], ['Rainbow Rocket', false], ['Pixel Arcade', false], ['Crystal Castle', false], ['Lava Maze', false]])
    expect(worlds.find(w => w.title === 'Pixel Arcade')).toMatchObject({ visibility: 'members', members: [{ id: MOCK_IDS.ava, displayName: 'Ava R.' }, { id: MOCK_IDS.chloe, displayName: 'Chloe M.' }] })
    const shown = await client.setWorldHidden(MOCK_IDS.worlds.moonBase, false)
    expect(shown.hiddenByTeacher).toBe(false)
    expect((await createMockClient({ as: 'student' }).listWorlds()).some(w => w.title === 'Moon Base')).toBe(false)
  })
  it('lets the owner share and unshare, and refuses once the teacher turns sharing off', async () => {
    const client = createMockClient({ as: 'student' })
    const shared = await client.setWorldSharing(MOCK_IDS.worlds.treehouse, { visibility: 'class', canEdit: true })
    expect(shared).toMatchObject({ visibility: 'class', canEdit: true, sharedAt: expect.any(String) })
    const unshared = await client.setWorldSharing(MOCK_IDS.worlds.treehouse, { visibility: 'private', canEdit: true })
    expect(unshared).toMatchObject({ visibility: 'private', sharedAt: null })
    await expect(client.setWorldSharing(MOCK_IDS.worlds.skyBridge, { visibility: 'private', canEdit: false })).rejects.toMatchObject({ code: 'owner_required' })
    const teacher = createMockClient({ as: 'teacher' })
    expect((await teacher.updateClass(MOCK_IDS.classId, { studentsCanShare: false })).studentsCanShare).toBe(false)
    await expect(teacher.setWorldSharing(MOCK_IDS.worlds.rocket, { visibility: 'class', canEdit: false })).rejects.toMatchObject({ code: 'student_required' })
    // Each mock has its own fixture; flip the flag here and expect the same refusal a student would get from the server.
    await client.updateClass(MOCK_IDS.classId, { studentsCanShare: false }).catch(() => {})
    const ownClass = createMockClient({ as: 'teacher' }); await ownClass.updateClass(MOCK_IDS.classId, { studentsCanShare: false })
    await ownClass.login({ username: 'ava_builds', password: MOCK_PASSWORD })
    await expect(ownClass.setWorldSharing(MOCK_IDS.worlds.treehouse, { visibility: 'class', canEdit: false })).rejects.toMatchObject({ status: 403, code: 'sharing_disabled' })
    expect((await ownClass.listWorlds()).map(w => w.title)).not.toContain('Sky Bridge')
  })
  it('invites chosen classmates, reports them to the owner, replaces or keeps the set, and clears it on unshare', async () => {
    const client = createMockClient({ as: 'student' })
    expect(await client.listClassmates(MOCK_IDS.classId)).toEqual([
      { id: MOCK_IDS.ben, displayName: 'Ben K.' }, { id: MOCK_IDS.chloe, displayName: 'Chloe M.' }, { id: MOCK_IDS.diego, displayName: 'Diego S.' }, { id: MOCK_IDS.emma, displayName: 'Emma L.' }, { id: MOCK_IDS.finn, displayName: 'Finn O.' },
    ])
    const invited = await client.setWorldSharing(MOCK_IDS.worlds.treehouse, { visibility: 'members', canEdit: false, members: [MOCK_IDS.chloe, MOCK_IDS.ben] })
    expect(invited).toMatchObject({ visibility: 'members', classCanEdit: false, sharedAt: expect.any(String), members: [{ id: MOCK_IDS.ben, displayName: 'Ben K.' }, { id: MOCK_IDS.chloe, displayName: 'Chloe M.' }] })
    expect((await client.setWorldSharing(MOCK_IDS.worlds.treehouse, { visibility: 'members', canEdit: true })).members).toHaveLength(2)
    expect((await client.setWorldSharing(MOCK_IDS.worlds.treehouse, { visibility: 'members', canEdit: true, members: [MOCK_IDS.ben] })).members).toEqual([{ id: MOCK_IDS.ben, displayName: 'Ben K.' }])
    for (const members of [[], [MOCK_IDS.ava], [MOCK_IDS.teacherId], ['nobody'], Array.from({ length: 31 }, (_, i) => `student-${i}`)]) {
      await expect(client.setWorldSharing(MOCK_IDS.worlds.treehouse, { visibility: 'members', canEdit: true, members })).rejects.toMatchObject({ status: 400 })
    }
    expect((await client.getWorld(MOCK_IDS.worlds.treehouse)).members).toEqual([{ id: MOCK_IDS.ben, displayName: 'Ben K.' }])
    const unshared = await client.setWorldSharing(MOCK_IDS.worlds.treehouse, { visibility: 'private', canEdit: false })
    expect(unshared).toMatchObject({ visibility: 'private', sharedAt: null }); expect(unshared).not.toHaveProperty('members')
    expect((await client.setWorldSharing(MOCK_IDS.worlds.treehouse, { visibility: 'members', canEdit: false }).catch(e => e)).status).toBe(400)
    // Invitees see the world; the class teacher too; fellow invitees never learn who else is invited.
    const chloe = createMockClient(); await chloe.login({ username: 'chloe_m', password: MOCK_PASSWORD })
    const arcade = await chloe.getWorld(MOCK_IDS.worlds.arcade)
    expect(arcade).toMatchObject({ visibility: 'members', canEdit: true, ownerName: 'Finn O.' }); expect(arcade).not.toHaveProperty('members')
    expect((await chloe.listClassmates(MOCK_IDS.classId)).map(c => c.id)).not.toContain(MOCK_IDS.chloe)
    expect((await createMockClient({ as: 'teacher' }).getWorld(MOCK_IDS.worlds.arcade)).members).toHaveLength(2)
  })
  it('keeps viewers read-only, copies any visible world, and stops at the world limit', async () => {
    const client = createMockClient({ as: 'student', worldLimit: 4 })
    const castle = await client.getWorld(MOCK_IDS.worlds.castle)
    expect(castle.canEdit).toBe(false); expect(castle.document).toBeDefined()
    await expect(client.saveWorld(castle.id, { expectedRevision: castle.revision, document: castle.document! })).rejects.toMatchObject({ code: 'read_only' })
    await expect(client.renameWorld(castle.id, 'Mine now')).rejects.toMatchObject({ code: 'owner_required' })
    await expect(client.listCheckpoints(castle.id)).rejects.toMatchObject({ code: 'owner_required' })
    const copy = await client.copyWorld(castle.id)
    expect(copy).toMatchObject({ title: 'Crystal Castle (copy)', ownerId: MOCK_IDS.ava, visibility: 'private', canEdit: true, kind: 'personal' })
    await expect(client.copyWorld(MOCK_IDS.worlds.skyBridge)).rejects.toMatchObject({ status: 409, code: 'world_limit' })
    await expect(client.getWorld(MOCK_IDS.worlds.garden)).rejects.toMatchObject({ status: 404 })
    await expect(client.getWorld(MOCK_IDS.worlds.moonBase)).rejects.toMatchObject({ code: 'world_hidden' })
    const sky = await client.getWorld(MOCK_IDS.worlds.skyBridge)
    expect((await client.saveWorld(sky.id, { expectedRevision: sky.revision, document: sky.document! })).revision).toBe(sky.revision + 1)
  })
  it('registers with the class code, rejects taken usernames with suggestions, and signs in by username alone', async () => {
    const client = createMockClient()
    await expect(client.resolveClass('makers3')).resolves.toEqual({ name: 'Period 3 Makers', canEnroll: true })
    const roster = await client.classRoster(MOCK_CLASS_CODE)
    expect(roster.students.map(s => s.displayName)).toEqual(['Ava R.', 'Ben K.', 'Chloe M.', 'Diego S.', 'Emma L.', 'Finn O.'])
    await expect(client.register({ classCode: 'MAKERS3', username: 'Ava_Builds', password: 'remember-this' })).rejects.toMatchObject({ status: 409, code: 'username_taken', details: { suggestions: ['Ava_Builds2', 'Ava_Builds3', 'Ava_Builds7'] } })
    await expect(client.register({ classCode: 'MAKERS3', username: 'newkid', password: 'newkid' })).rejects.toMatchObject({ code: 'invalid_password' })
    const created = await client.register({ classCode: 'MAKERS3', username: 'newkid', password: 'remember-this', rosterName: 'Nia Kidd' })
    expect(created.user).toMatchObject({ username: 'newkid', rosterName: 'Nia Kidd', role: 'student' })
    expect(client.getSession()?.user.username).toBe('newkid')
    expect((await client.listWorlds()).filter(w => w.ownerId === created.user.id)).toEqual([])
    await expect(client.login({ username: 'ben_k', password: 'wrong-one' })).rejects.toMatchObject({ code: 'invalid_credentials' })
    expect((await client.login({ username: 'ben_k', password: MOCK_PASSWORD })).user.rosterName).toBe('Ben Kim')
    expect((await client.listWorlds()).find(w => w.title === 'Lava Maze')).toMatchObject({ ownerName: 'Ava R.', canEdit: true })
    const teacher = await client.authenticate('teacher-login', { email: 'teacher@example.test', password: 'teach-bricks' })
    expect(teacher.user.role).toBe('teacher')
  })
  it('supports rename, duplicate, checkpoints and restore on own worlds and the existing request() routes', async () => {
    const client = createMockClient({ as: 'student' })
    expect((await client.renameWorld(MOCK_IDS.worlds.lava, 'Lava Maze 2')).title).toBe('Lava Maze 2')
    const duplicate = await client.duplicateWorld(MOCK_IDS.worlds.lava)
    expect(duplicate.title).toBe('Lava Maze 2 copy')
    const checkpoints = await client.listCheckpoints(MOCK_IDS.worlds.lava)
    expect(checkpoints[0]).toMatchObject({ reason: 'rename', revision: 3 })
    const restored = await client.restoreWorld(MOCK_IDS.worlds.lava, checkpoints[0].id)
    expect(restored).toMatchObject({ title: 'Lava Maze', revision: 5 })
    expect((await client.request<{ worlds: unknown[] }>('/worlds')).worlds).toHaveLength(9)
    await expect(client.request('/worlds/' + MOCK_IDS.worlds.town + '/members')).resolves.toMatchObject({ members: expect.arrayContaining([{ id: MOCK_IDS.ava, username: 'ava_builds' }]) })
  })
})

describe('typed classroom calls (the surface pages use; the mock client mirrors it)', () => {
  const world = { id: 'w1', title: 'Treehouse', ownerId: 'student1', classId: null, kind: 'personal', revision: 3, updatedAt: '2026-09-16T10:00:00Z', visibility: 'class', canEdit: true, classCanEdit: false, ownerName: 'Alex R.', ownerClassId: 'c1', sharedAt: '2026-09-15T10:00:00Z' }
  function calls() {
    const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(json(url.endsWith('/worlds') ? { worlds: [world] } : url.includes('/classes') ? { classes: [], class: { id: 'c1' }, students: [] } : url.includes('checkpoints') ? { checkpoints: [] } : { world: { ...world, document: { schemaVersion: 2 } } })))
    const client = new ClassroomClient('https://classroom.test', fetcher); client.setSession(auth)
    const sent = () => fetcher.mock.calls.map(([url, init]) => [url.replace('https://classroom.test/classroom', ''), init.method, init.body ? JSON.parse(init.body) : undefined])
    return { client, sent, fetcher }
  }
  it('sends sharing, hiding and copying to the contract routes', async () => {
    const { client, sent } = calls()
    expect(await client.setWorldSharing('w1', { visibility: 'class', canEdit: false })).toMatchObject({ id: 'w1', visibility: 'class' })
    await client.setWorldHidden('w1', true)
    await client.copyWorld('w1')
    expect(sent()).toEqual([
      ['/worlds/w1/sharing', 'PATCH', { visibility: 'class', canEdit: false }],
      ['/worlds/w1/visibility', 'PATCH', { hiddenByTeacher: true }],
      ['/worlds/w1/copy', 'POST', undefined],
    ])
  })
  it('wraps the list, world, class and student routes and unwraps their envelopes', async () => {
    const { client, sent } = calls()
    expect(await client.listWorlds()).toEqual([world])
    await client.listClasses(); await client.listStudents('c1'); await client.me()
    expect(await client.getWorld('w1')).toMatchObject({ document: { schemaVersion: 2 } })
    await client.createWorld({ title: 'New', document: { schemaVersion: 2 } as never })
    await client.saveWorld('w1', { expectedRevision: 3, document: { schemaVersion: 2 } as never })
    await client.renameWorld('w1', 'Renamed')
    await client.duplicateWorld('w1')
    await client.listCheckpoints('w1')
    await client.restoreWorld('w1', 'cp1')
    expect(await client.updateClass('c1', { studentsCanShare: false, showNamesOnJoin: true })).toEqual({ id: 'c1' })
    await client.createClass('Period 4')
    await client.updateStudent('c1', 's1', { suspended: true })
    expect(sent()).toEqual([
      ['/worlds', 'GET', undefined], ['/classes', 'GET', undefined], ['/classes/c1/students', 'GET', undefined], ['/me', 'GET', undefined],
      ['/worlds/w1', 'GET', undefined],
      ['/worlds', 'POST', { kind: 'personal', title: 'New', document: { schemaVersion: 2 } }],
      ['/worlds/w1', 'PUT', { expectedRevision: 3, document: { schemaVersion: 2 } }],
      ['/worlds/w1', 'PATCH', { title: 'Renamed' }],
      ['/worlds/w1', 'GET', undefined], ['/worlds', 'POST', { kind: 'personal', title: 'Treehouse copy', document: { schemaVersion: 2 } }],
      ['/worlds/w1/checkpoints', 'GET', undefined],
      ['/worlds/w1', 'GET', undefined], ['/worlds/w1/restore', 'POST', { checkpointId: 'cp1', expectedRevision: 3 }],
      ['/classes/c1', 'PATCH', { studentsCanShare: false, showNamesOnJoin: true }],
      ['/classes', 'POST', { name: 'Period 4' }],
      ['/classes/c1/students/s1', 'PATCH', { suspended: true }],
    ])
  })
  it('registers with an upper-cased class code and an optional roster name, and resolves a class code publicly', async () => {
    const fetcher = vi.fn().mockImplementation((url: string) => Promise.resolve(json(url.endsWith('/auth/class') ? { name: 'Studio 5', canEnroll: true } : auth)))
    const client = new ClassroomClient('https://classroom.test', fetcher)
    await client.register({ classCode: ' makers3 ', username: ' ava ', password: 'remember-this', rosterName: ' Ava Rivera ' })
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ classCode: 'MAKERS3', username: 'ava', password: 'remember-this', rosterName: 'Ava Rivera' })
    expect(client.getSession()).toEqual(auth)
    await client.register({ classCode: 'makers3', username: 'ben', password: 'remember-this', rosterName: '  ' })
    expect(JSON.parse(fetcher.mock.calls[1][1].body)).not.toHaveProperty('rosterName')
    const signedOut = new ClassroomClient('https://classroom.test', fetcher); signedOut.setSession(null)
    await expect(signedOut.resolveClass('makers3')).resolves.toEqual({ name: 'Studio 5', canEnroll: true })
    expect(fetcher.mock.calls[2][0]).toBe('https://classroom.test/classroom/auth/class')
    expect(fetcher.mock.calls[2][1].headers).not.toHaveProperty('Authorization')
  })
  it('builds the invite link and QR target as /join?classCode=', async () => {
    const { classJoinHref } = await import('./client')
    expect(classJoinHref(' makers3 ', 'https://brickgineers.com')).toBe('https://brickgineers.com/join?classCode=MAKERS3')
    expect(new URL(classJoinHref('ROOM42')).pathname).toBe('/join')
  })
})
