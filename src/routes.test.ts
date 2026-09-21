import { describe, expect, it } from 'vitest'
import { parseClassroomEntryIntent, resolveAppRoute } from './routes'

const resolve = (path: string) => resolveAppRoute(new URL(path, 'https://example.test'))

describe('public home and editor routes', () => {
  it('keeps the public home separate from the editor, including campaign links', () => {
    expect(resolve('/').route).toBe('landing')
    expect(resolve('/?utm_source=classroom').route).toBe('landing')
    expect(resolve('/#classroom').route).toBe('landing')
    expect(resolve('/build').route).toBe('build')
    expect(resolve('/welcome')).toEqual({ route: 'landing', canonicalPath: '/' })
    expect(resolve('/join')).toEqual({ route: 'join' })
    expect(resolve('/join/?classCode=ABC123')).toEqual({ route: 'join', canonicalPath: '/join?classCode=ABC123' })
    expect(resolve('/worlds')).toEqual({ route: 'worlds' })
    expect(resolve('/class')).toEqual({ route: 'class' })
    expect(resolve('/class/projector')).toEqual({ route: 'class-projector' })
  })

  it('preserves legacy classroom links and their fragments when moving the editor', () => {
    expect(resolve('/?classroom=worlds')).toEqual({ route: 'build', canonicalPath: '/build?classroom=worlds' })
    expect(resolve('/?classroom=class#example')).toEqual({ route: 'build', canonicalPath: '/build?classroom=class#example' })
    expect(resolve('/build/?classroom=save')).toEqual({ route: 'build', canonicalPath: '/build?classroom=save' })
  })

  it('keeps collaboration, published worlds, and authentication on their existing routes', () => {
    expect(resolve('/live/new').route).toBe('live')
    expect(resolve('/live/room123#owner=example').route).toBe('live')
    expect(resolve('/world#example').route).toBe('published')
    expect(resolve('/auth/teacher-callback?code=example&state=example').route).toBe('teacher-callback')
  })

  it('does not open a blank editor for mistyped links', () => {
    expect(resolve('/missing').route).toBe('not-found')
    expect(resolve('/live').route).toBe('not-found')
  })

  it('serves the UI gallery only in development builds', () => {
    const gallery = new URL('/dev/ui', 'https://example.test')
    expect(resolveAppRoute(gallery, { dev: true })).toEqual({ route: 'dev-ui' })
    expect(resolveAppRoute(gallery, { dev: false })).toEqual({ route: 'not-found' })
    expect(resolveAppRoute(new URL('/dev/ui/', 'https://example.test'), { dev: true }).route).toBe('not-found')
    expect(resolveAppRoute(new URL('/dev', 'https://example.test'), { dev: true }).route).toBe('not-found')
    expect(import.meta.env.DEV).toBe(true)
    expect(resolve('/dev/ui').route).toBe('dev-ui')
  })
})

describe('classroom entry intents', () => {
  it('accepts every documented intent from a query string', () => {
    for (const intent of ['save', 'worlds', 'class', 'join', 'signin', 'teacher'] as const) {
      expect(parseClassroomEntryIntent(`?classroom=${intent}`)).toBe(intent)
      expect(parseClassroomEntryIntent(`?utm_source=poster&classroom=${intent}`)).toBe(intent)
    }
  })

  it('rejects unknown, empty, mis-cased and missing intents without throwing', () => {
    expect(parseClassroomEntryIntent('?classroom=bogus')).toBeNull()
    expect(parseClassroomEntryIntent('?classroom=')).toBeNull()
    expect(parseClassroomEntryIntent('?classroom=Join')).toBeNull()
    expect(parseClassroomEntryIntent('?classroom=join%20')).toBeNull()
    expect(parseClassroomEntryIntent('?other=join')).toBeNull()
    expect(parseClassroomEntryIntent('')).toBeNull()
  })
})
