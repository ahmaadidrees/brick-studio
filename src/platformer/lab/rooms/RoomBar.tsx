/**
 * The line under the header while a studio plays in a Hackable room (docs/qa/hackable-rooms M1): who is here, the
 * link to send, and Leave. The host's changes go to everyone (said once, here); what the room says comes up here too.
 */
import { Check, Copy, LogOut, Users, WifiOff } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button } from '../../../ui'
import type { RoomSession } from './session'
import './rooms.css'

export function RoomBar({ session, invite, onLeave, leaveLabel = 'Leave' }: {
  session: RoomSession
  /** The page people join from (a path on this site), or null when there is none to give (a class room's guests). */
  invite: string | null
  onLeave: () => void
  leaveLabel?: string
}) {
  const view = useSyncExternalStore((fn) => session.subscribe(fn), () => session.view)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])
  useEffect(() => {
    if (!view.notice) return
    const t = setTimeout(() => session.clearNotice(), 6000)
    return () => clearTimeout(t)
  }, [view.notice, session])

  const link = invite ? new URL(invite, window.location.origin).href : null
  const copy = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch { /* the link is on screen to copy by hand */ }
  }
  const offline = view.status === 'offline'
  const waiting = view.status === 'connecting' || view.status === 'reconnecting'
  return (
    <div className="hk-room-bar" role="region" aria-label="Playing together">
      <span className="hk-room-who">
        {offline ? <WifiOff size={16} aria-hidden="true" /> : <Users size={16} aria-hidden="true" />}
        {offline
          ? view.detail || 'Not connected to the room.'
          : waiting
            ? view.status === 'reconnecting' ? 'Reconnecting…' : 'Joining the room…'
            : <>
                <span className="hk-room-count">{view.players.length} playing</span>
                <span className="hk-room-names">
                  {view.players.map((p) => (
                    <span key={p.num} className={`hk-room-name${p.num === view.me ? ' hk-room-me' : ''}`}>
                      {p.name}{p.num === view.me ? ' (you)' : ''}{p.host ? ' · host' : ''}
                    </span>
                  ))}
                </span>
              </>}
      </span>
      {view.notice
        ? <span className="hk-room-notice" role="status">{view.notice}</span>
        : view.host && !offline && !waiting && <span className="hk-room-hint">Your changes go to everyone. Restart starts everyone again.</span>}
      {link && (
        <span className="hk-room-invite">
          <input className="hk-room-link" readOnly value={link} aria-label="Link to join" onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" variant="secondary" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </span>
      )}
      <Button size="sm" variant="quiet" icon={<LogOut size={16} />} onClick={onLeave}>{leaveLabel}</Button>
    </div>
  )
}
