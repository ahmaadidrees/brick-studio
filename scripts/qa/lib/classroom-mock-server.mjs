/**
 * QA stand-in for the classroom half of the Worker (`/classroom/*`), served over plain HTTP so the REAL pages
 * (`/join`, `/worlds`, `/class`, the editor's save sheet) run through the real `ClassroomClient` transport,
 * sessionStorage session store and header hook. The local `wrangler dev` Worker answers 503 `classroom_unavailable`
 * for every classroom route without the Supabase secrets (multiplayer/worker/src/classroom/index.ts), so nothing
 * here can be proven against it; guest live rooms still go to the real Worker (VITE_LIVE_SERVER_URL).
 *
 * Contract mirrored: docs/classroom/API.md (auth, classes, worlds, "Shared personal worlds") and the W1 Worker
 * handlers in multiplayer/worker/src/classroom/index.ts — same paths, bodies, status codes and `{ error, code }`
 * shapes, including 409 `username_taken` + `suggestions`, 400 `invalid_password`, 409 `class_code_required`,
 * 403 `sharing_disabled` / `world_hidden` / `read_only` / `owner_required` / `teacher_required` /
 * `student_required` / `enrollment_closed` / `class_closed`, 409 `world_limit` / `revision_conflict`.
 *
 * Differences (deliberate): teacher-login creates a fresh teacher per email (so a first run is reachable), tokens are
 * opaque strings, no rate limits, no Google, `live-ticket` answers a fake ticket (the live room itself needs the real
 * Worker with Supabase and CLASSROOM_TICKET_SECRET, which this host does not have).
 *
 * Control routes (QA only): POST /__qa/reset, GET /__qa/state, POST /__qa/seed (fixture class + students + worlds,
 * returns every account's session for sessionStorage seeding), POST /__qa/session { username } (a session for an
 * existing account), GET /__qa/health.
 *
 * Run: node scripts/qa/lib/classroom-mock-server.mjs   (PORT, default 8798). Import `startMockClassroomServer` to
 * embed it in a harness.
 */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const COMMON_PASSWORDS = new Set(['password', 'password1', '123456', '1234567', '12345678', 'qwerty', 'abc123', 'abcdef', '111111', '000000', 'letmein', 'welcome', 'brick', 'bricks', 'bricks1', 'lego', 'legos', 'iloveyou', 'monkey', 'dragon', 'sunshine', 'princess'])
const WORLD_LIMIT = 50

class HttpError extends Error {
  constructor(status, code, message, details = {}) { super(message); this.status = status; this.code = code; this.details = details }
}
const fail = (status, code, message, details) => { throw new HttpError(status, code, message, details) }

export function displayName(rosterName) {
  const words = String(rosterName || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ''
  if (words.length === 1) return words[0]
  return `${words[0]} ${words[words.length - 1][0].toUpperCase()}.`
}

export function studentPasswordError(value, username) {
  if (typeof value !== 'string' || value.length < 6 || value.length > 128) return 'Passwords need 6 to 128 characters.'
  const key = value.trim().toLowerCase()
  if (COMMON_PASSWORDS.has(key) || /^(.)\1+$/.test(key) || (username && key === username.trim().toLowerCase())) return 'Choose a password that is harder to guess and different from your username.'
  return ''
}

const cleanText = (value, label, max = 80) => {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > max) fail(400, 'invalid_input', `${label} is required (up to ${max} characters).`)
  return text
}
const normalizeUsername = (value) => {
  const name = cleanText(value, 'Username', 24)
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,23}$/.test(name)) fail(400, 'invalid_username', 'Use 3–24 letters, numbers, underscores or hyphens.')
  return name
}
const emptyDocument = () => ({ schemaVersion: 2, partLibraryVersion: 1, environmentId: 'classic', customParts: [], bricks: [] })
const validDocument = (value) => {
  if (!value || typeof value !== 'object' || !Array.isArray(value.bricks)) fail(400, 'invalid_document', 'The build could not be read.')
  return structuredClone(value)
}

