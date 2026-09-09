import { validateBrickStudioDocument } from '@brick-studio/core';
import { teacherGoogleAuthorizationUrl, validGoogleCodeVerifier } from './googleOAuth';
import { ClassroomBodyError, readClassroomBody } from './readBody';

export interface ClassroomEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  /** Trusted existing Supabase user UUIDs, never student-controlled metadata. */
  BRICK_TEACHER_IDS?: string;
}
export type ClassroomAccessChange = { classId?: string; worldId?: string; userId?: string; reason: string };
export type ClassroomHandlerOptions = { onAccessChanged?: (event: ClassroomAccessChange) => Promise<void> };
export type ClassroomSessionIdentity = { userId: string; sessionId: string; authVersion: number };
type Row = Record<string, any>;
export class ClassroomHttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details: Row = {}) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new ClassroomHttpError(status, code, message); };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const cleanText = (value: unknown, label: string, max = 80): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, 'invalid_input', `${label} is required (up to ${max} characters).`);
  return (value as string).trim();
};
export function normalizeUsername(value: unknown): string {
  const name = cleanText(value, 'Username', 24);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,23}$/.test(name)) fail(400, 'invalid_username', 'Use 3–24 letters, numbers, underscores or hyphens.');
  return name;
}
function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) fail(400, 'invalid_password', 'Use a password with 8–128 characters.');
  return value as string;
}
export function sessionId(token: string): string {
  try {
    const part = token.split('.')[1];
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof payload.session_id === 'string' && uuid(payload.session_id)) return payload.session_id;
  } catch { /* Decoding is never authentication: getUser verifies the token separately. */ }
  return fail(401, 'invalid_session', 'Please sign in again.');
}
export class ClassroomService {
  private credentialLease: { userId: string; token: string; deadline: number } | null = null;
  constructor(public env: ClassroomEnv, private fetcher: typeof fetch = fetch) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ANON_KEY) fail(503, 'classroom_unavailable', 'Classroom accounts are not configured yet. Guest building is still available.');
  }
  async request(path: string, init: RequestInit = {}, token?: string): Promise<any> {
    if (this.credentialLease && Date.now() >= this.credentialLease.deadline) fail(409, 'account_busy', 'The account update expired. Please wait a few minutes and try again.');
    const response = await this.fetcher.call(globalThis, `${this.env.SUPABASE_URL!.replace(/\/$/, '')}${path}`, {
      signal: AbortSignal.timeout(15_000), ...init,
      headers: { apikey: this.env.SUPABASE_SERVICE_ROLE_KEY!, Authorization: `Bearer ${token || this.env.SUPABASE_SERVICE_ROLE_KEY}`, 'content-type': 'application/json', Prefer: 'return=representation', ...init.headers },
    });
    const data = response.status === 204 ? null : await response.json().catch(() => null) as Row | null;
    if (!response.ok) {
      if (data?.code === 'P0001' && ['brick_student_quota', 'brick_world_quota'].includes(data.message)) fail(409, 'quota_exceeded', data.message === 'brick_student_quota' ? 'This class has reached its student limit. Ask your teacher for help.' : 'You have reached the saved-world limit. Ask your teacher for help.');
      if (data?.code === '23514' && /brick_(world|checkpoint)_document_size/.test(data.message || '')) fail(413, 'too_large', 'This world exceeds the storage size limit. Your previous saved version is unchanged.');
      if (data?.code === '23505') fail(409, 'already_exists', 'That username or code is already in use.');
      if (path.startsWith('/auth/') && (response.status === 400 || response.status === 401 || response.status === 422)) fail(401, 'invalid_credentials', 'Check your sign-in details and try again.');
      if (path.startsWith('/auth/') && !path.includes('/admin/') && response.status === 403) fail(401, 'session_revoked', 'Your session ended. Please sign in again.');
      if (response.status === 429) fail(429, 'rate_limited', 'Too many attempts. Please wait a few minutes.');
      fail(502, 'service_unavailable', 'The account service could not complete this request. Please retry.');
    }
    return data;
  }
  rows(table: string, filter = ''): Promise<Row[]> { return this.request(`/rest/v1/brick_${table}?${filter}`); }
  insert(table: string, data: Row): Promise<Row[]> { return this.request(`/rest/v1/brick_${table}`, { method: 'POST', body: JSON.stringify(data) }); }
  patch(table: string, filter: string, data: Row): Promise<Row[]> { return this.request(`/rest/v1/brick_${table}?${filter}`, { method: 'PATCH', body: JSON.stringify(data) }); }
  remove(table: string, filter: string) { return this.request(`/rest/v1/brick_${table}?${filter}`, { method: 'DELETE' }); }
  rpc(name: string, data: Row): Promise<any> { return this.request(`/rest/v1/rpc/brick_${name}`, { method: 'POST', body: JSON.stringify(data) }); }
  async rate(key: string, limit: number, seconds: number) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    const hashed = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
    if (!await this.rpc('take_rate_limit', { p_key: hashed, p_limit: limit, p_seconds: seconds })) fail(429, 'rate_limited', 'Too many attempts. Please wait a few minutes.');
  }
  async authenticate(token: string, allowReset = false): Promise<Caller> {
    if (!token) fail(401, 'sign_in_required', 'Sign in to use classroom features.');
    const authUser = await this.request('/auth/v1/user', {}, token);
    const teachers = (this.env.BRICK_TEACHER_IDS || '').split(',').map(x => x.trim());
    if (teachers.includes(authUser.id)) {
      const sid = sessionId(token);
      const registered = (await this.rows('teacher_sessions', `session_id=eq.${sid}&user_id=eq.${authUser.id}&revoked=eq.false&limit=1`))[0];
      if (!registered) fail(401, 'session_revoked', 'Please sign in through Brick Studio again.');
      return { id: authUser.id, username: 'Teacher', rosterName: 'Teacher', role: 'teacher', resetRequired: false, token, authVersion: 0, sessionId: sid };
    }
    const student = (await this.rows('students', `user_id=eq.${authUser.id}&limit=1`))[0];
    if (!student) fail(403, 'not_enrolled', 'This account is not enrolled in Brick Studio.');
    const sid = sessionId(token);
    const registered = (await this.rows('sessions', `session_id=eq.${sid}&user_id=eq.${authUser.id}&limit=1`))[0];
    if (!registered || registered.auth_version !== student.auth_version) fail(401, 'session_revoked', 'Your account changed. Please sign in again.');
    if (student.suspended) fail(403, 'suspended', 'Your teacher has paused your classroom account.');
    if (student.reset_required && !allowReset) fail(403, 'password_change_required', 'Choose a new password to continue.');
    return { id: student.user_id, username: student.username, rosterName: student.roster_name, role: 'student', resetRequired: student.reset_required, classId: student.class_id, authVersion: student.auth_version, sessionId: sid, token };
  }
  async classFor(caller: Caller, id: string, teacherOnly = false): Promise<Row> {
    if (!uuid(id)) fail(404, 'not_found', 'Class not found.');
    const row = (await this.rows('classes', `id=eq.${id}&limit=1`))[0];
    if (!row || (caller.role === 'teacher' ? row.teacher_id !== caller.id : teacherOnly || caller.classId !== id)) fail(404, 'not_found', 'Class not found.');
    return row;
  }
  async worldFor(caller: Caller, id: string, requireCollaboration = false, metadataOnly = false): Promise<Row> {
    if (!uuid(id)) fail(404, 'not_found', 'World not found.');
    const world = (await this.rows('worlds', `id=eq.${id}&limit=1${metadataOnly ? '&select=id,class_id,owner_id,kind' : ''}`))[0];
    if (!world) fail(404, 'not_found', 'World not found.');
    if (world.kind === 'personal') {
      if (world.owner_id !== caller.id) fail(404, 'not_found', 'World not found.');
      if (requireCollaboration) fail(403, 'private_world', 'Only classroom worlds can be joined together.');
      return world;
    }
    const cls = await this.classFor(caller, world.class_id);
    if (caller.role !== 'teacher') {
      if (!cls.collaboration_open) fail(403, 'class_closed', 'Your teacher has closed classroom collaboration.');
      if (world.kind === 'group' && !(await this.rows('world_members', `world_id=eq.${id}&user_id=eq.${caller.id}&limit=1`)).length) fail(404, 'not_found', 'World not found.');
    }
    return world;
  }
  async me(caller: Caller) {
    const classes = await this.rows('classes', caller.role === 'teacher' ? `teacher_id=eq.${caller.id}&order=created_at.asc` : `id=eq.${caller.classId}`);
    return { user: { id: caller.id, username: caller.username, rosterName: caller.rosterName, role: caller.role, resetRequired: caller.resetRequired }, classes: await Promise.all(classes.map(async row => classView(row, caller.role === 'teacher' ? (await this.rows('class_codes', `class_id=eq.${row.id}&can_enroll=eq.true&limit=1`))[0]?.code : undefined))) };
  }
  async login(email: string, pass: string) { return this.request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email, password: pass }) }); }
  async registerSession(session: Row, student: Row) {
    await this.request('/rest/v1/brick_sessions?on_conflict=session_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ session_id: sessionId(session.access_token), user_id: student.user_id, auth_version: student.auth_version }) });
  }
  async registerTeacherSession(session: Row) {
    const authUser = await this.request('/auth/v1/user', {}, session.access_token);
    if (!(this.env.BRICK_TEACHER_IDS || '').split(',').map(x => x.trim()).includes(authUser.id)) fail(403, 'teacher_required', 'This account is not configured as a teacher.');
    await this.request('/rest/v1/brick_teacher_sessions?on_conflict=session_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ session_id: sessionId(session.access_token), user_id: authUser.id }) });
  }
  async authResult(session: Row) {
    const caller = await this.authenticate(session.access_token, true);
    return { ...await this.me(caller), session: { accessToken: session.access_token, refreshToken: session.refresh_token, expiresIn: session.expires_in } };
  }
  async audit(caller: Caller, action: string, classId?: string, targetId?: string) {
    await this.insert('audit_events', { actor_id: caller.id, action, class_id: classId || null, target_id: targetId || null });
  }
  async withCredentialLock<T>(userId: string, operation: () => Promise<T>): Promise<T> {
    const token = crypto.randomUUID();
    if (!await this.rpc('acquire_credential_lock', { p_user_id: userId, p_token: token })) fail(409, 'account_busy', 'An account update is already in progress. Wait a moment and try again.');
    this.credentialLease = { userId, token, deadline: Date.now() + 120_000 };
    try {
      const result = await operation();
      this.credentialLease = null;
      await this.remove('credential_locks', `user_id=eq.${userId}&token=eq.${token}`);
      return result;
    } catch (error) {
      this.credentialLease = null;
      // An uncertain provider write must not race a retry. Network/5xx failures keep
      // the bounded lease until expiry; ordinary validated failures can release it.
      if (error instanceof ClassroomHttpError && error.status < 500) await this.remove('credential_locks', `user_id=eq.${userId}&token=eq.${token}`);
      throw error;
    }
  }
}
export type Caller = { id: string; username: string; rosterName: string; role: 'teacher' | 'student'; resetRequired: boolean; classId?: string; authVersion: number; sessionId: string; token: string };
function classView(row: Row, code?: string) { return { id: row.id, name: row.name, loginCode: row.login_code, enrollmentOpen: row.enrollment_open, collaborationOpen: row.collaboration_open, ...(code ? { code } : {}) }; }
function worldView(row: Row, full = false) { return { id: row.id, title: row.title, ownerId: row.owner_id, classId: row.class_id, kind: row.kind, revision: row.revision, updatedAt: row.updated_at, ...(full ? { document: row.document } : {}) }; }
function studentView(row: Row) { return { id: row.user_id, username: row.username, rosterName: row.roster_name, suspended: row.suspended, resetRequired: row.reset_required }; }
function bearer(request: Request) { return request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1] || ''; }
function internalEmail(id: string) { return `brick-${id}@students.invalid`; }
function newCode() { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(10)), n => alphabet[n % alphabet.length]).join(''); }
async function body(request: Request): Promise<Row> {
  return readClassroomBody(request);
}
function document(value: unknown) {
  const result = validateBrickStudioDocument(value);
  if (!result.ok) fail(400, 'invalid_document', 'This world is incomplete or invalid. Your existing saved world has not been replaced.');
  return result.ok ? result.document : null;
}
function expectedRevision(value: unknown): number { if (!Number.isInteger(value) || (value as number) < 1) fail(400, 'invalid_revision', 'A valid expectedRevision is required.'); return value as number; }

