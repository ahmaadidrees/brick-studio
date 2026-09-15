import { isApplicationOrigin } from '../applicationOrigin';

/** Only a tab's PKCE code challenge and anti-CSRF state leave the browser here. */
export function teacherGoogleAuthorizationUrl(supabaseUrl: string, origin: string | null, challenge: unknown, state: unknown): string | null {
  if (!origin || typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)
      || typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(state)) return null;
  if (!isApplicationOrigin(origin)) return null;
  const callback = new URL('/auth/teacher-callback', origin);
  callback.searchParams.set('state', state);
  const authorize = new URL('/auth/v1/authorize', supabaseUrl);
  authorize.searchParams.set('provider', 'google');
  authorize.searchParams.set('redirect_to', callback.toString());
  authorize.searchParams.set('code_challenge', challenge);
  authorize.searchParams.set('code_challenge_method', 's256');
  authorize.searchParams.set('prompt', 'select_account');
  return authorize.toString();
}

export function validGoogleCodeVerifier(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}
