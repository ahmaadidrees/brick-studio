import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { worldLookHref, worldRoomHref } from './classPageData'
import { WorldOpenButtons } from './WorldOpenButtons'

afterEach(cleanup)

it('the class page plays a Hackable project in its room, or looks inside it at its own game’s address', () => {
  expect(worldRoomHref({ id: 'w1', format: 'hackable' })).toBe('/2d/hackable/w/w1')
  expect(worldRoomHref({ id: 'w2', format: 'hackable', kit: 'race' })).toBe('/2d/hackable/w/w2')
  expect(worldLookHref({ id: 'w1' })).toBe('/2d/hackable?world=w1')
  expect(worldLookHref({ id: 'w2', kit: 'race' })).toBe('/2d/hackable-race?world=w2')
  expect(worldRoomHref({ id: 'aaaa-bbbb', format: '2d', kit: 'race' })).toBe('/2d/w/aaaabbbb')
})

it('a Hackable 3D project opens at /3d/hackable to look inside: it has no room yet (D3)', () => {
  expect(worldLookHref({ id: 'w3', kit: '3d' })).toBe('/3d/hackable?world=w3')
  expect(worldRoomHref({ id: 'w3', format: 'hackable', kit: '3d' })).toBe('/3d/hackable?world=w3')
  render(<WorldOpenButtons world={{ id: 'w3', title: 'Sky castle', format: 'hackable', kit: '3d' }} />)
  expect(screen.queryByRole('link', { name: 'Play Sky castle together' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Look inside Sky castle' })).toHaveAttribute('href', '/3d/hackable?world=w3')
  cleanup()
  render(<WorldOpenButtons world={{ id: 'w2', title: 'Ice Loop', format: 'hackable', kit: 'race' }} />)
  expect(screen.getByRole('link', { name: 'Play Ice Loop together' })).toHaveAttribute('href', '/2d/hackable/w/w2')
})