/** The host Worker owns CORS and invokes this before its legacy routes. */
export async function handleClassroomRequest(request: Request, env: ClassroomEnv, options: ClassroomHandlerOptions = {}): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/classroom/')) return null;
  try { return await route(request, new ClassroomService(env), url.pathname.slice('/classroom/'.length).split('/'), options); }
  catch (error) {
    if (error instanceof ClassroomHttpError) return json({ error: error.message, code: error.code, ...error.details }, error.status);
    if (error instanceof ClassroomBodyError) return json({ error: error.message, code: error.code }, error.status);
    console.error('classroom_internal_error', error instanceof Error ? error.name : typeof error, error instanceof Error ? error.stack?.split('\n').slice(1, 4).join('\n') : '');
    return json({ error: 'The classroom service could not complete this request. Please retry.', code: 'internal_error' }, 500);
  }
}

async function route(request: Request, service: ClassroomService, path: string[], options: ClassroomHandlerOptions): Promise<Response> {
  const method = request.method;
  if (path[0] === 'auth' && method === 'POST') {
    const input = path[1] === 'logout' ? {} : await body(request);
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    // A full class shares one school NAT: account-level buckets do the tight throttling.
    await service.rate(`ip:${ip}`, 600, 600);
    if (path[1] === 'register' || path[1] === 'login') {
      const code = cleanText(input.classCode, 'Class code', 40).toUpperCase();
      const username = normalizeUsername(input.username);
      const pass = password(input.password);
      await service.rate(`login:${code}:${username.toLowerCase()}`, 12, 300);
      const alias = (await service.rows('class_codes', `code=eq.${encodeURIComponent(code)}&limit=1`))[0];
      if (!alias) fail(401, 'invalid_credentials', 'Check your class code, username and password.');
      const cls = (await service.rows('classes', `id=eq.${alias.class_id}&limit=1`))[0];
      if (path[1] === 'register') {
        if (!alias.can_enroll || !cls.enrollment_open) fail(403, 'enrollment_closed', 'Your teacher has closed enrollment with this code.');
        await service.rate(`enroll:${cls.id}`, 120, 600);
        const rosterName = cleanText(input.rosterName || username, 'Name your teacher knows');
        if ((await service.rows('students', `class_id=eq.${cls.id}&username_key=eq.${encodeURIComponent(username.toLowerCase())}&limit=1`)).length) fail(409, 'already_exists', 'That username is already used in this class.');
        const id = crypto.randomUUID();
        const auth = await service.request('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ id, email: internalEmail(id), password: pass, email_confirm: true, app_metadata: { brick_student: true } }) });
        const userId = auth.id || auth.user?.id;
        if (userId !== id) fail(502, 'account_creation_failed', 'Account creation did not complete. Ask your teacher for help.');
        let student: Row;
        try { student = (await service.insert('students', { user_id: id, class_id: cls.id, username, username_key: username.toLowerCase(), roster_name: rosterName }))[0]; }
        catch (error) { await service.request(`/auth/v1/admin/users/${id}`, { method: 'DELETE' }); throw error; }
        const session = await service.login(internalEmail(id), pass);
        await service.registerSession(session, student);
        return json(await service.authResult(session), 201);
      }
      const student = (await service.rows('students', `class_id=eq.${cls.id}&username_key=eq.${encodeURIComponent(username.toLowerCase())}&limit=1`))[0];
      if (!student) fail(401, 'invalid_credentials', 'Check your class code, username and password.');
      if ((await service.rows('credential_locks', `user_id=eq.${student.user_id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`)).length) fail(409, 'account_busy', 'Your teacher is updating this account. Please try again shortly.');
      const session = await service.login(internalEmail(student.user_id), pass);
      if (student.suspended) fail(403, 'suspended', 'Your teacher has paused your classroom account.');
      // A reset may have begun while managed Auth checked the old password. Never
      // register that session with a newer account version or during a mutation.
      const current = (await service.rows('students', `user_id=eq.${student.user_id}&limit=1`))[0];
      const changing = (await service.rows('credential_locks', `user_id=eq.${student.user_id}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`)).length;
      if (changing || !current || current.auth_version !== student.auth_version) fail(409, 'account_busy', 'Your account changed during sign-in. Please try again.');
      await service.registerSession(session, student);
      return json(await service.authResult(session));
    }
    if (path[1] === 'teacher-google-start') {
      const authorizationUrl = teacherGoogleAuthorizationUrl(service.env.SUPABASE_URL!, request.headers.get('Origin'), input.codeChallenge, input.state);
      if (!authorizationUrl) fail(400, 'invalid_oauth_request', 'Start Google sign-in again from Brick Studio.');
      return json({ url: authorizationUrl });
    }
    if (path[1] === 'teacher-google') {
      const code = cleanText(input.code, 'Sign-in code', 4096);
      if (!validGoogleCodeVerifier(input.codeVerifier)) fail(400, 'invalid_oauth_request', 'Start Google sign-in again from this browser tab.');
      // The provider verifies that this one-time code belongs to the initiating
      // tab's S256 challenge. No client identity/role claims are accepted.
      const session = await service.request('/auth/v1/token?grant_type=pkce', { method: 'POST', body: JSON.stringify({ auth_code: code, code_verifier: input.codeVerifier }) });
      await service.registerTeacherSession(session);
      return json(await service.authResult(session));
    }
    if (path[1] === 'teacher-login') {
      const email = cleanText(input.email, 'Email', 254);
      await service.rate(`teacher:${email.toLowerCase()}`, 12, 300);
      const session = await service.login(email, password(input.password));
      await service.registerTeacherSession(session);
      const caller = await service.authenticate(session.access_token, true);
      if (caller.role !== 'teacher') fail(403, 'teacher_required', 'This account is not configured as a teacher.');
      return json(await service.authResult(session));
    }
    if (path[1] === 'refresh') {
      const session = await service.request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: cleanText(input.refreshToken, 'Refresh token', 4096) }) });
      // Never register a refreshed session: an old session cannot adopt a new auth_version.
      return json(await service.authResult(session));
    }
    const caller = await service.authenticate(bearer(request), true);
    if (path[1] === 'logout') {
      if (caller.role === 'student') await service.remove('sessions', `session_id=eq.${caller.sessionId}&user_id=eq.${caller.id}`);
      else await service.patch('teacher_sessions', `session_id=eq.${caller.sessionId}&user_id=eq.${caller.id}`, { revoked: true });
      await service.request('/auth/v1/logout?scope=local', { method: 'POST' }, caller.token);
      await options.onAccessChanged?.({ userId: caller.id, classId: caller.classId, reason: 'logout' });
      return json({ ok: true });
    }
    if (path[1] === 'change-password') {
      if (caller.role !== 'student') fail(403, 'student_required', 'Manage teacher credentials through your sign-in provider.');
      const pass = password(input.password);
      await service.rate(`password:${caller.id}`, 6, 600);
      return service.withCredentialLock(caller.id, async () => {
      if (caller.resetRequired) {
        // Check managed credentials rather than storing a temporary-password hash ourselves.
        let unchanged: Row | null = null;
        try { unchanged = await service.login(internalEmail(caller.id), pass); }
        catch (error) { if (!(error instanceof ClassroomHttpError) || error.code !== 'invalid_credentials') throw error; }
        if (unchanged) {
          await service.request('/auth/v1/logout?scope=local', { method: 'POST' }, unchanged.access_token);
          fail(400, 'password_unchanged', 'Choose a different password from your temporary password.');
        }
      }
      // Revoke product sessions before changing managed credentials; failures remain fail-closed.
      const student = (await service.patch('students', `user_id=eq.${caller.id}&auth_version=eq.${caller.authVersion}`, { auth_version: caller.authVersion + 1 }))[0];
      if (!student) fail(409, 'account_changed', 'Your account changed. Please sign in again.');
      await service.request(`/auth/v1/admin/users/${caller.id}`, { method: 'PUT', body: JSON.stringify({ password: pass }) });
      const cleared = (await service.patch('students', `user_id=eq.${caller.id}&auth_version=eq.${student.auth_version}`, { reset_required: false }))[0];
      if (!cleared) fail(409, 'account_changed', 'Your account changed. Please sign in again.');
      const session = await service.login(internalEmail(caller.id), pass);
      await service.registerSession(session, student);
      await options.onAccessChanged?.({ userId: caller.id, classId: caller.classId, reason: 'password_changed' });
      return json(await service.authResult(session));
      });
    }
  }
  const caller = await service.authenticate(bearer(request), path[0] === 'me');
  if (path[0] === 'me' && method === 'GET') return json(await service.me(caller));
  if (path[0] === 'classes') {
    if (path.length === 1 && method === 'GET') return json({ classes: (await service.me(caller)).classes });
    if (path.length === 1 && method === 'POST') {
      if (caller.role !== 'teacher') fail(403, 'teacher_required', 'Only teachers can create classes.');
      const input = await body(request), code = newCode();
      const cls = (await service.insert('classes', { teacher_id: caller.id, name: cleanText(input.name, 'Class name'), login_code: code }))[0];
      await service.insert('class_codes', { class_id: cls.id, code });
      return json({ class: classView(cls, code) }, 201);
    }
    const cls = await service.classFor(caller, path[1], true);
    if (path.length === 2 && method === 'PATCH') {
      const input = await body(request), changes: Row = {};
      if (input.name !== undefined) changes.name = cleanText(input.name, 'Class name');
      for (const [api, db] of [['enrollmentOpen', 'enrollment_open'], ['collaborationOpen', 'collaboration_open']]) {
        if (input[api] !== undefined) { if (typeof input[api] !== 'boolean') fail(400, 'invalid_input', `${api} must be true or false.`); changes[db] = input[api]; }
      }
      const updated = Object.keys(changes).length ? (await service.patch('classes', `id=eq.${cls.id}&teacher_id=eq.${caller.id}`, changes))[0] : cls;
      let code: string | undefined;
      if (input.rotateCode === true) {
        await service.patch('class_codes', `class_id=eq.${cls.id}&can_enroll=eq.true`, { can_enroll: false });
        code = newCode(); await service.insert('class_codes', { class_id: cls.id, code });
      } else code = (await service.rows('class_codes', `class_id=eq.${cls.id}&can_enroll=eq.true&limit=1`))[0]?.code;
      await service.audit(caller, input.rotateCode ? 'rotate_class_code' : 'update_class', cls.id);
      await options.onAccessChanged?.({ classId: cls.id, reason: 'class_updated' });
      return json({ class: classView(updated, code) });
    }
    if (path[2] === 'students' && path.length === 3 && method === 'GET') return json({ students: (await service.rows('students', `class_id=eq.${cls.id}&order=username.asc`)).map(studentView) });
    if (path[2] === 'students' && path.length === 4 && method === 'PATCH') {
      if (!uuid(path[3])) fail(404, 'not_found', 'Student not found.');
      // Confirm classroom ownership before acquiring a student mutation lease.
      const target = (await service.rows('students', `class_id=eq.${cls.id}&user_id=eq.${path[3]}&limit=1`))[0];
      if (!target) fail(404, 'not_found', 'Student not found.');
      return service.withCredentialLock(path[3], async () => {
      const student = (await service.rows('students', `class_id=eq.${cls.id}&user_id=eq.${path[3]}&limit=1`))[0];
      if (!student) fail(404, 'not_found', 'Student not found.');
      const input = await body(request), changes: Row = {};
      if (input.username !== undefined) { changes.username = normalizeUsername(input.username); changes.username_key = changes.username.toLowerCase(); }
      if (input.rosterName !== undefined) changes.roster_name = cleanText(input.rosterName, 'Roster name');
      if (input.suspended !== undefined) { if (typeof input.suspended !== 'boolean') fail(400, 'invalid_input', 'suspended must be true or false.'); changes.suspended = input.suspended; changes.auth_version = student.auth_version + 1; }
      let temp: string | undefined;
      if (input.temporaryPassword !== undefined) { temp = password(input.temporaryPassword); changes.reset_required = true; changes.auth_version = student.auth_version + 1; }
      let updated = Object.keys(changes).length ? (await service.patch('students', `user_id=eq.${student.user_id}&class_id=eq.${cls.id}&auth_version=eq.${student.auth_version}`, changes))[0] : student;
      if (!updated) fail(409, 'account_changed', 'This account changed. Refresh and try again.');
      if (temp) {
        await service.request(`/auth/v1/admin/users/${student.user_id}`, { method: 'PUT', body: JSON.stringify({ password: temp, email: internalEmail(student.user_id), email_confirm: true }) });
        // Establish a server-only session solely to revoke all provider refresh sessions.
        const resetSession = await service.login(internalEmail(student.user_id), temp);
        await service.request('/auth/v1/logout?scope=global', { method: 'POST' }, resetSession.access_token);
      }
      await service.audit(caller, temp ? 'reset_password' : 'update_student', cls.id, student.user_id);
      await options.onAccessChanged?.({ classId: cls.id, userId: student.user_id, reason: temp ? 'password_reset' : 'student_updated' });
      return json({ student: studentView(updated) });
      });
    }
  }
  if (path[0] === 'worlds') {
    if (path.length === 1 && method === 'GET') {
      const mine = await service.rows('worlds', `owner_id=eq.${caller.id}&kind=eq.personal&select=id,title,owner_id,class_id,kind,revision,updated_at&order=updated_at.desc`);
      const classes = (await service.me(caller)).classes;
      const shared: Row[] = [];
      for (const cls of classes) {
        if (caller.role === 'student' && !cls.collaborationOpen) continue;
        const candidates = await service.rows('worlds', `class_id=eq.${cls.id}&select=id,title,owner_id,class_id,kind,revision,updated_at&order=updated_at.desc`);
        const memberships = caller.role === 'student' ? await service.rows('world_members', `user_id=eq.${caller.id}&select=world_id`) : [];
        shared.push(...candidates.filter(w => caller.role === 'teacher' || w.kind === 'class' || memberships.some(m => m.world_id === w.id)));
      }
      return json({ worlds: [...mine, ...shared].map(w => worldView(w)) });
    }
    if (path.length === 1 && method === 'POST') {
      const input = await body(request), kind = input.kind || 'personal';
      if (!['personal', 'class', 'group'].includes(kind)) fail(400, 'invalid_input', 'Unknown world kind.');
      if (kind !== 'personal') await service.classFor(caller, input.classId, true);
      await service.rate(`create-world:${caller.id}`, 60, 3600);
      const created = (await service.insert('worlds', { owner_id: caller.id, class_id: kind === 'personal' ? null : input.classId, kind, title: cleanText(input.title || 'My world', 'World title'), document: document(input.document) }))[0];
      return json({ world: worldView(created, true) }, 201);
    }
    const world = await service.worldFor(caller, path[1]);
    if (path.length === 2 && method === 'GET') return json({ world: worldView(world, true) });
    if (path.length === 2 && method === 'PATCH') {
      if (world.owner_id !== caller.id && caller.role !== 'teacher') fail(403, 'owner_required', 'Only the owner or teacher can rename this world.');
      const input = await body(request);
      const updated = await service.rpc('commit_world', { p_world_id: world.id, p_expected_revision: world.revision, p_document: world.document, p_title: cleanText(input.title, 'World title'), p_reason: 'rename', p_actor_id: caller.id, p_session_id: caller.sessionId, p_auth_version: caller.authVersion });
      if (updated.error === 'conflict') throw new ClassroomHttpError(409, 'revision_conflict', 'Someone saved a newer version. Refresh before renaming.', { currentRevision: updated.currentRevision });
      if (updated.error === 'access_revoked') fail(403, 'access_revoked', 'Classroom access changed.');
      if (updated.error === 'rate_limited') fail(429, 'rate_limited', 'Too many saves. Please wait briefly.');
      if (updated.error) fail(404, 'not_found', 'World not found.');
      await options.onAccessChanged?.({ worldId: world.id, classId: world.class_id || undefined, reason: 'world_saved' });
      return json({ world: worldView(updated) });
    }
    if (path.length === 2 && method === 'PUT' || path[2] === 'restore' && method === 'POST') {
      const input = await body(request), restoring = path[2] === 'restore';
      let doc: unknown, title: string | null = input.title === undefined ? null : cleanText(input.title, 'World title');
      if (restoring) {
        if (world.owner_id !== caller.id && caller.role !== 'teacher') fail(403, 'owner_required', 'Only the owner or teacher can restore this world.');
        if (!uuid(input.checkpointId)) fail(400, 'invalid_input', 'Choose a valid checkpoint.');
        const cp = (await service.rows('checkpoints', `id=eq.${input.checkpointId}&world_id=eq.${world.id}&limit=1`))[0];
        if (!cp) fail(404, 'not_found', 'Checkpoint not found.');
        doc = document(cp.document); title = cp.title;
      } else doc = document(input.document);
      const saved = await service.rpc('commit_world', { p_world_id: world.id, p_expected_revision: expectedRevision(input.expectedRevision), p_document: doc, p_title: title, p_reason: restoring ? 'restore' : 'save', p_actor_id: caller.id, p_session_id: caller.sessionId, p_auth_version: caller.authVersion });
      if (saved.error === 'conflict') throw new ClassroomHttpError(409, 'revision_conflict', 'Someone saved a newer version. Refresh before saving again.', { currentRevision: saved.currentRevision });
      if (saved.error === 'access_revoked') fail(403, 'access_revoked', 'Classroom access changed.');
      if (saved.error === 'rate_limited') fail(429, 'rate_limited', 'Too many saves. Please wait briefly.');
      if (saved.error) fail(404, 'not_found', 'World not found.');
      if (restoring) await service.audit(caller, 'restore_world', world.class_id, world.id);
      await options.onAccessChanged?.({ worldId: world.id, classId: world.class_id || undefined, reason: restoring ? 'world_restored' : 'world_saved' });
      return json({ world: worldView(saved, true) });
    }
    if (path[2] === 'checkpoints' && method === 'GET') return json({ checkpoints: (await service.rows('checkpoints', `world_id=eq.${world.id}&select=id,revision,created_at,reason&order=created_at.desc&limit=30`)).map(cp => ({ id: cp.id, revision: cp.revision, createdAt: cp.created_at, reason: cp.reason })) });
    if (path[2] === 'members') {
      if (world.kind === 'personal') fail(400, 'private_world', 'Personal worlds do not have group members.');
      if (method !== 'GET') {
        await service.classFor(caller, world.class_id, true);
        if (world.kind !== 'group') fail(400, 'class_world', 'Class worlds include the entire class. Use a group world for selected members.');
        if (method === 'POST') {
          const input = await body(request);
          if (!uuid(input.userId)) fail(400, 'invalid_input', 'Choose a student.');
          const student = (await service.rows('students', `user_id=eq.${input.userId}&class_id=eq.${world.class_id}&limit=1`))[0];
          if (!student || student.suspended) fail(400, 'invalid_member', 'Choose an active student in this class.');
          await service.request('/rest/v1/brick_world_members?on_conflict=world_id,user_id', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ world_id: world.id, user_id: student.user_id }) });
        } else if (method === 'DELETE' && uuid(path[3])) {
          await service.remove('world_members', `world_id=eq.${world.id}&user_id=eq.${path[3]}`);
          await service.audit(caller, 'remove_group_member', world.class_id, path[3]);
        } else fail(405, 'method_not_allowed', 'Unsupported member action.');
      }
      if (method !== 'GET') await options.onAccessChanged?.({ worldId: world.id, classId: world.class_id, userId: method === 'DELETE' ? path[3] : undefined, reason: 'members_updated' });
      const students = await service.rows('students', `class_id=eq.${world.class_id}&order=username.asc`);
      const members = world.kind === 'group' ? await service.rows('world_members', `world_id=eq.${world.id}`) : students.map(s => ({ user_id: s.user_id }));
      return json({ members: students.filter(s => members.some(m => m.user_id === s.user_id)).map(s => ({ id: s.user_id, username: s.username, ...(caller.role === 'teacher' ? { rosterName: s.roster_name } : {}) })) });
    }
  }
  return fail(404, 'not_found', 'Classroom route not found.');
}

