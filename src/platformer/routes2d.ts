/*
 * Pages under /2d. The app's router (src/routes.ts) sends every /2d path to the 2D chunk; this picks the page.
 *
 *   /2d                    home: start or continue a level, courses, your levels, play with friends
 *   /2d/build              your latest 2D level (a new one when there is none)
 *   /2d/build?new=1        a new level          ?world=<id> an account level     ?draft=<id> a level in this browser
 *   /2d/play/<course>      play a course        /2d/play#l=<code> play a level from a share link
 *   /2d/r/<room>           a guest room (32 hex digits)
 *   /2d/w/<world>          a class level's live room (its world id, with or without dashes)
 */

export type Route2D =
  | { kind: 'home' }
  | { kind: 'build'; world?: string; draft?: string; fresh: boolean }
  | { kind: 'course'; id: string }
  | { kind: 'shared'; code: string | null }
  | { kind: 'guest'; roomId: string }
  | { kind: 'classroom'; worldId: string }
  | { kind: 'not-found' }

/** A world id with dashes, from either spelling; null for anything else. */
export function canonicalWorldId(value: string): string | null {
  const compact = value.toLowerCase().replaceAll('-', '')
  if (!/^[a-f0-9]{32}$/.test(compact)) return null
  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`
}

export function parse2dRoute({ pathname, search, hash }: Pick<URL, 'pathname' | 'search' | 'hash'>): Route2D {
  const path = pathname.replace(/\/+$/, '') || '/'
  const query = new URLSearchParams(search)
  if (path === '/2d') return { kind: 'home' }
  if (path === '/2d/build') {
    const world = query.get('world')?.trim() || undefined
    const draft = query.get('draft')?.trim() || undefined
    return { kind: 'build', world: world && canonicalWorldId(world) ? canonicalWorldId(world)! : undefined, draft: draft?.slice(0, 64), fresh: query.get('new') === '1' }
  }
  if (path === '/2d/play') return { kind: 'shared', code: /^#l=(.+)$/.exec(hash)?.[1] ?? null }
  const course = /^\/2d\/play\/([a-z0-9-]{1,40})$/.exec(path)
  if (course) return { kind: 'course', id: course[1] }
  const guest = /^\/2d\/r\/([a-f0-9]{32})$/.exec(path)
  if (guest) return { kind: 'guest', roomId: guest[1] }
  const cls = /^\/2d\/w\/([a-fA-F0-9-]{32,36})$/.exec(path)
  if (cls && canonicalWorldId(cls[1])) return { kind: 'classroom', worldId: canonicalWorldId(cls[1])! }
  return { kind: 'not-found' }
}
