import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LiveWorldPage, { classroomWorldIdFromPath } from './LiveWorldPage'
import { ClassroomClient, type ClassroomAuth } from '../classroom/client'
import { createBrickStudioDocument } from './brickDocument'
import { createInitialLiveRoomSnapshot, type ConnectLiveRoom } from './live/liveRoomModel'
vi.mock('./BrickStudioApp', () => ({ default: () => <div>Builder scene</div> }))
const id = '00000000-0000-4000-8000-000000000001'
const roomId = id.replaceAll('-', '')
const auth: ClassroomAuth = { user: { id: '00000000-0000-4000-8000-000000000002', username: 'ActualName', rosterName: 'Alex', role: 'student', resetRequired: false }, classes: [], session: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 } }
const location = { pathname: `/live/${roomId}`, hash: '#owner=obsolete' }
beforeEach(() => sessionStorage.clear())
afterEach(cleanup)
function client() { return new ClassroomClient('', vi.fn(async () => new Response(JSON.stringify({ user: auth.user, classes: [] }))) as typeof fetch) }
it('requires account sign-in before reading or connecting to classroom worlds', () => {
  const connectRoom = vi.fn(); const fetchWorldSummary = vi.fn();
  render(<LiveWorldPage classroomClient={client()} initialLocation={location} connectRoom={connectRoom} fetchWorldSummary={fetchWorldSummary} />)
  expect(screen.getByText('Keep building as a guest')).toBeInTheDocument()
  expect(connectRoom).not.toHaveBeenCalled(); expect(fetchWorldSummary).not.toHaveBeenCalled()
})
it('requires password replacement before any multiplayer access', () => {
  const c = client(); c.setSession({ ...auth, user: { ...auth.user, resetRequired: true } });
  const connectRoom = vi.fn();
  render(<LiveWorldPage classroomClient={c} initialLocation={location} connectRoom={connectRoom} />)
  expect(screen.getByLabelText('New password')).toBeInTheDocument(); expect(connectRoom).not.toHaveBeenCalled()
})
it('uses the account username, ignores old owner links, and disconnects on sign-out', async () => {
  const c = client(); c.setSession(auth);
  const disconnect = vi.fn();
  const snapshot = { ...createInitialLiveRoomSnapshot(roomId, false), connection: 'online' as const, document: createBrickStudioDocument([]) };
  const connectRoom = vi.fn(() => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, disconnect, actions: { setProfile: vi.fn(), setMode: vi.fn(), setLocked: vi.fn(), sendPose: vi.fn(), requestResync: vi.fn() } })) as unknown as ConnectLiveRoom;
  render(<LiveWorldPage classroomClient={c} initialLocation={location} connectRoom={connectRoom} fetchWorldSummary={async () => ({ roomId, mode: 'build', title: 'Group', locked: false, playerCount: 0 })} renderWorld={view => <div>{view.selfProfile.displayName}</div>} />)
  await waitFor(() => expect(screen.getByText('ActualName')).toBeInTheDocument())
  expect(connectRoom).toHaveBeenCalledWith(expect.objectContaining({ roomId, profile: expect.objectContaining({ displayName: 'ActualName' }) }))
  expect((connectRoom as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toHaveProperty('ownerToken')
  act(() => c.setSession(null));
  expect(disconnect).toHaveBeenCalledOnce(); expect(screen.queryByText('ActualName')).not.toBeInTheDocument()
})
it('maps cloud IDs and rejects legacy room paths', () => {
  expect(classroomWorldIdFromPath(location.pathname)).toBe(id)
  expect(classroomWorldIdFromPath('/live/OLD123')).toBeNull()
})