/** Re-run for every privileged room action and periodically for idle sockets. Do not cache indefinitely. */
export async function authorizeClassroomWorld(request: Request, env: ClassroomEnv, worldId: string) {
  const service = new ClassroomService(env);
  const caller = await service.authenticate(bearer(request));
  const world = await service.worldFor(caller, worldId, true, true);
  return { userId: caller.id, username: caller.username, role: caller.role, worldId: world.id as string, classId: world.class_id as string, canEdit: true, isTeacher: caller.role === 'teacher', isOwner: world.owner_id === caller.id, authVersion: caller.authVersion, sessionId: caller.sessionId };
}

export type ClassroomWorldAccess = { userId: string; username: string; role: 'teacher' | 'student'; worldId: string; classId: string; canEdit: boolean; isTeacher: boolean; isOwner: boolean; authVersion: number; sessionId: string };
function accessError(code: string): ClassroomHttpError {
  const status = code === 'session_revoked' ? 401 : code === 'not_found' ? 404 : 403;
  const messages: Record<string, string> = { session_revoked: 'Please sign in again.', suspended: 'Your teacher has paused your classroom account.', password_change_required: 'Choose a new password to continue.', class_closed: 'Your teacher has closed classroom collaboration.', private_world: 'Only classroom worlds can be joined together.', not_found: 'World not found.' };
  return new ClassroomHttpError(status, code, messages[code] || 'Classroom access changed.');
}
function validIdentity(identity: ClassroomSessionIdentity) {
  if (!uuid(identity.userId) || !uuid(identity.sessionId) || !Number.isInteger(identity.authVersion)) fail(401, 'invalid_session', 'Please sign in again.');
}
/** Only invoke after validating ticket signature/expiry, or with trusted DO attachments. */
export async function revalidateClassroomWorldAccess(env: ClassroomEnv, identity: ClassroomSessionIdentity, worldId: string): Promise<ClassroomWorldAccess> {
  validIdentity(identity);
  if (!uuid(worldId)) fail(404, 'not_found', 'World not found.');
  const result = await new ClassroomService(env).rpc('authorize_world', { p_world_id: worldId, p_user_id: identity.userId, p_session_id: identity.sessionId, p_auth_version: identity.authVersion, p_teacher_allowed: (env.BRICK_TEACHER_IDS || '').split(',').map(x => x.trim()).includes(identity.userId) });
  if (result.error) throw accessError(result.error);
  return result as ClassroomWorldAccess;
}
export async function revalidateClassroomWorldAccessBatch(env: ClassroomEnv, identities: ClassroomSessionIdentity[], worldId: string): Promise<Array<{ identity: ClassroomSessionIdentity; access?: ClassroomWorldAccess; error?: { status: number; code: string; message: string } }>> {
  if (!uuid(worldId) || identities.length > 64) fail(400, 'invalid_input', 'Invalid permission batch.');
  identities.forEach(validIdentity);
  const teacherIds = (env.BRICK_TEACHER_IDS || '').split(',').map(x => x.trim());
  const results: Row[] = await new ClassroomService(env).rpc('authorize_world_batch', { p_world_id: worldId, p_identities: identities.map(identity => ({ ...identity, teacherAllowed: teacherIds.includes(identity.userId) })) });
  if (results.length !== identities.length) fail(502, 'service_unavailable', 'Permission checks did not complete.');
  return results.map((result, index) => {
    if (!result.error) return { identity: identities[index], access: result as ClassroomWorldAccess };
    const error = accessError(result.error);
    return { identity: identities[index], error: { status: error.status, code: error.code, message: error.message } };
  });
}
export async function reauthorizeClassroomSocket(env: ClassroomEnv, access: ClassroomSessionIdentity & { worldId: string }) {
  return revalidateClassroomWorldAccess(env, access, access.worldId);
}

