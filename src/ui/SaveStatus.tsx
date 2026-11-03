import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Cloud, Clock, LoaderCircle, Monitor, RefreshCw, TriangleAlert, Wifi, WifiOff } from 'lucide-react'
import type { CloudSaveStatus } from '../classroom/cloudAutosave'
import type { LiveConnectionState } from '../brick/liveProtocol'
import './ui.css'

/**
 * Where the open world lives, keyed to the real state enums. Nothing here is
 * inferred from a label: the caller passes the enum it already holds
 * (`CloudSaveStatus` from cloudAutosave, `LiveConnectionState` from the live
 * protocol) and guest drafts pass `{ kind: 'local' }`. A blocked storage
 * write must be reported as `{ kind: 'local', error: '…' }`, never as saved.
 */
export type SaveStatusSource =
  /** `state` is for drafts that report their own saves: 'saving' while a change waits, 'saved' once it is written. */
  | { kind: 'local'; error?: string; state?: 'saving' | 'saved' }
  | { kind: 'cloud'; status: CloudSaveStatus }
  | { kind: 'live'; connection: LiveConnectionState }

export type SaveStatusTone = 'local' | 'saved' | 'pending' | 'busy' | 'error' | 'offline'

export type SaveStatusDescriptor = {
  label: string
  /** The label's first word(s) when the rest only says where ("Saved" of "Saved to your account"): tight headers show just this. */
  short?: string
  tone: SaveStatusTone
  /** True while an operation is in flight (spinner icon, aria-busy). */
  busy: boolean
}

/** Pure mapping used by the component and by header tests. */
export function describeSaveStatus(source: SaveStatusSource): SaveStatusDescriptor {
  switch (source.kind) {
    case 'local':
      if (source.error) return { label: 'Couldn’t save', tone: 'error', busy: false }
      if (source.state === 'saving') return { label: 'Saving…', tone: 'busy', busy: true }
      if (source.state === 'saved') return { label: 'Saved on this computer', short: 'Saved', tone: 'saved', busy: false }
      return { label: 'On this computer only', tone: 'local', busy: false }
    case 'cloud':
      switch (source.status) {
        case 'saved': return { label: 'Saved to your account', short: 'Saved', tone: 'saved', busy: false }
        case 'pending': return { label: 'Waiting to save…', tone: 'pending', busy: false }
        case 'saving': return { label: 'Saving to your account…', tone: 'busy', busy: true }
        case 'error': return { label: 'Couldn’t save', tone: 'error', busy: false }
      }
      break
    case 'live':
      switch (source.connection) {
        case 'connecting': return { label: 'Connecting…', tone: 'busy', busy: true }
        case 'online': return { label: 'Shared world', tone: 'saved', busy: false }
        case 'reconnecting': return { label: 'Reconnecting…', tone: 'busy', busy: true }
        case 'offline': return { label: 'Offline · edits paused', tone: 'offline', busy: false }
      }
  }
  // Exhaustive above; TypeScript narrows every branch.
  throw new Error('Unknown save status source')
}

function iconFor(source: SaveStatusSource, busy: boolean) {
  const size = 16
  const spin = busy ? 'ui-spin' : undefined
  if (source.kind === 'local') return source.error ? <TriangleAlert size={size} /> : source.state === 'saving' ? <LoaderCircle size={size} className={spin} /> : <Monitor size={size} />
  if (source.kind === 'cloud') {
    switch (source.status) {
      case 'saved': return <Cloud size={size} />
      case 'pending': return <Clock size={size} />
      case 'saving': return <LoaderCircle size={size} className={spin} />
      case 'error': return <TriangleAlert size={size} />
    }
  }
  switch (source.connection) {
    case 'connecting': return <LoaderCircle size={size} className={spin} />
    case 'online': return <Wifi size={size} />
    case 'reconnecting': return <RefreshCw size={size} className={spin} />
    case 'offline': return <WifiOff size={size} />
  }
}

