import { expect, it } from 'vitest'
import { buildHref, invitedHref, liveHref, ownRoomHref } from './worldsData'

it('a Hackable project opens at its own game’s address to change or look inside, and is played in its room', () => {
  expect(buildHref({ id: 'w1', format: 'hackable' })).toBe('/2d/hackable?world=w1')
  expect(buildHref({ id: 'w2', format: 'hackable', kit: 'race' })).toBe('/2d/hackable-race?world=w2')
  // Classmates join its room; the owner opens it in the studio with the room open.
  expect(liveHref({ id: 'w1', format: 'hackable' })).toBe('/2d/hackable/w/w1')
  expect(ownRoomHref({ id: 'w2', format: 'hackable', kit: 'race' })).toBe('/2d/hackable-race?world=w2&together=1')
  expect(invitedHref({ id: 'w2', format: 'hackable', kit: 'race' })).toBe('/2d/hackable-race?world=w2&together=1')
  // A 2D race track (the older builder) is not a Hackable one.
  expect(buildHref({ id: 'w3', format: '2d', kit: 'race' })).toBe('/2d/build?world=w3')
})
