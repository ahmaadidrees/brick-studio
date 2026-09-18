/** Query parsing and the after-sign-in destination for `/join`. */

export type JoinMode = 'join' | 'signin' | 'teacher'

const MODES: ReadonlySet<string> = new Set<JoinMode>(['join', 'signin', 'teacher'])

export type JoinQuery = {
  mode: JoinMode
  /** Class code from an invite link (`/join?classCode=ROOM-42`); upper-cased, never longer than the field. */
  classCode: string
  /** Same-origin path to open after a successful sign-in, or '' when the link carried none. */
  next: string
}

/**
 * `next` must stay inside this app: a path starting with a single slash. Anything
 * else (a full URL, a protocol-relative `//host`, a backslash trick) is dropped
 * rather than followed, so an invite link can never bounce a student off-site.
 */
export function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return ''
  return value
}

export function parseJoinQuery(search: string): JoinQuery {
  const params = new URLSearchParams(search)
  const mode = params.get('mode')
  return {
    mode: mode && MODES.has(mode) ? (mode as JoinMode) : 'join',
    classCode: (params.get('classCode') ?? '').trim().toUpperCase().slice(0, 32),
    next: safeNext(params.get('next')),
  }
}

/** Where a signed-in account goes: the link's `next` when it has one, else the account's home. */
export function joinDestination(role: 'teacher' | 'student', next: string) {
  return next || (role === 'teacher' ? '/class' : '/worlds')
}
