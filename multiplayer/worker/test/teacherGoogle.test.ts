import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClassroomService, handleClassroomRequest, type ClassroomEnv } from '../src/classroom';
import { teacherGoogleAuthorizationUrl, validGoogleCodeVerifier } from '../src/classroom/googleOAuth';
const teacherId = '11111111-1111-4111-8111-111111111111';
const sid = '22222222-2222-4222-8222-222222222222';
const token = `header.${btoa(JSON.stringify({ session_id: sid }))}.signature`;
const env: ClassroomEnv = { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-service', SUPABASE_ANON_KEY: 'test-anon', BRICK_TEACHER_IDS: teacherId };
const challenge = 'a'.repeat(43), state = 'b'.repeat(43), verifier = 'c'.repeat(64);
afterEach(() => vi.restoreAllMocks());

describe('teacher Google PKCE boundary', () => {
  it('constructs only Google S256 authorization with a fixed same-origin callback', () => {
    const result = new URL(teacherGoogleAuthorizationUrl(env.SUPABASE_URL!, 'https://virtual-legos.vercel.app', challenge, state)!);
    expect(result.origin).toBe(env.SUPABASE_URL);
    expect(result.searchParams.get('provider')).toBe('google');
    expect(result.searchParams.get('code_challenge_method')).toBe('s256');
    expect(result.searchParams.get('code_challenge')).toBe(challenge);
    expect(result.searchParams.get('redirect_to')).toBe(`https://virtual-legos.vercel.app/auth/teacher-callback?state=${state}`);
    expect(result.toString()).not.toContain('access_token');
  });
  it('rejects attacker origins, non-HTTPS hosted origins, and weak state/challenges', () => {
    for (const origin of [null, 'https://evil.test', 'https://virtual-legos.vercel.app.evil.test', 'http://virtual-legos.vercel.app', 'https://virtual-legos.vercel.app/path']) {
      expect(teacherGoogleAuthorizationUrl(env.SUPABASE_URL!, origin, challenge, state)).toBeNull();
    }
    expect(teacherGoogleAuthorizationUrl(env.SUPABASE_URL!, 'http://localhost:5182', 'short', state)).toBeNull();
    expect(teacherGoogleAuthorizationUrl(env.SUPABASE_URL!, 'http://localhost:5182', challenge, 'short')).toBeNull();
    expect(validGoogleCodeVerifier('short')).toBe(false);
    expect(validGoogleCodeVerifier(verifier)).toBe(true);
  });
  it('exchanges code through provider, then registers only verified allowlisted identity', async () => {
    vi.spyOn(ClassroomService.prototype, 'rate').mockResolvedValue(undefined);
    const request = vi.spyOn(ClassroomService.prototype, 'request').mockImplementation(async (path, init, accessToken) => {
      if (path === '/auth/v1/token?grant_type=pkce') {
        expect(JSON.parse(String(init?.body))).toEqual({ auth_code: 'one-time-code', code_verifier: verifier });
        return { access_token: token, refresh_token: 'fresh-refresh', expires_in: 3600 };
      }
      if (path === '/auth/v1/user') { expect(accessToken).toBe(token); return { id: teacherId, email: 'teacher@example.test' }; }
      if (path.startsWith('/rest/v1/brick_teacher_sessions')) return [{ session_id: sid, user_id: teacherId, revoked: false }];
      if (path.startsWith('/rest/v1/brick_classes')) return [];
      throw new Error(`Unexpected ${path}`);
    });
    const result = await handleClassroomRequest(new Request('https://worker/classroom/auth/teacher-google', { method: 'POST', body: JSON.stringify({ code: 'one-time-code', codeVerifier: verifier }) }), env);
    expect(result?.status).toBe(200);
    expect(await result?.json()).toMatchObject({ user: { id: teacherId, role: 'teacher' }, session: { accessToken: token } });
    expect(request.mock.calls.some(([path, init]) => path.startsWith('/rest/v1/brick_teacher_sessions') && init?.method === 'POST')).toBe(true);
  });
  it('never enrolls an unapproved Google identity, regardless of role metadata', async () => {
    vi.spyOn(ClassroomService.prototype, 'rate').mockResolvedValue(undefined);
    const request = vi.spyOn(ClassroomService.prototype, 'request').mockImplementation(async path => {
      if (path.startsWith('/auth/v1/token')) return { access_token: token, refresh_token: 'fresh-refresh', expires_in: 3600 };
      if (path === '/auth/v1/user') return { id: sid, user_metadata: { role: 'teacher' } };
      throw new Error(`Unexpected ${path}`);
    });
    const result = await handleClassroomRequest(new Request('https://worker/classroom/auth/teacher-google', { method: 'POST', body: JSON.stringify({ code: 'one-time-code', codeVerifier: verifier }) }), env);
    expect(result?.status).toBe(403);
    expect(await result?.json()).toMatchObject({ code: 'teacher_required' });
    expect(request.mock.calls.every(([path]) => !path.includes('/rest/v1/'))).toBe(true);
  });
});
