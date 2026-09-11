import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import LiveWorldPage, { classroomWorldIdFromPath, legacyOwnerToken } from './LiveWorldPage'
import { ClassroomClient, type ClassroomAuth } from '../classroom/client'
import { createBrickStudioDocument } from './brickDocument'
import { saveLiveWorldSeed, LIVE_WORLD_SEED_KEY } from './live/liveWorldSeed'
import { saveLocalBrickStudioProject, loadLocalBrickStudioProject } from './documentPersistence'
import * as persistence from './documentPersistence'
import { createInitialLiveRoomSnapshot, type ConnectLiveRoom } from './live/liveRoomModel'
vi.mock('./BrickStudioApp', () => ({ default: () => <div>Builder scene</div> }))
const id = '00000000-0000-4000-8000-000000000001'
const roomId = id.replaceAll('-', '')
const auth: ClassroomAuth = { user: { id: '00000000-0000-4000-8000-000000000002', username: 'ActualName', rosterName: 'Alex', role: 'student', resetRequired: false }, classes: [], session: { accessToken: 'token', refreshToken: 'refresh', expiresIn: 3600 } }
const location = { pathname: `/live/${roomId}`, hash: '#owner=obsolete' }
beforeEach(() => { sessionStorage.clear(); window.localStorage.clear() })
afterEach(cleanup)
function client() { return new ClassroomClient('', vi.fn(async () => new Response(JSON.stringify({ user: auth.user, classes: [] }))) as typeof fetch) }
it('requires account sign-in before connecting to a protected classroom world', async () => {
  const connectRoom = vi.fn(); const fetchWorldSummary = vi.fn(async () => { throw Object.assign(new Error('Sign in required'), { status: 401 }) });
  render(<LiveWorldPage classroomClient={client()} initialLocation={location} connectRoom={connectRoom} fetchWorldSummary={fetchWorldSummary} />)
  expect(await screen.findByText('Keep building as a guest')).toBeInTheDocument()
  expect(connectRoom).not.toHaveBeenCalled(); expect(fetchWorldSummary).toHaveBeenCalledOnce()
})
it('requires password replacement before classroom multiplayer access', async () => {
  const c = client(); c.setSession({ ...auth, user: { ...auth.user, resetRequired: true } });
  const connectRoom = vi.fn();
  render(<LiveWorldPage classroomClient={c} initialLocation={location} connectRoom={connectRoom} fetchWorldSummary={async () => { throw Object.assign(new Error('Sign in required'), { status: 401 }) }} />)
  expect(await screen.findByLabelText('New password')).toBeInTheDocument(); expect(connectRoom).not.toHaveBeenCalled()
})
it('uses the account username, ignores old owner links, and disconnects on sign-out', async () => {
  const c = client(); c.setSession(auth);
  const disconnect = vi.fn();
  const snapshot = { ...createInitialLiveRoomSnapshot(roomId, false), connection: 'online' as const, document: createBrickStudioDocument([]) };
  const connectRoom = vi.fn(() => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, disconnect, actions: { setProfile: vi.fn(), setMode: vi.fn(), setLocked: vi.fn(), sendPose: vi.fn(), requestResync: vi.fn() } })) as unknown as ConnectLiveRoom;
  render(<LiveWorldPage classroomClient={c} initialLocation={location} connectRoom={connectRoom} fetchWorldSummary={vi.fn().mockRejectedValueOnce(Object.assign(new Error('Sign in required'), { status: 401 })).mockResolvedValue({ roomId, mode: 'build', title: 'Group', locked: false, playerCount: 0 })} renderWorld={view => <div>{view.selfProfile.displayName}</div>} />)
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

