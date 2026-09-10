import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import BrickStudioApp from './BrickStudioApp'
import type { RaceAvatarPose, RemoteRaceAvatar } from './BrickStudioScene'
import { createBrickStudioDocument, type BrickStudioDocument } from './brickDocument'
import { LIVE_MAX_PLAYERS, type LiveWorldMode } from './liveProtocol'
import { createLiveRoomClient, getLiveWorld, hasSavedLiveRoomIdentity } from './liveRoomClient'
import { browserClassroomClient, type ClassroomClient, type ClassroomAuth, type ClassroomWorld } from '../classroom/client'
import { ClassroomPanel } from '../classroom/ClassroomPanel'
import { createLiveRoomConnector, defaultConnectLiveRoom } from './live/liveRoomConnector'
import type { PlayerProfile } from './types'
import { LiveWorldHud } from './live/LiveWorldHud'
import { liveGuestLink, livePlayerColor, parseLiveWorldLocation, type ConnectLiveRoom, type LiveRoomActions, type LiveRoomSnapshot } from './live/liveRoomModel'
import { createLiveWorldRoom, fetchLiveWorldSummary, LiveWorldGatewayError, type CreateLiveWorld, type FetchLiveWorldSummary, type LiveWorldSummary } from './live/liveWorldGateway'
import { LiveWorldGate, type LiveWorldGateSubmit } from './live/LiveWorldGate'
import { LiveStatusChip } from './live/LiveStatusChip'
import { CopyInviteButton } from './live/CopyInviteButton'
import { liveProfileWithDisplayName, normalizeLiveProfile, loadStoredLiveProfile, saveStoredLiveProfile } from './live/liveProfile'
import { liveOwnerLocation } from './live/liveRoomModel'
import { saveLocalBrickStudioProject } from './documentPersistence'
import { loadLiveWorldSeed, LIVE_WORLD_SEED_KEY } from './live/liveWorldSeed'
import { useLiveRoomSession } from './live/useLiveRoomSession'
import { resolveCharacterId } from './contentCatalog'
import { loadCharacterPreferences } from './contentPreferences'
import type { ContentPickerSelection } from './contentPicker'
import { useBrickStore } from './store'
import { registerCustomParts } from './parts'
import './live/live-world.css'

export type LiveWorldSnapshotExport = { title: string; document: BrickStudioDocument }

export type LiveWorldSceneView = {
  roomTitle: string
  document: BrickStudioDocument
  mode: LiveWorldMode
  revision: number
  /** Current local identity and the one mutation path that persists and broadcasts it. */
  selfProfile: PlayerProfile
  setProfile: (profile: PlayerProfile) => void
  /** The HUD; whatever renders the scene must layer this on top. */
  overlay: ReactNode
}

export type LiveWorldPageProps = {
  classroomClient?: ClassroomClient;
  createWorld?: CreateLiveWorld
  fetchWorldSummary?: FetchLiveWorldSummary
  /** The realtime client seam. Defaults to `defaultConnectLiveRoom` until the liveRoomClient lane lands. */
  connectRoom?: ConnectLiveRoom
  /** Replace the default read-only scene with a live-synced one; receives the HUD as `view.overlay`. */
  renderWorld?: (view: LiveWorldSceneView) => ReactNode
  /** Publish the current room through the existing share-link format. Resolves to a user-facing status message. */
  publishWorld?: (world: LiveWorldSnapshotExport) => Promise<string>
  /** Save a remixable copy of the current room for this participant. Resolves to a user-facing status message. */
  remixWorld?: (world: LiveWorldSnapshotExport) => Promise<string>
  /** Ending a room has no frozen wire message yet; provide this to surface an owner-only End room control. */
  onEndRoom?: () => void
  copyText?: (text: string) => Promise<boolean>
  /** Route override for tests; defaults to `window.location`. */
  initialLocation?: { pathname: string; hash: string }
}

async function defaultCopyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function friendlyReason(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message
  return 'Something went wrong. Please try again.'
}

/**
 * Default live scene. The transport owns the Brick Studio store while this is
 * mounted, so document persistence is disabled and every local edit flows
 * through the authoritative room client.
 */
