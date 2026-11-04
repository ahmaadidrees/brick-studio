/**
 * The line under the header while a studio plays in a Hackable room (docs/qa/hackable-rooms M1): who is here, the
 * link to send, and Leave. The host's changes go to everyone (said once, here, where the host can edit); what the room
 * says comes up here too. The host also gets the room's controls: Restart where the page has no other, removing a
 * player, and closing the room to newcomers.
 */
import { Check, Copy, DoorClosed, DoorOpen, LogOut, RotateCcw, Settings2, UserMinus, Users, WifiOff } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button, Menu, MenuItem, MenuSeparator } from '../../../ui'
import { MAX_PLAYERS, type PlayerInfo } from './protocol'
import type { RoomSession } from './session'
import './rooms.css'

export function RoomBar({ session, invite, onLeave, leaveLabel = 'Leave', editing = false, onRestart }: {
  session: RoomSession
  /** The page people join from (a path on this site), or null when there is none to give (a class room's guests). */
  invite: string | null
  onLeave: () => void
  leaveLabel?: string
  /** The host edits the project on this screen (the studio), so their changes go to everyone. */
  editing?: boolean
  /** A Restart button for the host, where the page has none of its own (the join page). */
  onRestart?: () => void
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
  const live = !offline && !waiting
  const hosting = view.host && live
  const hint = editing ? 'Your changes go to everyone. Restart starts everyone again.' : onRestart ? 'Restart starts everyone again.' : ''
  return (
    <div className="hk-room-bar" role="region" aria-label="Playing together">
      <span className="hk-room-who">
        {offline ? <WifiOff size={16} aria-hidden="true" /> : <Users size={16} aria-hidden="true" />}
        {offline
          ? view.detail || 'Not connected to the room.'
          : waiting
            ? view.status === 'reconnecting' ? 'Reconnecting…' : 'Joining the room…'
            : <>
                <span className="hk-room-count">{view.players.filter((p) => !p.away).length} playing</span>
                <span className="hk-room-names">
                  {view.players.map((p) => (
                    <span key={p.num} className={`hk-room-name${p.num === view.me ? ' hk-room-me' : ''}${p.away ? ' hk-room-away' : ''}`}>
                      {p.name}{p.num === view.me ? ' (you)' : ''}{p.host ? ' · host' : ''}{p.away ? ' · reconnecting' : ''}
                    </span>
                  ))}
                </span>
                {view.settings.closed && <span className="hk-room-closed">Closed to new players</span>}
              </>}
      </span>
      {view.notice
        ? <span className="hk-room-notice" role="status">{view.notice}</span>
        : hosting && hint && <span className="hk-room-hint">{hint}</span>}
      {link && (
        <span className="hk-room-invite">
          <input className="hk-room-link" readOnly value={link} aria-label="Link to join" onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" variant="secondary" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </span>
      )}
      {hosting && onRestart && <Button size="sm" variant="secondary" icon={<RotateCcw size={16} />} onClick={onRestart}>Restart</Button>}
      {hosting && <HostControls session={session} players={view.players} me={view.me} closed={view.settings.closed} banned={view.banned} classroom={view.classroom} />}
      <Button size="sm" variant="quiet" icon={<LogOut size={16} />} onClick={onLeave}>{leaveLabel}</Button>
    </div>
  )
}

/** The host's room menu: remove a player, close the room to newcomers, let removed players back in. */
function HostControls({ session, players, me, closed, banned, classroom }: {
  session: RoomSession
  players: PlayerInfo[]
  me: number
  closed: boolean
  banned: number
  classroom: boolean
}) {
  const removable = players.filter((p) => p.num !== me && !p.host)
  const remove = (p: PlayerInfo) => {
    const message = classroom
      ? `Remove ${p.name} from the room? Their Hero goes. They can come back only when you let removed players back in.`
      : `Remove ${p.name} from the room? Their Hero goes, and they can’t come back unless you let removed players back in.`
    if (confirm(message)) session.removePlayer(p.num)
  }
  return (
    <Menu
      label="Room controls"
      align="end"
      width={300}
      header={<span className="hk-room-menu-head">{players.length} of {MAX_PLAYERS} players</span>}
      trigger={(props) => <Button {...props} size="sm" variant="secondary" icon={<Settings2 size={16} />}>Room</Button>}
    >
      {removable.map((p) => (
        <MenuItem key={p.num} icon={<UserMinus size={18} />} label={`Remove ${p.name}`} description={p.away ? 'Reconnecting now' : undefined} danger onSelect={() => remove(p)} />
      ))}
      {removable.length > 0 && <MenuSeparator />}
      {closed
        ? <MenuItem icon={<DoorOpen size={18} />} label="Let new players join" description="The room is closed: only people already in it can come back." onSelect={() => session.setClosed(false)} />
        : <MenuItem icon={<DoorClosed size={18} />} label="Close to new players" description="People already in the room can still come back." onSelect={() => session.setClosed(true)} />}
      {banned > 0 && <MenuItem icon={<Users size={18} />} label={`Let removed players back in (${banned})`} onSelect={() => session.letRemovedBack()} />}
    </Menu>
  )
}
