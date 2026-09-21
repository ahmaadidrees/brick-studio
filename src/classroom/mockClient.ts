import { createBrickStudioDocument, studentPasswordError, type BrickStudioDocument } from '@brick-studio/core'
import { ClassroomError } from './client'
import type {
  ClassroomAuthResult, ClassroomCheckpoint, ClassroomClass, ClassroomClassmate, ClassroomClassPatch, ClassroomClientSurface, ClassroomLoginInput, ClassroomMe,
  ClassroomRegisterInput, ClassroomRoster, ClassroomStudent, ClassroomStudentPatch, ClassroomWorld, ClassroomWorldCreateInput,
  ClassroomWorldMember, ClassroomWorldMemberSummary, ClassroomWorldSaveInput, ClassroomWorldSharing, ClassroomWorldVisibility,
} from './contracts'

/**
 * In-memory classroom client with the flows v2 fixture (docs/flows/CONTRACTS-V2.md): one class, six students, Ava's
 * three own worlds, five classmates' worlds with mixed sharing (one shared with invited classmates only), two teacher
 * worlds. Pages build against this until the
 * Worker lands; it mirrors the real routes and error codes (`username_taken` with suggestions, `sharing_disabled`,
 * `world_limit`, `revision_conflict`, `read_only`). Nothing here touches the network or storage.
 */
export type MockRole = 'student' | 'teacher' | 'guest'
export type MockClientOptions = { as?: MockRole; /** Simulated latency per call, in ms. */ delay?: number; /** Saved-world limit per account (server: 50). */ worldLimit?: number }

type MockUser = { id: string; username: string; rosterName: string; role: 'teacher' | 'student'; password: string; classId: string | null; suspended: boolean; resetRequired: boolean }
type MockWorld = { id: string; title: string; ownerId: string; classId: string | null; kind: ClassroomWorld['kind']; revision: number; updatedAt: string; document: BrickStudioDocument; visibility: ClassroomWorldVisibility; classCanEdit: boolean; hiddenByTeacher: boolean; sharedAt: string | null; members: string[] }
type MockClass = { id: string; teacherId: string; name: string; code: string; loginCode: string; enrollmentOpen: boolean; collaborationOpen: boolean; showNamesOnJoin: boolean; studentsCanShare: boolean }
type MockCheckpoint = ClassroomCheckpoint & { worldId: string; title: string; document: BrickStudioDocument }

export const MOCK_IDS = {
  classId: 'class-period-3', teacherId: 'teacher-idrees',
  ava: 'student-ava', ben: 'student-ben', chloe: 'student-chloe', diego: 'student-diego', emma: 'student-emma', finn: 'student-finn',
  worlds: { treehouse: 'world-ava-treehouse', rocket: 'world-ava-rocket', lava: 'world-ava-lava', skyBridge: 'world-ben-sky-bridge', castle: 'world-chloe-castle', moonBase: 'world-diego-moon-base', garden: 'world-emma-garden', arcade: 'world-finn-arcade', town: 'world-class-town', bridgeTeam: 'world-group-bridge' },
} as const
/** Invited classmates per members-only world (server: 30). */
export const MOCK_WORLD_MEMBER_LIMIT = 30
export const MOCK_CLASS_CODE = 'MAKERS3'
export const MOCK_PASSWORD = 'brick-time'

const day = (daysAgo: number, hour = 10) => new Date(Date.UTC(2026, 8, 17 - daysAgo, hour)).toISOString()
const fail = (status: number, code: string, message: string, details: Record<string, unknown> = {}): never => { throw new ClassroomError(message, status, code, details) }
/** First name plus last initial ("Ava R."); one-word names stay as they are. */
export const mockDisplayName = (rosterName: string) => { const words = rosterName.trim().split(/\s+/).filter(Boolean); return words.length < 2 ? words[0] || '' : `${words[0]} ${words[words.length - 1][0].toUpperCase()}.` }

