/** Local manual-test provider. Real Worker invite handlers and Durable Objects use this fake storage. */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { dirname } from 'node:path'
import { createMockClassroom } from '../qa/lib/classroom-mock-server.mjs'

export const LOCAL_PASSWORD = 'local-bricks-42'
const json = (status, body) => ({ status, body })
const fail = (status, code, error) => { throw Object.assign(new Error(error), { status, code }) }
const inviteState = () => ({ invite_id: randomUUID(), invited_at: new Date().toISOString(), seen_at: null, joined_at: null })
const format = (world) => world.document.format === 'brickgineers-2d' ? '2d' : 'brick'
const encodeRuns = (values) => {
  let output = ''
  for (let start = 0; start < values.length;) {
    let end = start + 1
    while (end < values.length && values[end] === values[start]) end++
    const length = end - start
    output += String.fromCharCode(65 + values[start]) + (length > 1 ? length.toString(36) : '')
    start = end
  }
  return output
}

export function createLocalFixture({ stateFile } = {}) {
  const classroom = createMockClassroom(), { db } = classroom
  db.invites = []
  db.audit = []
  if (stateFile) {
    try {
      const saved = JSON.parse(readFileSync(stateFile, 'utf8'))
      Object.assign(db, saved, { sessions: new Map(saved.sessions) })
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  const persist = () => {
    if (!stateFile) return
    mkdirSync(dirname(stateFile), { recursive: true })
    writeFileSync(`${stateFile}.tmp`, JSON.stringify({ ...db, sessions: [...db.sessions] }), { mode: 0o600 })
    renameSync(`${stateFile}.tmp`, stateFile)
  }
  // Opaque mock sessions become JWT-shaped local tokens. No production token verifier accepts these.
  function prepareSession(auth) {
    if (!auth?.session?.accessToken) return auth
    const old = auth.session.accessToken, entry = db.sessions.get(old)
    entry.sessionId ??= randomUUID()
    const payload = Buffer.from(JSON.stringify({ session_id: entry.sessionId, sub: entry.userId })).toString('base64url')
    const token = `eyJhbGciOiJMT0NBTCJ9.${payload}.${Buffer.from(old).toString('base64url')}`
    db.sessions.delete(old); db.sessions.set(token, entry)
    auth.session.accessToken = token
    return auth
  }
  const authEntry = (token) => {
    const session = db.sessions.get(token), user = session && db.users.find(u => u.id === session.userId)
    if (!user || session.authVersion !== user.authVersion) fail(401, 'session_revoked', 'Sign in locally again.')
    return { session, user }
  }
  const worldRow = (w) => ({ id: w.id, title: w.title, owner_id: w.ownerId, class_id: w.classId, kind: w.kind, revision: w.revision,
    updated_at: w.updatedAt, document: w.document, doc_format: w.document.format ?? null, class_visibility: w.visibility,
    class_can_edit: w.classCanEdit, hidden_by_teacher: w.hiddenByTeacher, class_shared_at: w.sharedAt })
  const tables = () => ({
    worlds: db.worlds.map(worldRow),
    students: db.users.filter(u => u.role === 'student').map(u => ({ user_id: u.id, username: u.username, roster_name: u.rosterName,
      class_id: u.classId, auth_version: u.authVersion, suspended: u.suspended, reset_required: u.resetRequired })),
    classes: db.classes.map(c => ({ id: c.id, teacher_id: c.teacherId, name: c.name, login_code: c.codes[0],
      enrollment_open: c.enrollmentOpen, collaboration_open: c.collaborationOpen, students_can_share: c.studentsCanShare })),
    world_members: db.invites,
    sessions: [...db.sessions.values()].filter(s => db.users.find(u => u.id === s.userId)?.role === 'student')
      .map(s => ({ session_id: s.sessionId, user_id: s.userId, auth_version: s.authVersion })),
    teacher_sessions: [...db.sessions.values()].filter(s => db.users.find(u => u.id === s.userId)?.role === 'teacher')
      .map(s => ({ session_id: s.sessionId, user_id: s.userId, revoked: false })),
    audit_events: db.audit,
  })
  const matches = (row, query) => [...query].every(([key, value]) => {
    if (['select', 'limit', 'offset', 'order', 'on_conflict'].includes(key)) return true
    if (value.startsWith('eq.')) return String(row[key]) === value.slice(3)
    if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]))
    fail(400, 'unsupported_filter', `Local provider does not implement ${key}=${value}.`)
  })
  function authorize(worldId, userId, sessionId, authVersion) {
    const user = db.users.find(u => u.id === userId)
    const found = [...db.sessions].find(([, s]) => s.userId === userId && s.sessionId === sessionId
      && (user?.role === 'teacher' ? authVersion === 0 : s.authVersion === authVersion))
    if (!found) return { error: 'session_revoked' }
    try {
      const { user } = authEntry(found[0])
      const { world } = classroom.route('GET', `/classroom/worlds/${worldId}`, null, found[0]).body
      return { userId, username: user.username, role: user.role, worldId, classId: world.classId, canEdit: world.canEdit,
        isOwner: world.ownerId === userId, isTeacher: user.role === 'teacher', authVersion, sessionId }
    } catch (error) { return { error: error.code || 'not_found' } }
  }
  function provider(method, url, body, token) {
    if (url.pathname === '/auth/v1/user') return json(200, { id: authEntry(token).user.id })
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/brick_(.+)$/)
    if (rpc) {
      if (method !== 'POST') fail(405, 'method_not_allowed', 'Use POST for local RPCs.')
      if (rpc[1] === 'take_rate_limit') return json(200, true)
      if (rpc[1] === 'authorize_world') return json(200, authorize(body.p_world_id, body.p_user_id, body.p_session_id, body.p_auth_version))
      if (rpc[1] === 'authorize_world_batch') return json(200, body.p_identities.map(i => authorize(body.p_world_id, i.userId, i.sessionId, i.authVersion)))
      if (rpc[1] === 'commit_world') {
        const access = authorize(body.p_world_id, body.p_actor_id, body.p_session_id, body.p_auth_version)
        if (access.error || !access.canEdit) return json(200, { error: 'access_revoked' })
        const world = db.worlds.find(w => w.id === body.p_world_id)
        if (world.revision !== body.p_expected_revision) return json(200, { error: 'conflict', currentRevision: world.revision })
        db.checkpoints.push({ id: randomUUID(), worldId: world.id, revision: world.revision, createdAt: new Date().toISOString(),
          reason: body.p_reason, title: world.title, document: structuredClone(world.document) })
        world.document = structuredClone(body.p_document); world.revision++; world.updatedAt = new Date().toISOString()
        if (body.p_title) world.title = body.p_title
        persist()
        return json(200, worldRow(world))
      }
      fail(501, 'unsupported_rpc', `Local provider does not implement brick_${rpc[1]}.`)
    }
    const table = url.pathname.match(/^\/rest\/v1\/brick_(.+)$/)?.[1]
    if (!table || !(table in tables())) fail(404, 'unsupported_table', 'This local provider exposes only room/invite fixtures.')
    let rows = tables()[table].filter(row => matches(row, url.searchParams))
    if (method === 'GET') {
      const ordering = url.searchParams.get('order')
      if (ordering) rows.sort((a, b) => { for (const field of ordering.split(',')) {
        const [key, direction] = field.split('.'), result = String(a[key]).localeCompare(String(b[key]))
        if (result) return direction === 'desc' ? -result : result
      } return 0 })
      const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || rows.length)
      return json(200, rows.slice(offset, offset + limit))
    }
    if (table === 'world_members' && method === 'PATCH') { rows.forEach(row => Object.assign(row, body)); persist(); return json(200, rows) }
    if (table === 'world_members' && (method === 'POST' || method === 'DELETE')) {
      if (method === 'DELETE') db.invites = db.invites.filter(row => !rows.includes(row))
      else for (const row of Array.isArray(body) ? body : [body]) {
        if (!db.invites.some(i => i.world_id === row.world_id && i.user_id === row.user_id)) db.invites.push({ ...inviteState(), ...row })
      }
      for (const world of db.worlds) world.members = db.invites.filter(i => i.world_id === world.id).map(i => i.user_id)
      persist(); return json(method === 'POST' ? 201 : 200, method === 'POST' ? body : rows)
    }
    if (table === 'worlds' && method === 'PATCH') {
      const names = { class_visibility: 'visibility', class_can_edit: 'classCanEdit', class_shared_at: 'sharedAt', hidden_by_teacher: 'hiddenByTeacher',
        title: 'title', document: 'document', revision: 'revision', updated_at: 'updatedAt' }
      for (const row of rows) {
        const world = db.worlds.find(w => w.id === row.id)
        for (const [key, value] of Object.entries(body)) {
          if (!(key in names)) fail(501, 'unsupported_world_patch', `Local provider does not implement worlds.${key}.`)
          world[names[key]] = value
        }
      }
      persist(); return json(200, rows.map(row => worldRow(db.worlds.find(w => w.id === row.id))))
    }
    if (table === 'audit_events' && method === 'POST') { db.audit.push(body); persist(); return json(201, [body]) }
    fail(501, 'unsupported_mutation', `Local provider does not implement ${method} brick_${table}.`)
  }
  function syncInvites(world) {
    const ids = world.visibility === 'members' ? world.members : []
    db.invites = db.invites.filter(i => i.world_id !== world.id || ids.includes(i.user_id))
    for (const userId of ids) if (!db.invites.some(i => i.world_id === world.id && i.user_id === userId)) {
      db.invites.push({ world_id: world.id, user_id: userId, ...inviteState() })
    }
  }
  function route(method, pathname, input, token) {
    const result = classroom.route(method, pathname, input, token)
    prepareSession(result.body)
    const sharing = pathname.match(/^\/classroom\/worlds\/([^/]+)\/sharing$/)
    if (sharing && method === 'PATCH') syncInvites(db.worlds.find(w => w.id === sharing[1]))
    if (method !== 'GET') persist()
    return result
  }
  function seed() {
    const teacher = route('POST', '/classroom/auth/teacher-login', { email: 'local-teacher@example.test', password: LOCAL_PASSWORD }).body
    const cls = route('POST', '/classroom/classes', { name: 'Local Test Makers' }, teacher.session.accessToken).body.class
    const students = ['local_builder', 'local_guest', 'local_observer'].map((username, i) => route('POST', '/classroom/auth/register',
      { classCode: cls.code, username, rosterName: ['Builder Sample', 'Guest Sample', 'Observer Sample'][i], password: LOCAL_PASSWORD }).body)
    const buildToken = students[0].session.accessToken, ids = students.slice(1).map(s => s.user.id)
    const bricks = { schemaVersion: 2, partLibraryVersion: 1, environmentId: 'classic', customParts: [], bricks: [
      { id: 'local-brick-red', partId: 'brick_2x4', x: 2, y: 0, z: 2, rotation: 0, color: '#e8644a' },
      { id: 'local-brick-blue', partId: 'brick_2x4', x: 6, y: 0, z: 2, rotation: 0, color: '#5888da' }] }
    const tiles = new Uint8Array(80 * 27)
    tiles.fill(1, 80 * 25)
    for (const x of [24, 40, 56]) for (const y of [23, 24]) { tiles[y * 80 + x] = 8; tiles[y * 80 + x + 1] = 9 }
    const level = { format: 'brickgineers-2d', version: 1, level: { v: 1, title: 'Motion and Pipes Runway', w: 80, h: 27,
      theme: 'day', style: 'cartoon', tiles: encodeRuns(tiles), contents: `A${(2160).toString(36)}`,
      objects: [[1, 0, 3, 24, 1, 0], [2, 1, 74, 24, 1, 0]], pipes: [[1001, 24, 23, 1002], [1002, 56, 23, 1001]] } }
    for (const [title, document] of [['Invite Brick Playground', bricks], ['Motion and Pipes Runway', level]]) {
      const { world } = route('POST', '/classroom/worlds', { title, document }, buildToken).body
      route('PATCH', `/classroom/worlds/${world.id}/sharing`, { visibility: 'members', canEdit: true, members: ids }, buildToken)
    }
    persist()
  }
  if (!db.users.length) seed()
  const info = () => ({ boundary: 'Local fake provider; real Worker rooms and invite handlers; SQL/RLS/OAuth are not verified.',
    class: { name: db.classes[0].name, code: db.classes[0].codes[0] }, password: LOCAL_PASSWORD,
    accounts: db.users.map(u => ({ username: u.username, email: u.email, role: u.role })),
    worlds: db.worlds.map(w => ({ id: w.id, title: w.title, format: format(w), owner: db.users.find(u => u.id === w.ownerId)?.username })) })
  return { classroom, route, provider, info, persist }
}

