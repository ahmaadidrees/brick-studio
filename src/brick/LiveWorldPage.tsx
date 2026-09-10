import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import BrickStudioApp from './BrickStudioApp'
import type { RaceAvatarPose } from './BrickStudioScene'
import type { RemoteAvatarSource } from './remoteAvatarSource'
import { createBrickStudioDocument, type BrickStudioDocument } from './brickDocument'
import { type LiveWorldMode } from './liveProtocol'
import { createLiveRoomClient, getLiveWorld } from './liveRoomClient'
import { browserClassroomClient, type ClassroomClient, type ClassroomAuth, type ClassroomWorld } from '../classroom/client'
import { ClassroomPanel } from '../classroom/ClassroomPanel'
import { createLiveRoomConnector } from './live/liveRoomConnector'
import type { PlayerProfile } from './types'
import { LiveWorldHud } from './live/LiveWorldHud'
import { liveGuestLink, parseLiveWorldLocation, type ConnectLiveRoom, type LiveRoomActions, type LiveRoomUiSnapshot } from './live/liveRoomModel'
import type { CreateLiveWorld, FetchLiveWorldSummary } from './live/liveWorldGateway'
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
  remoteAvatarSource,
}: {
  view: LiveWorldSceneView
  snapshot: LiveRoomUiSnapshot
  actions: LiveRoomActions
  remoteAvatarSource: RemoteAvatarSource
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
      raceScene={{ onLocalAvatarPose: sendPose, remoteAvatarSource }}
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
  const pathname = props.initialLocation?.pathname ?? window.location.pathname;
  const worldId = classroomWorldIdFromPath(pathname);
  if (!auth || auth.user.resetRequired || pathname === '/live/new') {
    return <ClassroomPanel client={client} intent="class" getDocument={() => useBrickStore.getState().getDocumentSnapshot()}
      onClose={() => window.location.assign('/')}
      onOpenWorld={() => window.location.assign('/')}
      onJoinWorld={world => window.location.assign(`/live/${world.id.replaceAll('-', '')}`)} />;
  }
  if (!worldId) return <BlockedView heading="Open this world from My Class" message="This older room link is no longer available. Your classroom worlds are listed in Brick Studio." />;
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
  return props.renderWorld ? <>{props.renderWorld(view)}</> : <DefaultLiveWorldScene view={view} snapshot={snapshot} actions={actions} remoteAvatarSource={session.remoteAvatarSource} />;
}