function fixture() {
  const student = (id: string, username: string, rosterName: string): MockUser => ({ id, username, rosterName, role: 'student', password: MOCK_PASSWORD, classId: MOCK_IDS.classId, suspended: false, resetRequired: false })
  const users: MockUser[] = [
    { id: MOCK_IDS.teacherId, username: 'Teacher', rosterName: 'Mr. Idrees', role: 'teacher', password: 'teach-bricks', classId: null, suspended: false, resetRequired: false },
    student(MOCK_IDS.ava, 'ava_builds', 'Ava Rivera'), student(MOCK_IDS.ben, 'ben_k', 'Ben Kim'), student(MOCK_IDS.chloe, 'chloe_m', 'Chloe Martin'),
    student(MOCK_IDS.diego, 'diego_s', 'Diego Santos'), student(MOCK_IDS.emma, 'emma_l', 'Emma Lopez'), student(MOCK_IDS.finn, 'finn_o', 'Finn Okafor'),
  ]
  const classes: MockClass[] = [{ id: MOCK_IDS.classId, teacherId: MOCK_IDS.teacherId, name: 'Period 3 Makers', code: MOCK_CLASS_CODE, loginCode: MOCK_CLASS_CODE, enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true, studentsCanShare: true }]
  const world = (id: string, title: string, ownerId: string, updated: number, sharing: Partial<Pick<MockWorld, 'visibility' | 'classCanEdit' | 'hiddenByTeacher' | 'sharedAt' | 'kind' | 'classId' | 'members'>> = {}): MockWorld => ({
    id, title, ownerId, classId: null, kind: 'personal', revision: 3, updatedAt: day(updated), document: createBrickStudioDocument([]), visibility: 'private', classCanEdit: false, hiddenByTeacher: false, sharedAt: null, members: [], ...sharing,
  })
  const worlds: MockWorld[] = [
    world(MOCK_IDS.worlds.treehouse, 'Treehouse Hideout', MOCK_IDS.ava, 0),
    world(MOCK_IDS.worlds.rocket, 'Rainbow Rocket', MOCK_IDS.ava, 2, { visibility: 'class', classCanEdit: false, sharedAt: day(2, 14) }),
    world(MOCK_IDS.worlds.lava, 'Lava Maze', MOCK_IDS.ava, 5, { visibility: 'class', classCanEdit: true, sharedAt: day(4) }),
    world(MOCK_IDS.worlds.skyBridge, 'Sky Bridge', MOCK_IDS.ben, 1, { visibility: 'class', classCanEdit: true, sharedAt: day(1, 9) }),
    world(MOCK_IDS.worlds.castle, 'Crystal Castle', MOCK_IDS.chloe, 3, { visibility: 'class', classCanEdit: false, sharedAt: day(3) }),
    world(MOCK_IDS.worlds.moonBase, 'Moon Base', MOCK_IDS.diego, 1, { visibility: 'class', classCanEdit: true, hiddenByTeacher: true, sharedAt: day(6) }),
    world(MOCK_IDS.worlds.garden, 'Secret Garden', MOCK_IDS.emma, 7),
    // Quiet invite: Finn shared with Ava and Chloe only; Ben, Diego and Emma never see it.
    world(MOCK_IDS.worlds.arcade, 'Pixel Arcade', MOCK_IDS.finn, 2, { visibility: 'members', classCanEdit: true, sharedAt: day(2, 16), members: [MOCK_IDS.ava, MOCK_IDS.chloe] }),
    world(MOCK_IDS.worlds.town, 'Our Town', MOCK_IDS.teacherId, 0, { kind: 'class', classId: MOCK_IDS.classId, visibility: 'class' }),
    world(MOCK_IDS.worlds.bridgeTeam, 'Bridge Team', MOCK_IDS.teacherId, 4, { kind: 'group', classId: MOCK_IDS.classId, visibility: 'class', members: [MOCK_IDS.ava, MOCK_IDS.ben] }),
  ]
  const checkpoints: MockCheckpoint[] = worlds.filter(w => w.ownerId === MOCK_IDS.ava).flatMap(w => [1, 2].map(revision => ({ id: `${w.id}-cp${revision}`, worldId: w.id, revision, createdAt: day(8 - revision), reason: revision === 1 ? 'save' : 'restore', title: w.title, document: w.document })))
  return { users, classes, worlds, checkpoints }
}

export type MockClassroomClient = ClassroomClientSurface & {
  /** The role the fixture started as; `getSession()` reflects later sign-ins. */
  readonly startedAs: MockRole
  /** Reset the fixture and session (tests). */
  reset(as?: MockRole): void
}