export async function startLocalFixtureServer({ port = 8798, workerOrigin = 'http://127.0.0.1:8799', stateFile } = {}) {
  const fixture = createLocalFixture({ stateFile })
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`)
    const headers = { 'content-type': 'application/json', 'cache-control': 'no-store', vary: 'Origin' }
    const origin = request.headers.origin
    if (origin) {
      const parsed = URL.canParse(origin) ? new URL(origin) : null
      if (!parsed || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) { response.writeHead(403, headers); response.end('{}'); return }
      Object.assign(headers, { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type, authorization' })
    }
    if (request.method === 'OPTIONS') { response.writeHead(204, headers); response.end(); return }
    let result
    try {
      let raw = ''
      for await (const chunk of request) { raw += chunk; if (raw.length > 3_000_000) fail(413, 'too_large', 'Local request is too large.') }
      const input = raw ? JSON.parse(raw) : null, token = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
      const realWorkerRoute = /^\/classroom\/invites(?:\/[^/]+)?$/.test(url.pathname)
        || /^\/classroom\/worlds\/[^/]+\/(?:sharing|visibility|invites|live-ticket|platformer-ticket|platformer-recovery)(?:\/[^/]+)?$/.test(url.pathname)
      if (url.pathname === '/__local/health') result = json(200, { ok: true, worlds: fixture.classroom.db.worlds.length, provider: 'local-fixture' })
      else if (url.pathname === '/__local/info') result = json(200, fixture.info())
      else if (realWorkerRoute) {
        const upstream = await fetch(`${workerOrigin}${url.pathname}${url.search}`, { method: request.method,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, ...(raw ? { body: raw } : {}), signal: AbortSignal.timeout(15_000) })
        result = json(upstream.status, await upstream.json())
      } else if (url.pathname.startsWith('/auth/v1/') || url.pathname.startsWith('/rest/v1/')) result = fixture.provider(request.method, url, input, token)
      else if (url.pathname.startsWith('/classroom/')) result = fixture.route(request.method, url.pathname, input, token)
      else result = json(404, { code: 'not_found', error: 'Local fixture route not found.' })
    } catch (error) { result = json(error.status || 500, { code: error.code || 'local_provider_error', error: error.message, ...error.details }) }
    response.writeHead(result.status, headers); response.end(JSON.stringify(result.body))
  })
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, '127.0.0.1', resolve))
  return { server, fixture, close: () => new Promise(resolve => server.close(resolve)) }
}
