import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LiveWorldPage, { classroomPresence, classroomWorldIdFromPath, invitesSentToast, legacyOwnerToken, sharedLookOnlyToast } from './LiveWorldPage'
import { ClassroomClient, type ClassroomAuth, type ClassroomWorld } from '../classroom/client'
import type { InviteSheetProps } from '../classroom/InviteSheet'
import { useBrickStore } from './store'
import { createBrickStudioDocument } from './brickDocument'
import { saveLiveWorldSeed, LIVE_WORLD_SEED_KEY } from './live/liveWorldSeed'
import { saveLocalBrickStudioProject, loadLocalBrickStudioProject } from './documentPersistence'
import * as persistence from './documentPersistence'
import { createInitialLiveRoomSnapshot, type ConnectLiveRoom } from './live/liveRoomModel'
vi.mock('./BrickStudioApp', () => ({ default: () => <div>Builder scene</div> }))
// Lane A owns the real sheet; the room is tested against its props contract.
vi.mock('../classroom/InviteSheet', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../classroom/InviteSheet')>()),
  InviteSheet: (props: InviteSheetProps) => (
    <div role="dialog" aria-modal="true" aria-label="Who do you want to build with?">
      <p>{props.className}</p>
      <p>{props.classmates === null ? 'Loading classmates' : props.classmates.map(mate => mate.displayName).join(', ')}</p>
      <button type="button" disabled={props.busy} onClick={() => props.onInvite({ visibility: 'members', canEdit: true, members: ['u-ben', 'u-cy'] })}>Invite Ben K. and Cy D. and build</button>
      <button type="button" onClick={props.onClose}>Close</button>
    </div>
  ),
}))
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
  // Signed-out visitors get a gate first (the id may be a classroom world or unknown), then the sign-in panel.
  expect(await screen.findByText('This world needs a class sign-in')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Sign in to my class' }))
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
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Guest Builder' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create shared world' }));
  await screen.findByText('Guest Builder');
  expect(createWorld).toHaveBeenCalledWith(expect.objectContaining({ profile: expect.objectContaining({ displayName: 'Guest Builder' }) }));
  expect(connectRoom).toHaveBeenCalledWith(expect.objectContaining({ roomId, ownerToken: 'a'.repeat(64) }));
});

it('lets a signed-out guest join a public room with a builder name', async () => {
  const connectRoom = guestConnector();
  const summary = vi.fn(async () => ({ roomId, mode: 'build' as const, title: 'Guest world', locked: false, playerCount: 1 }));
  render(<LiveWorldPage classroomClient={client()} initialLocation={{ pathname: `/live/${roomId}`, hash: '' }} connectRoom={connectRoom} fetchWorldSummary={summary} renderWorld={view => <div>{view.selfProfile.displayName}</div>} />);
  fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Friend' } });
  fireEvent.click(screen.getByRole('button', { name: 'Join world' }));
  await screen.findByText('Friend');
  expect(connectRoom).toHaveBeenCalledWith(expect.objectContaining({ roomId, profile: expect.objectContaining({ displayName: 'Friend' }) }));
  expect((connectRoom as ReturnType<typeof vi.fn>).mock.calls[0][0].ownerToken).toBeUndefined();
  expect(summary).toHaveBeenCalledOnce();
});

it('does not open a socket or reveal a guest gate when classroom preflight requires sign-in', async () => {
  const connectRoom = guestConnector();
  render(<LiveWorldPage classroomClient={client()} initialLocation={{ pathname: `/live/${roomId}`, hash: '#owner=' + 'b'.repeat(64) }} connectRoom={connectRoom} fetchWorldSummary={async () => { throw Object.assign(new Error('Sign in required'), { status: 401 }) }} />);
  // A signed-out visitor sees a calm gate first: the link may be a classroom world or a room that no longer exists.
  fireEvent.click(await screen.findByRole('button', { name: 'Sign in to my class' }));
  await screen.findByText('Keep building as a guest');
  expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
  expect(connectRoom).not.toHaveBeenCalled();
});