export function createMockClient({ as = 'guest', delay = 0, worldLimit = 50 }: MockClientOptions = {}): MockClassroomClient {
  let db = fixture()
  let auth: ClassroomAuthResult | null = null
  const listeners = new Set<() => void>()
  let nextId = 1
  const now = () => new Date().toISOString()
  const wait = () => (delay > 0 ? new Promise<void>(resolve => setTimeout(resolve, delay)) : Promise.resolve())

  /** Fixture presence: Ava, Ben and Chloe are building in Period 3 right now; sign-in responses report null like the server. */
  const buildingNow = (cls: MockClass, forTeacher: boolean, signIn: boolean) => signIn || !forTeacher ? null : cls.id === MOCK_IDS.classId ? 3 : 0
  const classView = (cls: MockClass, forTeacher: boolean, signIn = false): ClassroomClass => ({ id: cls.id, name: cls.name, loginCode: cls.loginCode, enrollmentOpen: cls.enrollmentOpen, collaborationOpen: cls.collaborationOpen, showNamesOnJoin: cls.showNamesOnJoin, studentsCanShare: cls.studentsCanShare, buildingNow: buildingNow(cls, forTeacher, signIn), teacherName: userById(cls.teacherId)?.rosterName ?? null, ...(forTeacher ? { code: cls.code } : {}) })
  const studentView = (user: MockUser): ClassroomStudent => ({ id: user.id, username: user.username, rosterName: user.rosterName, suspended: user.suspended, resetRequired: user.resetRequired })
  const userById = (id: string) => db.users.find(user => user.id === id)
  const ownerName = (world: MockWorld) => { const owner = userById(world.ownerId); return !owner ? 'Builder' : owner.role === 'teacher' ? 'Teacher' : mockDisplayName(owner.rosterName) }
  const meFor = (user: MockUser, signIn = false): ClassroomMe => ({
    user: { id: user.id, username: user.username, rosterName: user.rosterName, role: user.role, resetRequired: user.resetRequired },
    classes: db.classes.filter(cls => user.role === 'teacher' ? cls.teacherId === user.id : cls.id === user.classId).map(cls => classView(cls, user.role === 'teacher', signIn)),
  })
  const sessionFor = (user: MockUser): ClassroomAuthResult => ({ ...meFor(user, true), session: { accessToken: `mock-access-${user.id}-${nextId++}`, refreshToken: `mock-refresh-${user.id}`, expiresIn: 3600 } })
  const publish = (next: ClassroomAuthResult | null) => { auth = next; listeners.forEach(listener => listener()) }
  const caller = (allowReset = false): MockUser => {
    const user = auth && userById(auth.user.id)
    if (!user) return fail(401, 'sign_in_required', 'Sign in to use classroom features.')
    if (user.suspended) return fail(403, 'suspended', 'Your teacher has paused your classroom account.')
    if (user.resetRequired && !allowReset) return fail(403, 'password_change_required', 'Choose a new password to continue.')
    return user
  }
  const classFor = (user: MockUser, id: string, teacherOnly = false): MockClass => {
    const cls = db.classes.find(row => row.id === id)
    if (!cls || (user.role === 'teacher' ? cls.teacherId !== user.id : teacherOnly || user.classId !== id)) return fail(404, 'not_found', 'Class not found.')
    return cls
  }
  const classByCode = (code: string) => {
    const key = code.trim().toUpperCase()
    if (!key || key.length > 40) fail(400, 'invalid_input', 'Class code is required (up to 40 characters).')
    return db.classes.find(cls => cls.code === key || cls.loginCode === key) ?? fail(404, 'class_not_found', 'Check the class code with your teacher.')
  }
  /** Mirrors the Worker's worldAccess: owner always; classmates/teacher of the owner's class for shared personal worlds; class/group rules otherwise. */
  const access = (user: MockUser, id: string): { world: MockWorld; canEdit: boolean; isOwner: boolean } => {
    const world = db.worlds.find(row => row.id === id) ?? fail(404, 'not_found', 'World not found.')
    if (world.ownerId === user.id) return { world, canEdit: true, isOwner: true }
    if (world.kind === 'personal') {
      const owner = userById(world.ownerId)
      if (world.visibility === 'private' || !owner?.classId) fail(404, 'not_found', 'World not found.')
      const cls = classFor(user, owner!.classId!)
      if (user.role === 'student') {
        if (world.visibility === 'members' && !world.members.includes(user.id)) fail(404, 'not_found', 'World not found.')
        if (owner!.suspended) fail(404, 'not_found', 'World not found.')
        if (world.hiddenByTeacher) fail(403, 'world_hidden', 'Your teacher hid this world from the class.')
        if (!cls.collaborationOpen) fail(403, 'class_closed', 'Your teacher has closed classroom collaboration.')
        if (!cls.studentsCanShare) fail(403, 'sharing_disabled', 'Your teacher has turned off sharing between students.')
      }
      return { world, canEdit: world.classCanEdit, isOwner: false }
    }
    const cls = classFor(user, world.classId!)
    if (user.role === 'student') {
      if (!cls.collaborationOpen) fail(403, 'class_closed', 'Your teacher has closed classroom collaboration.')
      if (world.kind === 'group' && !world.members.includes(user.id)) fail(404, 'not_found', 'World not found.')
    }
    return { world, canEdit: true, isOwner: false }
  }
  /** Invitees of a members-only world by display name, in the picker's order. */
  const memberSummaries = (world: MockWorld): ClassroomWorldMemberSummary[] => world.members
    .map(id => userById(id)).filter((member): member is MockUser => Boolean(member))
    .map(member => ({ id: member.id, displayName: mockDisplayName(member.rosterName) }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
  const worldView = (world: MockWorld, user: MockUser, canEdit: boolean, full = false): ClassroomWorld => ({
    id: world.id, title: world.title, ownerId: world.ownerId, classId: world.classId, kind: world.kind, revision: world.revision, updatedAt: world.updatedAt,
    visibility: world.kind === 'personal' ? world.visibility : 'class', canEdit, classCanEdit: world.kind === 'personal' ? world.classCanEdit : true, ownerName: ownerName(world), ownerClassId: world.kind === 'personal' ? userById(world.ownerId)?.classId ?? null : world.classId,
    sharedAt: world.kind === 'personal' && world.visibility !== 'private' ? world.sharedAt : null,
    // Who is invited is the owner's and the teacher's business, never a fellow invitee's.
    ...(world.kind === 'personal' && world.visibility === 'members' && (world.ownerId === user.id || user.role === 'teacher') ? { members: memberSummaries(world) } : {}),
    ...(user.role === 'teacher' ? { hiddenByTeacher: world.hiddenByTeacher } : {}), ...(full ? { document: structuredClone(world.document) } : {}),
  })
  const listWorlds = (user: MockUser): ClassroomWorld[] => {
    const mine = db.worlds.filter(world => world.ownerId === user.id && world.kind === 'personal').map(world => worldView(world, user, true))
    const classes = db.classes.filter(cls => user.role === 'teacher' ? cls.teacherId === user.id : cls.id === user.classId && cls.collaborationOpen)
    const classIds = classes.map(cls => cls.id)
    const shared = db.worlds.filter(world => world.kind !== 'personal' && classIds.includes(world.classId!) && (user.role === 'teacher' || world.kind === 'class' || world.members.includes(user.id))).map(world => worldView(world, user, true))
    const sharingClasses = classes.filter(cls => user.role === 'teacher' || cls.studentsCanShare)
    const classmates = db.users.filter(other => other.role === 'student' && other.id !== user.id && sharingClasses.some(cls => cls.id === other.classId) && (user.role === 'teacher' || !other.suspended)).map(other => other.id)
    const fromClassmates = db.worlds
      .filter(world => world.kind === 'personal' && world.visibility !== 'private' && classmates.includes(world.ownerId) && (user.role === 'teacher' || !world.hiddenByTeacher))
      .filter(world => user.role === 'teacher' || world.visibility !== 'members' || world.members.includes(user.id))
      .map(world => worldView(world, user, world.classCanEdit))
    const byDate = (a: ClassroomWorld, b: ClassroomWorld) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
    return [...mine.sort(byDate), ...shared.sort(byDate), ...fromClassmates.sort(byDate)]
  }
  const cleanTitle = (value: unknown, fallback?: string) => {
    const title = typeof value === 'string' ? value.trim() : ''
    if (!title && fallback) return fallback
    if (!title || title.length > 80) fail(400, 'invalid_input', 'World title is required (up to 80 characters).')
    return title
  }
  const validUsername = (value: unknown) => {
    const name = typeof value === 'string' ? value.trim() : ''
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,23}$/.test(name)) fail(400, 'invalid_username', 'Use 3–24 letters, numbers, underscores or hyphens.')
    return name
  }
  const assertUsernameFree = (username: string, excludeUserId?: string) => {
    const taken = (name: string) => db.users.some(user => user.username.toLowerCase() === name.toLowerCase() && user.id !== excludeUserId)
    if (!taken(username)) return
    const suggestions = ['2', '3', '7', '4', '5', '8', '9', '6'].map(suffix => `${username.slice(0, 24 - suffix.length)}${suffix}`).filter(name => !taken(name)).slice(0, 3)
    fail(409, 'username_taken', 'That username is already taken. Try one of these or choose another.', { suggestions })
  }
  const insertWorld = (user: MockUser, title: string, document: BrickStudioDocument, kind: ClassroomWorld['kind'] = 'personal', classId: string | null = null): MockWorld => {
    if (db.worlds.filter(world => world.ownerId === user.id).length >= worldLimit) fail(409, 'world_limit', 'You have reached the saved-world limit. Ask your teacher for help.')
    const world: MockWorld = { id: `world-${nextId++}`, title, ownerId: user.id, classId, kind, revision: 1, updatedAt: now(), document: structuredClone(document), visibility: 'private', classCanEdit: false, hiddenByTeacher: false, sharedAt: null, members: [] }
    db.worlds.unshift(world)
    return world
  }
  const commit = (world: MockWorld, expectedRevision: number, document: BrickStudioDocument, title: string | null, reason: string) => {
    if (world.revision !== expectedRevision) fail(409, 'revision_conflict', 'Someone saved a newer version. Refresh before saving again.', { currentRevision: world.revision })
    db.checkpoints.unshift({ id: `cp-${nextId++}`, worldId: world.id, revision: world.revision, createdAt: now(), reason, title: world.title, document: world.document })
    db.checkpoints = db.checkpoints.filter(cp => cp.worldId !== world.id).concat(db.checkpoints.filter(cp => cp.worldId === world.id).slice(0, 30))
    world.document = structuredClone(document); if (title) world.title = title; world.revision += 1; world.updatedAt = now()
    return world
  }
  const members = (world: MockWorld, user: MockUser): ClassroomWorldMember[] => db.users
    .filter(other => other.role === 'student' && other.classId === world.classId && (world.kind === 'class' || world.members.includes(other.id)))
    .map(other => ({ id: other.id, username: other.username, ...(user.role === 'teacher' ? { rosterName: other.rosterName } : {}) }))
  const isBoolean = (value: unknown, label: string) => { if (typeof value !== 'boolean') fail(400, 'invalid_input', `${label} must be true or false.`); return value as boolean }
  const isObject = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' ? value as Record<string, unknown> : {})

  /** The same routes as the Worker, so `request()` callers (existing panel code) work unchanged against the fixture. */
  const route = (method: string, path: string, body: unknown): unknown => {
    const parts = path.replace(/^\//, '').split('?')[0].split('/')
    const input = isObject(body)
    if (parts[0] === 'auth' && method === 'POST') {
      if (parts[1] === 'class') { const cls = classByCode(String(input.classCode ?? '')); return { name: cls.name, canEnroll: cls.enrollmentOpen } }
      if (parts[1] === 'roster') {
        const cls = classByCode(String(input.classCode ?? ''))
        const students = cls.showNamesOnJoin ? db.users.filter(user => user.classId === cls.id && !user.suspended).map(user => ({ username: user.username, displayName: mockDisplayName(user.rosterName) })).sort((a, b) => a.displayName.localeCompare(b.displayName) || a.username.localeCompare(b.username)) : []
        return { name: cls.name, canEnroll: cls.enrollmentOpen, showNames: cls.showNamesOnJoin, students } satisfies ClassroomRoster
      }
      if (parts[1] === 'register') {
        const username = validUsername(input.username)
        const error = studentPasswordError(input.password, username); if (error) fail(400, 'invalid_password', error)
        const cls = db.classes.find(row => row.code === String(input.classCode ?? '').trim().toUpperCase()) ?? fail(401, 'invalid_credentials', 'Check your class code, username and password.')
        if (!cls.enrollmentOpen) fail(403, 'enrollment_closed', 'Your teacher has closed enrollment with this code.')
        assertUsernameFree(username)
        const user: MockUser = { id: `student-${nextId++}`, username, rosterName: typeof input.rosterName === 'string' && input.rosterName.trim() ? input.rosterName.trim() : username, role: 'student', password: input.password as string, classId: cls.id, suspended: false, resetRequired: false }
        db.users.push(user)
        const next = sessionFor(user); publish(next); return next
      }
      if (parts[1] === 'login') {
        const username = validUsername(input.username)
        if (typeof input.password !== 'string' || input.password.length < 6) fail(400, 'invalid_password', 'Use a password with 6–128 characters.')
        const code = typeof input.classCode === 'string' && input.classCode.trim() ? input.classCode.trim().toUpperCase() : null
        const matches = db.users.filter(user => user.role === 'student' && user.username.toLowerCase() === username.toLowerCase() && (!code || db.classes.some(cls => cls.id === user.classId && (cls.code === code || cls.loginCode === code))))
        if (matches.length > 1) fail(409, 'class_code_required', 'More than one account uses this username. Add your class code to pick yours.')
        const user = matches[0]
        if (!user || user.password !== input.password) fail(401, 'invalid_credentials', code ? 'Check your class code, username and password.' : 'Check your username and password.')
        if (user.suspended) fail(403, 'suspended', 'Your teacher has paused your classroom account.')
        const next = sessionFor(user); publish(next); return next
      }
      if (parts[1] === 'teacher-login') {
        const email = typeof input.email === 'string' ? input.email.trim() : ''
        if (!email || typeof input.password !== 'string' || input.password.length < 8) fail(401, 'invalid_credentials', 'Check your sign-in details and try again.')
        const next = sessionFor(userById(MOCK_IDS.teacherId)!); publish(next); return next
      }
      if (parts[1] === 'refresh') { const user = caller(true); const next = sessionFor(user); publish(next); return next }
      if (parts[1] === 'logout') { caller(true); publish(null); return { ok: true } }
      if (parts[1] === 'change-password') {
        const user = caller(true)
        if (user.role !== 'student') fail(403, 'student_required', 'Manage teacher credentials through your sign-in provider.')
        const error = studentPasswordError(input.password, user.username); if (error) fail(400, 'invalid_password', error)
        if (user.resetRequired && input.password === user.password) fail(400, 'password_unchanged', 'Choose a different password from your temporary password.')
        user.password = input.password as string; user.resetRequired = false
        const next = sessionFor(user); publish(next); return next
      }
    }
    const user = caller(parts[0] === 'me')
    if (parts[0] === 'me' && method === 'GET') return meFor(user)
    if (parts[0] === 'classes') {
      if (parts.length === 1 && method === 'GET') return { classes: meFor(user).classes }
      if (parts.length === 1 && method === 'POST') {
        if (user.role !== 'teacher') fail(403, 'teacher_required', 'Only teachers can create classes.')
        const name = typeof input.name === 'string' ? input.name.trim() : ''
        if (!name || name.length > 80) fail(400, 'invalid_input', 'Class name is required (up to 80 characters).')
        const code = `CLASS${String(nextId++).padStart(3, '0')}`
        const cls: MockClass = { id: `class-${nextId++}`, teacherId: user.id, name, code, loginCode: code, enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true, studentsCanShare: true }
        db.classes.push(cls)
        return { class: classView(cls, true) }
      }
      if (parts[2] === 'classmates' && parts.length === 3 && method === 'GET') {
        const own = classFor(user, parts[1])
        const classmates: ClassroomClassmate[] = db.users.filter(other => other.role === 'student' && other.classId === own.id && !other.suspended && other.id !== user.id)
          .map(other => ({ id: other.id, displayName: mockDisplayName(other.rosterName) }))
          .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.id.localeCompare(b.id))
        return { classmates }
      }
      const cls = classFor(user, parts[1], true)
      if (parts.length === 2 && method === 'PATCH') {
        if (input.name !== undefined) { const name = typeof input.name === 'string' ? input.name.trim() : ''; if (!name || name.length > 80) fail(400, 'invalid_input', 'Class name is required (up to 80 characters).'); cls.name = name }
        for (const key of ['enrollmentOpen', 'collaborationOpen', 'showNamesOnJoin', 'studentsCanShare'] as const) if (input[key] !== undefined) cls[key] = isBoolean(input[key], key)
        if (input.rotateCode === true) cls.code = `${cls.code.replace(/\d+$/, '')}${String(nextId++).padStart(3, '0')}`
        return { class: classView(cls, true) }
      }
      if (parts[2] === 'students' && parts.length === 3 && method === 'GET') return { students: db.users.filter(other => other.classId === cls.id).sort((a, b) => a.username.localeCompare(b.username)).map(studentView) }
      if (parts[2] === 'students' && parts.length === 4 && method === 'PATCH') {
        const student = db.users.find(other => other.classId === cls.id && other.id === parts[3]) ?? fail(404, 'not_found', 'Student not found.')
        if (input.username !== undefined) { const username = validUsername(input.username); assertUsernameFree(username, student.id); student.username = username }
        if (input.rosterName !== undefined) { const name = typeof input.rosterName === 'string' ? input.rosterName.trim() : ''; if (!name || name.length > 80) fail(400, 'invalid_input', 'Roster name is required (up to 80 characters).'); student.rosterName = name }
        if (input.suspended !== undefined) student.suspended = isBoolean(input.suspended, 'suspended')
        if (input.temporaryPassword !== undefined) { const error = studentPasswordError(input.temporaryPassword, student.username); if (error) fail(400, 'invalid_password', error); student.password = input.temporaryPassword as string; student.resetRequired = true }
        if ((input.suspended !== undefined || input.temporaryPassword !== undefined) && auth?.user.id === student.id) publish(null)
        return { student: studentView(student) }
      }
    }
    if (parts[0] === 'worlds') {
      if (parts.length === 1 && method === 'GET') return { worlds: listWorlds(user) }
      if (parts.length === 1 && method === 'POST') {
        const kind = (input.kind ?? 'personal') as ClassroomWorld['kind']
        if (!['personal', 'class', 'group'].includes(kind)) fail(400, 'invalid_input', 'Unknown world kind.')
        if (kind !== 'personal') classFor(user, String(input.classId), true)
        if (!input.document || typeof input.document !== 'object') fail(400, 'invalid_document', 'This world is incomplete or invalid.')
        const created = insertWorld(user, cleanTitle(input.title, 'My world'), input.document as BrickStudioDocument, kind, kind === 'personal' ? null : String(input.classId))
        return { world: worldView(created, user, true, true) }
      }
      const { world, canEdit, isOwner } = access(user, parts[1])
      if (parts.length === 2 && method === 'GET') return { world: worldView(world, user, canEdit, true) }
      if (parts.length === 2 && method === 'PATCH') {
        if (!(isOwner || (world.kind !== 'personal' && user.role === 'teacher'))) fail(403, 'owner_required', 'Only the owner or teacher can rename this world.')
        commit(world, world.revision, world.document, cleanTitle(input.title), 'rename')
        return { world: worldView(world, user, canEdit) }
      }
      if (parts.length === 2 && method === 'PUT') {
        if (!canEdit) fail(403, 'read_only', 'You do not have editing access to this world.')
        if (!Number.isInteger(input.expectedRevision)) fail(400, 'invalid_revision', 'A valid expectedRevision is required.')
        commit(world, input.expectedRevision as number, input.document as BrickStudioDocument, input.title === undefined ? null : cleanTitle(input.title), 'save')
        return { world: worldView(world, user, canEdit, true) }
      }
      if (parts[2] === 'restore' && method === 'POST') {
        if (!(isOwner || (world.kind !== 'personal' && user.role === 'teacher'))) fail(403, 'owner_required', 'Only the owner or teacher can restore this world.')
        const cp = db.checkpoints.find(row => row.id === input.checkpointId && row.worldId === world.id) ?? fail(404, 'not_found', 'Checkpoint not found.')
        commit(world, input.expectedRevision as number, cp.document, cp.title, 'restore')
        return { world: worldView(world, user, canEdit, true) }
      }
      if (parts[2] === 'checkpoints' && method === 'GET') {
        if (world.kind === 'personal' && !isOwner) fail(403, 'owner_required', 'Only the owner can see checkpoints of a personal world.')
        return { checkpoints: db.checkpoints.filter(cp => cp.worldId === world.id).slice(0, 30).map(({ id, revision, createdAt, reason }) => ({ id, revision, createdAt, reason })) }
      }
      if (parts[2] === 'sharing' && method === 'PATCH') {
        if (user.role !== 'student') fail(403, 'student_required', 'Only students share their own worlds with the class.')
        if (!isOwner || world.kind !== 'personal') fail(403, 'owner_required', 'Only the owner can share this world.')
        if (!['private', 'class', 'members'].includes(String(input.visibility))) fail(400, 'invalid_input', 'visibility must be private, class or members.')
        const wantsEdit = isBoolean(input.canEdit, 'canEdit')
        const cls = classFor(user, user.classId!)
        if (!cls.studentsCanShare) fail(403, 'sharing_disabled', 'Your teacher has turned off sharing between students.')
        const visibility = input.visibility as ClassroomWorldVisibility
        if (visibility === 'members') {
          // A given list replaces the invitees (validated first, so a refused list changes nothing); an omitted list keeps them.
          if (input.members !== undefined) {
            if (!Array.isArray(input.members) || input.members.some(id => typeof id !== 'string')) fail(400, 'invalid_input', 'members must be a list of student ids.')
            const ids = [...new Set(input.members as string[])]
            if (ids.includes(user.id)) fail(400, 'invalid_member', 'You already own this world.')
            if (ids.length > MOCK_WORLD_MEMBER_LIMIT) fail(400, 'too_many_members', `Pick up to ${MOCK_WORLD_MEMBER_LIMIT} classmates.`)
            if (ids.some(id => { const other = userById(id); return !other || other.role !== 'student' || other.classId !== user.classId || other.suspended })) fail(400, 'invalid_member', 'Choose active students in your class.')
            if (!ids.length) fail(400, 'invalid_input', 'Pick at least one classmate.')
            world.members = ids
          } else if (!world.members.length) fail(400, 'invalid_input', 'Pick at least one classmate.')
        } else world.members = []
        const sharing = visibility !== 'private'
        world.visibility = visibility; world.classCanEdit = sharing && wantsEdit; world.sharedAt = sharing ? world.sharedAt ?? now() : null
        return { world: worldView(world, user, true) }
      }
      if (parts[2] === 'visibility' && method === 'PATCH') {
        if (user.role !== 'teacher') fail(403, 'teacher_required', 'Only the class teacher can hide a shared world.')
        if (world.kind !== 'personal') fail(400, 'invalid_input', 'Only shared student worlds can be hidden.')
        world.hiddenByTeacher = isBoolean(input.hiddenByTeacher, 'hiddenByTeacher')
        return { world: worldView(world, user, canEdit) }
      }
      if (parts[2] === 'copy' && method === 'POST') {
        const created = insertWorld(user, `${world.title} (copy)`.slice(0, 80), world.document)
        return { world: worldView(created, user, true, true) }
      }
      if (parts[2] === 'members') {
        if (world.kind === 'personal') fail(400, 'private_world', 'Personal worlds do not have group members.')
        if (method !== 'GET') {
          classFor(user, world.classId!, true)
          if (world.kind !== 'group') fail(400, 'class_world', 'Class worlds include the entire class. Use a group world for selected members.')
          if (method === 'POST') {
            const student = db.users.find(other => other.id === input.userId && other.classId === world.classId && !other.suspended) ?? fail(400, 'invalid_member', 'Choose an active student in this class.')
            if (!world.members.includes(student.id)) world.members.push(student.id)
          } else if (method === 'DELETE' && parts[3]) world.members = world.members.filter(id => id !== parts[3])
          else fail(405, 'method_not_allowed', 'Unsupported member action.')
        }
        return { members: members(world, user) }
      }
    }
    return fail(404, 'not_found', 'Classroom route not found.')
  }

  const request = async <T,>(path: string, method = 'GET', body?: unknown): Promise<T> => { await wait(); return route(method, path, body) as T }
  const start = (role: MockRole) => { auth = role === 'guest' ? null : sessionFor(userById(role === 'teacher' ? MOCK_IDS.teacherId : MOCK_IDS.ava)!) }
  start(as)
  const client: MockClassroomClient = {
    startedAs: as,
    reset(role = as) { db = fixture(); start(role); listeners.forEach(listener => listener()) },
    getSession: () => auth,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    setSession: next => publish(next),
    request,
    authenticate: (path, values) => request(`/auth/${path}`, 'POST', values),
    login: ({ username, password, classCode }: ClassroomLoginInput) => { const code = classCode?.trim().toUpperCase(); return request('/auth/login', 'POST', { username: username.trim(), password, ...(code ? { classCode: code } : {}) }) },
    register: ({ classCode, username, password, rosterName }: ClassroomRegisterInput) => request('/auth/register', 'POST', { classCode: classCode.trim().toUpperCase(), username: username.trim(), password, ...(rosterName?.trim() ? { rosterName: rosterName.trim() } : {}) }),
    classRoster: classCode => request('/auth/roster', 'POST', { classCode: classCode.trim().toUpperCase() }),
    resolveClass: classCode => request('/auth/class', 'POST', { classCode: classCode.trim().toUpperCase() }),
    changePassword: password => request('/auth/change-password', 'POST', { password }),
    /** No Google round trip in the fixture: sign in as the teacher and return to the requested page. */
    startGoogleTeacher: async returnTo => { await wait(); publish(sessionFor(userById(MOCK_IDS.teacherId)!)); return returnTo },
    signOut: async () => { await request('/auth/logout', 'POST') },
    me: () => request('/me'),
    listWorlds: async () => (await request<{ worlds: ClassroomWorld[] }>('/worlds')).worlds,
    listClasses: async () => (await request<{ classes: ClassroomClass[] }>('/classes')).classes,
    listStudents: async classId => (await request<{ students: ClassroomStudent[] }>(`/classes/${classId}/students`)).students,
    listClassmates: async classId => (await request<{ classmates: ClassroomClassmate[] }>(`/classes/${classId}/classmates`)).classmates,
    getWorld: async id => (await request<{ world: ClassroomWorld }>(`/worlds/${id}`)).world,
    createWorld: async (input: ClassroomWorldCreateInput) => (await request<{ world: ClassroomWorld }>('/worlds', 'POST', input)).world,
    saveWorld: async (id, input: ClassroomWorldSaveInput) => (await request<{ world: ClassroomWorld }>(`/worlds/${id}`, 'PUT', input)).world,
    renameWorld: async (id, title) => (await request<{ world: ClassroomWorld }>(`/worlds/${id}`, 'PATCH', { title })).world,
    duplicateWorld: async id => { const source = await client.getWorld(id); return client.createWorld({ title: `${source.title} copy`.slice(0, 80), document: source.document!, kind: 'personal' }) },
    listCheckpoints: async id => (await request<{ checkpoints: ClassroomCheckpoint[] }>(`/worlds/${id}/checkpoints`)).checkpoints,
    restoreWorld: async (id, checkpointId) => { const current = await client.getWorld(id); return (await request<{ world: ClassroomWorld }>(`/worlds/${id}/restore`, 'POST', { checkpointId, expectedRevision: current.revision })).world },
    setWorldSharing: async (id, sharing: ClassroomWorldSharing) => (await request<{ world: ClassroomWorld }>(`/worlds/${id}/sharing`, 'PATCH', sharing)).world,
    setWorldHidden: async (id, hidden) => (await request<{ world: ClassroomWorld }>(`/worlds/${id}/visibility`, 'PATCH', { hiddenByTeacher: hidden })).world,
    copyWorld: async id => (await request<{ world: ClassroomWorld }>(`/worlds/${id}/copy`, 'POST')).world,
    createClass: async name => (await request<{ class: ClassroomClass }>('/classes', 'POST', { name })).class,
    updateClass: async (id, patch: ClassroomClassPatch) => (await request<{ class: ClassroomClass }>(`/classes/${id}`, 'PATCH', patch)).class,
    updateStudent: async (classId, studentId, patch: ClassroomStudentPatch) => (await request<{ student: ClassroomStudent }>(`/classes/${classId}/students/${studentId}`, 'PATCH', patch)).student,
  }
  return client
}