function DefaultLiveWorldScene({
  view,
  snapshot,
  actions,
}: {
  view: LiveWorldSceneView
  snapshot: LiveRoomSnapshot
  actions: LiveRoomActions
}) {
  // The scene and store share the runtime part map, so install the authoritative
  // document definitions before rendering any custom-part meshes or controls.
  registerCustomParts(view.document.customParts)
  const sendPose = useCallback((pose: RaceAvatarPose) => {
    actions.sendPose({
      x: pose.position[0],
      y: pose.position[1],
      z: pose.position[2],
      yaw: pose.facingYaw,
      moving: pose.horizontalSpeed > 0.1,
      jumping: !pose.grounded,
    })
  }, [actions])
  const remoteAvatars = useMemo<RemoteRaceAvatar[]>(() => snapshot.remotePoses.map((pose) => {
    const player = snapshot.players.find((candidate) => candidate.playerId === pose.playerId)
    return {
      id: pose.playerId,
      name: player?.profile.displayName || 'Builder',
      color: livePlayerColor(pose.playerId),
      characterId: resolveCharacterId(player?.profile.characterId),
      palette: player?.profile.palette,
      position: [pose.x, pose.y, pose.z],
      facingYaw: pose.yaw,
      horizontalSpeed: pose.moving ? 1 : 0,
      grounded: !pose.jumping,
    }
  }), [snapshot.players, snapshot.remotePoses])
  const livePolicy = useMemo(() => ({
    connection: snapshot.connection,
    isOwner: snapshot.isOwner,
    onRequestMode: actions.setMode,
  }), [actions.setMode, snapshot.connection, snapshot.isOwner])
  const contentPolicy = useMemo(() => ({
    environmentId: view.document.environmentId,
    characterId: view.selfProfile.characterId,
    palette: view.selfProfile.palette,
    canChangeEnvironment: snapshot.isOwner
      && snapshot.connection === 'online'
      && snapshot.mode === 'build'
      && Boolean(actions.replaceDocument),
    environmentHelp: snapshot.isOwner
      ? 'Switch everyone to Build before changing the shared environment. You can still customize your character now.'
      : 'Choose your character and colors. The room owner controls the shared environment.',
    onApply: (selection: ContentPickerSelection) => {
      view.setProfile({
        ...view.selfProfile,
        characterId: selection.characterId ?? 'classic',
        palette: { ...selection.palette },
      })
      if (
        selection.environmentId
        && selection.environmentId !== view.document.environmentId
        && snapshot.isOwner
      ) {
        const opId = actions.replaceDocument?.({
          ...view.document,
          environmentId: selection.environmentId,
        })
        if (!opId) {
          useBrickStore.setState({ toast: 'The shared world is still reconnecting. Try the environment change again.' })
        }
      }
    },
  }), [actions, snapshot.connection, snapshot.isOwner, snapshot.mode, view])
  const customPartPolicy = useMemo(() => {
    const canEdit = snapshot.isOwner
      && snapshot.connection === 'online'
      && snapshot.mode === 'build'
      && Boolean(actions.replaceDocument)
    return {
      customParts: view.document.customParts,
      canEdit,
      help: snapshot.isOwner
        ? 'Switch everyone to Build and wait for sync before changing the shared brick library.'
        : 'The room owner controls custom brick shapes so every builder stays in sync.',
      onReplaceDocument: (next: { bricks: BrickStudioDocument['bricks']; customParts: BrickStudioDocument['customParts'] }) => {
        if (!canEdit) return false
        try {
          return Boolean(actions.replaceDocument?.(createBrickStudioDocument(next.bricks, {
            environmentId: view.document.environmentId,
            customParts: next.customParts,
          })))
        } catch {
          return false
        }
      },
    }
  }, [actions, snapshot.connection, snapshot.isOwner, snapshot.mode, view.document])
  return (
    <BrickStudioApp
      raceScene={{ onLocalAvatarPose: sendPose, remoteAvatars }}
      livePolicy={livePolicy}
      liveOverlay={view.overlay}
      contentPolicy={contentPolicy}
      customPartPolicy={customPartPolicy}
    />
  )
}