it('recognizes only well-formed owner capabilities from actual legacy owner links', () => {
  expect(legacyOwnerToken(location.pathname, '#owner=' + 'a'.repeat(64))).toBe('a'.repeat(64))
  expect(legacyOwnerToken(location.pathname, '#owner=malformed')).toBeNull()
  expect(legacyOwnerToken('/live/invalid', '#owner=' + 'a'.repeat(64))).toBeNull()
  expect(legacyOwnerToken(location.pathname, '#unrelated=' + 'a'.repeat(64))).toBeNull()
})
it('offers authenticated missing legacy-owner recovery and preserves account-bound resume', async () => {
  const personalId = '00000000-0000-4000-8000-000000000099'
  const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith('/me') ? { user: auth.user, classes: [] } : { world: { id: personalId, ownerId: auth.user.id, kind: 'personal' } })))
  const c = new ClassroomClient('', fetcher as typeof fetch); c.setSession(auth)
  const connectRoom = vi.fn()
  render(<LiveWorldPage classroomClient={c} initialLocation={{ ...location, hash: '#owner=' + 'a'.repeat(64) }} connectRoom={connectRoom} fetchWorldSummary={async () => { throw Object.assign(new Error('World not found'), { status: 404 }) }} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Save older world to My Worlds' }))
  await waitFor(() => expect(JSON.parse(sessionStorage.getItem('brick-studio.active-cloud-world.v1')!)).toEqual({ userId: auth.user.id, worldId: personalId }))
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining(`/legacy-worlds/${roomId}/import`), expect.objectContaining({ method: 'POST', body: JSON.stringify({ ownerToken: 'a'.repeat(64) }) }))
  expect(connectRoom).not.toHaveBeenCalled()
})
it('does not offer recovery for a malformed owner token', async () => {
  const c = client(); c.setSession(auth)
  render(<LiveWorldPage classroomClient={c} initialLocation={location} fetchWorldSummary={async () => { throw Object.assign(new Error('World not found'), { status: 404 }) }} />)
  await screen.findByText('Cannot open this world')
  expect(screen.queryByRole('button', { name: 'Save older world to My Worlds' })).not.toBeInTheDocument()
})


function guestConnector() {
  const snapshot = { ...createInitialLiveRoomSnapshot(roomId, false), connection: 'online' as const, document: createBrickStudioDocument([]) };
  return vi.fn(() => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, disconnect: vi.fn(), actions: { setProfile: vi.fn(), setMode: vi.fn(), setLocked: vi.fn(), sendPose: vi.fn(), requestResync: vi.fn() } })) as unknown as ConnectLiveRoom;
}

