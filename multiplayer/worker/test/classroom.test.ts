import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrickStudioDocument } from '@brick-studio/core';
import { ClassroomHttpError, ClassroomService, PRESENCE_ROOM_LIMIT, authorizeClassroomWorld, handleClassroomRequest, listClassroomWorldIds, normalizeUsername, revalidateClassroomWorldAccess, rosterDisplayName, usernameSuggestions, type Caller, type ClassroomAccessChange, type ClassroomEnv } from '../src/classroom';
type Row = Record<string, any>;

const studentId = '11111111-1111-4111-8111-111111111111';
const teacherId = '22222222-2222-4222-8222-222222222222';
const classId = '33333333-3333-4333-8333-333333333333';
const worldId = '44444444-4444-4444-8444-444444444444';
const sid = '55555555-5555-4555-8555-555555555555';
const token = `header.${btoa(JSON.stringify({ session_id: sid }))}.signature`;
const env: ClassroomEnv = { SUPABASE_URL: 'https://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service', SUPABASE_ANON_KEY: 'test-anon', BRICK_TEACHER_IDS: teacherId };
const student = { user_id: studentId, class_id: classId, username: 'Builder', roster_name: 'Sam', suspended: false, reset_required: false, auth_version: 2 };
const caller: Caller = { id: studentId, username: 'Builder', rosterName: 'Sam', role: 'student', resetRequired: false, classId, authVersion: 2, sessionId: sid, token };
function serviceWith(entries: Record<string, unknown>) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const entry = entries[url.pathname];
    if (entry === undefined) throw new Error(`Unexpected request ${url.pathname}`);
    return new Response(JSON.stringify(entry), { status: 200 });
  });
  return { service: new ClassroomService(env, fetcher as typeof fetch), fetcher };
}
afterEach(() => vi.restoreAllMocks());

describe('classroom account and authorization boundaries', () => {
  it('uses a restricted case-preserving username rather than accepting query syntax', () => {
    expect(normalizeUsername(' Dragon_7 ')).toBe('Dragon_7');
    for (const value of ['ab', 'name&role=teacher', 'a.b', '__proto__', 'x'.repeat(25)]) expect(() => normalizeUsername(value)).toThrow();
  });
  it('rejects a revoked session even when Supabase still accepts its JWT', async () => {
    const { service } = serviceWith({ '/auth/v1/user': { id: studentId }, '/rest/v1/brick_students': [student], '/rest/v1/brick_sessions': [{ auth_version: 1 }] });
    await expect(service.authenticate(token)).rejects.toMatchObject({ status: 401, code: 'session_revoked' });
  });
  it('rejects unregistered provider sessions, including externally refreshed tokens', async () => {
    const { service } = serviceWith({ '/auth/v1/user': { id: studentId }, '/rest/v1/brick_students': [student], '/rest/v1/brick_sessions': [] });
    await expect(service.authenticate(token)).rejects.toMatchObject({ code: 'session_revoked' });
  });
  it('requires password replacement before ordinary account access', async () => {
    const { service } = serviceWith({ '/auth/v1/user': { id: studentId }, '/rest/v1/brick_students': [{ ...student, reset_required: true }], '/rest/v1/brick_sessions': [{ auth_version: 2 }] });
    await expect(service.authenticate(token)).rejects.toMatchObject({ code: 'password_change_required' });
    await expect(service.authenticate(token, true)).resolves.toMatchObject({ resetRequired: true });
  });
  it('suspension blocks even reset-required account routes', async () => {
    const { service } = serviceWith({ '/auth/v1/user': { id: studentId }, '/rest/v1/brick_students': [{ ...student, suspended: true }], '/rest/v1/brick_sessions': [{ auth_version: 2 }] });
    await expect(service.authenticate(token, true)).rejects.toMatchObject({ code: 'suspended' });
  });
  it('does not trust teacher metadata from a student account', async () => {
    const { service } = serviceWith({ '/auth/v1/user': { id: studentId, user_metadata: { role: 'teacher' }, app_metadata: { role: 'teacher' } }, '/rest/v1/brick_students': [student], '/rest/v1/brick_sessions': [{ auth_version: 2 }] });
    await expect(service.authenticate(token)).resolves.toMatchObject({ role: 'student' });
  });
  it('recognizes only a configured trusted teacher UUID', async () => {
    const { service } = serviceWith({ '/auth/v1/user': { id: teacherId, email: 'teacher@example.test' }, '/rest/v1/brick_teacher_sessions': [{ user_id: teacherId, session_id: sid, revoked: false }] });
    await expect(service.authenticate(token)).resolves.toMatchObject({ role: 'teacher', id: teacherId });
  });
  it('denies another class even if the caller guesses its world UUID', async () => {
    const { service } = serviceWith({ '/rest/v1/brick_classes': [{ id: classId, teacher_id: teacherId }] });
    await expect(service.classFor({ ...caller, classId: worldId }, classId)).rejects.toMatchObject({ status: 404 });
  });
  it('removing group membership denies access without deleting world content', async () => {
    const { service, fetcher } = serviceWith({ '/rest/v1/brick_worlds': [{ id: worldId, kind: 'group', class_id: classId }], '/rest/v1/brick_classes': [{ id: classId, teacher_id: teacherId, collaboration_open: true }], '/rest/v1/brick_world_members': [] });
    await expect(service.worldFor(caller, worldId)).rejects.toMatchObject({ status: 404 });
    expect(fetcher.mock.calls.length).toBe(3);
  });
  it('closed collaboration prevents student access but teacher retains oversight', async () => {
    const { service } = serviceWith({ '/rest/v1/brick_worlds': [{ id: worldId, kind: 'class', class_id: classId }], '/rest/v1/brick_classes': [{ id: classId, teacher_id: teacherId, collaboration_open: false }] });
    await expect(service.worldFor(caller, worldId)).rejects.toMatchObject({ code: 'class_closed' });
    await expect(service.worldFor({ ...caller, id: teacherId, role: 'teacher' }, worldId)).resolves.toMatchObject({ id: worldId });
  });
  it('keeps unshared personal worlds private even from a class teacher, while the owner may open them live', async () => {
    const { service, fetcher } = serviceWith({ '/rest/v1/brick_worlds': [{ id: worldId, kind: 'personal', owner_id: studentId, class_visibility: 'private' }] });
    await expect(service.worldFor({ ...caller, id: teacherId, role: 'teacher' }, worldId)).rejects.toMatchObject({ status: 404 });
    await expect(service.worldFor({ ...caller, id: teacherId, role: 'student', classId }, worldId)).rejects.toMatchObject({ status: 404 });
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('brick_students'))).toBe(true);
    await expect(service.worldAccess(caller, worldId, true)).resolves.toMatchObject({ canEdit: true, isOwner: true, ownerName: 'Sam' });
  });
  it('reports a provider password-policy rejection on admin user writes as invalid_password, not a sign-in failure', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.startsWith('/auth/v1/admin/users')) return new Response(JSON.stringify({ code: 'weak_password', msg: 'Password should be at least 8 characters.' }), { status: 422 });
      return new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' }), { status: 400 });
    });
    const service = new ClassroomService(env, fetcher as typeof fetch);
    // Registration and teacher-issued temporary passwords both write through the admin API.
    await expect(service.request('/auth/v1/admin/users', { method: 'POST' })).rejects.toMatchObject({ status: 400, code: 'invalid_password', message: 'Password should be at least 8 characters.' });
    await expect(service.request(`/auth/v1/admin/users/${studentId}`, { method: 'PUT' })).rejects.toMatchObject({ status: 400, code: 'invalid_password', message: 'Password should be at least 8 characters.' });
    // Sign-in keeps the deliberately vague credential error.
    await expect(service.request('/auth/v1/token?grant_type=password', { method: 'POST' })).rejects.toMatchObject({ status: 401, code: 'invalid_credentials', message: 'Check your sign-in details and try again.' });
  });
  it('falls back to a generic password message when the provider gives none', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 400 }));
    const service = new ClassroomService(env, fetcher as typeof fetch);
    await expect(service.request('/auth/v1/admin/users', { method: 'POST' })).rejects.toMatchObject({ code: 'invalid_password', message: 'The account service did not accept that password. Try a longer one.' });
  });
  it('fails clearly when backend configuration is unavailable', async () => {
    const response = await handleClassroomRequest(new Request('https://worker.test/classroom/me'), {});
    expect(response?.status).toBe(503);
    expect(await response?.json()).toMatchObject({ code: 'classroom_unavailable' });
  });
  it('leaves non-classroom routing to the existing Worker', async () => {
    expect(await handleClassroomRequest(new Request('https://worker.test/worlds'), {})).toBeNull();
  });
  it('does not auto-register a revoked teacher provider session', async () => {
    const { service, fetcher } = serviceWith({ '/auth/v1/user': { id: teacherId }, '/rest/v1/brick_teacher_sessions': [] });
    await expect(service.authenticate(token)).rejects.toMatchObject({ code: 'session_revoked' });
    expect(fetcher.mock.calls).toHaveLength(2);
  });
  it('revalidates ticket identity against current membership without a bearer', async () => {
    const { fetcher } = serviceWith({ '/rest/v1/rpc/brick_authorize_world': { username: 'Builder', userId: studentId, isTeacher: false, canEdit: true } });
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetcher as typeof fetch);
    await expect(revalidateClassroomWorldAccess(env, { userId: studentId, sessionId: sid, authVersion: 2 }, worldId)).resolves.toMatchObject({ username: 'Builder', userId: studentId, isTeacher: false, canEdit: true });
    expect(fetcher.mock.calls.every(([url]) => !String(url).includes('/auth/'))).toBe(true);
    expect(fetcher.mock.calls).toHaveLength(1);
  });
  it('rejects a previously issued ticket after a password reset increments version', async () => {
    const { fetcher } = serviceWith({ '/rest/v1/rpc/brick_authorize_world': { error: 'session_revoked' } });
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetcher as typeof fetch);
    await expect(revalidateClassroomWorldAccess(env, { userId: studentId, sessionId: sid, authVersion: 2 }, worldId)).rejects.toMatchObject({ code: 'session_revoked' });
  });
  it('rejects reset-required ticket even if its version and session are current', async () => {
    const { fetcher } = serviceWith({ '/rest/v1/rpc/brick_authorize_world': { error: 'password_change_required' } });
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetcher as typeof fetch);
    await expect(revalidateClassroomWorldAccess(env, { userId: studentId, sessionId: sid, authVersion: 2 }, worldId)).rejects.toMatchObject({ code: 'password_change_required' });
  });
  it('rejects an old teacher ticket after logout', async () => {
    const { fetcher } = serviceWith({ '/rest/v1/rpc/brick_authorize_world': { error: 'session_revoked' } });
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetcher as typeof fetch);
    await expect(revalidateClassroomWorldAccess(env, { userId: teacherId, sessionId: sid, authVersion: 0 }, worldId)).rejects.toMatchObject({ code: 'session_revoked' });
  });
  it('does not execute a second overlapping password mutation', async () => {
    const { service } = serviceWith({ '/rest/v1/rpc/brick_acquire_credential_lock': false });
    const mutation = vi.fn();
    await expect(service.withCredentialLock(studentId, mutation)).rejects.toMatchObject({ code: 'account_busy' });
    expect(mutation).not.toHaveBeenCalled();
  });
  it('holds credential lease after an uncertain provider error', async () => {
    const { service, fetcher } = serviceWith({ '/rest/v1/rpc/brick_acquire_credential_lock': true });
    await expect(service.withCredentialLock(studentId, async () => { throw new Error('network timeout'); })).rejects.toThrow('network timeout');
    expect(fetcher.mock.calls).toHaveLength(1);
  });
});