export type SaveStatusProps = {
  source: SaveStatusSource
  /** Secondary line or tooltip copy (e.g. the storage error). */
  detail?: string
  /** Icon + label in one pill (header) vs. icon-only with the label for screen readers. */
  compact?: boolean
  /** Full pill on wide screens, icon-only under 640px (the label stays for screen readers). */
  autoCompact?: boolean
  /** Shown only for error/offline tones. */
  action?: ReactNode
  /**
   * One or two sentences on where the project lives and what to do. With it the pill is a button: clicking or
   * tapping it shows them underneath (Escape or a tap elsewhere closes them).
   */
  explain?: ReactNode
  className?: string
}

/**
 * Truthful save-state pill. `role="status"` + `aria-live="polite"` so a save
 * error is announced without stealing focus. The device icon marks browser-
 * only drafts; the cloud icon appears only when the cloud reports `saved`.
 */
export function SaveStatus({ source, detail, compact = false, autoCompact = false, action, explain, className }: SaveStatusProps) {
  const { label, short, tone, busy } = describeSaveStatus(source)
  const showAction = action && (tone === 'error' || tone === 'offline')
  const detailText = detail ?? (source.kind === 'local' && source.error ? source.error : undefined)
  const pill = ['ui-save-status', `ui-save-status-${tone}`, compact && 'ui-save-status-compact', autoCompact && !compact && 'ui-save-status-auto'].filter(Boolean).join(' ')
  const title = compact || autoCompact ? (detailText ? `${label} — ${detailText}` : label) : detailText
  const inner = <>
    <span className="ui-save-status-icon" aria-hidden="true">{iconFor(source, busy)}</span>
    <span className={compact ? 'sr-only' : 'ui-save-status-text'}>
      {/* An explained pill (a button named by its label) can drop the "where" words in a tight header. */}
      <span className="ui-save-status-label">{explain && short ? <>{short}<span className="ui-save-status-where">{label.slice(short.length)}</span></> : label}</span>
      {detailText && !compact && <span className="ui-save-status-detail">{detailText}</span>}
    </span>
  </>
  if (explain) return <ExplainedSaveStatus pill={pill} className={className} kind={source.kind} tone={tone} busy={busy} label={label} explain={explain} action={showAction ? action : undefined}>{inner}</ExplainedSaveStatus>
  return (
    <div
      className={className ? `${pill} ${className}` : pill}
      role="status"
      aria-live="polite"
      aria-busy={busy || undefined}
      data-kind={source.kind}
      data-tone={tone}
      title={title}
    >
      {inner}
      {showAction && <span className="ui-save-status-action">{action}</span>}
    </div>
  )
}

/** The pill as a button that opens a short explanation under it. The label is still announced as it changes. */
function ExplainedSaveStatus({ pill, className, kind, tone, busy, label, explain, action, children }: {
  pill: string
  className?: string
  kind: SaveStatusSource['kind']
  tone: SaveStatusTone
  busy: boolean
  label: string
  explain: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }
    document.addEventListener('pointerdown', away, true)
    window.addEventListener('keydown', escape, true)
    return () => { document.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', escape, true) }
  }, [open])
  return (
    <div ref={wrap} className={className ? `ui-save-status-wrap ${className}` : 'ui-save-status-wrap'} data-kind={kind} data-tone={tone}>
      <button type="button" className={`${pill} ui-save-status-button`} aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} aria-busy={busy || undefined}
        title={open ? undefined : `${label}. Where is my project?`} onClick={() => setOpen(!open)}>
        {children}
      </button>
      {action && <span className="ui-save-status-action">{action}</span>}
      <span className="sr-only" role="status" aria-live="polite">{label}</span>
      {open && <div id={id} className="ui-save-status-pop" role="note">
        <strong>{label}</strong>
        <p>{explain}</p>
      </div>}
    </div>
  )
}
