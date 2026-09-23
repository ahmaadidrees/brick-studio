import { describe, expect, it } from 'vitest'
import { canonicalWorldId, parse2dRoute } from './routes2d'

const at = (url: string) => {
  const u = new URL(url, 'https://brickgineers.test')
  return parse2dRoute(u)
}

describe('2D routes', () => {
  it('resolve every page', () => {
    expect(at('/2d')).toEqual({ kind: 'home' })
    expect(at('/2d/')).toEqual({ kind: 'home' })
    expect(at('/2d/build')).toEqual({ kind: 'build', world: undefined, draft: undefined, fresh: false })
    expect(at('/2d/build?new=1')).toMatchObject({ kind: 'build', fresh: true })
    expect(at('/2d/build?draft=d123')).toMatchObject({ kind: 'build', draft: 'd123' })
    expect(at('/2d/play/workshop')).toEqual({ kind: 'course', id: 'workshop' })
    expect(at('/2d/play#l=abc')).toEqual({ kind: 'shared', code: 'abc' })
    expect(at('/2d/r/' + 'a'.repeat(32))).toEqual({ kind: 'guest', roomId: 'a'.repeat(32) })
    expect(at('/2d/nope')).toEqual({ kind: 'not-found' })
    expect(at('/2d/r/short')).toEqual({ kind: 'not-found' })
  })

  it('accept world ids with or without dashes and nothing else', () => {
    const id = '12345678-1234-4234-8234-123456789abc'
    expect(at(`/2d/build?world=${id}`)).toMatchObject({ world: id })
    expect(at(`/2d/build?world=${id.replaceAll('-', '').toUpperCase()}`)).toMatchObject({ world: id })
    expect(at('/2d/build?world=../../etc')).toMatchObject({ world: undefined })
    expect(at(`/2d/w/${id.replaceAll('-', '')}`)).toEqual({ kind: 'classroom', worldId: id })
    expect(at(`/2d/w/${id}`)).toEqual({ kind: 'classroom', worldId: id })
    expect(canonicalWorldId('xyz')).toBeNull()
  })
})
