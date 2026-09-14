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
