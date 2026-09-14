import {
  AlertCircle,
  Clipboard,
  Download,
  Lock,
  LogOut,
  RefreshCw,
  Share2,
  Sparkles,
  Unlock,
  Users,
  X,
} from 'lucide-react'
import { createContext, useContext, useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { Button } from '../../ui'
import type { LiveWorldMode } from '../liveProtocol'
import { CopyInviteButton } from './CopyInviteButton'
import { LiveStatusChip } from './LiveStatusChip'
import { PresenceRoster } from './PresenceRoster'
import {
  describeLiveMode,
  liveEditPermission,
  type LiveRoomActions,
  type LiveRoomUiSnapshot,
} from './liveRoomModel'

export type LiveWorldHudProps = {
  snapshot: LiveRoomUiSnapshot
  roomTitle: string
  roomKind?: 'guest' | 'classroom'
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
  /** Downloads the currently visible document without replacing a local build. */
  onExportWorld?: () => Promise<string>
  /** Exports the preserved draft from a replaced session, rather than the current room. */
  onExportRecovery?: () => Promise<string>
  /** No frozen wire message ends a room yet, so this renders only when an integration provides it. */
  onEndRoom?: () => void
}

type LocalNote = { tone: 'ok' | 'warn'; message: string }

/**
 * Header → HUD bridge. The editor header owns the People entry (board 06/11), so the page
 * provides this context and bumps `seq` to open the room panel; the HUD then hides its own
 * fallback trigger. Standalone renders (no provider) keep a compact trigger of their own.
 */
export type LivePeoplePanelRequest = { seq: number }
export const LivePeoplePanelContext = createContext<LivePeoplePanelRequest | null>(null)

/**
 * Canvas-first live chrome (board 11). The studio header remains the one authoritative
 * Build/Explore control and shows the connection state; this layer owns one People/room
 * panel (invite link, who is here, room controls, keep a copy) plus transport feedback.
 */
export function LiveWorldHud({
  snapshot,
  roomTitle,
  roomKind = 'guest',
  shareLink,
  copyText,
  editingIntegrated,
  actions,
  onLeave,
  onPublishSnapshot,
  onRemixWorld,
  onExportWorld,
  onExportRecovery,
  onEndRoom,
}: LiveWorldHudProps) {
  const { connection, syncing, mode, locked, isOwner, players, selfPlayerId, notice } = snapshot
  const [panelOpen, setPanelOpen] = useState(false)
  const [dismissedNoticeSeq, setDismissedNoticeSeq] = useState<number | null>(null)
  const [localNote, setLocalNote] = useState<LocalNote | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [exportedRecovery, setExportedRecovery] = useState<LiveRoomUiSnapshot['recoveryDocument']>(null)
  const [announcement, setAnnouncement] = useState('')
  const previousRoom = useRef<{ mode: LiveWorldMode; locked: boolean; names: Map<string, string> } | null>(null)
  const panel = useRef<HTMLElement>(null)
  const restoreFocusTo = useRef<HTMLElement | null>(null)
  const panelId = useId()
  const headerRequest = useContext(LivePeoplePanelContext)

  const online = connection === 'online'
  const controlsEnabled = isOwner && online
  const permission = liveEditPermission(snapshot)
  const modeInfo = describeLiveMode(mode)
  const selfPlayer = players.find((player) => player.playerId === selfPlayerId)
  const ownerName = players.find((player) => player.isOwner)?.profile.displayName
  const sessionReplaced = connection === 'offline' && notice?.code === 'session_replaced'
  const recoveryDocument = snapshot.recoveryDocument
  const recoveryExported = Boolean(recoveryDocument && recoveryDocument === exportedRecovery)
  const visibleNotice = notice && !sessionReplaced && !(recoveryDocument && notice.code === 'changes_need_review') && notice.seq !== dismissedNoticeSeq ? notice : null
  const guestRoom = roomKind === 'guest'
  const pendingOperations = snapshot.pendingOperations ?? 0
  const hasPendingChanges = pendingOperations > 0
  const needsLeaveWarning = hasPendingChanges || Boolean(recoveryDocument && (!recoveryExported || (snapshot.recoveryDocumentCount ?? 1) > 1))
  const pendingMessage = `${pendingOperations} ${pendingOperations === 1 ? 'change still needs' : 'changes still need'} confirmation from the room.`
  const peopleLabel = `People, ${players.length} ${online ? 'here' : 'last seen'}`

  useEffect(() => {
    if (!needsLeaveWarning) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [needsLeaveWarning])

  // Narrates room-level changes (mode, lock, joins/leaves) for screen readers
  // without moving focus; the maps let a departure still be named.
  useEffect(() => {
    const names = new Map(players.map((player) => [player.playerId, player.profile.displayName || 'A builder']))
    const previous = previousRoom.current
    previousRoom.current = { mode, locked, names }
    if (!previous) return
    const messages: string[] = []
    if (mode !== previous.mode) messages.push(mode === 'build' ? 'Everyone can build now.' : 'Everyone is exploring now.')
    if (locked !== previous.locked) messages.push(locked ? 'The owner closed the room to new joins.' : 'The owner opened the room to new joins.')
    if (previous.names.size > 0) {
      for (const [playerId, name] of names) {
        if (!previous.names.has(playerId)) messages.push(`${name} joined the room.`)
      }
      for (const [playerId, name] of previous.names) {
        if (!names.has(playerId)) messages.push(`${name} left the room.`)
      }
    }
    if (messages.length) setAnnouncement(messages.join(' '))
  }, [mode, locked, players])

  // The header's People button asks for the panel through context; remember where focus
  // came from so closing returns there.
  useEffect(() => {
    if (!headerRequest || headerRequest.seq === 0) return
    restoreFocusTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setPanelOpen(true)
  }, [headerRequest])

  useEffect(() => {
    if (!panelOpen) return
    panel.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setPanelOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true)
      restoreFocusTo.current?.focus()
    }
  }, [panelOpen])

  const togglePanel = (event: MouseEvent<HTMLButtonElement>) => {
    restoreFocusTo.current = event.currentTarget
    setPanelOpen((current) => !current)
  }

  const runShareAction = (action: (() => Promise<string>) | undefined) => {
    if (!action || shareBusy) return
    setShareBusy(true)
    Promise.resolve().then(action)
      .then((message) => setLocalNote({ tone: 'ok', message }))
      .catch((reason: unknown) => setLocalNote({
        tone: 'warn',
        message: reason instanceof Error ? reason.message : 'That did not work — please try again.',
      }))
      .finally(() => setShareBusy(false))
  }

  const keepCopyActions = Boolean(onPublishSnapshot || onRemixWorld || onExportWorld)

  return (
    <div className="live-hud">
      {!headerRequest && (
        <div className="live-toolbar" role="toolbar" aria-label="Live collaboration controls">
          <LiveStatusChip connection={connection} syncing={syncing} sessionReplaced={sessionReplaced} pendingOperations={pendingOperations} />
          <Button variant="quiet" size="sm" icon={<Users size={16} />} aria-label={peopleLabel} aria-controls={panelOpen ? panelId : undefined} aria-expanded={panelOpen} onClick={togglePanel}>
            People<strong className="live-people-count" aria-hidden="true">{players.length}</strong>
          </Button>
        </div>
      )}

      {panelOpen && (
        <>
          <button className="live-panel-backdrop" type="button" aria-label="Close people panel" onClick={() => setPanelOpen(false)} />
          <section
            ref={panel}
            className="live-panel"
            id={panelId}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`${panelId}-title`}
            tabIndex={-1}
          >
            <header className="live-panel-heading">
              <div><span className="live-eyebrow">{guestRoom ? 'Temporary guest room' : 'Classroom world'}</span><h2 id={`${panelId}-title`}>{roomTitle}</h2></div>
              <Button variant="quiet" iconOnly icon={<X size={18} />} aria-label="Close people panel" onClick={() => setPanelOpen(false)}>Close</Button>
            </header>

            <div className="live-panel-body">
              <section className="live-panel-section" aria-labelledby={`${panelId}-invite`}>
                <h3 id={`${panelId}-invite`}>Invite link</h3>
                <div className="live-share-row">
                  <code className="live-share-link" title={shareLink}>{shareLink}</code>
                  <CopyInviteButton shareLink={shareLink} copyText={copyText} />
                </div>
                <p>{guestRoom ? 'Anyone with this invite can join as a guest. No account needed.' : 'Only classmates with access can join. They need to sign in, or open this world from My Class.'}</p>
                {guestRoom && <small>{isOwner ? 'Share this invite, and keep your owner link for yourself.' : 'The owner can close the room to new people.'}</small>}
                {guestRoom && <p className="live-retention-note"><strong>Temporary room.</strong> Expires after 2 hours without activity. Download a copy to keep your build.</p>}
              </section>

              <section className="live-panel-section" aria-labelledby={`${panelId}-people`}>
                <h3 id={`${panelId}-people`}>{online ? `In this world (${players.length})` : 'Last seen in this room'}</h3>
                <PresenceRoster
                  inline
                  players={players}
                  selfPlayerId={selfPlayerId}
                  onRename={guestRoom && online ? (displayName) => actions.setProfile({ ...(selfPlayer?.profile ?? { displayName }), displayName }) : undefined}
                />
              </section>

              <section className="live-panel-section" aria-labelledby={`${panelId}-room`}>
                <h3 id={`${panelId}-room`}>Room</h3>
                <div className="live-room-summary">
                  <span>{isOwner ? 'You are the owner' : ownerName ? `${ownerName} is the owner` : 'You are a guest'}</span>
                  <strong>{modeInfo.label}</strong>
                  <p>{sessionReplaced ? 'Building is paused in this tab. Rejoin below to continue here.' : permission.canEdit ? modeInfo.detail : permission.reason}</p>
                  {!isOwner && <small>The owner controls Build and Explore from the main switch.</small>}
                  {permission.canEdit && !editingIntegrated && <small>Shared brick editing is still being connected.</small>}
                </div>
                {!guestRoom && <p className="live-retention-note">Reopen this classroom world from My Class. Your teacher manages who can join.</p>}
                {hasPendingChanges && <p className="live-pending-note">{pendingMessage} Wait for Live or download a copy before leaving.</p>}
                {isOwner ? (
                  <Button
                    variant="secondary"
                    fullWidth
                    className="live-lock-toggle"
                    icon={locked ? <Lock size={16} /> : <Unlock size={16} />}
                    aria-pressed={locked}
                    disabled={!controlsEnabled}
                    onClick={() => controlsEnabled && actions.setLocked(!locked)}
                  >
                    {locked ? 'Open room to new people' : 'Close room to new people'}
                  </Button>
                ) : (
                  <p className="live-guest-lock-status">
                    {locked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
                    {locked ? 'New people cannot join right now.' : 'New people can join with the invite.'}
                  </p>
                )}
                <div className="live-panel-actions">
                  <Button variant="secondary" icon={<RefreshCw size={16} />} onClick={() => actions.requestResync()} disabled={!online}>Get latest world</Button>
                  <Button variant="secondary" icon={<LogOut size={16} />} onClick={onLeave}>Leave room</Button>
                  {isOwner && onEndRoom && <Button variant="danger" className="live-danger-button" onClick={onEndRoom}>End room</Button>}
                </div>
                {actions.exportDiagnostics && <Button variant="quiet" size="sm" className="live-diagnostics-button" icon={<Clipboard size={14} />} disabled={shareBusy} onClick={() => runShareAction(async () => {
                  const copied = await copyText(actions.exportDiagnostics!())
                  if (!copied) throw new Error('Could not copy diagnostics. Try again.')
                  return 'Diagnostics copied. Share them when reporting a connection problem.'
                })}>Copy diagnostics</Button>}
              </section>

              {keepCopyActions && (
                <section className="live-panel-section" aria-labelledby={`${panelId}-copy`}>
                  <h3 id={`${panelId}-copy`}>Keep a copy</h3>
                  <p>A copy keeps the build you see now. Later room changes won’t update it.</p>
                  {hasPendingChanges && <p className="live-pending-note">{pendingMessage} Your copy includes those changes.</p>}
                  <div className="live-panel-actions">
                    {onExportWorld && (
                      <Button variant="secondary" icon={<Download size={16} />} disabled={shareBusy || !snapshot.document} onClick={() => runShareAction(onExportWorld)}>Export copy</Button>
                    )}
                    {isOwner && onPublishSnapshot && (
                      <Button variant="secondary" icon={<Share2 size={16} />} disabled={shareBusy || !snapshot.document} onClick={() => runShareAction(onPublishSnapshot)}>Publish snapshot</Button>
                    )}
                    {onRemixWorld && (
                      <Button variant="secondary" icon={<Sparkles size={16} />} disabled={shareBusy || !snapshot.document} onClick={() => runShareAction(onRemixWorld)}>Use as my local build</Button>
                    )}
                  </div>
                  {onRemixWorld && <p>Using this as your local build replaces this browser’s current build. Export a file to keep a separate copy.</p>}
                </section>
              )}
            </div>
          </section>
        </>
      )}

      <div className="live-hud-bottom">
        {recoveryDocument && onExportRecovery && (
          <div className="live-recovery-banner live-draft-recovery" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span><strong>Keep a copy of your earlier changes</strong>{recoveryExported
              ? 'Recovery download started. Check your downloads before leaving.'
              : 'This tab had changes the room could not confirm. Download this draft before you leave. The live room may look different.'}
              {(snapshot.recoveryDocumentCount ?? 0) > 1 && <small className="live-pending-detail">{snapshot.recoveryDocumentCount} recovery copies remain. Download each before leaving.</small>}
            </span>
            <Button variant="primary" size="sm" disabled={shareBusy} onClick={() => runShareAction(async () => {
              const message = await onExportRecovery()
              setExportedRecovery(recoveryDocument)
              return message
            })}>Download recovery copy</Button>
            {recoveryExported && !hasPendingChanges && actions.dismissRecovery && <Button variant="secondary" size="sm" onClick={actions.dismissRecovery}>I have my copy</Button>}
          </div>
        )}
        {(connection === 'reconnecting' || connection === 'offline') && (
          <div className={`live-recovery-banner${connection === 'offline' ? ' live-recovery-banner-offline' : ''}`} role="status">
            <RefreshCw size={16} className={connection === 'reconnecting' ? 'live-status-spin' : undefined} aria-hidden="true" />
            <span><strong>{sessionReplaced ? 'This room is open somewhere else' : connection === 'offline' ? 'Building is paused' : 'Reconnecting to the room'}</strong> {sessionReplaced ? 'Close the other tab or device, then rejoin here. Your canvas stays visible.' : connection === 'offline' ? 'Unsent changes are still here. Reconnect, or download a copy from People before leaving.' : 'Unsent changes are still here. Wait for Live before editing again.'}
              {hasPendingChanges && <small className="live-pending-detail">{pendingMessage} Keep this tab open or download a copy from People before leaving.</small>}
            </span>
            {connection === 'offline' && actions.reconnect && <Button variant="primary" size="sm" onClick={actions.reconnect}>{sessionReplaced ? 'Rejoin here' : 'Try again'}</Button>}
          </div>
        )}
        {visibleNotice && (
          <div className="live-notice" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span><strong>{visibleNotice.code.includes('reject') ? 'That change was not saved.' : 'Room update.'}</strong> {visibleNotice.message}</span>
            {online && <Button variant="secondary" size="sm" className="live-notice-action" onClick={() => actions.requestResync()}>Get latest</Button>}
            <Button variant="quiet" size="sm" iconOnly icon={<X size={14} />} aria-label="Dismiss message" onClick={() => setDismissedNoticeSeq(visibleNotice.seq)}>Dismiss</Button>
          </div>
        )}
        {localNote && (
          <div className={`live-notice live-note-${localNote.tone}`} role={localNote.tone === 'warn' ? 'alert' : 'status'}>
            <span>{localNote.message}</span>
            <Button variant="quiet" size="sm" iconOnly icon={<X size={14} />} aria-label="Dismiss message" onClick={() => setLocalNote(null)}>Dismiss</Button>
          </div>
        )}
      </div>
      <div className="live-visually-hidden" aria-live="polite" aria-atomic="true" data-testid="live-room-announcer">{announcement}</div>
    </div>
  )
}