it('creates from the prepared document without replacing the separately saved guest build', async () => {
  const localDocument = createBrickStudioDocument([]);
  const seed = createBrickStudioDocument([], { environmentId: 'sky-island' });
  saveLocalBrickStudioProject(window.localStorage, localDocument);
  saveLiveWorldSeed(seed);
  const createWorld = vi.fn(async () => ({ roomId, ownerToken: 'c'.repeat(64) }));
  render(<LiveWorldPage classroomClient={client()} initialLocation={{ pathname: '/live/new', hash: '' }} createWorld={createWorld} connectRoom={guestConnector()} renderWorld={view => <div>{view.selfProfile.displayName}</div>} />);
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'Scene Builder' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create shared world' }));
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
    fireEvent.change(await screen.findByLabelText('Your name'), { target: { value: 'Friend' } });
    fireEvent.click(screen.getByRole('button', { name: 'Join world' }));
    fireEvent.click(await screen.findByRole('button', { name: /^People, \d+ here$/ }));
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

describe('build together in a classroom room', () => {
  const owner: ClassroomAuth = { ...auth, classes: [{ id: 'c1', name: 'Room 12', loginCode: 'ABC', enrollmentOpen: true, collaborationOpen: true, showNamesOnJoin: true, studentsCanShare: true, buildingNow: 0, teacherName: 'Ms. Idrees' }] }
  const ben = { id: 'u-ben', displayName: 'Ben K.' }
  const cy = { id: 'u-cy', displayName: 'Cy D.' }
  const castle: ClassroomWorld = { id, title: 'Castle', ownerId: owner.user.id, classId: null, kind: 'personal', revision: 3, updatedAt: '2026-09-21T09:00:00Z', visibility: 'members', canEdit: true, classCanEdit: true, ownerName: 'Alex', ownerClassId: 'c1', sharedAt: '2026-09-21T09:00:00Z', members: [ben] }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
  function ownerClient(world: ClassroomWorld | null = castle) {
    const calls: { path: string; method: string; body: unknown }[] = []
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      const path = url.slice(url.indexOf('/classroom') + '/classroom'.length)
      const method = init?.method ?? 'GET'
      calls.push({ path, method, body: init?.body ? JSON.parse(init.body as string) : undefined })
      if (path === '/me') return json({ user: owner.user, classes: owner.classes })
      if (path === `/worlds/${id}/sharing` && method === 'PATCH') {
        const sharing = JSON.parse(init!.body as string) as { visibility: ClassroomWorld['visibility']; canEdit: boolean }
        return json({ world: { ...castle, visibility: sharing.visibility, classCanEdit: sharing.canEdit, members: [ben, cy] } })
      }
      if (path === `/worlds/${id}`) return world ? json({ world }) : json({ error: 'Not found', code: 'not_found' }, 404)
      if (path === '/classes/c1/classmates') return json({ classmates: [ben, cy] })
      return json({ error: `Unexpected ${method} ${path}`, code: 'test' }, 500)
    })
    const c = new ClassroomClient('', fetcher as unknown as typeof fetch); c.setSession(owner)
    return { c, calls }
  }
  function ownerConnector(players: { playerId: string; isOwner: boolean; profile: { displayName: string } }[]) {
    const snapshot = { ...createInitialLiveRoomSnapshot(roomId, true), connection: 'online' as const, syncing: false, selfPlayerId: owner.user.id, document: createBrickStudioDocument([]), players }
    return vi.fn(() => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, disconnect: vi.fn(), actions: { setProfile: vi.fn(), setMode: vi.fn(), setLocked: vi.fn(), sendPose: vi.fn(), requestResync: vi.fn() } })) as unknown as ConnectLiveRoom
  }
  const summary = () => vi.fn().mockRejectedValueOnce(Object.assign(new Error('Sign in required'), { status: 401 })).mockResolvedValue({ roomId, mode: 'build', title: 'Castle', locked: false, playerCount: 1 })
  beforeEach(() => { useBrickStore.setState({ toast: null }); window.history.replaceState(null, '', '/') })

  it('toasts the invites on ?invited=1 arrival, names the audience from the world, and strips the flag', async () => {
    window.history.replaceState(null, '', `/live/${roomId}?invited=1`)
    const { c } = ownerClient()
    render(<LiveWorldPage classroomClient={c} initialLocation={{ pathname: `/live/${roomId}`, hash: '' }} connectRoom={ownerConnector([{ playerId: owner.user.id, isOwner: true, profile: { displayName: 'ActualName' } }])} fetchWorldSummary={summary()} renderWorld={view => <>{view.overlay}</>} />)
    await waitFor(() => expect(useBrickStore.getState().toast).toBe('Invites sent. Ben K. will find “Castle” on their Worlds page.'))
    expect(window.location.search).toBe('')
    expect(window.location.pathname).toBe(`/live/${roomId}`)
  })

  it('falls back to a generic line when the world cannot be read, and never toasts without the flag', async () => {
    window.history.replaceState(null, '', `/live/${roomId}?invited=1`)
    const { c } = ownerClient(null)
    render(<LiveWorldPage classroomClient={c} initialLocation={{ pathname: `/live/${roomId}`, hash: '' }} connectRoom={ownerConnector([])} fetchWorldSummary={summary()} renderWorld={view => <>{view.overlay}</>} />)
    await waitFor(() => expect(useBrickStore.getState().toast).toBe('Invites sent. They will find “Castle” on their Worlds page.'))
    cleanup()
    useBrickStore.setState({ toast: null })
    const { c: plain } = ownerClient()
    render(<LiveWorldPage classroomClient={plain} initialLocation={{ pathname: `/live/${roomId}`, hash: '' }} connectRoom={ownerConnector([])} fetchWorldSummary={summary()} renderWorld={view => <>{view.overlay}</>} />)
    await screen.findByRole('button', { name: /^People, 0 here/ })
    await act(async () => { await Promise.resolve() })
    expect(useBrickStore.getState().toast).toBeNull()
  })

  it('lets the owner of a personal world invite more classmates from the People panel without leaving the room', async () => {
    const { c, calls } = ownerClient()
    render(<LiveWorldPage classroomClient={c} initialLocation={{ pathname: `/live/${roomId}`, hash: '' }} connectRoom={ownerConnector([{ playerId: owner.user.id, isOwner: true, profile: { displayName: 'ActualName' } }, { playerId: 'u-ben', isOwner: false, profile: { displayName: 'ben.k' } }])} fetchWorldSummary={summary()} renderWorld={view => <>{view.overlay}<span data-testid="presence">{JSON.stringify(view.presence)}</span></>} />)
    // Presence copy uses the roster's display names and reaches the header's People chip.
    const people = await screen.findByRole('button', { name: 'People, 2 here. Building with Ben K.' })
    await waitFor(() => expect(screen.getByTestId('presence')).toHaveTextContent('{"building":["Ben K."],"waiting":[]}'))
    fireEvent.click(people)
    const panel = screen.getByRole('dialog', { name: 'Castle' })
    expect(panel).toHaveTextContent('Building with Ben K.')
    fireEvent.click(within(panel).getByRole('button', { name: 'Invite more' }))
    const sheet = await screen.findByRole('dialog', { name: 'Who do you want to build with?' })
    expect(sheet).toHaveTextContent('Room 12')
    await waitFor(() => expect(sheet).toHaveTextContent('Ben K., Cy D.'))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Invite Ben K. and Cy D. and build' }))
    await waitFor(() => expect(useBrickStore.getState().toast).toBe('Invites sent. Ben K. and Cy D. will find “Castle” on their Worlds page.'))
    expect(calls).toContainEqual({ path: `/worlds/${id}/sharing`, method: 'PATCH', body: { visibility: 'members', canEdit: true, members: ['u-ben', 'u-cy'] } })
    expect(screen.queryByRole('dialog', { name: 'Who do you want to build with?' })).not.toBeInTheDocument()
    // The refreshed roster now waits for Cy.
    await waitFor(() => expect(screen.getByTestId('presence')).toHaveTextContent('{"building":["Ben K."],"waiting":["Cy D."]}'))
    expect(window.location.pathname).toBe('/')
  })

  it('hides Invite more from guests of the room', async () => {
    const { c } = ownerClient({ ...castle, ownerId: 'someone-else' })
    const snapshot = { ...createInitialLiveRoomSnapshot(roomId, false), connection: 'online' as const, syncing: false, selfPlayerId: owner.user.id, document: createBrickStudioDocument([]), players: [{ playerId: owner.user.id, isOwner: false, profile: { displayName: 'ActualName' } }] }
    const connectRoom = vi.fn(() => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, disconnect: vi.fn(), actions: { setProfile: vi.fn(), setMode: vi.fn(), setLocked: vi.fn(), sendPose: vi.fn(), requestResync: vi.fn() } })) as unknown as ConnectLiveRoom
    render(<LiveWorldPage classroomClient={c} initialLocation={{ pathname: `/live/${roomId}`, hash: '' }} connectRoom={connectRoom} fetchWorldSummary={summary()} renderWorld={view => <>{view.overlay}</>} />)
    fireEvent.click(await screen.findByRole('button', { name: /^People, 1 here/ }))
    await act(async () => { await Promise.resolve() })
    expect(within(screen.getByRole('dialog', { name: 'Castle' })).queryByRole('button', { name: 'Invite more' })).not.toBeInTheDocument()
  })

  it('derives presence and invite copy from the world roster', () => {
    const self = owner.user.id
    const inRoom = (playerId: string, displayName: string) => ({ playerId, isOwner: playerId === self, profile: { displayName } })
    expect(classroomPresence(undefined, [inRoom(self, 'me')], self)).toBeUndefined()
    expect(classroomPresence({ visibility: 'private' }, [inRoom(self, 'me')], self)).toBeUndefined()
    expect(classroomPresence({ visibility: 'members', members: [ben, cy] }, [inRoom(self, 'me'), inRoom('u-ben', 'ben.k'), inRoom('guest', 'Dana')], self)).toEqual({ building: ['Ben K.', 'Dana'], waiting: ['Cy D.'] })
    expect(classroomPresence({ visibility: 'class' }, [inRoom(self, 'me'), inRoom('u-ben', 'ben.k')], self)).toEqual({ building: ['ben.k'], waiting: [] })
    expect(invitesSentToast({ title: 'Castle', visibility: 'class' }, 'Room')).toBe('Invites sent. The class will find “Castle” on their Worlds page.')
    expect(invitesSentToast({ title: '', visibility: 'members', members: [ben, cy, { id: 'u-d', displayName: 'Dee F.' }] }, 'Fallback')).toBe('Invites sent. Ben K., Cy D. and Dee F. will find “Fallback” on their Worlds page.')
    expect(sharedLookOnlyToast({ visibility: 'members', canEdit: false, members: ['u-ben'] }, [ben])).toBe('Shared with Ben K. They can look from their Worlds page.')
    expect(sharedLookOnlyToast({ visibility: 'class', canEdit: false }, [])).toBe('Shared with the class. They can look from their Worlds page.')
  })
})