function BlockedView({ heading, message, onRetry }: { heading: string; message: string; onRetry?: () => void }) {
  return (
    <main className="live-world-page">
      <section className="live-gate-card live-blocked-card">
        <span className="live-eyebrow">Live rooms</span>
        <h1>{heading}</h1>
        <p>{message}</p>
        {onRetry && <button className="live-primary-button" type="button" onClick={onRetry}>Try again</button>}
        <a className="live-quiet-link" href="/">Open Brick Studio</a>
      </section>
    </main>
  )
}

export function classroomWorldIdFromPath(pathname: string): string | null {
  const id = /^\/live\/([a-f0-9]{32})\/?$/i.exec(pathname)?.[1];
  return id ? `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`.toLowerCase() : null;
}

export function legacyOwnerToken(pathname: string, hash: string): string | null {
  const parsed = parseLiveWorldLocation(pathname, hash);
  return parsed.kind === 'join' && classroomWorldIdFromPath(pathname) && /^[a-f0-9]{64}$/i.test(parsed.ownerToken ?? '') ? parsed.ownerToken! : null;
}

export default function LiveWorldPage(props: LiveWorldPageProps = {}) {
  const client = props.classroomClient ?? browserClassroomClient;
  const auth = useSyncExternalStore(client.subscribe, client.getSession);
  const [pathname] = useState(() => props.initialLocation?.pathname ?? window.location.pathname);
  const parsed = parseLiveWorldLocation(pathname, props.initialLocation?.hash ?? window.location.hash);
  const [access, setAccess] = useState<'checking' | 'guest' | 'classroom' | 'error'>('checking');
  const [summary, setSummary] = useState<LiveWorldSummary | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const fetchSummary = props.fetchWorldSummary ?? fetchLiveWorldSummary;
  useEffect(() => {
    if (parsed.kind !== 'join') return;
    let active = true;
    setAccess('checking');
    void fetchSummary(parsed.roomId).then(value => {
      if (!active) return;
      setSummary(value); setAccess('guest');
    }).catch(reason => {
      if (!active) return;
      // Only the server decides whether this is a classroom world. Guest room
      // capabilities never bypass the classroom ticket or membership checks.
      if (reason?.status === 401 || reason?.status === 403 || (reason?.status === 404 && auth && legacyOwnerToken(pathname, props.initialLocation?.hash ?? window.location.hash))) setAccess('classroom');
      else { setError(friendlyReason(reason)); setAccess('error'); }
    });
    return () => { active = false; };
  }, [pathname, fetchSummary, retry]); // Account changes must not remount a guest session.
  if (parsed.kind === 'create') return <GuestLiveWorld {...props} />;
  if (parsed.kind === 'invalid') return <BlockedView heading="This live link is not quite right" message="Ask the room owner to copy the invite link again." />;
  if (access === 'checking') return <BlockedView heading="Checking this room…" message="One moment while we look up the invite." />;
  if (access === 'error') return <BlockedView heading="Cannot open this world" message={error} onRetry={() => setRetry(n => n + 1)} />;
  if (access === 'guest' && summary) return <GuestLiveWorld {...props} initialSummary={summary} />;
  const worldId = classroomWorldIdFromPath(pathname);
  if (!auth || auth.user.resetRequired) {
    return <ClassroomPanel client={client} intent="class" getDocument={() => useBrickStore.getState().getDocumentSnapshot()}
      onClose={() => window.location.assign('/')}
      onOpenWorld={() => window.location.assign('/')}
      onJoinWorld={world => window.location.assign(`/live/${world.id.replaceAll('-', '')}`)} />;
  }
  if (!worldId) return <BlockedView heading="Open this world from My Class" message="Your classroom worlds are listed in Brick Studio." />;
  return <AuthenticatedLiveWorld key={auth.user.id} {...props} auth={auth} client={client} worldId={worldId} />;
}

