import { expect, it } from 'vitest'
import { worldRoomHref } from './classPageData'

it('Open on the class page takes a Hackable project to its own game’s address', () => {
  expect(worldRoomHref({ id: 'w1', format: 'hackable' })).toBe('/2d/hackable?world=w1')
  expect(worldRoomHref({ id: 'w2', format: 'hackable', kit: 'race' })).toBe('/2d/hackable-race?world=w2')
  expect(worldRoomHref({ id: 'aaaa-bbbb', format: '2d', kit: 'race' })).toBe('/2d/w/aaaabbbb')
})
