/** Only a tab's PKCE code challenge and anti-CSRF state leave the browser here. */
export function teacherGoogleAuthorizationUrl(supabaseUrl: string, origin: string | null, challenge: unknown, state: unknown): string | null {
  if (!origin || typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)
      || typeof state !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(state)) return null;
  let site: URL;
  try { site = new URL(origin); } catch { return null; }
  if (site.origin !== origin || !(
    (site.protocol === 'https:' && (site.hostname === 'virtual-legos.vercel.app' || /^virtual-legos-[a-z0-9-]+\.vercel\.app$/.test(site.hostname)))
    || (['localhost', '127.0.0.1'].includes(site.hostname) && ['http:', 'https:'].includes(site.protocol))
  )) return null;
  const callback = new URL('/auth/teacher-callback', site);
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