describe('live access-change kinds', () => {
  const checkpointId = '66666666-6666-4666-8666-666666666666';
  const cls = { id: classId, teacher_id: teacherId, name: 'Period 1', login_code: 'PERIOD1', enrollment_open: true, collaboration_open: true };
  const world = { id: worldId, class_id: classId, kind: 'group', owner_id: teacherId, title: 'Bridge', revision: 4, document: createBrickStudioDocument([]) };
  const teacher: Caller = { id: teacherId, username: 'Teacher', rosterName: 'Teacher', role: 'teacher', resetRequired: false, authVersion: 0, sessionId: sid, token };
  function routesAs(role: Caller) {
    const events: ClassroomAccessChange[] = [];
    vi.spyOn(ClassroomService.prototype, 'authenticate').mockResolvedValue(role);
    vi.spyOn(ClassroomService.prototype, 'rate').mockResolvedValue(undefined);
    vi.spyOn(ClassroomService.prototype, 'rows').mockImplementation(async table =>
      table === 'worlds' ? [world] : table === 'classes' ? [cls] : table === 'students' ? [student]
        : table === 'checkpoints' ? [{ id: checkpointId, world_id: worldId, document: world.document, title: 'Bridge v1' }] : []);
    vi.spyOn(ClassroomService.prototype, 'rpc').mockImplementation(async (name, input) =>
      name === 'commit_world' ? { ...world, revision: world.revision + 1, title: input.p_title ?? world.title } : true);
    vi.spyOn(ClassroomService.prototype, 'patch').mockImplementation(async (table, _filter, data) => [{ ...(table === 'classes' ? cls : student), ...data }]);
    vi.spyOn(ClassroomService.prototype, 'insert').mockResolvedValue([]);
    vi.spyOn(ClassroomService.prototype, 'remove').mockResolvedValue(null);
    vi.spyOn(ClassroomService.prototype, 'request').mockImplementation(async path =>
      path.startsWith('/auth/v1/token') ? { access_token: token, refresh_token: 'refresh', expires_in: 3600 } : path === '/auth/v1/user' ? { id: role.id } : {});
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await handleClassroomRequest(new Request(`https://worker.test/classroom/${path}`, {
        method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
      }), env, { onAccessChanged: async event => { events.push(event); } });
      expect(response?.status, `${method} ${path}`).toBe(200);
      return events.at(-1);
    };
    return call;
  }
  it('classifies teacher world and class mutations by their live effect', async () => {
    const call = routesAs(teacher);
    expect(await call('PATCH', `worlds/${worldId}`, { title: 'Bridge challenge' })).toEqual({ worldId, classId, reason: 'world_saved', change: 'metadata' });
    expect(await call('PUT', `worlds/${worldId}`, { expectedRevision: 4, document: world.document })).toEqual({ worldId, classId, reason: 'world_saved', change: 'metadata' });
    expect(await call('POST', `worlds/${worldId}/restore`, { checkpointId, expectedRevision: 4 })).toEqual({ worldId, classId, reason: 'world_restored', change: 'metadata' });
    expect(await call('PATCH', `classes/${classId}`, { collaborationOpen: false })).toEqual({ classId, reason: 'class_updated', change: 'membership' });
    expect(await call('POST', `worlds/${worldId}/members`, { userId: studentId })).toEqual({ worldId, classId, userId: undefined, reason: 'members_updated', change: 'membership' });
    expect(await call('DELETE', `worlds/${worldId}/members/${studentId}`)).toEqual({ worldId, classId, userId: studentId, reason: 'members_updated', change: 'revocation' });
    expect(await call('PATCH', `classes/${classId}/students/${studentId}`, { rosterName: 'Sam R.' })).toEqual({ classId, userId: studentId, reason: 'student_updated', change: 'membership' });
    expect(await call('PATCH', `classes/${classId}/students/${studentId}`, { suspended: true })).toEqual({ classId, userId: studentId, reason: 'student_updated', change: 'revocation' });
    expect(await call('PATCH', `classes/${classId}/students/${studentId}`, { temporaryPassword: 'temporary-pass' })).toEqual({ classId, userId: studentId, reason: 'password_reset', change: 'revocation' });
  });
  it('classifies a student signing out as a revocation of that session only', async () => {
    const call = routesAs(caller);
    expect(await call('POST', 'auth/logout', {})).toEqual({ userId: studentId, classId, reason: 'logout', change: 'revocation' });
  });
});

