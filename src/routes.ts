export const BUILD_PATH = '/build'

export type AppRoute = 'landing' | 'build' | 'published' | 'live' | 'teacher-callback' | 'not-found'

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
