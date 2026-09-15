import type { ReactNode } from 'react'
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
  | { kind: 'local'; error?: string }
  | { kind: 'cloud'; status: CloudSaveStatus }
  | { kind: 'live'; connection: LiveConnectionState }

export type SaveStatusTone = 'local' | 'saved' | 'pending' | 'busy' | 'error' | 'offline'

export type SaveStatusDescriptor = {
  label: string
  tone: SaveStatusTone
  /** True while an operation is in flight (spinner icon, aria-busy). */
  busy: boolean
}

/** Pure mapping used by the component and by header tests. */
export function describeSaveStatus(source: SaveStatusSource): SaveStatusDescriptor {
  switch (source.kind) {
    case 'local':
      return source.error
        ? { label: 'Save needs attention', tone: 'error', busy: false }
        : { label: 'This browser only', tone: 'local', busy: false }
    case 'cloud':
      switch (source.status) {
        case 'saved': return { label: 'Saved to your account', tone: 'saved', busy: false }
        case 'pending': return { label: 'Waiting to save…', tone: 'pending', busy: false }
        case 'saving': return { label: 'Saving to your account…', tone: 'busy', busy: true }
        case 'error': return { label: 'Save needs attention', tone: 'error', busy: false }
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
  if (source.kind === 'local') return source.error ? <TriangleAlert size={size} /> : <Monitor size={size} />
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
  className?: string
}

/**
 * Truthful save-state pill. `role="status"` + `aria-live="polite"` so a save
 * error is announced without stealing focus. The device icon marks browser-
 * only drafts; the cloud icon appears only when the cloud reports `saved`.
 */
export function SaveStatus({ source, detail, compact = false, autoCompact = false, action, className }: SaveStatusProps) {
  const { label, tone, busy } = describeSaveStatus(source)
  const showAction = action && (tone === 'error' || tone === 'offline')
  const detailText = detail ?? (source.kind === 'local' && source.error ? source.error : undefined)
  return (
    <div
      className={['ui-save-status', `ui-save-status-${tone}`, compact && 'ui-save-status-compact', autoCompact && !compact && 'ui-save-status-auto', className].filter(Boolean).join(' ')}
      role="status"
      aria-live="polite"
      aria-busy={busy || undefined}
      data-kind={source.kind}
      data-tone={tone}
      title={compact || autoCompact ? (detailText ? `${label} — ${detailText}` : label) : detailText}
    >
      <span className="ui-save-status-icon" aria-hidden="true">{iconFor(source, busy)}</span>
      <span className={compact ? 'sr-only' : 'ui-save-status-text'}>
        <span className="ui-save-status-label">{label}</span>
        {detailText && !compact && <span className="ui-save-status-detail">{detailText}</span>}
      </span>
      {showAction && <span className="ui-save-status-action">{action}</span>}
    </div>
  )
}
