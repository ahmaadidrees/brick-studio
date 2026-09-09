import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClassroomService, handleClassroomRequest, normalizeUsername, revalidateClassroomWorldAccess, type Caller, type ClassroomEnv } from '../src/classroom';

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
