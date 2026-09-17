import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBrickStudioDocument } from '@brick-studio/core';
import { ClassroomService, handleClassroomRequest, normalizeUsername, revalidateClassroomWorldAccess, type Caller, type ClassroomAccessChange, type ClassroomEnv } from '../src/classroom';

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
  it('keeps personal worlds private even from a class teacher', async () => {
    const { service } = serviceWith({ '/rest/v1/brick_worlds': [{ id: worldId, kind: 'personal', owner_id: studentId }] });
    await expect(service.worldFor({ ...caller, id: teacherId, role: 'teacher' }, worldId)).rejects.toMatchObject({ status: 404 });
    await expect(service.worldFor(caller, worldId, true)).rejects.toMatchObject({ code: 'private_world' });
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
