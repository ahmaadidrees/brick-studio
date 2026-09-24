import { describe, expect, it } from 'vitest'
import { joinDestination, parseJoinQuery, safeNext } from './joinQuery'
import { allGreen, passwordRules, usernameRules } from './joinRules'

describe('join query', () => {
  it('defaults to the join mode and upper-cases an invited code', () => {
    expect(parseJoinQuery('')).toEqual({ mode: 'join', classCode: '', next: '' })
    expect(parseJoinQuery('?classCode=room-42&mode=signin')).toEqual({ mode: 'signin', classCode: 'ROOM-42', next: '' })
    expect(parseJoinQuery('?mode=nonsense').mode).toBe('join')
  })

  it('keeps only same-app destinations', () => {
    expect(safeNext('/worlds')).toBe('/worlds')
    expect(safeNext('https://example.com')).toBe('')
    expect(safeNext('//example.com')).toBe('')
    expect(safeNext('/\\example.com')).toBe('')
    expect(safeNext(null)).toBe('')
  })

  it('sends students and teachers to their own home when no destination was asked for', () => {
    expect(joinDestination('student', '')).toBe('/worlds')
    expect(joinDestination('teacher', '')).toBe('/class')
    expect(joinDestination('teacher', '/build')).toBe('/build')
  })
})

describe('account rules', () => {
  it('reports each username rule separately', () => {
    expect(usernameRules('').every(rule => rule.state === 'pending')).toBe(true)
    expect(usernameRules('_ab').find(rule => rule.id === 'start')?.state).toBe('bad')
    expect(usernameRules('a b').find(rule => rule.id === 'spaces')?.state).toBe('bad')
    expect(usernameRules('ab').find(rule => rule.id === 'length')?.state).toBe('bad')
    expect(allGreen(usernameRules('sky_builder-2'))).toBe(true)
  })

  it('holds the guessable rule grey until length and username pass', () => {
    expect(passwordRules('123', 'sky').find(rule => rule.id === 'guessable')?.state).toBe('pending')
    expect(passwordRules('password', 'sky').find(rule => rule.id === 'guessable')?.state).toBe('bad')
    expect(passwordRules('sky_builder', 'sky_builder').find(rule => rule.id === 'username')?.state).toBe('bad')
    expect(allGreen(passwordRules('brick tower', 'sky_builder'))).toBe(true)
  })
})

it('returns a signed-in student to the same compact 2D classroom invite', () => {
  const next = '/2d/w/12345678123442348234123456789abc'
  const query = parseJoinQuery('?mode=signin&next=' + encodeURIComponent(next))
  expect(joinDestination('student', query.next)).toBe(next)
})
