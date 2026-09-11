import { RefreshCw, Wifi, WifiOff } from 'lucide-react'
import type { LiveConnectionState } from '../liveProtocol'
import { describeLiveConnection } from './liveRoomModel'

export type LiveStatusChipProps = {
  connection: LiveConnectionState
  syncing: boolean
  /** Optional transport-level retry, shown only once the client reports itself offline. */
  onReconnect?: () => void
  /** A different tab or device took over this participant's connection. */
  sessionReplaced?: boolean
  pendingOperations?: number
}

/** Connection + sync pill. `role="status"` lets screen readers hear drops and recoveries without stealing focus. */
export function LiveStatusChip({ connection, syncing, onReconnect, sessionReplaced = false, pendingOperations = 0 }: LiveStatusChipProps) {
  const status = sessionReplaced
    ? { label: 'Paused here', detail: 'This room is open in another tab or device.', tone: 'warn' }
    : connection === 'online' && pendingOperations > 0
      ? { label: 'Syncing…', detail: `${pendingOperations} ${pendingOperations === 1 ? 'change' : 'changes'} waiting for the room`, tone: 'busy' }
      : describeLiveConnection(connection, syncing)
  const Icon = connection === 'online' ? Wifi : connection === 'offline' ? WifiOff : RefreshCw
  const spinning = status.tone === 'busy' || connection === 'reconnecting'
  return (
    <div className={`live-status-chip live-tone-${status.tone}`} role="status" aria-live="polite">
      <Icon size={15} aria-hidden="true" className={spinning ? 'live-status-spin' : undefined} />
      <span className="live-status-text">
        <strong>{status.label}</strong>
        <small>{status.detail}</small>
      </span>
      {connection === 'offline' && onReconnect && (
        <button type="button" onClick={onReconnect}>{sessionReplaced ? 'Rejoin here' : 'Try again'}</button>
      )}
    </div>
  )
}