it('creates a live room without an account and gives the creator the owner capability', async () => {
  const createWorld = vi.fn(async () => ({ roomId, ownerToken: 'a'.repeat(64) }));
  const connectRoom = guestConnector();
  render(<LiveWorldPage classroomClient={client()} initialLocation={{ pathname: '/live/new', hash: '' }} createWorld={createWorld} connectRoom={connectRoom} renderWorld={view => <div>{view.selfProfile.displayName}</div>} />);
  fireEvent.change(screen.getByLabelText('Your builder name'), { target: { value: 'Guest Builder' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create my live room' }));
  await screen.findByText('Guest Builder');
  expect(createWorld).toHaveBeenCalledWith(expect.objectContaining({ profile: expect.objectContaining({ displayName: 'Guest Builder' }) }));
  expect(connectRoom).toHaveBeenCalledWith(expect.objectContaining({ roomId, ownerToken: 'a'.repeat(64) }));
});

it('lets a signed-out guest join a public room with a builder name', async () => {
  const connectRoom = guestConnector();
  const summary = vi.fn(async () => ({ roomId, mode: 'build' as const, title: 'Guest world', locked: false, playerCount: 1 }));
  render(<LiveWorldPage classroomClient={client()} initialLocation={{ pathname: `/live/${roomId}`, hash: '' }} connectRoom={connectRoom} fetchWorldSummary={summary} renderWorld={view => <div>{view.selfProfile.displayName}</div>} />);
  fireEvent.change(await screen.findByLabelText('Your builder name'), { target: { value: 'Friend' } });
  fireEvent.click(screen.getByRole('button', { name: 'Join the room' }));
  await screen.findByText('Friend');
  expect(connectRoom).toHaveBeenCalledWith(expect.objectContaining({ roomId, profile: expect.objectContaining({ displayName: 'Friend' }) }));
  expect((connectRoom as ReturnType<typeof vi.fn>).mock.calls[0][0].ownerToken).toBeUndefined();
  expect(summary).toHaveBeenCalledOnce();
});

it('does not open a socket or reveal a guest gate when classroom preflight requires sign-in', async () => {
  const connectRoom = guestConnector();
  render(<LiveWorldPage classroomClient={client()} initialLocation={{ pathname: `/live/${roomId}`, hash: '#owner=' + 'b'.repeat(64) }} connectRoom={connectRoom} fetchWorldSummary={async () => { throw Object.assign(new Error('Sign in required'), { status: 401 }) }} />);
  await screen.findByText('Keep building as a guest');
  expect(screen.queryByLabelText('Your builder name')).not.toBeInTheDocument();
  expect(connectRoom).not.toHaveBeenCalled();
});


it('creates from the prepared document without replacing the separately saved guest build', async () => {
  const localDocument = createBrickStudioDocument([]);
  const seed = createBrickStudioDocument([], { environmentId: 'sky-island' });
  saveLocalBrickStudioProject(window.localStorage, localDocument);
  saveLiveWorldSeed(seed);
  const createWorld = vi.fn(async () => ({ roomId, ownerToken: 'c'.repeat(64) }));
  render(<LiveWorldPage classroomClient={client()} initialLocation={{ pathname: '/live/new', hash: '' }} createWorld={createWorld} connectRoom={guestConnector()} renderWorld={view => <div>{view.selfProfile.displayName}</div>} />);
  fireEvent.change(screen.getByLabelText('Your builder name'), { target: { value: 'Scene Builder' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create my live room' }));
  await screen.findByText('Scene Builder');
  expect(createWorld).toHaveBeenCalledWith(expect.objectContaining({ document: seed }));
  expect(loadLocalBrickStudioProject(window.localStorage)).toEqual({ ok: true, document: localDocument });
  expect(sessionStorage.getItem(LIVE_WORLD_SEED_KEY)).toBeNull();
});

it('exports a guest room snapshot without overwriting the separately saved local build', async () => {
  const localDocument = createBrickStudioDocument([], { environmentId: 'sky-island' });
  saveLocalBrickStudioProject(window.localStorage, localDocument);
  const download = vi.spyOn(persistence, 'downloadBrickStudioDocument').mockReturnValue({ ok: true });
  try {
    render(<LiveWorldPage classroomClient={client()} initialLocation={{ pathname: `/live/${roomId}`, hash: '' }}
      connectRoom={guestConnector()} fetchWorldSummary={async () => ({ roomId, mode: 'build', title: 'Guest world', locked: false, playerCount: 1 })}
      renderWorld={view => <>{view.overlay}</>} />);
    fireEvent.change(await screen.findByLabelText('Your builder name'), { target: { value: 'Friend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join the room' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Share' }));
    fireEvent.click(screen.getByRole('button', { name: 'Export copy' }));
    await waitFor(() => expect(download).toHaveBeenCalledWith(createBrickStudioDocument([])));
    expect(loadLocalBrickStudioProject(window.localStorage)).toEqual({ ok: true, document: localDocument });
  } finally {
    download.mockRestore();
  }
});

it('allows explicit classroom rejoin when the first connection was replaced before a document loaded', async () => {
  const c = client(); c.setSession(auth);
  const reconnect = vi.fn();
  const snapshot = { ...createInitialLiveRoomSnapshot(roomId, false), connection: 'offline' as const,
    notice: { seq: 1, code: 'session_replaced', message: 'This room is open in another tab or device.' } };
  const connectRoom: ConnectLiveRoom = () => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, disconnect: vi.fn(),
    actions: { setProfile: vi.fn(), setMode: vi.fn(), setLocked: vi.fn(), sendPose: vi.fn(), requestResync: vi.fn(), reconnect } });
  render(<LiveWorldPage classroomClient={c} initialLocation={location} connectRoom={connectRoom}
    fetchWorldSummary={vi.fn().mockRejectedValueOnce(Object.assign(new Error('Sign in required'), { status: 401 })).mockResolvedValue({ roomId, mode: 'build', title: 'Group', locked: false, playerCount: 0 })} />);
  expect(await screen.findByText('Paused here')).toBeInTheDocument();
  expect(reconnect).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Rejoin here' }));
  expect(reconnect).toHaveBeenCalledOnce();
});
