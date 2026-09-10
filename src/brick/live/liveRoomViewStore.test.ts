import { expect, it } from 'vitest'
import { createBrickStudioDocument } from '../brickDocument'
import { createLiveRoomViewStore } from './liveRoomViewStore'
import { createFakeLiveRoomConnector } from './testing/fakeLiveRoomController'

const player = { playerId: 'friend', isOwner: false, profile: { displayName: 'Sam' } }
const pose = { playerId: 'friend', x: 1, y: 2, z: 3, yaw: 0, at: 1, moving: false, jumping: false }

function roomView() {
  const connector = createFakeLiveRoomConnector({ players: [player], remotePoses: [pose], document: createBrickStudioDocument([]) })
  const controller = connector.connect({ roomId: 'room', profile: { displayName: 'Alex' } })
  return { view: createLiveRoomViewStore(controller), room: connector.rooms[0] }
}

it('returns cached snapshots between relevant changes for useSyncExternalStore', () => {
  const { view, room } = roomView()
  const firstRoom = view.getSnapshot()
  const firstAvatars = view.remoteAvatarSource.getSnapshot()
  expect(view.getSnapshot()).toBe(firstRoom)
  expect(view.remoteAvatarSource.getSnapshot()).toBe(firstAvatars)

  room.emit({ remotePoses: [{ ...pose, x: 10 }] })
  expect(view.getSnapshot()).toBe(firstRoom)
  const movedAvatars = view.remoteAvatarSource.getSnapshot()
  expect(movedAvatars).not.toBe(firstAvatars)
  expect(view.remoteAvatarSource.getSnapshot()).toBe(movedAvatars)

  room.emit({ notice: { seq: 1, code: 'access_changed', message: 'Access changed' } })
  const changedRoom = view.getSnapshot()
  expect(changedRoom).not.toBe(firstRoom)
  expect(changedRoom.notice?.code).toBe('access_changed')
  expect(view.getSnapshot()).toBe(changedRoom)
  expect(view.remoteAvatarSource.getSnapshot()).toBe(movedAvatars)
})

it('reads the latest pose when the avatar layer mounts after Build mode', () => {
  const { view, room } = roomView()
  view.getSnapshot()
  for (let x = 1; x <= 20; x += 1) room.emit({ remotePoses: [{ ...pose, x }] })
  expect(view.remoteAvatarSource.getSnapshot()[0].position).toEqual([20, 2, 3])
})

it('keeps simultaneous room sources isolated across sign-outs and world switches', () => {
  const first = roomView()
  const second = roomView()
  first.room.emit({ remotePoses: [{ ...pose, x: 20 }], notice: { seq: 1, code: 'access_changed', message: 'Access changed' } })
  expect(first.view.remoteAvatarSource.getSnapshot()[0].position[0]).toBe(20)
  expect(second.view.remoteAvatarSource.getSnapshot()[0].position[0]).toBe(1)
  expect(second.view.getSnapshot().notice).toBeNull()
})