export function createMockClassroom() {
  const db = { users: [], classes: [], worlds: [], checkpoints: [], sessions: new Map(), counters: { code: 10, token: 0 } }
  const now = () => new Date().toISOString()

  const userById = (id) => db.users.find((u) => u.id === id)
  const classById = (id) => db.classes.find((c) => c.id === id)
  const classByCode = (code) => { const key = String(code || '').trim().toUpperCase(); return db.classes.find((c) => c.codes.includes(key)) }
  const nextCode = () => `ROOM-${++db.counters.code}`

  const classView = (cls, forTeacher) => ({
    id: cls.id, name: cls.name, loginCode: cls.codes[0], enrollmentOpen: cls.enrollmentOpen, collaborationOpen: cls.collaborationOpen,
    showNamesOnJoin: cls.showNamesOnJoin, studentsCanShare: cls.studentsCanShare, buildingNow: null, teacherName: null,
    ...(forTeacher ? { code: cls.codes[cls.codes.length - 1] } : {}),
  })
  const meFor = (user) => ({
    user: { id: user.id, username: user.username, rosterName: user.rosterName, role: user.role, resetRequired: user.resetRequired },
    classes: db.classes.filter((c) => (user.role === 'teacher' ? c.teacherId === user.id : c.id === user.classId)).map((c) => classView(c, user.role === 'teacher')),
  })
  const sessionFor = (user) => {
    const accessToken = `qa-access-${user.id}-${++db.counters.token}`
    const refreshToken = `qa-refresh-${user.id}-${db.counters.token}`
    db.sessions.set(accessToken, { userId: user.id, refreshToken, authVersion: user.authVersion })
    return { ...meFor(user), session: { accessToken, refreshToken, expiresIn: 3600 } }
  }
  const studentView = (u) => ({ id: u.id, username: u.username, rosterName: u.rosterName, suspended: u.suspended, resetRequired: u.resetRequired })
  const ownerName = (world) => { const o = userById(world.ownerId); return !o ? 'Builder' : o.role === 'teacher' ? 'Teacher' : displayName(o.rosterName) }
  const worldView = (world, caller, canEdit, full = false) => ({
    id: world.id, title: world.title, ownerId: world.ownerId, classId: world.classId, kind: world.kind, revision: world.revision, updatedAt: world.updatedAt,
    visibility: world.kind === 'personal' ? world.visibility : 'class', canEdit, classCanEdit: world.kind === 'personal' ? world.classCanEdit : true,
    ownerName: ownerName(world), ownerClassId: world.kind === 'personal' ? (userById(world.ownerId)?.classId ?? null) : world.classId,
    sharedAt: world.kind === 'personal' && world.visibility === 'class' ? world.sharedAt : null,
    ...(caller.role === 'teacher' ? { hiddenByTeacher: world.hiddenByTeacher } : {}),
    ...(full ? { document: structuredClone(world.document) } : {}),
  })

  const authenticate = (token, allowReset = false) => {
    const entry = token ? db.sessions.get(token) : null
    const user = entry && userById(entry.userId)
    if (!user || entry.authVersion !== user.authVersion) fail(401, 'sign_in_required', 'Sign in to use classroom features.')
    if (user.suspended) fail(403, 'suspended', 'Your teacher has paused your classroom account.')
    if (user.resetRequired && !allowReset) fail(403, 'password_change_required', 'Choose a new password to continue.')
    return user
  }
  const classFor = (user, id, teacherOnly = false) => {
    const cls = classById(id)
    if (!cls || (user.role === 'teacher' ? cls.teacherId !== user.id : teacherOnly || user.classId !== id)) fail(404, 'not_found', 'Class not found.')
    return cls
  }
  const usernameTaken = (username, exceptId) => db.users.some((u) => u.username.toLowerCase() === username.toLowerCase() && u.id !== exceptId)
  const assertUsernameFree = (username, exceptId) => {
    if (!usernameTaken(username, exceptId)) return
    const stem = (suffix) => `${username.slice(0, 24 - suffix.length)}${suffix}`
    const suggestions = []
    for (const candidate of [...['2', '3', '7', '4', '5', '8', '9', '6'].map(stem), ...Array.from({ length: 8 }, (_, i) => stem(String(11 + i * 7))), ...Array.from({ length: 8 }, (_, i) => stem(`_${13 + i * 5}`))]) {
      if (!usernameTaken(candidate) && !suggestions.includes(candidate)) suggestions.push(candidate)
      if (suggestions.length === 3) break
    }
    fail(409, 'username_taken', 'That username is already taken. Try one of these or choose another.', { suggestions })
  }

  /** Mirrors Worker `worldAccess`: owner always; classmates/teacher of the owner's class for shared personal worlds; class/group rules otherwise. */
  const access = (user, id) => {
    const world = db.worlds.find((w) => w.id === id) ?? fail(404, 'not_found', 'World not found.')
    if (world.ownerId === user.id) return { world, canEdit: true, isOwner: true }
    if (world.kind === 'personal') {
      const owner = userById(world.ownerId)
      if (world.visibility !== 'class' || !owner?.classId) fail(404, 'not_found', 'World not found.')
      const cls = classFor(user, owner.classId)
      if (user.role === 'student') {
        if (world.hiddenByTeacher) fail(403, 'world_hidden', 'Your teacher hid this world from the class.')
        if (!cls.collaborationOpen) fail(403, 'class_closed', 'Your teacher has closed classroom collaboration.')
        if (!cls.studentsCanShare) fail(403, 'sharing_disabled', 'Your teacher has turned off sharing between students.')
      }
      return { world, canEdit: world.classCanEdit, isOwner: false }
    }
    const cls = classFor(user, world.classId)
    if (user.role === 'student') {
      if (!cls.collaborationOpen) fail(403, 'class_closed', 'Your teacher has closed classroom collaboration.')
      if (world.kind === 'group' && !world.members.includes(user.id)) fail(404, 'not_found', 'World not found.')
    }
    return { world, canEdit: true, isOwner: false }
  }
  const listWorlds = (user) => {
    const mine = db.worlds.filter((w) => w.ownerId === user.id && w.kind === 'personal').map((w) => worldView(w, user, true))
    const classes = db.classes.filter((c) => (user.role === 'teacher' ? c.teacherId === user.id : c.id === user.classId && c.collaborationOpen))
    const classIds = classes.map((c) => c.id)
    const shared = db.worlds.filter((w) => w.kind !== 'personal' && classIds.includes(w.classId) && (user.role === 'teacher' || w.kind === 'class' || w.members.includes(user.id))).map((w) => worldView(w, user, true))
    const sharingClasses = classes.filter((c) => user.role === 'teacher' || c.studentsCanShare)
    const classmates = db.users.filter((o) => o.role === 'student' && o.id !== user.id && sharingClasses.some((c) => c.id === o.classId) && (user.role === 'teacher' || !o.suspended)).map((o) => o.id)
    const classmateWorlds = db.worlds
      .filter((w) => w.kind === 'personal' && w.visibility === 'class' && classmates.includes(w.ownerId) && (user.role === 'teacher' || !w.hiddenByTeacher))
      .map((w) => worldView(w, user, w.classCanEdit))
    return [...mine, ...shared, ...classmateWorlds]
  }
  const insertWorld = (user, title, document, kind = 'personal', classId = null) => {
    if (kind === 'personal' && db.worlds.filter((w) => w.ownerId === user.id).length >= WORLD_LIMIT) fail(409, 'world_limit', 'You have reached the saved-world limit. Ask your teacher for help.')
    const world = { id: randomUUID(), title: title.slice(0, 80), ownerId: user.id, classId, kind, revision: 1, updatedAt: now(), document: validDocument(document), visibility: 'private', classCanEdit: false, hiddenByTeacher: false, sharedAt: null, members: [] }
    db.worlds.push(world)
    return world
  }
  const commit = (world, expectedRevision, document, title, reason) => {
    if (expectedRevision !== world.revision) fail(409, 'revision_conflict', 'Someone saved a newer version. Refresh before saving again.', { currentRevision: world.revision })
    db.checkpoints.push({ id: randomUUID(), worldId: world.id, revision: world.revision, createdAt: now(), reason, title: world.title, document: structuredClone(world.document) })
    world.document = document; if (title) world.title = title.slice(0, 80); world.revision += 1; world.updatedAt = now()
    return world
  }

  /** One request. Returns `{ status, body }`. */
  function route(method, pathname, input, token) {
    const parts = pathname.replace(/^\/classroom\/?/, '').split('/').filter(Boolean)
    const body = input && typeof input === 'object' ? input : {}
    if (parts[0] === 'auth' && method === 'POST') {
      if (parts[1] === 'class' || parts[1] === 'roster') {
        const code = cleanText(body.classCode, 'Class code', 40).toUpperCase()
        const cls = classByCode(code) ?? fail(404, 'class_not_found', 'Check the class code with your teacher.')
        const canEnroll = cls.enrollmentOpen && cls.codes[cls.codes.length - 1] === code
        if (parts[1] === 'class') return { status: 200, body: { name: cls.name, canEnroll } }
        const students = cls.showNamesOnJoin
          ? db.users.filter((u) => u.role === 'student' && u.classId === cls.id && !u.suspended).map((u) => ({ username: u.username, displayName: displayName(u.rosterName) })).sort((a, b) => a.displayName.localeCompare(b.displayName) || a.username.localeCompare(b.username))
          : []
        return { status: 200, body: { name: cls.name, canEnroll, showNames: cls.showNamesOnJoin, students } }
      }
      if (parts[1] === 'register') {
        const code = cleanText(body.classCode, 'Class code', 40).toUpperCase()
        const username = normalizeUsername(body.username)
        const error = studentPasswordError(body.password, username); if (error) fail(400, 'invalid_password', error)
        const cls = classByCode(code) ?? fail(401, 'invalid_credentials', 'Check your class code, username and password.')
        if (!cls.enrollmentOpen || cls.codes[cls.codes.length - 1] !== code) fail(403, 'enrollment_closed', 'Your teacher has closed enrollment with this code.')
        const rosterName = cleanText(body.rosterName || username, 'Name your teacher knows')
        assertUsernameFree(username)
        const user = { id: randomUUID(), username, rosterName, role: 'student', password: body.password, classId: cls.id, suspended: false, resetRequired: false, authVersion: 1 }
        db.users.push(user)
        return { status: 201, body: sessionFor(user) }
      }
      if (parts[1] === 'login') {
        const username = normalizeUsername(body.username)
        if (typeof body.password !== 'string' || body.password.length < 6 || body.password.length > 128) fail(400, 'invalid_password', 'Use a password with 6–128 characters.')
        const code = body.classCode ? cleanText(body.classCode, 'Class code', 40).toUpperCase() : null
        let user
        if (code) {
          const cls = classByCode(code) ?? fail(401, 'invalid_credentials', 'Check your class code, username and password.')
          user = db.users.find((u) => u.role === 'student' && u.classId === cls.id && u.username.toLowerCase() === username.toLowerCase()) ?? fail(401, 'invalid_credentials', 'Check your class code, username and password.')
        } else {
          const matches = db.users.filter((u) => u.role === 'student' && u.username.toLowerCase() === username.toLowerCase())
          if (matches.length > 1) fail(409, 'class_code_required', 'More than one account uses this username. Add your class code to pick yours.')
          user = matches[0] ?? fail(401, 'invalid_credentials', 'Check your username and password.')
        }
        if (user.password !== body.password) fail(401, 'invalid_credentials', code ? 'Check your class code, username and password.' : 'Check your username and password.')
        if (user.suspended) fail(403, 'suspended', 'Your teacher has paused your classroom account.')
        return { status: 200, body: sessionFor(user) }
      }
      if (parts[1] === 'teacher-login') {
        const email = cleanText(body.email, 'Email', 254).toLowerCase()
        if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) fail(401, 'invalid_credentials', 'Check your sign-in details and try again.')
        let user = db.users.find((u) => u.role === 'teacher' && u.email === email)
        if (user && user.password !== body.password) fail(401, 'invalid_credentials', 'Check your sign-in details and try again.')
        if (!user) {
          // A fresh teacher per email: the first run on /class is reachable without a Google round trip.
          user = { id: randomUUID(), username: 'Teacher', rosterName: 'Teacher', email, role: 'teacher', password: body.password, classId: null, suspended: false, resetRequired: false, authVersion: 1 }
          db.users.push(user)
        }
        return { status: 200, body: sessionFor(user) }
      }
      if (parts[1] === 'teacher-google-start') fail(503, 'classroom_unavailable', 'Google sign-in is not available on the QA mock. Use email and password.')
      if (parts[1] === 'refresh') {
        const entry = [...db.sessions.values()].find((s) => s.refreshToken === body.refreshToken)
        const user = entry && userById(entry.userId)
        if (!user || entry.authVersion !== user.authVersion) fail(401, 'session_revoked', 'Please sign in again.')
        return { status: 200, body: sessionFor(user) }
      }
      if (parts[1] === 'logout') { if (token) db.sessions.delete(token); return { status: 200, body: { ok: true } } }
      if (parts[1] === 'change-password') {
        const user = authenticate(token, true)
        if (user.role !== 'student') fail(403, 'student_required', 'Manage teacher credentials through your sign-in provider.')
        const error = studentPasswordError(body.password, user.username); if (error) fail(400, 'invalid_password', error)
        if (user.resetRequired && body.password === user.password) fail(400, 'password_unchanged', 'Choose a different password from your temporary password.')
        user.password = body.password; user.resetRequired = false; user.authVersion += 1
        return { status: 200, body: sessionFor(user) }
      }
      fail(404, 'not_found', 'Classroom route not found.')
    }
    const user = authenticate(token, parts[0] === 'me')
    if (parts[0] === 'me' && method === 'GET') return { status: 200, body: meFor(user) }
    if (parts[0] === 'classes') {
      if (parts.length === 1 && method === 'GET') return { status: 200, body: { classes: meFor(user).classes } }
      if (parts.length === 1 && method === 'POST') {
        if (user.role !== 'teacher') fail(403, 'teacher_required', 'Only teachers can create classes.')
        const name = cleanText(body.name, 'Class name')
        const cls = { id: randomUUID(), teacherId: user.id, name, codes: [nextCode()], enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true, studentsCanShare: true }
        db.classes.push(cls)
        return { status: 201, body: { class: classView(cls, true) } }
      }
      const cls = classFor(user, parts[1], true)
      if (parts.length === 2 && method === 'PATCH') {
        if (body.name !== undefined) cls.name = cleanText(body.name, 'Class name')
        for (const key of ['enrollmentOpen', 'collaborationOpen', 'showNamesOnJoin', 'studentsCanShare']) {
          if (body[key] === undefined) continue
          if (typeof body[key] !== 'boolean') fail(400, 'invalid_input', `${key} must be true or false.`)
          cls[key] = body[key]
        }
        if (body.rotateCode === true) cls.codes.push(nextCode())
        return { status: 200, body: { class: classView(cls, true) } }
      }
      if (parts[2] === 'students' && parts.length === 3 && method === 'GET') {
        return { status: 200, body: { students: db.users.filter((u) => u.role === 'student' && u.classId === cls.id).sort((a, b) => a.username.localeCompare(b.username)).map(studentView) } }
      }
      if (parts[2] === 'students' && parts.length === 4 && method === 'PATCH') {
        const student = db.users.find((u) => u.id === parts[3] && u.classId === cls.id) ?? fail(404, 'not_found', 'Student not found.')
        if (body.username !== undefined) { const next = normalizeUsername(body.username); assertUsernameFree(next, student.id); student.username = next; student.authVersion += 1 }
        if (body.rosterName !== undefined) student.rosterName = cleanText(body.rosterName, 'Roster name')
        if (body.suspended !== undefined) { student.suspended = Boolean(body.suspended); student.authVersion += 1 }
        if (body.temporaryPassword !== undefined) { const error = studentPasswordError(body.temporaryPassword, student.username); if (error) fail(400, 'invalid_password', error); student.password = body.temporaryPassword; student.resetRequired = true; student.authVersion += 1 }
        return { status: 200, body: { student: studentView(student) } }
      }
      fail(404, 'not_found', 'Classroom route not found.')
    }
    if (parts[0] === 'worlds') {
      if (parts.length === 1 && method === 'GET') return { status: 200, body: { worlds: listWorlds(user) } }
      if (parts.length === 1 && method === 'POST') {
        const kind = body.kind || 'personal'
        if (!['personal', 'class', 'group'].includes(kind)) fail(400, 'invalid_input', 'Unknown world kind.')
        if (kind !== 'personal') classFor(user, body.classId, true)
        const created = insertWorld(user, cleanText(body.title || 'My world', 'World title'), body.document, kind, kind === 'personal' ? null : body.classId)
        return { status: 201, body: { world: worldView(created, user, true, true) } }
      }
      const a = access(user, parts[1]), { world } = a
      const controls = a.isOwner || (world.kind !== 'personal' && user.role === 'teacher')
      if (parts.length === 2 && method === 'GET') return { status: 200, body: { world: worldView(world, user, a.canEdit, true) } }
      if (parts[2] === 'sharing' && parts.length === 3 && method === 'PATCH') {
        if (user.role !== 'student') fail(403, 'student_required', 'Only students share their own worlds with the class.')
        if (!a.isOwner || world.kind !== 'personal') fail(403, 'owner_required', 'Only the owner can share this world.')
        if (body.visibility !== 'private' && body.visibility !== 'class') fail(400, 'invalid_input', 'visibility must be private or class.')
        if (typeof body.canEdit !== 'boolean') fail(400, 'invalid_input', 'canEdit must be true or false.')
        const cls = classFor(user, user.classId)
        if (!cls.studentsCanShare) fail(403, 'sharing_disabled', 'Your teacher has turned off sharing between students.')
        const sharing = body.visibility === 'class'
        world.visibility = body.visibility; world.classCanEdit = sharing && body.canEdit; world.sharedAt = sharing ? world.sharedAt ?? now() : null
        return { status: 200, body: { world: worldView(world, user, true) } }
      }
      if (parts[2] === 'visibility' && parts.length === 3 && method === 'PATCH') {
        if (user.role !== 'teacher') fail(403, 'teacher_required', 'Only the class teacher can hide a shared world.')
        if (world.kind !== 'personal') fail(400, 'invalid_input', 'Only shared student worlds can be hidden.')
        if (typeof body.hiddenByTeacher !== 'boolean') fail(400, 'invalid_input', 'hiddenByTeacher must be true or false.')
        world.hiddenByTeacher = body.hiddenByTeacher
        return { status: 200, body: { world: worldView(world, user, a.canEdit) } }
      }
      if (parts[2] === 'copy' && parts.length === 3 && method === 'POST') {
        const created = insertWorld(user, `${world.title} (copy)`, world.document)
        return { status: 201, body: { world: worldView(created, user, true, true) } }
      }
      if (parts.length === 2 && method === 'PATCH') {
        if (!controls) fail(403, 'owner_required', 'Only the owner or teacher can rename this world.')
        commit(world, world.revision, world.document, cleanText(body.title, 'World title'), 'rename')
        return { status: 200, body: { world: worldView(world, user, a.canEdit) } }
      }
      if (parts.length === 2 && method === 'PUT') {
        if (!a.canEdit) fail(403, 'read_only', 'You do not have editing access to this world.')
        if (!Number.isInteger(body.expectedRevision)) fail(400, 'invalid_input', 'expectedRevision is required.')
        commit(world, body.expectedRevision, validDocument(body.document), body.title === undefined ? null : cleanText(body.title, 'World title'), 'save')
        return { status: 200, body: { world: worldView(world, user, a.canEdit, true) } }
      }
      if (parts[2] === 'restore' && method === 'POST') {
        if (!controls) fail(403, 'owner_required', 'Only the owner or teacher can restore this world.')
        const cp = db.checkpoints.find((c) => c.id === body.checkpointId && c.worldId === world.id) ?? fail(404, 'not_found', 'Checkpoint not found.')
        commit(world, body.expectedRevision, structuredClone(cp.document), cp.title, 'restore')
        return { status: 200, body: { world: worldView(world, user, a.canEdit, true) } }
      }
      if (parts[2] === 'checkpoints' && method === 'GET') {
        if (!controls) fail(403, 'owner_required', 'Only the owner can see the recovery history of this world.')
        return { status: 200, body: { checkpoints: db.checkpoints.filter((c) => c.worldId === world.id).slice(-30).reverse().map(({ id, revision, createdAt, reason }) => ({ id, revision, createdAt, reason })) } }
      }
      if (parts[2] === 'live-ticket' && method === 'POST') return { status: 200, body: { ticket: `qa-mock-ticket-${world.id}` } }
      if (parts[2] === 'members') {
        if (world.kind === 'personal') fail(400, 'private_world', 'Personal worlds do not have group members.')
        if (method !== 'GET') {
          classFor(user, world.classId, true)
          if (world.kind !== 'group') fail(400, 'class_world', 'Class worlds include the entire class. Use a group world for selected members.')
          if (method === 'POST') {
            const student = db.users.find((u) => u.id === body.userId && u.classId === world.classId && !u.suspended) ?? fail(400, 'invalid_member', 'Choose an active student in this class.')
            if (!world.members.includes(student.id)) world.members.push(student.id)
          } else if (method === 'DELETE' && parts[3]) world.members = world.members.filter((id) => id !== parts[3])
          else fail(405, 'method_not_allowed', 'Unsupported member action.')
        }
        const students = db.users.filter((u) => u.role === 'student' && u.classId === world.classId)
        const ids = world.kind === 'group' ? world.members : students.map((s) => s.id)
        return { status: 200, body: { members: students.filter((s) => ids.includes(s.id)).map((s) => ({ id: s.id, username: s.username, ...(user.role === 'teacher' ? { rosterName: s.rosterName } : {}) })) } }
      }
    }
    fail(404, 'not_found', 'Classroom route not found.')
  }

  /** QA control: a fixture close to the contract's (one class, six students, own + classmates' + teacher worlds). */
  function seed({ teacherEmail = 'qa-teacher@example.com', teacherPassword = 'teach-bricks', className = 'Period 3 Makers', password = 'brick-time' } = {}) {
    const teacher = route('POST', '/classroom/auth/teacher-login', { email: teacherEmail, password: teacherPassword }).body
    const teacherToken = teacher.session.accessToken
    const cls = route('POST', '/classroom/classes', { name: className }, teacherToken).body.class
    const names = [['ava_builds', 'Ava Rivera'], ['ben_k', 'Ben Kim'], ['chloe_m', 'Chloe Martin'], ['diego_s', 'Diego Santos'], ['emma_l', 'Emma Lopez'], ['finn_o', 'Finn Okafor']]
    const students = Object.fromEntries(names.map(([username, rosterName]) => [username, route('POST', '/classroom/auth/register', { classCode: cls.code, username, rosterName, password }).body]))
    const tokenOf = (username) => students[username].session.accessToken
    const brick = (i) => ({ id: `seed-${i}`, partId: 'brick_2x4', x: 2 * i, y: 0, z: 2, rotation: 0, color: '#5888da' })
    const doc = (count) => ({ ...emptyDocument(), bricks: Array.from({ length: count }, (_, i) => brick(i)) })
    const make = (username, title, count, sharing) => {
      const world = route('POST', '/classroom/worlds', { title, document: doc(count) }, tokenOf(username)).body.world
      if (sharing) route('PATCH', `/classroom/worlds/${world.id}/sharing`, sharing, tokenOf(username))
      return world
    }
    const worlds = {
      treehouse: make('ava_builds', 'Treehouse Hideout', 12),
      rocket: make('ava_builds', 'Rainbow Rocket', 30, { visibility: 'class', canEdit: false }),
      lava: make('ava_builds', 'Lava Lab', 5, { visibility: 'class', canEdit: true }),
      skyBridge: make('ben_k', 'Sky Bridge', 20, { visibility: 'class', canEdit: true }),
      castle: make('chloe_m', 'Cloud Castle', 40, { visibility: 'class', canEdit: false }),
      moonBase: make('diego_s', 'Moon Base', 8, { visibility: 'class', canEdit: false }),
      garden: make('emma_l', 'Secret Garden', 3, { visibility: 'class', canEdit: true }),
    }
    route('PATCH', `/classroom/worlds/${worlds.moonBase.id}/visibility`, { hiddenByTeacher: true }, teacherToken)
    worlds.town = route('POST', '/classroom/worlds', { title: 'Class Town', kind: 'class', classId: cls.id, document: doc(2) }, teacherToken).body.world
    worlds.bridgeTeam = route('POST', '/classroom/worlds', { title: 'Bridge Team', kind: 'group', classId: cls.id, document: doc(1) }, teacherToken).body.world
    route('POST', `/classroom/worlds/${worlds.bridgeTeam.id}/members`, { userId: students.ava_builds.user.id }, teacherToken)
    // A second teacher with no class yet, for the /class first-run surface.
    const newTeacher = route('POST', '/classroom/auth/teacher-login', { email: 'qa-new-teacher@example.com', password: teacherPassword }).body
    // Sessions carry the account's classes, so re-issue them now that the fixture is complete.
    const fresh = (auth) => sessionFor(userById(auth.user.id))
    return { teacher: fresh(teacher), newTeacher, class: classView(classById(cls.id), true), students: Object.fromEntries(Object.entries(students).map(([k, v]) => [k, fresh(v)])), worlds, password, teacherEmail, teacherPassword }
  }

  function control(method, pathname, body) {
    if (pathname === '/__qa/health') return { status: 200, body: { ok: true, users: db.users.length, classes: db.classes.length, worlds: db.worlds.length } }
    if (pathname === '/__qa/reset' && method === 'POST') { db.users = []; db.classes = []; db.worlds = []; db.checkpoints = []; db.sessions.clear(); db.counters.code = 10; return { status: 200, body: { ok: true } } }
    if (pathname === '/__qa/state' && method === 'GET') return { status: 200, body: { users: db.users.map(({ password: _p, ...u }) => u), classes: db.classes, worlds: db.worlds.map(({ document, ...w }) => ({ ...w, bricks: document.bricks.length })) } }
    if (pathname === '/__qa/seed' && method === 'POST') return { status: 200, body: seed(body || {}) }
    if (pathname === '/__qa/session' && method === 'POST') {
      const user = db.users.find((u) => u.username === body?.username || (body?.email && u.email === body.email)) ?? fail(404, 'not_found', 'No such account.')
      return { status: 200, body: sessionFor(user) }
    }
    fail(404, 'not_found', 'Unknown QA control route.')
  }

  return { route, control, seed, db }
}

