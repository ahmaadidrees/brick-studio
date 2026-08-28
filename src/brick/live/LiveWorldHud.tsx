import { AlertCircle, Footprints, Hammer, Lock, LogOut, RefreshCw, Share2, Sparkles, Unlock, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import type { LiveWorldMode } from '../liveProtocol'
import { CopyInviteButton } from './CopyInviteButton'
import { LiveStatusChip } from './LiveStatusChip'
import { PresenceRoster } from './PresenceRoster'
import {
  describeLiveMode,
  liveEditPermission,
  type LiveRoomActions,
  type LiveRoomSnapshot,
} from './liveRoomModel'

export type LiveWorldHudProps = {
  snapshot: LiveRoomSnapshot
  roomTitle: string
  /** Clean guest link — never contains the owner capability. */
  shareLink: string
  copyText: (text: string) => Promise<boolean>
  /** True once a live-synced scene is wired in; until then Build mode explains that in-scene editing is pending. */
  editingIntegrated: boolean
  actions: LiveRoomActions
  onLeave: () => void
  /** Resolves to a status message; a rejection's message is shown as a warning. Owner-only affordance. */
  onPublishSnapshot?: () => Promise<string>
  /** Resolves to a status message; any participant may save a remix copy. */
  onRemixWorld?: () => Promise<string>
  /** No frozen wire message ends a room yet, so this renders only when an integration provides it. */
  onEndRoom?: () => void
}

type LocalNote = { tone: 'ok' | 'warn'; message: string }

/** Everything overlaid on the live scene: room card, status, roster, owner controls, and friendly notices. */
export function LiveWorldHud({
  snapshot,
  roomTitle,
  shareLink,
  copyText,
  editingIntegrated,
  actions,
  onLeave,
  onPublishSnapshot,
  onRemixWorld,
  onEndRoom,
}: LiveWorldHudProps) {
  const { connection, syncing, mode, locked, isOwner, players, selfPlayerId, notice } = snapshot
  const [dismissedNoticeSeq, setDismissedNoticeSeq] = useState<number | null>(null)
  const [localNote, setLocalNote] = useState<LocalNote | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const previousRoom = useRef<{ mode: LiveWorldMode; locked: boolean; names: Map<string, string> } | null>(null)

  const online = connection === 'online'
  const controlsEnabled = isOwner && online
  const permission = liveEditPermission(snapshot)
  const modeInfo = describeLiveMode(mode)
  const selfPlayer = players.find((player) => player.playerId === selfPlayerId)
  const ownerName = players.find((player) => player.isOwner)?.profile.displayName
  const visibleNotice = notice && notice.seq !== dismissedNoticeSeq ? notice : null

  // Narrates room-level changes (mode, lock, joins/leaves) for screen readers
  // without moving focus; the maps let a departure still be named.
  useEffect(() => {
    const names = new Map(players.map((player) => [player.playerId, player.profile.displayName || 'A builder']))
    const previous = previousRoom.current
    previousRoom.current = { mode, locked, names }
    if (!previous) return
    const messages: string[] = []
    if (mode !== previous.mode) {
      messages.push(mode === 'build' ? 'Everyone can build now.' : 'Everyone is exploring now.')
    }
    if (locked !== previous.locked) {
      messages.push(locked ? 'The owner locked guest building.' : 'The owner unlocked guest building.')
    }
    if (previous.names.size > 0) {
      // The first roster fill is the welcome payload, not people arriving.
      for (const [playerId, name] of names) {
        if (!previous.names.has(playerId)) messages.push(`${name} joined the room.`)
      }
      for (const [playerId, name] of previous.names) {
        if (!names.has(playerId)) messages.push(`${name} left the room.`)
      }
    }
    if (messages.length) setAnnouncement(messages.join(' '))
  }, [mode, locked, players])

  const runShareAction = (action: (() => Promise<string>) | undefined) => {
    if (!action || shareBusy) return
    setShareBusy(true)
    action()
      .then((message) => setLocalNote({ tone: 'ok', message }))
      .catch((reason: unknown) => setLocalNote({
        tone: 'warn',
        message: reason instanceof Error ? reason.message : 'That did not work — please try again.',
      }))
      .finally(() => setShareBusy(false))
  }

  const setModeSafely = (nextMode: LiveWorldMode) => {
    if (!controlsEnabled || nextMode === mode) return
    actions.setMode(nextMode)
  }

  const guestNoteId = useId()

  return (
    <div className="live-hud">
      <div className="live-hud-top">
        <div className="live-room-card">
          <div className="live-room-card-heading">
            <span className="live-eyebrow">Live room</span>
            <strong title={roomTitle}>{roomTitle}</strong>
          </div>
          <div className="live-room-card-share">
            <CopyInviteButton shareLink={shareLink} copyText={copyText} />
            <small>{isOwner ? 'Guests join with this link — it never includes your owner key.' : 'Share this link to invite more builders.'}</small>
          </div>
        </div>
        <div className="live-hud-side">
          <LiveStatusChip connection={connection} syncing={syncing} onReconnect={actions.reconnect} />
          <PresenceRoster
            players={players}
            selfPlayerId={selfPlayerId}
            onRename={(displayName) => actions.setProfile({ ...(selfPlayer?.profile ?? { displayName }), displayName })}
          />
        </div>
      </div>

      <section className="live-control-card" aria-label="Room controls">
        <span className="live-eyebrow">{isOwner ? 'Owner controls' : 'Room mode'}</span>
        <div className="live-mode-switch" role="group" aria-label="Room mode">
          <button
            type="button"
            aria-pressed={mode === 'build'}
            disabled={!controlsEnabled}
            aria-describedby={isOwner ? undefined : guestNoteId}
            onClick={() => setModeSafely('build')}
          ><Hammer size={14} aria-hidden="true" />Build</button>
          <button
            type="button"
            aria-pressed={mode === 'explore'}
            disabled={!controlsEnabled}
            aria-describedby={isOwner ? undefined : guestNoteId}
            onClick={() => setModeSafely('explore')}
          ><Footprints size={14} aria-hidden="true" />Explore</button>
        </div>
        <button
          type="button"
          className="live-lock-toggle"
          aria-pressed={locked}
          disabled={!controlsEnabled}
          aria-describedby={isOwner ? undefined : guestNoteId}
          onClick={() => controlsEnabled && actions.setLocked(!locked)}
        >
          {locked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
          {locked ? 'Guest building locked' : 'Guests can build'}
        </button>
        {!isOwner && (
          <p className="live-control-note" id={guestNoteId}>
            Only the room owner{ownerName ? ` (${ownerName})` : ''} can change the mode or lock building.
          </p>
        )}
        <p className="live-mode-detail">{permission.canEdit ? modeInfo.detail : permission.reason}</p>
        {permission.canEdit && !editingIntegrated && (
          <p className="live-mode-detail live-mode-pending">Shared brick editing switches on once the live sync client is wired in.</p>
        )}
        <div className="live-session-actions">
          {isOwner && onPublishSnapshot && (
            <button type="button" disabled={shareBusy || !snapshot.document} onClick={() => runShareAction(onPublishSnapshot)}>
              <Share2 size={14} aria-hidden="true" />Publish snapshot
            </button>
          )}
          {onRemixWorld && (
            <button type="button" disabled={shareBusy || !snapshot.document} onClick={() => runShareAction(onRemixWorld)}>
              <Sparkles size={14} aria-hidden="true" />Save a copy
            </button>
          )}
          <button type="button" onClick={() => actions.requestResync()} disabled={!online}>
            <RefreshCw size={14} aria-hidden="true" />Re-sync
          </button>
          {isOwner && onEndRoom && (
            <button type="button" className="live-danger-button" onClick={onEndRoom}>End room</button>
          )}
          <button type="button" onClick={onLeave}><LogOut size={14} aria-hidden="true" />Leave</button>
        </div>
      </section>

      <div className="live-hud-bottom">
        {!isOwner && locked && mode === 'build' && (
          <p className="live-lock-banner" role="status">
            <Lock size={13} aria-hidden="true" />
            The owner locked building for now — you can still look around and plan your next brick.
          </p>
        )}
        {visibleNotice && (
          <div className="live-notice" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span>{visibleNotice.message}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setDismissedNoticeSeq(visibleNotice.seq)}>
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        )}
        {localNote && (
          <div className={`live-notice live-note-${localNote.tone}`} role={localNote.tone === 'warn' ? 'alert' : 'status'}>
            <span>{localNote.message}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setLocalNote(null)}>
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div className="live-visually-hidden" aria-live="polite" aria-atomic="true" data-testid="live-room-announcer">{announcement}</div>
    </div>
  )
}
