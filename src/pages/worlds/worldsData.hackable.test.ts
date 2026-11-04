import { expect, it } from 'vitest'
import { buildHref, canBuildTogether, canPlayTogether, invitedHref, liveHref, ownRoomHref } from './worldsData'

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

it('a Hackable 3D project opens at /3d/hackable everywhere, and has no room to play in yet (D3)', () => {
  const world = { id: 'w4', format: 'hackable' as const, kit: '3d' as const }
  expect(buildHref(world)).toBe('/3d/hackable?world=w4')
  // A classmate's opens to look inside (and make their own copy), not a room.
  expect(liveHref(world)).toBe('/3d/hackable?world=w4')
  expect(ownRoomHref(world)).toBe('/3d/hackable?world=w4')
  expect(invitedHref(world)).toBe('/3d/hackable?world=w4')
  expect(canPlayTogether(world)).toBe(false)
  expect(canBuildTogether(world)).toBe(false)
  expect(canPlayTogether({ format: 'hackable', kit: 'race' })).toBe(true)
  expect(canPlayTogether({ format: 'hackable' })).toBe(true)
  // A classic 3D build is still built together in its live room.
  expect(liveHref({ id: 'aaaa-bbbb', format: 'brick' })).toBe('/live/aaaabbbb')
  expect(buildHref({ id: 'w5', format: 'brick' })).toBe('/build?world=w5')
})
