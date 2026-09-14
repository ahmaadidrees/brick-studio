export const BUILD_PATH = '/build'

export type AppRoute = 'landing' | 'build' | 'published' | 'live' | 'teacher-callback' | 'not-found'

/**
 * Account entry intents carried by `/build?classroom=<intent>`.
 * `save` opens the save flow, `worlds`/`class` open a signed-in tab, and
 * `join`/`signin`/`teacher` pick the initial sign-in mode for guests.
 */
export type ClassroomEntryIntent = 'save' | 'worlds' | 'class' | 'join' | 'signin' | 'teacher'

const CLASSROOM_ENTRY_INTENTS: ReadonlySet<string> = new Set<ClassroomEntryIntent>(['save', 'worlds', 'class', 'join', 'signin', 'teacher'])

export function isClassroomEntryIntent(value: unknown): value is ClassroomEntryIntent {
  return typeof value === 'string' && CLASSROOM_ENTRY_INTENTS.has(value)
}

/** Reads `?classroom=` from a query string; unknown or missing values resolve to null. */
export function parseClassroomEntryIntent(search: string): ClassroomEntryIntent | null {
  const value = new URLSearchParams(search).get('classroom')
  return isClassroomEntryIntent(value) ? value : null
}

/** Resolve only known routes; preserve old editor links without hiding the home page. */
export function resolveAppRoute(location: Pick<URL, 'pathname' | 'search' | 'hash'>): {
  route: AppRoute
  canonicalPath?: string
} {
  const { pathname, search, hash } = location
  if (pathname === '/auth/teacher-callback') return { route: 'teacher-callback' }
  if (/^\/live\/[^/]+\/?$/.test(pathname)) return { route: 'live' }
  if (/^\/world\/?$/.test(pathname)) return { route: 'published' }
  if (pathname === '/build' || pathname === '/build/') {
    return { route: 'build', ...(pathname.endsWith('/') ? { canonicalPath: `${BUILD_PATH}${search}${hash}` } : {}) }
  }
  if (pathname === '/' && new URLSearchParams(search).has('classroom')) {
    return { route: 'build', canonicalPath: `${BUILD_PATH}${search}${hash}` }
  }
  if (/^\/welcome\/?$/.test(pathname)) return { route: 'landing', canonicalPath: `/${search}${hash}` }
  if (pathname === '/') return { route: 'landing' }
  return { route: 'not-found' }
}