/** Server-only helpers. The DO must authorize the caller before committing any edit. */
export async function loadClassroomWorld(env: ClassroomEnv, worldId: string) {
  if (!uuid(worldId)) fail(404, 'not_found', 'World not found.');
  const row = (await new ClassroomService(env).rows('worlds', `id=eq.${worldId}&limit=1`))[0];
  if (!row) fail(404, 'not_found', 'World not found.');
  return worldView(row, true);
}
export async function commitClassroomWorld(env: ClassroomEnv, worldId: string, value: unknown, revision: number, identity: ClassroomSessionIdentity) {
  if (!uuid(worldId)) fail(404, 'not_found', 'World not found.');
  const saved = await new ClassroomService(env).rpc('commit_world', { p_world_id: worldId, p_expected_revision: expectedRevision(revision), p_document: document(value), p_title: null, p_reason: 'live_edit', p_actor_id: identity.userId, p_session_id: identity.sessionId, p_auth_version: identity.authVersion });
  if (saved.error === 'conflict') throw new ClassroomHttpError(409, 'revision_conflict', 'A newer world revision exists.', { currentRevision: saved.currentRevision });
  if (saved.error === 'access_revoked') fail(403, 'access_revoked', 'Classroom access changed.');
  if (saved.error === 'rate_limited') fail(429, 'rate_limited', 'Too many saves. Please wait briefly.');
  if (saved.error) fail(404, 'not_found', 'World not found.');
  return worldView(saved, true);
}
export async function listClassroomWorldIds(env: ClassroomEnv, filter: { classId?: string; userId?: string }): Promise<string[]> {
  const service = new ClassroomService(env);
  if (filter.classId && uuid(filter.classId)) return (await service.rows('worlds', `class_id=eq.${filter.classId}&select=id`)).map(w => w.id);
  if (filter.userId && uuid(filter.userId)) {
    const student = (await service.rows('students', `user_id=eq.${filter.userId}&limit=1`))[0];
    if (student) return (await service.rows('worlds', `class_id=eq.${student.class_id}&select=id`)).map(w => w.id);
    const classes = await service.rows('classes', `teacher_id=eq.${filter.userId}&select=id`);
    const worlds = await Promise.all(classes.map(c => service.rows('worlds', `class_id=eq.${c.id}&select=id`)));
    return worlds.flat().map(w => w.id);
  }
  return [];
}