function AuthenticatedLiveWorld({ auth, client, worldId, ...props }: LiveWorldPageProps & { auth: ClassroomAuth; client: ClassroomClient; worldId: string }) {
  const roomId = worldId.replaceAll('-', '');
  const [title, setTitle] = useState('Classroom world');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [canRecover, setCanRecover] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const oldOwnerToken = legacyOwnerToken(props.initialLocation?.pathname ?? window.location.pathname, props.initialLocation?.hash ?? window.location.hash);
  const [appearance, setAppearance] = useState(() => loadCharacterPreferences());
  const profile = useMemo<PlayerProfile>(() => ({ displayName: auth.user.username, characterId: appearance.characterId, palette: appearance.palette }), [auth.user.username, appearance]);
  const connectRoom = useMemo(() => props.connectRoom ?? createLiveRoomConnector(options => createLiveRoomClient({
    ...options, clientId: auth.user.id, identityStorage: null,
    getTicket: async () => {
      if (client.getSession()?.user.id !== auth.user.id) throw new Error('Account changed');
      const result = await client.request<{ ticket: string }>(`/worlds/${worldId}/live-ticket`, 'POST');
      if (client.getSession()?.user.id !== auth.user.id) throw new Error('Account changed');
      return result.ticket;
    },
  })), [props.connectRoom, auth.user.id, client, worldId]);
  useEffect(() => {
    let active = true;
    setReady(false); setError(''); setCanRecover(false);
    let checkingWorld = false;
    void (async () => {
      // Refresh expired credentials through the account client before preflight.
      const me = await client.request<{ user: ClassroomAuth['user']; classes: ClassroomAuth['classes'] }>('/me');
      const session = client.getSession();
      if (!active || !session || session.user.id !== auth.user.id) return;
      if (me.user.resetRequired) { client.setSession({ ...session, ...me }); return; }
      checkingWorld = true;
      const summary = props.fetchWorldSummary
        ? await props.fetchWorldSummary(roomId)
        : await getLiveWorld(roomId, { headers: { Authorization: `Bearer ${session.session.accessToken}` } });
      if (active) { setTitle(summary.title || 'Classroom world'); setReady(true); }
    })().catch(reason => { if (active) { setError(friendlyReason(reason)); setCanRecover(Boolean(checkingWorld && oldOwnerToken && reason?.status === 404)); } });
    return () => { active = false; };
  }, [auth.user.id, client, roomId, props.fetchWorldSummary, retry]);
  const session = useLiveRoomSession({ connectRoom, roomId: ready ? roomId : null, profile: ready ? profile : null });
  if (error && canRecover) return <main className="live-world-page"><section className="live-gate-card live-blocked-card">
    <h1>Bring this older world into My Worlds</h1>
    <p>Your owner link can recover this build into your account if the older room is still available.</p>
    <button className="live-primary-button" type="button" disabled={recovering} onClick={async () => {
      if (recovering || !oldOwnerToken) return;
      setRecovering(true); setRecoveryError('');
      try {
        const result = await client.request<{ world: ClassroomWorld }>(`/legacy-worlds/${roomId}/import`, 'POST', { ownerToken: oldOwnerToken });
        if (client.getSession()?.user.id !== auth.user.id) throw new Error('Your account changed. Reopen My Worlds in the correct account.');
        sessionStorage.setItem('brick-studio.active-cloud-world.v1', JSON.stringify({ userId: auth.user.id, worldId: result.world.id }));
        window.location.replace('/');
      } catch (reason) { setRecoveryError(`Could not recover this older world. ${friendlyReason(reason)}`); }
      finally { setRecovering(false); }
    }}>{recovering ? 'Saving older world…' : 'Save older world to My Worlds'}</button>
    {recoveryError && <p role="alert">{recoveryError}</p>}
    <a className="live-quiet-link" href="/">Open Brick Studio</a>
  </section></main>;
  if (error) return <BlockedView heading="Cannot open this classroom world" message={error} onRetry={() => setRetry(n => n + 1)} />;
  if (!ready || session.status !== 'active') return <BlockedView heading="Opening your classroom world…" message="Checking your class access and saved work." />;
  const snapshot = session.snapshot;
  if (snapshot.notice?.code === 'access_changed' || snapshot.notice?.code === 'classroom_auth_required') {
    return <BlockedView heading="Classroom access changed" message={snapshot.notice.message} onRetry={() => window.location.reload()} />;
  }
  if (!snapshot.document) return <BlockedView heading={`Opening ${title}…`} message={snapshot.notice?.message || 'Connecting to your classmates.'} />;
  const setProfile = (next: PlayerProfile) => {
    const safe = { ...next, displayName: auth.user.username };
    setAppearance({ characterId: resolveCharacterId(safe.characterId), palette: safe.palette ?? {} });
    session.actions.setProfile(safe);
  };
  const actions = { ...session.actions, setProfile };
  const overlay = <LiveWorldHud snapshot={snapshot} roomTitle={title}
    shareLink={liveGuestLink(window.location.origin, roomId)} copyText={props.copyText ?? defaultCopyText}
    editingIntegrated actions={actions} onLeave={() => window.location.assign('/')} />;
  const view: LiveWorldSceneView = { roomTitle: title, document: snapshot.document, mode: snapshot.mode, revision: snapshot.revision, selfProfile: profile, setProfile, overlay };
  return props.renderWorld ? <>{props.renderWorld(view)}</> : <DefaultLiveWorldScene view={view} snapshot={snapshot} actions={actions} />;
}

