import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import BrickStudioApp from './BrickStudioApp'
import type { RaceAvatarPose, RemoteRaceAvatar } from './BrickStudioScene'
import { createBrickStudioDocument, type BrickStudioDocument } from './brickDocument'
import { loadLocalBrickStudioProject, saveLocalBrickStudioProject } from './documentPersistence'
import { LIVE_MAX_PLAYERS, type LiveWorldMode } from './liveProtocol'
import { createPublishedWorldUrl } from './publishedWorlds'
import { hasSavedLiveRoomIdentity } from './liveRoomClient'
import type { PlayerProfile } from './types'
import { CopyInviteButton } from './live/CopyInviteButton'
import { LiveStatusChip } from './live/LiveStatusChip'
import { LiveWorldGate, type LiveWorldGateSubmit } from './live/LiveWorldGate'
import { LiveWorldHud } from './live/LiveWorldHud'
import {
  liveProfileWithDisplayName,
  normalizeLiveProfile,
  loadStoredLiveProfile,
  saveStoredLiveProfile,
} from './live/liveProfile'
import { defaultConnectLiveRoom } from './live/liveRoomConnector'
import {
  liveGuestLink,
  livePlayerColor,
  liveOwnerLocation,
  parseLiveWorldLocation,
  type ConnectLiveRoom,
  type LiveRoomActions,
  type LiveRoomSnapshot,
} from './live/liveRoomModel'
import {
  createLiveWorldRoom,
  fetchLiveWorldSummary,
  LiveWorldGatewayError,
  type CreateLiveWorld,
  type FetchLiveWorldSummary,
  type LiveWorldSummary,
} from './live/liveWorldGateway'
import { useLiveRoomSession } from './live/useLiveRoomSession'
import { resolveCharacterId } from './contentCatalog'
import { loadCharacterPreferences } from './contentPreferences'
import type { ContentPickerSelection } from './contentPicker'
import { useBrickStore } from './store'
import { registerCustomParts } from './parts'
import './live/live-world.css'

/**
 * `/live/new` — create a room (POST /worlds), then hand the owner their room.
 * `/live/:roomId` — join preflight (GET /worlds/:roomId), display-name gate,
 * then the live session. The realtime WebSocket session itself arrives through
 * the `ConnectLiveRoom` seam (see `live/liveRoomConnector.ts`); every service
 * this page uses can be overridden through props for tests and integration.
 */

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

type RoomHandle = { roomId: string; ownerToken?: string; title: string }

type PreflightState =
  | { status: 'loading' }
  | { status: 'ready'; summary: LiveWorldSummary }
  | { status: 'blocked'; heading: string; message: string; canRetry: boolean }

const FALLBACK_ROOM_TITLE = 'Live build room'

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

function loadSeedDocument(): BrickStudioDocument | null {
  try {
    const result = loadLocalBrickStudioProject(window.localStorage)
    return result.ok ? result.document : null
  } catch {
    return null
  }
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

export default function LiveWorldPage(props: LiveWorldPageProps = {}) {
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
  const seedDocument = useMemo(() => (parsed.kind === 'create' ? loadSeedDocument() : null), [parsed])

  const [room, setRoom] = useState<RoomHandle | null>(() => (
    parsed.kind === 'join'
      ? { roomId: parsed.roomId, ownerToken: parsed.ownerToken, title: FALLBACK_ROOM_TITLE }
      : null
  ))
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [preflight, setPreflight] = useState<PreflightState>({ status: 'loading' })
  const [preflightNonce, setPreflightNonce] = useState(0)
  const [gateBusy, setGateBusy] = useState(false)
  const [gateError, setGateError] = useState<string | null>(null)

  useEffect(() => {
    if (parsed.kind !== 'join') return
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
    const document = seedFromCurrentBuild && seedDocument ? seedDocument : createBrickStudioDocument([])
    setGateBusy(true)
    setGateError(null)
    createWorld({ title, document, profile: nextProfile })
      .then((created) => {
        saveStoredLiveProfile(nextProfile)
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

  const publishWorld = props.publishWorld ?? (async (world: LiveWorldSnapshotExport) => {
    const url = await createPublishedWorldUrl(world.document, world.title)
    const copied = await copyText(url).catch(() => false)
    if (!copied) window.prompt('Share this snapshot link:', url)
    return copied
      ? 'Snapshot link copied — anyone can explore or remix it.'
      : 'Snapshot link ready to share.'
  })

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
        onPublishSnapshot={snapshot.isOwner ? () => publishWorld(exportWorld()) : undefined}
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
