import { expect, it } from 'vitest'
import { buildHref, liveHref } from './worldsData'

it('a Hackable project opens at its own game’s address: yours to build, a classmate’s to look at', () => {
  expect(buildHref({ id: 'w1', format: 'hackable' })).toBe('/2d/hackable?world=w1')
  expect(liveHref({ id: 'w1', format: 'hackable' })).toBe('/2d/hackable?world=w1')
  expect(buildHref({ id: 'w2', format: 'hackable', kit: 'race' })).toBe('/2d/hackable-race?world=w2')
  expect(liveHref({ id: 'w2', format: 'hackable', kit: 'race' })).toBe('/2d/hackable-race?world=w2')
  // A 2D race track (the older builder) is not a Hackable one.
  expect(buildHref({ id: 'w3', format: '2d', kit: 'race' })).toBe('/2d/build?world=w3')
})