type RoomHandle = { roomId: string; ownerToken?: string; title: string }
type PreflightState =
  | { status: 'loading' }
  | { status: 'ready'; summary: LiveWorldSummary }
  | { status: 'blocked'; heading: string; message: string; canRetry: boolean }
const FALLBACK_ROOM_TITLE = 'Live build room'

function GuestLiveWorld(props: LiveWorldPageProps & { initialSummary?: LiveWorldSummary }) {
  const createWorld = props.createWorld ?? createLiveWorldRoom
  const fetchSummary = props.fetchWorldSummary ?? fetchLiveWorldSummary
  const connectRoom = props.connectRoom ?? defaultConnectLiveRoom
  const copyText = props.copyText ?? defaultCopyText

  const parsed = useMemo(() => {
    const location = props.initialLocation ?? { pathname: window.location.pathname, hash: window.location.hash }
    return parseLiveWorldLocation(location.pathname, location.hash)
    // The route is fixed for the lifetime of the page (main.tsx re-mounts per navigation).
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const storedProfile = useMemo(() => loadStoredLiveProfile(), [])
  const storedAppearance = useMemo(() => loadCharacterPreferences(), [])
  const preferredProfile = useMemo<PlayerProfile>(() => ({
    displayName: storedProfile?.displayName ?? '',
    characterId: storedProfile?.characterId ?? storedAppearance.characterId,
    palette: storedProfile?.palette ?? storedAppearance.palette,
  }), [storedAppearance, storedProfile])
  const returningGuest = useMemo(
    () => parsed.kind === 'join' && !parsed.ownerToken && hasSavedLiveRoomIdentity(parsed.roomId),
    [parsed],
  )
  const seedDocument = useMemo(() => (parsed.kind === 'create' ? loadLiveWorldSeed() : null), [parsed])

  const [room, setRoom] = useState<RoomHandle | null>(() => (
    parsed.kind === 'join'
      ? { roomId: parsed.roomId, ownerToken: parsed.ownerToken, title: props.initialSummary?.title ?? FALLBACK_ROOM_TITLE }
      : null
  ))
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [preflight, setPreflight] = useState<PreflightState>(props.initialSummary ? { status: 'ready', summary: props.initialSummary } : { status: 'loading' })
  const [preflightNonce, setPreflightNonce] = useState(0)
  const [gateBusy, setGateBusy] = useState(false)
  const [gateError, setGateError] = useState<string | null>(null)

  useEffect(() => {
    if (parsed.kind !== 'join' || (props.initialSummary && preflightNonce === 0)) return
    let active = true
    setPreflight({ status: 'loading' })
    fetchSummary(parsed.roomId)
      .then((summary) => {
        if (!active) return
        setPreflight({ status: 'ready', summary })
        if (summary.title) setRoom((current) => (current ? { ...current, title: summary.title! } : current))
      })
      .catch((reason: unknown) => {
        if (!active) return
        const gateway = reason instanceof LiveWorldGatewayError ? reason : null
        setPreflight({
          status: 'blocked',
          heading: gateway?.code === 'not-found' ? 'This room is closed' : 'Cannot reach this room',
          message: gateway?.message ?? friendlyReason(reason),
          canRetry: gateway?.code !== 'not-found',
        })
      })
    return () => {
      active = false
    }
  }, [parsed, fetchSummary, preflightNonce])

  const session = useLiveRoomSession({
    connectRoom,
    roomId: profile && room ? room.roomId : null,
    ownerToken: room?.ownerToken,
    profile,
  })

  const shareLink = room ? liveGuestLink(window.location.origin, room.roomId) : ''

  const handleCreate = ({ displayName, title, seedFromCurrentBuild }: LiveWorldGateSubmit) => {
    if (gateBusy) return
    const nextProfile = liveProfileWithDisplayName(displayName, preferredProfile)
    const document = seedDocument && (seedFromCurrentBuild || seedDocument.bricks.length === 0) ? seedDocument : createBrickStudioDocument([])
    setGateBusy(true)
    setGateError(null)
    createWorld({ title, document, profile: nextProfile })
      .then((created) => {
        saveStoredLiveProfile(nextProfile)
        try { window.sessionStorage.removeItem(LIVE_WORLD_SEED_KEY) } catch { /* Keep the current room usable if storage is blocked. */ }
        try {
          // The owner capability lives in the URL fragment only, mirroring race
          // host links: it survives refresh but is never sent to a server and
          // never appears in the guest share link.
          window.history.replaceState(null, '', liveOwnerLocation(created.roomId, created.ownerToken))
        } catch {
          /* A blocked history API only costs refresh-survival of ownership. */
        }
        setRoom({ roomId: created.roomId, ownerToken: created.ownerToken, title })
        setProfile(nextProfile)
      })
      .catch((reason: unknown) => setGateError(friendlyReason(reason)))
      .finally(() => setGateBusy(false))
  }

  const handleJoin = ({ displayName }: LiveWorldGateSubmit) => {
    const nextProfile = liveProfileWithDisplayName(displayName, preferredProfile)
    saveStoredLiveProfile(nextProfile)
    setProfile(nextProfile)
  }

  const remixWorld = props.remixWorld ?? (async (world: LiveWorldSnapshotExport) => {
    const saved = saveLocalBrickStudioProject(window.localStorage, world.document)
    if (!saved.ok) throw new Error(saved.error.message)
    return 'Copy saved to your studio — open Brick Studio to keep building it.'
  })

  const leaveRoom = () => {
    window.location.assign('/')
  }

  if (parsed.kind === 'invalid') {
    return (
      <BlockedView
        heading="This live link is not quite right"
        message="A live room link looks like /live/ABC123. Ask the room owner to copy the invite link again."
      />
    )
  }

  if (!profile || !room) {
    if (parsed.kind === 'create') {
      return (
        <main className="live-world-page">
          <LiveWorldGate
            kind="create"
            seedBrickCount={seedDocument ? seedDocument.bricks.length : null}
            defaultDisplayName={storedProfile?.displayName}
            busy={gateBusy}
            errorMessage={gateError}
            onSubmit={handleCreate}
          />
        </main>
      )
    }
    if (preflight.status === 'loading') {
      return (
        <main className="live-world-page">
          <section className="live-gate-card live-blocked-card">
            <span className="live-eyebrow">Live room invite</span>
            <h1>Checking this room…</h1>
            <p role="status">One moment while we look up the invite.</p>
          </section>
        </main>
      )
    }
    if (preflight.status === 'blocked') {
      return (
        <BlockedView
          heading={preflight.heading}
          message={preflight.message}
          onRetry={preflight.canRetry ? () => setPreflightNonce((nonce) => nonce + 1) : undefined}
        />
      )
    }
    if (preflight.summary.locked && !parsed.ownerToken && !returningGuest) {
      return (
        <BlockedView
          heading="This room is closed to new joins"
          message="The owner paused new arrivals. Ask them to reopen the room, then try this invite again. Everyone already inside can keep playing."
          onRetry={() => setPreflightNonce((nonce) => nonce + 1)}
        />
      )
    }
    if (
      preflight.summary.playerCount !== null
      && preflight.summary.playerCount >= LIVE_MAX_PLAYERS
      && !parsed.ownerToken
      && !returningGuest
    ) {
      return (
        <BlockedView
          heading="This room is full"
          message="This live world already has 30 builders. Try again after someone leaves."
          onRetry={() => setPreflightNonce((nonce) => nonce + 1)}
        />
      )
    }
    return (
      <main className="live-world-page">
        <LiveWorldGate
          kind="join"
          roomTitle={preflight.summary.title}
          playerCount={preflight.summary.playerCount}
          returningOwner={Boolean(room?.ownerToken)}
          defaultDisplayName={storedProfile?.displayName}
          errorMessage={gateError}
          onSubmit={handleJoin}
        />
      </main>
    )
  }

  if (session.status === 'unwired') {
    return (
      <main className="live-world-page">
        <section className="live-gate-card live-pending-card">
          <span className="live-eyebrow">Live room</span>
          <h1>{room.title}</h1>
          <p role="status">
            You are checked in as <strong>{profile.displayName}</strong>. Live co-building is not switched on in this
            build yet — the realtime sync client is still being wired in. Your room and invite link are ready to share.
          </p>
          <div className="live-share-row">
            <CopyInviteButton shareLink={shareLink} copyText={copyText} className="live-primary-button" />
            <code className="live-share-link">{shareLink}</code>
          </div>
          {room.ownerToken && (
            <p className="live-owner-hint">Keep this tab&rsquo;s web address safe — it holds your owner key for this room.</p>
          )}
          <a className="live-quiet-link" href="/">Back to Brick Studio</a>
        </section>
      </main>
    )
  }

  if (session.status === 'active') {
    const snapshot: LiveRoomSnapshot = session.snapshot
    const setLiveProfile = (nextProfile: PlayerProfile) => {
      const normalized = normalizeLiveProfile(nextProfile)
      saveStoredLiveProfile(normalized)
      setProfile(normalized)
      session.actions.setProfile(normalized)
    }
    const liveActions: LiveRoomActions = {
      ...session.actions,
      setProfile: setLiveProfile,
    }
    const exportWorld = (): LiveWorldSnapshotExport => {
      if (!snapshot.document) throw new Error('The world has not finished loading yet.')
      return { title: room.title, document: snapshot.document }
    }
    const overlay = (
      <LiveWorldHud
        snapshot={snapshot}
        roomTitle={room.title}
        shareLink={shareLink}
        copyText={copyText}
        editingIntegrated
        actions={liveActions}
        onLeave={leaveRoom}
        onRemixWorld={() => remixWorld(exportWorld())}
        onEndRoom={props.onEndRoom}
      />
    )
    if (!snapshot.document) {
      return (
        <main className="live-world-page">
          <section className="live-gate-card live-blocked-card" aria-busy={snapshot.connection !== 'offline'}>
            <span className="live-eyebrow">Live room</span>
            <h1>Opening {room.title}…</h1>
            <LiveStatusChip
              connection={snapshot.connection}
              syncing={snapshot.syncing}
              onReconnect={session.actions.reconnect}
            />
            {snapshot.notice && <p className="live-gate-error" role="alert">{snapshot.notice.message}</p>}
            <a className="live-quiet-link" href="/">Leave and open Brick Studio</a>
          </section>
        </main>
      )
    }
    const view: LiveWorldSceneView = {
      roomTitle: room.title,
      document: snapshot.document,
      mode: snapshot.mode,
      revision: snapshot.revision,
      selfProfile: profile,
      setProfile: setLiveProfile,
      overlay,
    }
    return props.renderWorld
      ? <>{props.renderWorld(view)}</>
      : <DefaultLiveWorldScene view={view} snapshot={snapshot} actions={liveActions} />
  }

  return (
    <main className="live-world-page">
      <section className="live-gate-card live-blocked-card">
        <span className="live-eyebrow">Live room</span>
        <h1>Opening {room.title}…</h1>
        <p role="status">Connecting you to the room.</p>
      </section>
    </main>
  )
}