describe('student password and alias boundaries', () => {
  const call = (path: string, data: unknown) => handleClassroomRequest(new Request(`https://worker.test/classroom/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }), env);
  it('rejects short/common/username passwords before provider registration', async () => {
    vi.spyOn(ClassroomService.prototype, 'rate').mockResolvedValue(undefined);
    const request = vi.spyOn(ClassroomService.prototype, 'request');
    for (const password of ['short', '123456', 'BUILDER']) {
      const response = await call('register', { classCode: 'ROOM42', username: 'Builder', password });
      expect(response?.status).toBe(400);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it('keeps teacher passwords at eight characters', async () => {
    vi.spyOn(ClassroomService.prototype, 'rate').mockResolvedValue(undefined);
    const login = vi.spyOn(ClassroomService.prototype, 'login');
    const response = await call('teacher-login', { email: 'teacher@example.invalid', password: 'orbit7' });
    expect(response?.status).toBe(400); expect(login).not.toHaveBeenCalled();
  });
  it('accepts six characters for student login, retains old weak passwords, and groups aliases in one rate bucket', async () => {
    const rate = vi.spyOn(ClassroomService.prototype, 'rate').mockResolvedValue(undefined);
    vi.spyOn(ClassroomService.prototype, 'rows').mockImplementation(async table => table === 'class_codes' ? [{ class_id: classId, can_enroll: false }] : table === 'classes' ? [{ id: classId }] : table === 'students' ? [student] : []);
    const login = vi.spyOn(ClassroomService.prototype, 'login').mockResolvedValue({ access_token: token, refresh_token: 'refresh', expires_in: 3600 });
    vi.spyOn(ClassroomService.prototype, 'registerSession').mockResolvedValue(undefined);
    vi.spyOn(ClassroomService.prototype, 'authResult').mockResolvedValue({ session: { accessToken: token, refreshToken: 'refresh', expiresIn: 3600 }, user: { id: studentId, username: 'Builder', rosterName: 'Sam', role: 'student', resetRequired: false }, classes: [] });
    for (const [code, password] of [['ALIAS1', 'orbit7'], ['ALIAS2', 'password']]) {
      expect((await call('login', { classCode: code, username: 'Builder', password }))?.status).toBe(200);
    }
    expect(login).toHaveBeenCalledWith(expect.any(String), 'orbit7');
    const buckets = rate.mock.calls.filter(([key]) => key.startsWith('login:'));
    expect(buckets).toEqual([[`login:${classId}:builder`, 12, 300], [`login:${classId}:builder`, 12, 300]]);
  });
});

describe('class entry lookup', () => {
  it('returns only class name and enrollment availability and keeps old codes usable', async () => {
    vi.spyOn(ClassroomService.prototype, 'rate').mockResolvedValue(undefined);
    const rows = vi.spyOn(ClassroomService.prototype, 'rows').mockImplementation(async table => table === 'class_codes' ? [{ class_id: classId, can_enroll: true }] : [{ id: classId, name: 'STEM class', enrollment_open: true, teacher_id: teacherId }]);
    const call = () => handleClassroomRequest(new Request('https://worker.test/classroom/auth/class', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ classCode: 'CLASS123' }) }), env);
    expect(await (await call())!.json()).toEqual({ name: 'STEM class', canEnroll: true });
    rows.mockImplementation(async table => table === 'class_codes' ? [{ class_id: classId, can_enroll: false }] : [{ name: 'STEM class', enrollment_open: true }]);
    expect(await (await call())!.json()).toEqual({ name: 'STEM class', canEnroll: false });
    rows.mockResolvedValue([]);
    expect((await call())!.status).toBe(404);
  });
});

describe('username-only sign-in', () => {
  const call = (path: string, data: unknown) => handleClassroomRequest(new Request(`https://worker.test/classroom/auth/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }), env);
  const authed = { session: { accessToken: token, refreshToken: 'refresh', expiresIn: 3600 }, user: { id: studentId, username: 'Builder', rosterName: 'Sam', role: 'student' as const, resetRequired: false }, classes: [] };
  function signIn(matches: Row[], loginResult: 'ok' | 'wrong' = 'ok') {
    const rate = vi.spyOn(ClassroomService.prototype, 'rate').mockResolvedValue(undefined);
    const rows = vi.spyOn(ClassroomService.prototype, 'rows').mockImplementation(async (table, filter = '') => {
      if (table === 'students' && filter.includes('username_key=eq.')) return matches.filter(row => !filter.includes('class_id=eq.') || filter.includes(`class_id=eq.${row.class_id}`));
      if (table === 'students') return matches.slice(0, 1);
      if (table === 'class_codes') return filter.includes('OTHER') ? [{ class_id: worldId, can_enroll: false }] : [{ class_id: classId, can_enroll: false }];
      return [];
    });
    const login = vi.spyOn(ClassroomService.prototype, 'login').mockImplementation(async () => {
      if (loginResult === 'wrong') throw new ClassroomHttpError(401, 'invalid_credentials', 'Check your sign-in details and try again.');
      return { access_token: token, refresh_token: 'refresh', expires_in: 3600 };
    });
    vi.spyOn(ClassroomService.prototype, 'registerSession').mockResolvedValue(undefined);
    vi.spyOn(ClassroomService.prototype, 'authResult').mockResolvedValue(authed);
    return { rate, rows, login, buckets: () => rate.mock.calls.filter(([key]) => key.startsWith('login:')).map(([key]) => key) };
  }
  it('signs a student in by username alone without touching class codes', async () => {
    const { rows, login, buckets } = signIn([student]);
    const response = await call('login', { username: 'Builder', password: 'orbit7' });
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ user: { username: 'Builder' } });
    expect(login).toHaveBeenCalledWith(expect.stringContaining(studentId), 'orbit7');
    expect(rows.mock.calls.some(([table]) => table === 'class_codes')).toBe(false);
    expect(rows.mock.calls.find(([table, filter]) => table === 'students' && filter?.includes('username_key'))?.[1]).toBe('username_key=eq.builder&limit=2');
    expect(buckets()).toEqual(['login:builder']);
  });
  it('answers an unknown username and a wrong password the same way from the same bucket', async () => {
    const missing = signIn([]);
    const unknown = await call('login', { username: 'Builder', password: 'orbit7' });
    expect(unknown?.status).toBe(401);
    expect(await unknown?.json()).toMatchObject({ code: 'invalid_credentials' });
    expect(missing.login).not.toHaveBeenCalled();
    expect(missing.buckets()).toEqual(['login:builder']);
    vi.restoreAllMocks();
    const wrong = signIn([student], 'wrong');
    const rejected = await call('login', { username: 'builder', password: 'not-it' });
    expect(rejected?.status).toBe(401);
    expect(await rejected?.json()).toMatchObject({ code: 'invalid_credentials' });
    expect(wrong.buckets()).toEqual(['login:builder']);
  });
  it('asks for the class code only when two rows share a username, then honors it', async () => {
    const { login, buckets } = signIn([student, { ...student, user_id: teacherId, class_id: worldId }]);
    const ambiguous = await call('login', { username: 'Builder', password: 'orbit7' });
    expect(ambiguous?.status).toBe(409);
    expect(await ambiguous?.json()).toMatchObject({ code: 'class_code_required' });
    expect(login).not.toHaveBeenCalled();
    const scoped = await call('login', { username: 'Builder', password: 'orbit7', classCode: 'other' });
    expect(scoped?.status).toBe(200);
    expect(login).toHaveBeenCalledWith(expect.stringContaining(teacherId), 'orbit7');
    expect(buckets()).toEqual(['login:builder', `login:${worldId}:builder`]);
  });
  it('rejects a username taken in any class at registration and offers free variants checked against the database', async () => {
    vi.spyOn(ClassroomService.prototype, 'rate').mockResolvedValue(undefined);
    const request = vi.spyOn(ClassroomService.prototype, 'request');
    const rows = vi.spyOn(ClassroomService.prototype, 'rows').mockImplementation(async (table, filter = '') => {
      if (table === 'class_codes') return [{ class_id: classId, can_enroll: true }];
      if (table === 'classes') return [{ id: classId, enrollment_open: true }];
      if (table === 'students' && filter.startsWith('username_key=eq.builder&')) return [{ user_id: teacherId }];
      if (table === 'students' && filter.startsWith('username_key=in.')) return [{ username_key: 'builder2' }, { username_key: 'builder7' }];
      return [];
    });
    const response = await call('register', { classCode: 'ROOM42', username: 'Builder', password: 'remember-this', rosterName: 'Sam Rivera' });
    expect(response?.status).toBe(409);
    const payload = await response?.json() as Row;
    expect(payload).toMatchObject({ code: 'username_taken' });
    expect(payload.suggestions).toEqual(['Builder3', 'Builder4', 'Builder5']);
    expect(rows.mock.calls.find(([table, filter]) => table === 'students' && filter?.startsWith('username_key=eq.'))?.[1]).not.toContain('class_id');
    expect(request).not.toHaveBeenCalled();
  });
  it('keeps suggestions inside the username length limit', async () => {
    const rows = vi.spyOn(ClassroomService.prototype, 'rows').mockResolvedValue([]);
    const suggestions = await usernameSuggestions(new ClassroomService(env), 'a'.repeat(24));
    expect(suggestions).toEqual([`${'a'.repeat(23)}2`, `${'a'.repeat(23)}3`, `${'a'.repeat(23)}7`]);
    expect(rows).toHaveBeenCalledTimes(1);
  });
  it('rejects a teacher renaming a student to a username used in another class', async () => {
    vi.spyOn(ClassroomService.prototype, 'authenticate').mockResolvedValue({ id: teacherId, username: 'Teacher', rosterName: 'Teacher', role: 'teacher', resetRequired: false, authVersion: 0, sessionId: sid, token });
    vi.spyOn(ClassroomService.prototype, 'rpc').mockResolvedValue(true);
    vi.spyOn(ClassroomService.prototype, 'remove').mockResolvedValue(null);
    const patch = vi.spyOn(ClassroomService.prototype, 'patch');
    vi.spyOn(ClassroomService.prototype, 'rows').mockImplementation(async (table, filter = '') => {
      if (table === 'classes') return [{ id: classId, teacher_id: teacherId }];
      if (table === 'students' && filter.startsWith('username_key=eq.nova&')) return filter.includes(`user_id=neq.${studentId}`) ? [{ user_id: worldId }] : [];
      if (table === 'students' && filter.startsWith('username_key=in.')) return [];
      if (table === 'students') return [{ ...student, username_key: 'builder' }];
      return [];
    });
    const response = await handleClassroomRequest(new Request(`https://worker.test/classroom/classes/${classId}/students/${studentId}`, { method: 'PATCH', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ username: 'Nova' }) }), env);
    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({ code: 'username_taken', suggestions: ['Nova2', 'Nova3', 'Nova7'] });
    expect(patch).not.toHaveBeenCalled();
  });
});