export async function startMockClassroomServer({ port = Number(process.env.PORT || 8798), host = '127.0.0.1', log = false } = {}) {
  const classroom = createMockClassroom()
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Origin', ...(origin ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'access-control-allow-headers': 'content-type, authorization' } : {}) }
    if (request.method === 'OPTIONS') { response.writeHead(204, headers); response.end(); return }
    const url = new URL(request.url, `http://${host}:${port}`)
    let raw = ''
    for await (const chunk of request) raw += chunk
    let input = null
    try { input = raw ? JSON.parse(raw) : null } catch { response.writeHead(400, headers); response.end(JSON.stringify({ error: 'Invalid JSON body.', code: 'invalid_json' })); return }
    const token = (request.headers.authorization || '').replace(/^Bearer\s+/i, '') || null
    let result
    try {
      result = url.pathname.startsWith('/__qa/') ? classroom.control(request.method, url.pathname, input) : url.pathname.startsWith('/classroom') ? classroom.route(request.method, url.pathname, input, token) : { status: 404, body: { error: 'Not a classroom route. Live rooms live on the real Worker.', code: 'not_found' } }
    } catch (error) {
      result = error instanceof HttpError ? { status: error.status, body: { error: error.message, code: error.code, ...error.details } } : { status: 500, body: { error: String(error?.stack || error), code: 'internal_error' } }
    }
    if (log) console.log(`${request.method} ${url.pathname} -> ${result.status}${result.body?.code ? ' ' + result.body.code : ''}`)
    response.writeHead(result.status, headers)
    response.end(JSON.stringify(result.body))
  })
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, host, resolve))
  return { server, classroom, origin: `http://${host}:${port}`, close: () => new Promise((resolve) => server.close(resolve)) }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { origin } = await startMockClassroomServer({ log: process.env.MOCK_LOG === '1' })
  console.log(`mock classroom server on ${origin} (POST /__qa/reset, /__qa/seed; GET /__qa/state)`)
}
