import {
  AlertCircle,
  Clipboard,
  Download,
  Lock,
  LogOut,
  RefreshCw,
  Settings2,
  Share2,
  Sparkles,
  Unlock,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
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
type LivePanel = 'people' | 'share' | 'room'

/**
 * Canvas-first live chrome. Brick Studio's header remains the one authoritative
 * Build/Explore control; this layer only handles presence, sharing, room
 * management, and transport feedback.
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
  const [activePanel, setActivePanel] = useState<LivePanel | null>(null)
  const [dismissedNoticeSeq, setDismissedNoticeSeq] = useState<number | null>(null)
  const [localNote, setLocalNote] = useState<LocalNote | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [exportedRecovery, setExportedRecovery] = useState<LiveRoomUiSnapshot['recoveryDocument']>(null)
  const [announcement, setAnnouncement] = useState('')
  const previousRoom = useRef<{ mode: LiveWorldMode; locked: boolean; names: Map<string, string> } | null>(null)
  const panel = useRef<HTMLElement>(null)
  const restoreFocusTo = useRef<HTMLButtonElement | null>(null)
  const panelId = useId()

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

  useEffect(() => {
    if (!activePanel) return
    panel.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      setActivePanel(null)
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true)
      restoreFocusTo.current?.focus()
    }
  }, [activePanel])

  const togglePanel = (nextPanel: LivePanel, event: MouseEvent<HTMLButtonElement>) => {
    restoreFocusTo.current = event.currentTarget
    setActivePanel((current) => current === nextPanel ? null : nextPanel)
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

  const triggerProps = (name: LivePanel) => ({
    'aria-controls': activePanel === name ? panelId : undefined,
    'aria-expanded': activePanel === name,
  })

  const panelHeading = activePanel === 'people'
    ? online ? `${players.length} ${players.length === 1 ? 'person' : 'people'} here` : 'Last seen in this room'
    : activePanel === 'share'
      ? 'Share this live world'
      : roomTitle

  return (
    <div className="live-hud">
      <div className="live-toolbar" role="toolbar" aria-label="Live collaboration controls">
        <LiveStatusChip connection={connection} syncing={syncing} sessionReplaced={sessionReplaced} pendingOperations={pendingOperations} />
        <button type="button" aria-label={`People, ${players.length} ${online ? 'here' : 'last seen'}`} {...triggerProps('people')} onClick={(event) => togglePanel('people', event)}>
          <Users size={16} aria-hidden="true" /><span>People</span><strong>{players.length}</strong>
        </button>
        <button type="button" {...triggerProps('share')} onClick={(event) => togglePanel('share', event)}>
          <Share2 size={16} aria-hidden="true" /><span>Share</span>
        </button>
        <button type="button" title={roomTitle} {...triggerProps('room')} onClick={(event) => togglePanel('room', event)}>
          <Settings2 size={16} aria-hidden="true" /><span>Room</span>
        </button>
      </div>

      {activePanel && (
        <>
          <button className="live-panel-backdrop" type="button" aria-label="Close live panel" onClick={() => setActivePanel(null)} />
          <section
            ref={panel}
            className={`live-panel live-${activePanel}-panel`}
            id={panelId}
            role="dialog"
            aria-modal="false"
            aria-labelledby={`${panelId}-title`}
            tabIndex={-1}
          >
            <header className="live-panel-heading">
              <div><span className="live-eyebrow">{guestRoom ? 'Temporary guest room' : 'Classroom world'}</span><h2 id={`${panelId}-title`}>{panelHeading}</h2></div>
              <button type="button" aria-label={`Close ${activePanel} panel`} onClick={() => setActivePanel(null)}><X size={17} /></button>
            </header>

            {activePanel === 'people' && (
              <PresenceRoster
                inline
                players={players}
                selfPlayerId={selfPlayerId}
                onRename={guestRoom && online ? (displayName) => actions.setProfile({ ...(selfPlayer?.profile ?? { displayName }), displayName }) : undefined}
              />
            )}

            {activePanel === 'share' && (
              <div className="live-share-panel-content">
                <p>{guestRoom ? 'Anyone with this invite can join as a guest. No account needed.' : 'Only classmates with access can join. They need to sign in, or open this world from My Class.'}</p>
                <CopyInviteButton shareLink={shareLink} copyText={copyText} />
                {guestRoom && <small>{isOwner ? 'Share this invite, and keep your owner link for yourself.' : 'The owner can close the room to new people.'}</small>}
                {guestRoom && <p className="live-retention-note"><strong>Temporary room.</strong> Expires after 2 hours without activity. Export a copy to keep your build.</p>}
                {(onPublishSnapshot || onRemixWorld || onExportWorld) && (
                  <div className="live-panel-section">
                    <strong>Keep a copy</strong>
                    <p>A copy keeps the build you see now. Later room changes won’t update it.</p>
                    {hasPendingChanges && <p className="live-pending-note">{pendingMessage} Your copy includes those changes.</p>}
                    <div className="live-panel-actions">
                      {onExportWorld && (
                        <button type="button" disabled={shareBusy || !snapshot.document} onClick={() => runShareAction(onExportWorld)}>
                          <Download size={15} aria-hidden="true" />Export copy
                        </button>
                      )}
                      {isOwner && onPublishSnapshot && (
                        <button type="button" disabled={shareBusy || !snapshot.document} onClick={() => runShareAction(onPublishSnapshot)}>
                          <Share2 size={15} aria-hidden="true" />Publish snapshot
                        </button>
                      )}
                      {onRemixWorld && (
                        <button type="button" disabled={shareBusy || !snapshot.document} onClick={() => runShareAction(onRemixWorld)}>
                          <Sparkles size={15} aria-hidden="true" />Use as my local build
                        </button>
                      )}
                    </div>
                    {onRemixWorld && <p>Using this as your local build replaces this browser’s current build. Export a file to keep a separate copy.</p>}
                  </div>
                )}
              </div>
            )}

            {activePanel === 'room' && (
              <div className="live-room-panel-content">
                <div className="live-room-summary">
                  <span>{isOwner ? 'You are the owner' : ownerName ? `${ownerName} is the owner` : 'You are a guest'}</span>
                  <strong>{modeInfo.label}</strong>
                  <p>{sessionReplaced ? 'Building is paused in this tab. Rejoin below to continue here.' : permission.canEdit ? modeInfo.detail : permission.reason}</p>
                  {!isOwner && <small>The owner controls Build and Explore from the main switch.</small>}
                  {permission.canEdit && !editingIntegrated && <small>Shared brick editing is still being connected.</small>}
                </div>
                <p className="live-retention-note">{guestRoom
                  ? 'This guest room expires after 2 hours without activity. Use Share → Export copy to keep your build.'
                  : 'Reopen this classroom world from My Class. Your teacher manages who can join.'}</p>
                {hasPendingChanges && <p className="live-pending-note">{pendingMessage} Wait for Live or export a copy from Share before leaving.</p>}
                {isOwner ? (
                  <button
                    type="button"
                    className="live-lock-toggle"
                    aria-pressed={locked}
                    disabled={!controlsEnabled}
                    onClick={() => controlsEnabled && actions.setLocked(!locked)}
                  >
                    {locked ? <Lock size={15} aria-hidden="true" /> : <Unlock size={15} aria-hidden="true" />}
                    {locked ? 'Open room to new people' : 'Close room to new people'}
                  </button>
                ) : (
                  <p className="live-guest-lock-status">
                    {locked ? <Lock size={14} aria-hidden="true" /> : <Unlock size={14} aria-hidden="true" />}
                    {locked ? 'New people cannot join right now.' : 'New people can join with the invite.'}
                  </p>
                )}
                <div className="live-panel-actions">
                  <button type="button" onClick={() => actions.requestResync()} disabled={!online}>
                    <RefreshCw size={15} aria-hidden="true" />Get latest world
                  </button>
                  <button type="button" onClick={onLeave}><LogOut size={15} aria-hidden="true" />Leave room</button>
                  {isOwner && onEndRoom && <button type="button" className="live-danger-button" onClick={onEndRoom}>End room</button>}
                </div>
                {actions.exportDiagnostics && <button type="button" className="live-diagnostics-button" disabled={shareBusy} onClick={() => runShareAction(async () => {
                  const copied = await copyText(actions.exportDiagnostics!())
                  if (!copied) throw new Error('Could not copy diagnostics. Try again.')
                  return 'Diagnostics copied. Share them when reporting a connection problem.'
                })}><Clipboard size={14} aria-hidden="true" />Copy diagnostics</button>}
              </div>
            )}
          </section>
        </>
      )}

      <div className="live-hud-bottom">
        {recoveryDocument && onExportRecovery && (
          <div className="live-recovery-banner live-draft-recovery" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span><strong>Keep a copy of your earlier changes</strong>{recoveryExported
              ? 'Recovery download started. Check your downloads before leaving.'
              : 'This tab had changes the room could not confirm. Download this draft before you leave. The live room may look different.'}
              {(snapshot.recoveryDocumentCount ?? 0) > 1 && <small className="live-pending-detail">{snapshot.recoveryDocumentCount} recovery copies remain. Download each before leaving.</small>}
            </span>
            <button type="button" disabled={shareBusy} onClick={() => runShareAction(async () => {
              const message = await onExportRecovery()
              setExportedRecovery(recoveryDocument)
              return message
            })}>Download recovery copy</button>
            {recoveryExported && !hasPendingChanges && actions.dismissRecovery && <button type="button" onClick={actions.dismissRecovery}>I have my copy</button>}
          </div>
        )}
        {(connection === 'reconnecting' || connection === 'offline') && (
          <div className="live-recovery-banner" role="status">
            <RefreshCw size={15} className={connection === 'reconnecting' ? 'live-status-spin' : undefined} aria-hidden="true" />
            <span><strong>{sessionReplaced ? 'This room is open somewhere else' : connection === 'offline' ? 'Building is paused' : 'Reconnecting to the room'}</strong> {sessionReplaced ? 'Close the other tab or device, then rejoin here. Your canvas stays visible.' : 'Wait for Live before editing again. You can still export the build you see from Share.'}
              {hasPendingChanges && <small className="live-pending-detail">{pendingMessage} Keep this tab open or export a copy from Share before leaving.</small>}
            </span>
            {connection === 'offline' && actions.reconnect && <button type="button" onClick={actions.reconnect}>{sessionReplaced ? 'Rejoin here' : 'Try again'}</button>}
          </div>
        )}
        {visibleNotice && (
          <div className="live-notice" role="alert">
            <AlertCircle size={15} aria-hidden="true" />
            <span><strong>{visibleNotice.code.includes('reject') ? 'That change was not saved.' : 'Room update.'}</strong> {visibleNotice.message}</span>
            {online && <button className="live-notice-action" type="button" onClick={() => actions.requestResync()}>Get latest</button>}
            <button type="button" aria-label="Dismiss message" onClick={() => setDismissedNoticeSeq(visibleNotice.seq)}><X size={13} aria-hidden="true" /></button>
          </div>
        )}
        {localNote && (
          <div className={`live-notice live-note-${localNote.tone}`} role={localNote.tone === 'warn' ? 'alert' : 'status'}>
            <span>{localNote.message}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setLocalNote(null)}><X size={13} aria-hidden="true" /></button>
          </div>
        )}
      </div>
      <div className="live-visually-hidden" aria-live="polite" aria-atomic="true" data-testid="live-room-announcer">{announcement}</div>
    </div>
  )
}
