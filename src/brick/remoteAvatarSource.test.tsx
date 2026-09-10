import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { RemoteRaceAvatar } from './BrickStudioScene'
import { useRemoteAvatars } from './remoteAvatarSource'

afterEach(cleanup)

function AvatarProbe({ avatars }: { avatars?: RemoteRaceAvatar[] }) {
  const current = useRemoteAvatars(undefined, avatars)
  return <output>{current.map(avatar => `${avatar.id}:${avatar.position[0]}`).join(',')}</output>
}

it('preserves the original array-driven scene API without a live controller', () => {
  const avatar: RemoteRaceAvatar = { id: 'racer', color: '#fff', position: [1, 2, 3], facingYaw: 0, horizontalSpeed: 0, grounded: true }
  const { rerender } = render(<AvatarProbe avatars={[avatar]} />)
  expect(screen.getByRole('status')).toHaveTextContent('racer:1')
  rerender(<AvatarProbe avatars={[{ ...avatar, position: [10, 2, 3] }]} />)
  expect(screen.getByRole('status')).toHaveTextContent('racer:10')
  rerender(<AvatarProbe />)
  expect(screen.getByRole('status')).toBeEmptyDOMElement()
})