describe('join-screen roster', () => {
  const cls = { id: classId, teacher_id: teacherId, name: 'STEM class', login_code: 'ROOM42', enrollment_open: true, collaboration_open: true, show_names_on_join: true };
  const roster = [
    { user_id: studentId, username: 'sky_builder', roster_name: 'Zed Quinn', suspended: false },
    { user_id: teacherId, username: 'ava', roster_name: '  Ava   Rose Lee ', suspended: false },
    { user_id: worldId, username: 'solo', roster_name: 'Cher', suspended: false },
  ];
  const call = (body: unknown) => handleClassroomRequest(new Request('https://worker.test/classroom/auth/roster', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);
  function backend(classRow: Row | null, students = roster) {
    vi.spyOn(ClassroomService.prototype, 'rate').mockResolvedValue(undefined);
    return vi.spyOn(ClassroomService.prototype, 'rows').mockImplementation(async (table, filter = '') => {
      if (table === 'class_codes') return classRow ? [{ class_id: classId, can_enroll: false }] : [];
      if (table === 'classes') return classRow ? [classRow] : [];
      if (table === 'students') return students.filter(row => !filter.includes('suspended=eq.false') || !row.suspended).map(row => ({ username: row.username, roster_name: row.roster_name }));
      return [];
    });
  }
  it('lists first names with last initials, sorted, without roster names, ids or credentials', async () => {
    const rows = backend(cls);
    const response = await call({ classCode: 'room42' });
    expect(response?.status).toBe(200);
    const text = await response!.text();
    expect(JSON.parse(text)).toEqual({ name: 'STEM class', canEnroll: false, showNames: true, students: [
      { username: 'ava', displayName: 'Ava L.' }, { username: 'solo', displayName: 'Cher' }, { username: 'sky_builder', displayName: 'Zed Q.' },
    ] });
    expect(text).not.toMatch(/roster_name|rosterName|user_id|Quinn|Rose|password|auth_version/);
    expect(rows.mock.calls.find(([table]) => table === 'students')?.[1]).toContain('suspended=eq.false');
    expect(rows.mock.calls.find(([table]) => table === 'students')?.[1]).toContain('select=username,roster_name');
    expect(rows.mock.calls.find(([table]) => table === 'class_codes')?.[1]).toBe('code=eq.ROOM42&limit=1');
  });
  it('excludes suspended students', async () => {
    backend(cls, [...roster, { user_id: sid, username: 'paused', roster_name: 'Pat Paused', suspended: true }]);
    expect(((await (await call({ classCode: 'ROOM42' }))!.json()) as Row).students.map((row: Row) => row.username)).toEqual(['ava', 'solo', 'sky_builder']);
  });
  it('returns an empty list when the teacher hides names', async () => {
    const rows = backend({ ...cls, show_names_on_join: false });
    expect(await (await call({ classCode: 'ROOM42' }))!.json()).toEqual({ name: 'STEM class', canEnroll: false, showNames: false, students: [] });
    expect(rows.mock.calls.some(([table]) => table === 'students')).toBe(false);
  });
  it('rejects unknown codes and malformed input without a roster query', async () => {
    const rows = backend(null);
    const unknown = await call({ classCode: 'NOPE' });
    expect(unknown?.status).toBe(404);
    expect(await unknown?.json()).toMatchObject({ code: 'class_not_found' });
    for (const body of [{}, { classCode: 42 }, { classCode: '' }, { classCode: 'x'.repeat(41) }]) {
      const malformed = await call(body);
      expect(malformed?.status).toBe(400);
      expect(await malformed?.json()).toMatchObject({ code: 'invalid_input' });
    }
    expect(rows.mock.calls.some(([table]) => table === 'students')).toBe(false);
  });
  it('formats display names from any roster spelling', () => {
    expect(rosterDisplayName('Ava Rose')).toBe('Ava R.');
    expect(rosterDisplayName('ava')).toBe('ava');
    expect(rosterDisplayName('  Ava   Rose   Lee ')).toBe('Ava L.');
    expect(rosterDisplayName('Ava de la Cruz')).toBe('Ava C.');
    expect(rosterDisplayName('')).toBe('');
  });
  it('lets the owning teacher toggle names on the join screen and reports it on the class', async () => {
    vi.spyOn(ClassroomService.prototype, 'authenticate').mockResolvedValue({ id: teacherId, username: 'Teacher', rosterName: 'Teacher', role: 'teacher', resetRequired: false, authVersion: 0, sessionId: sid, token });
    vi.spyOn(ClassroomService.prototype, 'rows').mockImplementation(async table => table === 'classes' ? [cls] : []);
    const patch = vi.spyOn(ClassroomService.prototype, 'patch').mockImplementation(async (_table, _filter, data) => [{ ...cls, ...data }]);
    vi.spyOn(ClassroomService.prototype, 'insert').mockResolvedValue([]);
    const patchClass = (body: unknown, bearer = token) => handleClassroomRequest(new Request(`https://worker.test/classroom/classes/${classId}`, { method: 'PATCH', headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);
    const response = await patchClass({ showNamesOnJoin: false });
    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ class: { id: classId, name: 'STEM class', loginCode: 'ROOM42', enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: false, studentsCanShare: true, buildingNow: null, teacherName: null } });
    expect(patch).toHaveBeenCalledWith('classes', `id=eq.${classId}&teacher_id=eq.${teacherId}`, { show_names_on_join: false });
    expect((await patchClass({ showNamesOnJoin: 'no' }))?.status).toBe(400);
    vi.spyOn(ClassroomService.prototype, 'authenticate').mockResolvedValue(caller);
    expect((await patchClass({ showNamesOnJoin: false }))?.status).toBe(404);
  });
});

describe('shared personal worlds (flows v2 sharing model)', () => {
  const avaId = '11111111-1111-4111-8111-00000000000a', benId = '11111111-1111-4111-8111-00000000000b', cyId = '11111111-1111-4111-8111-00000000000c';
  const otherClassId = '33333333-3333-4333-8333-000000000002', otherTeacherId = '22222222-2222-4222-8222-000000000002';
  const treehouse = '44444444-4444-4444-8444-00000000000a', copyId = '44444444-4444-4444-8444-0000000000cc';
  const doc = createBrickStudioDocument([]);
  const ava: Caller = { ...caller, id: avaId, username: 'ava_builds', rosterName: 'Ava Rivera' };
  const ben: Caller = { ...caller, id: benId, username: 'ben_k', rosterName: 'Ben Kim' };
  const cy: Caller = { ...caller, id: cyId, username: 'cy_other', rosterName: 'Cy Other', classId: otherClassId };
  const teacher: Caller = { id: teacherId, username: 'Teacher', rosterName: 'Teacher', role: 'teacher', resetRequired: false, authVersion: 0, sessionId: sid, token };
  const otherTeacher: Caller = { ...teacher, id: otherTeacherId };
  type Tables = { classes: Row[]; students: Row[]; worlds: Row[]; sessions?: Row[] };
  /** A small PostgREST stand-in: eq/in/neq filters, PATCH returning the updated rows, inserts with ids, the RPCs the routes use. */
  function backend(as: Caller, tables: Tables) {
    const events: ClassroomAccessChange[] = [];
    const db: Record<string, Row[]> = { classes: tables.classes, students: tables.students, worlds: tables.worlds, world_members: [], class_codes: [], checkpoints: [], audit_events: [] };
    const matches = (row: Row, query: URLSearchParams) => [...query.entries()].every(([key, value]) => {
      if (['select', 'limit', 'offset', 'order'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('neq.')) return String(row[key]) !== value.slice(4);
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]));
      throw new Error(`Unsupported filter ${key}=${value}`);
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input)), table = url.pathname.replace('/rest/v1/brick_', ''), method = init?.method ?? 'GET';
      if (url.pathname.startsWith('/rest/v1/rpc/')) {
        const name = url.pathname.replace('/rest/v1/rpc/brick_', ''), body = JSON.parse(String(init?.body));
        if (name === 'take_rate_limit') return Response.json(true);
        if (name === 'commit_world') { const world = db.worlds.find(row => row.id === body.p_world_id)!; return Response.json({ ...world, revision: world.revision + 1, title: body.p_title ?? world.title, document: body.p_document }); }
        throw new Error(`Unexpected rpc ${name}`);
      }
      if (!(table in db)) throw new Error(`Unexpected table ${table}`);
      const rows = db[table].filter(row => matches(row, url.searchParams));
      if (method === 'PATCH') { const data = JSON.parse(String(init?.body)); rows.forEach(row => Object.assign(row, data)); return Response.json(rows); }
      if (method === 'POST') { const data = { id: copyId, revision: 1, updated_at: '2026-09-17T12:00:00Z', ...JSON.parse(String(init?.body)) }; db[table].push(data); return Response.json([data]); }
      const limit = Number(url.searchParams.get('limit') || 1000);
      return Response.json(rows.slice(0, limit));
    });
    vi.spyOn(ClassroomService.prototype, 'authenticate').mockResolvedValue(as);
    // The routes build their own service on the module fetch; the returned service uses the same tables directly.
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetcher as typeof fetch);
    const service = new ClassroomService(env, fetcher as typeof fetch);
    const call = async (method: string, path: string, body?: unknown) => {
      const response = await handleClassroomRequest(new Request(`https://worker.test/classroom/${path}`, {
        method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
      }), env, { onAccessChanged: async event => { events.push(event); } });
      return { status: response!.status, body: await response!.json() as Row };
    };
    return { call, events, db, service, fetcher };
  }
  const period3 = () => ({ id: classId, teacher_id: teacherId, name: 'Period 3 Makers', login_code: 'MAKERS3', enrollment_open: true, collaboration_open: true, show_names_on_join: true, students_can_share: true });
  const roster = () => [
    { user_id: avaId, class_id: classId, username: 'ava_builds', username_key: 'ava_builds', roster_name: 'Ava Rivera', suspended: false, reset_required: false, auth_version: 2 },
    { user_id: benId, class_id: classId, username: 'ben_k', username_key: 'ben_k', roster_name: 'Ben Kim', suspended: false, reset_required: false, auth_version: 2 },
    { user_id: cyId, class_id: otherClassId, username: 'cy_other', username_key: 'cy_other', roster_name: 'Cy Other', suspended: false, reset_required: false, auth_version: 2 },
  ];
  const world = (sharing: Row = {}) => ({ id: treehouse, owner_id: avaId, class_id: null, kind: 'personal', title: 'Treehouse Hideout', revision: 3, updated_at: '2026-09-16T10:00:00Z', document: doc, class_visibility: 'private', class_can_edit: false, hidden_by_teacher: false, class_shared_at: null, ...sharing });
  const shared = (sharing: Row = {}) => world({ class_visibility: 'class', class_shared_at: '2026-09-15T10:00:00Z', ...sharing });
  const tables = (worlds: Row[], cls: Row = period3()): Tables => ({ classes: [cls, { ...period3(), id: otherClassId, teacher_id: otherTeacherId, name: 'Period 4' }], students: roster(), worlds });

  it('the owner shares with look-only, then with editing, and unsharing re-authorizes the live room', async () => {
    const { call, events, db, fetcher } = backend(ava, tables([world()]));
    const looked = await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'class', canEdit: false });
    expect(looked.status).toBe(200);
    expect(looked.body.world).toMatchObject({ id: treehouse, visibility: 'class', canEdit: true, classCanEdit: false, ownerName: 'Ava R.', ownerClassId: classId, sharedAt: expect.any(String) });
    expect(db.worlds[0]).toMatchObject({ class_visibility: 'class', class_can_edit: false });
    const sharedAt = db.worlds[0].class_shared_at;
    const edit = await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'class', canEdit: true });
    expect(edit.body.world.sharedAt).toBe(sharedAt);
    expect(edit.body.world).toMatchObject({ canEdit: true, classCanEdit: true });
    expect(db.worlds[0].class_can_edit).toBe(true);
    const unshared = await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'private', canEdit: true });
    expect(unshared.body.world).toMatchObject({ visibility: 'private', sharedAt: null, canEdit: true });
    expect(db.worlds[0]).toMatchObject({ class_visibility: 'private', class_can_edit: false, class_shared_at: null });
    // Every change re-authorizes the room in place: classmates lose access on unshare (owner stays), edit rights follow class_can_edit.
    expect(events).toEqual(Array(3).fill({ worldId: treehouse, reason: 'sharing_updated', change: 'membership' }));
    expect((await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'everyone', canEdit: true })).status).toBe(400);
    expect((await call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'class', canEdit: 'yes' })).status).toBe(400);
  });
  it('refuses sharing when the teacher turned it off, and from anyone but the student owner', async () => {
    const off = backend(ava, tables([world()], { ...period3(), students_can_share: false }));
    const refused = await off.call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'class', canEdit: false });
    expect(refused).toEqual({ status: 403, body: { error: 'Your teacher has turned off sharing between students.', code: 'sharing_disabled' } });
    expect(off.db.worlds[0].class_visibility).toBe('private');
    expect(off.events).toEqual([]);
    vi.restoreAllMocks();
    const classmate = backend(ben, tables([shared()]));
    expect((await classmate.call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'private', canEdit: false })).body.code).toBe('owner_required');
    vi.restoreAllMocks();
    const asTeacher = backend(teacher, tables([shared()]));
    expect((await asTeacher.call('PATCH', `worlds/${treehouse}/sharing`, { visibility: 'private', canEdit: false })).body.code).toBe('student_required');
  });
  it('lets a classmate look but not change a look-only world, and edit one shared with editing', async () => {
    const look = backend(ben, tables([shared()]));
    const seen = await look.call('GET', `worlds/${treehouse}`);
    expect(seen.status).toBe(200);
    expect(seen.body.world).toMatchObject({ visibility: 'class', canEdit: false, classCanEdit: false, ownerName: 'Ava R.', ownerClassId: classId, sharedAt: '2026-09-15T10:00:00Z' });
    expect(seen.body.world.document).toEqual(doc);
    expect((await look.call('PUT', `worlds/${treehouse}`, { expectedRevision: 3, document: doc })).body.code).toBe('read_only');
    expect((await look.call('PATCH', `worlds/${treehouse}`, { title: 'Mine now' })).body.code).toBe('owner_required');
    expect((await look.call('GET', `worlds/${treehouse}/checkpoints`)).body.code).toBe('owner_required');
    expect((await look.call('POST', `worlds/${treehouse}/restore`, { checkpointId: sid, expectedRevision: 3 })).body.code).toBe('read_only');
    expect(look.db.worlds[0].title).toBe('Treehouse Hideout');
    expect(await look.service.worldAccess(ben, treehouse, true, true)).toMatchObject({ canEdit: false, isOwner: false, ownerName: 'Ava R.', ownerClassId: classId });
    vi.restoreAllMocks();
    const edit = backend(ben, tables([shared({ class_can_edit: true })]));
    const saved = await edit.call('PUT', `worlds/${treehouse}`, { expectedRevision: 3, document: doc });
    expect(saved.status).toBe(200);
    expect(saved.body.world).toMatchObject({ revision: 4, canEdit: true, ownerName: 'Ava R.' });
    expect((await edit.call('PATCH', `worlds/${treehouse}`, { title: 'Mine now' })).body.code).toBe('owner_required');
    expect(await edit.service.worldAccess(ben, treehouse, true, true)).toMatchObject({ canEdit: true, isOwner: false });
    // The owner edits whatever the sharing settings say, including a look-only world.
    expect(await edit.service.worldAccess(ava, treehouse, true, true)).toMatchObject({ canEdit: true, isOwner: true, ownerName: 'Ava R.' });
    expect(await look.service.worldAccess(ava, treehouse)).toMatchObject({ canEdit: true, isOwner: true });
  });
  it('hides shared worlds from students of another class, and unshared or hidden ones from classmates', async () => {
    const other = backend(cy, tables([shared({ class_can_edit: true })]));
    expect((await other.call('GET', `worlds/${treehouse}`)).status).toBe(404);
    expect((await other.call('POST', `worlds/${treehouse}/copy`)).status).toBe(404);
    await expect(other.service.worldAccess(otherTeacher, treehouse)).rejects.toMatchObject({ status: 404 });
    vi.restoreAllMocks();
    const unshared = backend(ben, tables([world({ class_can_edit: true })]));
    expect((await unshared.call('GET', `worlds/${treehouse}`)).status).toBe(404);
    expect(unshared.fetcher.mock.calls.every(([url]) => !String(url).includes('brick_students'))).toBe(true);
    vi.restoreAllMocks();
    const hidden = backend(ben, tables([shared({ hidden_by_teacher: true })]));
    expect((await hidden.call('GET', `worlds/${treehouse}`)).body).toMatchObject({ code: 'world_hidden' });
    await expect(hidden.service.worldAccess(ben, treehouse, true, true)).rejects.toMatchObject({ status: 403, code: 'world_hidden' });
    await expect(hidden.service.worldAccess(teacher, treehouse, true, true)).resolves.toMatchObject({ canEdit: false, isOwner: false });
    vi.restoreAllMocks();
    const closed = backend(ben, tables([shared()], { ...period3(), collaboration_open: false }));
    expect((await closed.call('GET', `worlds/${treehouse}`)).body.code).toBe('class_closed');
    vi.restoreAllMocks();
    const off = backend(ben, tables([shared()], { ...period3(), students_can_share: false }));
    expect((await off.call('GET', `worlds/${treehouse}`)).body.code).toBe('sharing_disabled');
    // Owners are never blocked by their teacher's settings on their own world.
    await expect(off.service.worldAccess(ava, treehouse, true)).resolves.toMatchObject({ canEdit: true, isOwner: true });
  });
  it('lets the teacher look but never edit a shared world that is hidden, in a closed class, or with sharing off', async () => {
    const open = backend(teacher, tables([shared({ class_can_edit: true })]));
    await expect(open.service.worldAccess(teacher, treehouse, true, true)).resolves.toMatchObject({ canEdit: true, isOwner: false, ownerName: 'Ava R.' });
    expect((await open.call('GET', `worlds/${treehouse}`)).body.world).toMatchObject({ canEdit: true, classCanEdit: true });
    vi.restoreAllMocks();
    const hidden = backend(teacher, tables([shared({ class_can_edit: true, hidden_by_teacher: true })]));
    await expect(hidden.service.worldAccess(teacher, treehouse, true, true)).resolves.toMatchObject({ canEdit: false, isOwner: false });
    expect((await hidden.call('GET', `worlds/${treehouse}`)).body.world).toMatchObject({ canEdit: false, classCanEdit: true, hiddenByTeacher: true });
    expect((await hidden.call('PUT', `worlds/${treehouse}`, { expectedRevision: 3, document: doc })).body.code).toBe('read_only');
    expect(hidden.db.worlds[0].revision).toBe(3);
    vi.restoreAllMocks();
    const closed = backend(teacher, tables([shared({ class_can_edit: true })], { ...period3(), collaboration_open: false }));
    await expect(closed.service.worldAccess(teacher, treehouse, true, true)).resolves.toMatchObject({ canEdit: false, isOwner: false });
    expect((await closed.call('PUT', `worlds/${treehouse}`, { expectedRevision: 3, document: doc })).body.code).toBe('read_only');
    vi.restoreAllMocks();
    const off = backend(teacher, tables([shared({ class_can_edit: true })], { ...period3(), students_can_share: false }));
    await expect(off.service.worldAccess(teacher, treehouse, true, true)).resolves.toMatchObject({ canEdit: false, isOwner: false });
    expect((await off.call('PUT', `worlds/${treehouse}`, { expectedRevision: 3, document: doc })).body.code).toBe('read_only');
    // A classmate in the same states is refused outright, as before.
    vi.restoreAllMocks();
    const classmate = backend(ben, tables([shared({ class_can_edit: true })], { ...period3(), students_can_share: false }));
    expect((await classmate.call('PUT', `worlds/${treehouse}`, { expectedRevision: 3, document: doc })).body.code).toBe('sharing_disabled');
  });
  it('lets the class teacher hide and show a shared world, and nobody else', async () => {
    const own = backend(teacher, tables([shared()]));
    const hidden = await own.call('PATCH', `worlds/${treehouse}/visibility`, { hiddenByTeacher: true });
    expect(hidden.status).toBe(200);
    expect(hidden.body.world).toMatchObject({ hiddenByTeacher: true, visibility: 'class', ownerName: 'Ava R.', canEdit: false });
    expect(own.db.worlds[0].hidden_by_teacher).toBe(true);
    expect(own.events).toEqual([{ worldId: treehouse, reason: 'visibility_updated', change: 'membership' }]);
    expect((await own.call('PATCH', `worlds/${treehouse}/visibility`, { hiddenByTeacher: false })).body.world.hiddenByTeacher).toBe(false);
    expect((await own.call('PATCH', `worlds/${treehouse}/visibility`, { hiddenByTeacher: 'yes' })).status).toBe(400);
    vi.restoreAllMocks();
    const foreign = backend(otherTeacher, tables([shared()]));
    expect((await foreign.call('PATCH', `worlds/${treehouse}/visibility`, { hiddenByTeacher: true })).status).toBe(404);
    vi.restoreAllMocks();
    const student = backend(ben, tables([shared()]));
    expect((await student.call('PATCH', `worlds/${treehouse}/visibility`, { hiddenByTeacher: true })).body.code).toBe('teacher_required');
    expect(student.db.worlds[0].hidden_by_teacher).toBe(false);
    vi.restoreAllMocks();
    const privateWorld = backend(teacher, tables([world()]));
    expect((await privateWorld.call('PATCH', `worlds/${treehouse}/visibility`, { hiddenByTeacher: true })).status).toBe(404);
  });
  it('copies any visible world into a personal world titled "<title> (copy)" and stops at the world limit', async () => {
    const { call, db, fetcher } = backend(ben, tables([shared()]));
    const copied = await call('POST', `worlds/${treehouse}/copy`);
    expect(copied.status).toBe(201);
    expect(copied.body.world).toMatchObject({ id: copyId, title: 'Treehouse Hideout (copy)', ownerId: benId, classId: null, kind: 'personal', visibility: 'private', canEdit: true, ownerName: 'Ben K.', sharedAt: null, document: doc });
    expect(db.worlds.at(-1)).toMatchObject({ owner_id: benId, class_id: null, kind: 'personal', document: doc });
    expect(db.worlds.at(-1)).not.toHaveProperty('class_visibility');
    vi.restoreAllMocks();
    const full = backend(ben, tables([shared(), ...Array.from({ length: 50 }, (_, i) => ({ ...world(), id: `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`, owner_id: benId }))]));
    expect(await full.call('POST', `worlds/${treehouse}/copy`)).toEqual({ status: 409, body: { error: 'You have reached the saved-world limit. Ask your teacher for help.', code: 'world_limit' } });
    expect(full.fetcher.mock.calls.some(([, init]) => init?.method === 'POST' && !String(init.body).includes('p_key'))).toBe(false);
    vi.restoreAllMocks();
    const own = backend(ava, tables([world()]));
    expect((await own.call('POST', `worlds/${treehouse}/copy`)).body.world).toMatchObject({ title: 'Treehouse Hideout (copy)', ownerId: avaId, ownerName: 'Ava R.' });
    vi.restoreAllMocks();
    const long = backend(ava, tables([world({ title: 'x'.repeat(80) })]));
    expect((await long.call('POST', `worlds/${treehouse}/copy`)).body.world.title).toHaveLength(80);
  });
  it('maps a database quota rejection on the copy insert to world_limit', async () => {
    vi.spyOn(ClassroomService.prototype, 'authenticate').mockResolvedValue(ben);
    vi.spyOn(ClassroomService.prototype, 'rate').mockResolvedValue(undefined);
    vi.spyOn(ClassroomService.prototype, 'worldAccess').mockResolvedValue({ world: shared(), canEdit: false, isOwner: false, ownerName: 'Ava R.', ownerClassId: classId });
    vi.spyOn(ClassroomService.prototype, 'rows').mockResolvedValue([]);
    vi.spyOn(ClassroomService.prototype, 'insert').mockRejectedValue(new ClassroomHttpError(409, 'quota_exceeded', 'You have reached the saved-world limit. Ask your teacher for help.'));
    const response = await handleClassroomRequest(new Request(`https://worker.test/classroom/worlds/${treehouse}/copy`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }), env);
    expect(response?.status).toBe(409);
    expect(await response?.json()).toMatchObject({ code: 'world_limit' });
  });
  it('lets the teacher switch student sharing per class and reports it on the class view', async () => {
    const { call, db, events } = backend(teacher, tables([]));
    const off = await call('PATCH', `classes/${classId}`, { studentsCanShare: false });
    expect(off.status).toBe(200);
    expect(off.body.class).toMatchObject({ id: classId, studentsCanShare: false, collaborationOpen: true });
    expect(db.classes[0].students_can_share).toBe(false);
    expect(events).toEqual([{ classId, reason: 'class_updated', change: 'membership' }]);
    expect((await call('PATCH', `classes/${classId}`, { studentsCanShare: 'no' })).status).toBe(400);
    expect((await call('GET', 'classes')).body.classes[0]).toMatchObject({ studentsCanShare: false });
    vi.restoreAllMocks();
    const student = backend(ben, tables([]));
    expect((await student.call('PATCH', `classes/${classId}`, { studentsCanShare: true })).status).toBe(404);
  });
  it('reports how many accounts are building in each class from live presence, only on a teacher\'s GET classes', async () => {
    const { db, fetcher } = backend(teacher, tables([shared(), { ...shared(), id: copyId, owner_id: benId }, { id: worldId, kind: 'class', class_id: classId, owner_id: teacherId }]));
    const asked: string[][] = [];
    const liveParticipants = vi.fn<(worldIds: string[]) => Promise<string[] | null>>(async worldIds => { asked.push([...worldIds].sort()); return worldIds.length ? [avaId, benId, avaId] : []; });
    const call = async (path: string) => (await handleClassroomRequest(new Request(`https://worker.test/classroom/${path}`, { headers: { authorization: `Bearer ${token}` } }), env, { liveParticipants }))!.json() as Promise<Row>;
    const classes = (await call('classes')).classes as Row[];
    expect(classes.map(row => [row.id, row.buildingNow])).toEqual([[classId, 2]]);
    expect(asked).toEqual([[worldId, treehouse, copyId].sort()]);
    // Opening the app (GET me) never fans out to live rooms.
    expect((await call('me')).classes[0].buildingNow).toBeNull();
    liveParticipants.mockResolvedValueOnce(null);
    expect((await call('classes')).classes[0].buildingNow).toBeNull();
    // Sign-in responses and students never fan out either.
    const service = new ClassroomService(env, fetcher as typeof fetch);
    expect((await service.me(teacher)).classes.map(row => row.buildingNow)).toEqual([null]);
    vi.spyOn(ClassroomService.prototype, 'authenticate').mockResolvedValue(ben);
    expect((await call('classes')).classes[0]).toMatchObject({ buildingNow: null, studentsCanShare: true });
    expect(liveParticipants).toHaveBeenCalledTimes(2);
    expect(db.classes[0].students_can_share).toBe(true);
    // The presence bucket is per teacher: once it is empty the listing still succeeds with unknown counts.
    const limited = fetcher.getMockImplementation()!;
    fetcher.mockImplementation(async (input, init) => String(input).endsWith('/rpc/brick_take_rate_limit') ? Response.json(false) : limited(input, init));
    vi.spyOn(ClassroomService.prototype, 'authenticate').mockResolvedValue(teacher);
    expect((await call('classes')).classes[0].buildingNow).toBeNull();
    expect(liveParticipants).toHaveBeenCalledTimes(2);
    fetcher.mockImplementation(async (input, init) => String(input).endsWith('/rpc/brick_take_rate_limit') ? new Response('down', { status: 500 }) : limited(input, init));
    expect((await call('classes')).classes[0].buildingNow).toBeNull();
    expect(liveParticipants).toHaveBeenCalledTimes(2);
  });
  it('caps the presence fan-out at PRESENCE_ROOM_LIMIT rooms per listing, in class order', async () => {
    const classRow = (n: number) => ({ ...period3(), id: `00000000-0000-4000-8000-0000000c${String(n).padStart(4, '0')}`, name: `Class ${n}` });
    const classes = [classRow(1), classRow(2), classRow(3), classRow(4)];
    const worldRow = (cls: Row, n: number) => ({ id: `00000000-0000-4000-8000-${cls.id.slice(-4)}${String(n).padStart(8, '0')}`, kind: 'class', class_id: cls.id, owner_id: teacherId, title: 'W', revision: 1, updated_at: '2026-09-16T10:00:00Z', class_visibility: 'private', class_can_edit: false, hidden_by_teacher: false, class_shared_at: null });
    const worlds = [...Array.from({ length: 100 }, (_, i) => worldRow(classes[0], i)), ...Array.from({ length: 51 }, (_, i) => worldRow(classes[2], i)), worldRow(classes[3], 0)];
    const { fetcher } = backend(teacher, { classes, students: [], worlds });
    const service = new ClassroomService(env, fetcher as typeof fetch);
    const liveParticipants = vi.fn(async (worldIds: string[]) => worldIds.slice(0, 3));
    const result = (await service.me(teacher, liveParticipants)).classes.map(row => [row.name, row.buildingNow]);
    // Class 1 fits (100 rooms), class 2 has no rooms and costs nothing, class 3 would exceed 150 in total, so it
    // and every class after it report unknown rather than partial counts.
    expect(result).toEqual([['Class 1', 3], ['Class 2', 0], ['Class 3', null], ['Class 4', null]]);
    expect(liveParticipants).toHaveBeenCalledTimes(1);
    expect(liveParticipants.mock.calls[0][0]).toHaveLength(100);
    expect(PRESENCE_ROOM_LIMIT).toBe(150);
  });
  it('includes shared personal worlds when a class change fans out to live rooms', async () => {
    const { fetcher } = backend(teacher, tables([shared(), { ...shared(), id: copyId, owner_id: benId, class_visibility: 'private' }, { ...shared(), id: sid, owner_id: cyId }, { id: worldId, kind: 'class', class_id: classId, owner_id: teacherId }]));
    expect((await listClassroomWorldIds(env, { classId })).sort()).toEqual([worldId, treehouse].sort());
    expect((await listClassroomWorldIds(env, { userId: benId })).sort()).toEqual([worldId, treehouse].sort());
    expect(await listClassroomWorldIds(env, { userId: otherTeacherId })).toEqual([sid]);
  });
  it('issues live access as a viewer or editor from the bearer route', async () => {
    const { fetcher } = backend(ben, tables([shared()]));
    const request = new Request(`https://worker.test/classroom/worlds/${treehouse}/live-ticket`, { headers: { authorization: `Bearer ${token}` } });
    await expect(authorizeClassroomWorld(request, env, treehouse)).resolves.toMatchObject({ userId: benId, worldId: treehouse, classId: null, canEdit: false, isOwner: false, isTeacher: false, role: 'student' });
    vi.restoreAllMocks();
    const owner = backend(ava, tables([world()]));
    await expect(authorizeClassroomWorld(request, env, treehouse)).resolves.toMatchObject({ userId: avaId, canEdit: true, isOwner: true });
  });
  it('translates the new live permission codes for socket re-authorization', async () => {
    for (const [code, status] of [['world_hidden', 403], ['sharing_disabled', 403], ['private_world', 403], ['class_closed', 403], ['not_found', 404]] as const) {
      const { fetcher } = serviceWith({ '/rest/v1/rpc/brick_authorize_world': { error: code } });
      vi.spyOn(globalThis, 'fetch').mockImplementation(fetcher as typeof fetch);
      await expect(revalidateClassroomWorldAccess(env, { userId: benId, sessionId: sid, authVersion: 2 }, treehouse)).rejects.toMatchObject({ code, status });
      vi.restoreAllMocks();
    }
  });
});
