import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ClassroomClient, type ClassroomAuth } from '../classroom/client'
import type { BrickStudioAppProps } from './BrickStudioApp'
import { createBrickStudioDocument } from './brickDocument'
import LiveWorldPage from './LiveWorldPage'
import { createFakeLiveRoomConnector } from './live/testing/fakeLiveRoomController'
import { useRemoteAvatars, type RemoteAvatarSource } from './remoteAvatarSource'

const renders = vi.hoisted(() => ({ editor: 0, avatars: 0 }))

// Keep the real page, session, and subscription hooks. Replacing WebGL with a
// probe lets us count editor work separately from the scene's avatar boundary.
vi.mock('./BrickStudioApp', () => ({
  default: (props: BrickStudioAppProps) => {
    renders.editor += 1
    return <>
      <div>Build tools</div>
      <output aria-label="Editor connection">{props.livePolicy?.connection}</output>
      <output aria-label="Editor environment">{props.contentPolicy?.environmentId}</output>
      <button onClick={() => props.raceScene?.onLocalAvatarPose?.({
        position: [3, 4, 5], facingYaw: 1, horizontalSpeed: 2, grounded: false,
      })}>Move my character</button>
      <AvatarProbe source={props.raceScene?.remoteAvatarSource} />
      {props.liveOverlay}
    </>
  },
}))

function AvatarProbe({ source }: { source?: RemoteAvatarSource }) {
  const avatars = useRemoteAvatars(source)
  renders.avatars += 1
  return <output aria-label="Remote characters">{avatars.map(avatar => `${avatar.name}:${avatar.position[0]}`).join(',')}</output>
}

const worldId = '00000000-0000-4000-8000-000000000001'
const roomId = worldId.replaceAll('-', '')
const auth: ClassroomAuth = {
  user: { id: '00000000-0000-4000-8000-000000000002', username: 'Alex', rosterName: 'Alex', role: 'student', resetRequired: false },
  classes: [], session: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 },
}
const self = { playerId: auth.user.id, isOwner: false, profile: { displayName: 'Alex' } }
const friend = { playerId: 'friend', isOwner: true, profile: { displayName: 'Sam' } }
const pose = { playerId: friend.playerId, x: 0, y: 2, z: 3, yaw: 0, moving: true, jumping: false, at: 1 }

beforeEach(() => {
  sessionStorage.clear()
  renders.editor = 0
  renders.avatars = 0
})
afterEach(cleanup)

async function openWorld() {
  const client = new ClassroomClient('', vi.fn(async () => new Response(JSON.stringify({ user: auth.user, classes: [] }))) as typeof fetch)
  client.setSession(auth)
  const connector = createFakeLiveRoomConnector({
    connection: 'online', syncing: false, document: createBrickStudioDocument([]),
    mode: 'explore', players: [self, friend], selfPlayerId: self.playerId, remotePoses: [pose],
  })
  render(<LiveWorldPage classroomClient={client} initialLocation={{ pathname: `/live/${roomId}`, hash: '' }}
    connectRoom={connector.connect}
    fetchWorldSummary={async () => ({ roomId, mode: 'explore', title: 'Our group', locked: false, playerCount: 2 })} />)
  await screen.findByText('Build tools')
  return { room: connector.rooms[0], client }
}

it('updates every remote movement without rerendering the editor and keeps local pose delivery working', async () => {
  const { room } = await openWorld()
  const before = { ...renders }
  for (let index = 1; index <= 60; index += 1) {
    act(() => room.emit({ remotePoses: [{ ...pose, x: index, at: index + 1 }] }))
    expect(screen.getByLabelText('Remote characters')).toHaveTextContent(`Sam:${index}`)
  }
  expect(renders.editor - before.editor).toBe(0)
  expect(renders.avatars - before.avatars).toBe(60)
  fireEvent.click(screen.getByRole('button', { name: 'Move my character' }))
  expect(room.calls.sendPose).toEqual([{ x: 3, y: 4, z: 5, yaw: 1, moving: true, jumping: true }])
})

it('refreshes names without a new pose and removes departing players immediately', async () => {
  const { room } = await openWorld()
  act(() => room.emit({ players: [self, { ...friend, profile: { displayName: 'Taylor' } }] }))
  expect(screen.getByLabelText('Remote characters')).toHaveTextContent('Taylor:0')
  // Even if poses have not been cleared yet, membership wins.
  act(() => room.emit({ players: [self] }))
  expect(screen.getByLabelText('Remote characters')).toBeEmptyDOMElement()
  expect(screen.getByRole('button', { name: 'People, 1 here' })).toBeInTheDocument()
})

it('still delivers reconnect, room admission, document changes and rejection notices to the editor', async () => {
  const { room } = await openWorld()
  act(() => room.emit({ remotePoses: [{ ...pose, x: 10 }], connection: 'reconnecting' }))
  expect(screen.getByLabelText('Editor connection')).toHaveTextContent('reconnecting')
  expect(screen.getByText('Reconnecting to the room')).toBeInTheDocument()
  act(() => room.emit({ connection: 'online', locked: true, mode: 'build' }))
  expect(screen.getByLabelText('Editor connection')).toHaveTextContent('online')
  fireEvent.click(screen.getByRole('button', { name: 'Room' }))
  expect(screen.getByText('New people cannot join right now.')).toBeInTheDocument()
  act(() => room.emit({ document: createBrickStudioDocument([], { environmentId: 'brick-valley' }), revision: 2 }))
  expect(screen.getByLabelText('Editor environment')).toHaveTextContent('brick-valley')
  act(() => room.emit({ notice: { seq: 1, code: 'edit_rejected', message: 'Another builder changed that brick.' } }))
  expect(screen.getByRole('alert')).toHaveTextContent('Another builder changed that brick.')
})

it.each(['access_changed', 'classroom_auth_required'])('immediately removes the editor on %s during avatar movement', async (code) => {
  const { room } = await openWorld()
  act(() => room.emit({
    remotePoses: [{ ...pose, x: 20 }],
    notice: { seq: 1, code, message: 'Ask your teacher to restore your access.' },
  }))
  expect(screen.getByText('Classroom access changed')).toBeInTheDocument()
  expect(screen.queryByText('Build tools')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Remote characters')).not.toBeInTheDocument()
})

it('disconnects and removes the scene on sign-out after receiving poses', async () => {
  const { room, client } = await openWorld()
  act(() => room.emit({ remotePoses: [{ ...pose, x: 30 }] }))
  act(() => client.setSession(null))
  await waitFor(() => expect(room.calls.disconnect).toBe(1))
  expect(screen.queryByText('Build tools')).not.toBeInTheDocument()
})
