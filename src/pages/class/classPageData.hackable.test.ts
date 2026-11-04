import { expect, it } from 'vitest'
import { worldLookHref, worldRoomHref } from './classPageData'

it('the class page plays a Hackable project in its room, or looks inside it at its own game’s address', () => {
  expect(worldRoomHref({ id: 'w1', format: 'hackable' })).toBe('/2d/hackable/w/w1')
  expect(worldRoomHref({ id: 'w2', format: 'hackable', kit: 'race' })).toBe('/2d/hackable/w/w2')
  expect(worldLookHref({ id: 'w1' })).toBe('/2d/hackable?world=w1')
  expect(worldLookHref({ id: 'w2', kit: 'race' })).toBe('/2d/hackable-race?world=w2')
  expect(worldRoomHref({ id: 'aaaa-bbbb', format: '2d', kit: 'race' })).toBe('/2d/w/aaaabbbb')
})
