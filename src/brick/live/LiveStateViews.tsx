import { useEffect, useState } from 'react'
import { Download, GraduationCap, Hammer, Lock, RefreshCw } from 'lucide-react'
import { Button } from '../../ui'
import { BrandLockup } from '../../brand'
import type { BrickStudioDocument } from '../brickDocument'
import { downloadBrickStudioDocument } from '../documentPersistence'
import type { LiveRoomActions, LiveRoomUiSnapshot } from './liveRoomModel'
import { LiveStatusChip } from './LiveStatusChip'

/**
 * Presentational state cards for the live world page (board 15): blocked/loading gates,
 * the opening-room wait and the classroom-access-changed recovery card.
 * LiveWorldPage owns the transport and decides which of these to show.
 */

export function friendlyReason(reason: unknown): string {
  if (reason instanceof Error && reason.message) return reason.message
  return 'Something went wrong. Please try again.'
}

export async function exportLiveWorldCopy(document: BrickStudioDocument, recovery = false): Promise<string> {
  const result = recovery ? downloadBrickStudioDocument(document, globalThis, 'brickgineers-recovery') : downloadBrickStudioDocument(document)
  if (!result.ok) throw new Error(result.error.message)
  return 'Download started. Keep the .brickstudio file to reopen this copy later with Import.'
}

/** Go to the builder; the guest draft there is untouched by whatever room this page was about. */
function BuilderLink({ label = 'Go to builder', quiet = false }: { label?: string; quiet?: boolean }) {
  return <a className={quiet ? 'live-quiet-link' : 'ui-button ui-button-secondary ui-button-md live-builder-link'} href="/build">{quiet ? label : <><Hammer size={16} aria-hidden="true" /><span>{label}</span></>}</a>
}

export type BlockedViewAction = { label: string; onClick: () => void }

export function BlockedView({ heading, message, onRetry, action }: { heading: string; message: string; onRetry?: () => void; action?: BlockedViewAction }) {
  const closed = /closed|full|sign-in/i.test(heading)
  return (
    <main className="live-world-page">
      <section className="live-gate-card live-blocked-card" aria-labelledby="live-blocked-title">
        <BrandLockup size={32} className="live-gate-brand" />
        <span className={`live-state-icon${closed ? ' live-state-icon-warn' : ''}`} aria-hidden="true">{closed ? <Lock size={22} /> : <RefreshCw size={22} />}</span>
        <span className="live-eyebrow">Shared worlds</span>
        <h1 id="live-blocked-title">{heading}</h1>
        <p>{message}</p>
        <div className="live-state-actions">
          {action && <Button variant="primary" icon={<GraduationCap size={16} />} onClick={action.onClick}>{action.label}</Button>}
          {onRetry && <Button variant={action ? 'secondary' : 'primary'} icon={<RefreshCw size={16} />} onClick={onRetry}>Try again</Button>}
          <BuilderLink />
        </div>
      </section>
    </main>
  )
}

export function OpeningRoomView({ title, snapshot, actions }: { title: string; snapshot: LiveRoomUiSnapshot; actions: LiveRoomActions }) {
  return (
    <main className="live-world-page">
      <section className="live-gate-card live-blocked-card" aria-busy={snapshot.connection !== 'offline'}>
        <BrandLockup size={32} className="live-gate-brand" />
        <span className="live-eyebrow">Shared world</span>
        <h1>Opening {title}…</h1>
        <p>Just a moment while we get things ready.</p>
        <LiveStatusChip connection={snapshot.connection} syncing={snapshot.syncing}
          onReconnect={actions.reconnect} sessionReplaced={snapshot.notice?.code === 'session_replaced'} pendingOperations={snapshot.pendingOperations} />
        {snapshot.notice && <p className="live-gate-error" role="alert">{snapshot.notice.message}</p>}
        <BuilderLink label="Leave and go to builder" quiet />
      </section>
    </main>
  )
}

export function ClassroomAccessChangedView({ snapshot, actions }: { snapshot: LiveRoomUiSnapshot; actions: LiveRoomActions }) {
  const draft = snapshot.recoveryDocument ?? snapshot.document
  const [exportedDraft, setExportedDraft] = useState<BrickStudioDocument | null>(null)
  const [exportedCurrentDraft, setExportedCurrentDraft] = useState<BrickStudioDocument | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const hasPending = (snapshot.pendingOperations ?? 0) > 0
  const currentDraft = hasPending && snapshot.recoveryDocument && snapshot.document !== draft ? snapshot.document : null
  const needsLeaveWarning = (hasPending && snapshot.document !== exportedCurrentDraft)
    || Boolean(snapshot.recoveryDocument && (draft !== exportedDraft || (snapshot.recoveryDocumentCount ?? 1) > 1))
  useEffect(() => {
    if (!needsLeaveWarning) return
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnBeforeLeaving)
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving)
  }, [needsLeaveWarning])
  return <main className="live-world-page"><section className="live-gate-card live-blocked-card">
    <BrandLockup size={32} className="live-gate-brand" />
    <span className="live-eyebrow">Classroom world</span>
    <h1>Classroom access changed</h1>
    <p>{snapshot.notice?.message || 'Ask your teacher to check your access to this world.'}</p>
    {draft && <>
      <p>{hasPending || snapshot.recoveryDocument ? 'Keep a copy of your earlier changes before leaving. Some changes may not be in the shared world.' : 'You can still download the build already loaded in this tab.'}</p>
      <Button variant="primary" icon={<Download size={16} />} disabled={busy} onClick={async () => {
        if (busy) return
        setBusy(true); setMessage('')
        try {
          setMessage(await exportLiveWorldCopy(draft, true)); setExportedDraft(draft)
          if (draft === snapshot.document) setExportedCurrentDraft(draft)
        }
        catch (reason) { setMessage(friendlyReason(reason)) }
        finally { setBusy(false) }
      }}>Download recovery copy</Button>
      {(snapshot.recoveryDocumentCount ?? 0) > 1 && <p>{snapshot.recoveryDocumentCount} recovery copies remain. Download each before leaving.</p>}
      {snapshot.recoveryDocument && draft === exportedDraft && !hasPending && actions.dismissRecovery && <Button variant="secondary" onClick={actions.dismissRecovery}>I have my copy</Button>}
    </>}
    {currentDraft && <>
      <p>You also have newer changes in this tab. Download this current draft as a separate copy.</p>
      <Button variant="secondary" icon={<Download size={16} />} disabled={busy} onClick={async () => {
        if (busy) return
        setBusy(true); setMessage('')
        try {
          const result = downloadBrickStudioDocument(currentDraft, globalThis, 'brickgineers-current-draft')
          if (!result.ok) throw new Error(result.error.message)
          setExportedCurrentDraft(currentDraft)
          setMessage('Current draft download started. The shared world has not confirmed these changes.')
        } catch (reason) { setMessage(friendlyReason(reason)) }
        finally { setBusy(false) }
      }}>Download current draft</Button>
    </>}
    {message && <p role="status">{message}</p>}
    {actions.reconnect && <Button variant="secondary" icon={<RefreshCw size={16} />} disabled={snapshot.connection !== 'offline'} onClick={actions.reconnect}>Try reconnecting</Button>}
    <BuilderLink quiet />
  </section></main>
}
