/**
 * The line under the header while a studio plays in a Hackable room (docs/qa/hackable-rooms M1, M2): who is here and
 * what each is editing, the link to send, and Leave. Changes go to everyone (said once, here, where you can edit);
 * what the room says comes up here too. The host also gets the room's controls: who may build and who may change code
 * (for everyone, or one player at a time), Undo last change, removing a player and closing the room to newcomers
 * (Restart is on the stage, for the host only). Everyone gets Changes: the room's recent changes, and Undo for their own.
 */
import { Blocks, Check, Code2, Copy, DoorClosed, DoorOpen, Hammer, History, LogOut, Lock, Settings2, Undo2, UserMinus, Users, WifiOff } from 'lucide-react'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { Button, Menu, MenuItem, MenuSeparator } from '../../../ui'
import { MAX_PLAYERS, type HistoryItem, type PlayerInfo, type RoomSettings } from './protocol'
import type { RoomSession } from './session'
import './rooms.css'

export function RoomBar({ session, invite, onLeave, leaveLabel = 'Leave', editing = false }: {
  session: RoomSession
  /** The page people join from (a path on this site), or null when there is none to give (a class room's guests). */
  invite: string | null
  onLeave: () => void
  leaveLabel?: string
  /** The host edits the project on this screen (the studio), so their changes go to everyone. */
  editing?: boolean
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
  // Where the host can't edit (the join page), only Restart is theirs.
  const hint = editing ? 'Your changes go to everyone. Restart starts everyone again.' : 'Restart starts everyone again.'
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
                    <span key={p.num} className={`hk-room-name${p.num === view.me ? ' hk-room-me' : ''}${p.away ? ' hk-room-away' : ''}`} title={roleWords(p)}>
                      {p.name}{p.num === view.me ? ' (you)' : ''}{p.host ? ' · host' : ''}{p.away ? ' · reconnecting' : ''}
                      {!p.host && p.code && <Code2 className="hk-room-role" size={13} aria-label="can change code" />}
                      {p.editing && !p.away && <span className="hk-room-editing"> · {p.editing}</span>}
                    </span>
                  ))}
                </span>
                {view.settings.closed && <span className="hk-room-closed">Closed to new players</span>}
              </>}
      </span>
      {view.notice
        ? <span className="hk-room-notice" role="status">{view.notice}</span>
        : hosting && <span className="hk-room-hint">{hint}</span>}
      {link && (
        <span className="hk-room-invite">
          <input className="hk-room-link" readOnly value={link} aria-label="Link to join" onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" variant="secondary" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={() => void copy()}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </span>
      )}
      {live && view.history.length > 0 && <Changes session={session} history={view.history} me={view.me} host={view.host} />}
      {hosting && <HostControls session={session} players={view.players} me={view.me} settings={view.settings} banned={view.banned} classroom={view.classroom} history={view.history} />}
      <Button size="sm" variant="quiet" icon={<LogOut size={16} />} onClick={onLeave}>{leaveLabel}</Button>
    </div>
  )
}

/** What a player may do, in words (the chip's tooltip). */
function roleWords(p: PlayerInfo): string {
  if (p.host) return 'Host: can build, change code and run the room'
  if (p.code && p.build) return 'Can build and change code'
  if (p.code) return 'Can change code'
  if (p.build) return 'Can build'
  return 'Can play'
}

/** The room's recent changes, newest first: Undo for our own (the host: anyone's). */
function Changes({ session, history, me, host }: { session: RoomSession; history: HistoryItem[]; me: number; host: boolean }) {
  const items = [...history].reverse()
  return (
    <Menu
      label="Changes"
      align="end"
      width={340}
      header={<span className="hk-room-menu-head">Recent changes{host ? ' (you can put back any)' : ''}</span>}
      trigger={(props) => <Button {...props} size="sm" variant="secondary" icon={<History size={16} />}>Changes</Button>}
    >
      {items.map((h) => {
        const mine = h.by === me
        const can = !h.undone && (mine || host)
        return (
          <MenuItem
            key={h.seq}
            icon={h.undone ? <Undo2 size={18} /> : h.kind === 'code' ? <Code2 size={18} /> : <Hammer size={18} />}
            label={`${mine ? 'You' : h.name} ${h.summary}`}
            description={h.undone ? 'Put back' : can ? 'Press to put it back' : undefined}
            disabled={!can}
            onSelect={() => session.undo(h.seq)}
          />
        )
      })}
    </Menu>
  )
}

/**
 * The host's room menu: who may build and change code (everyone, or one player at a time), Undo last change, remove a
 * player, close the room to newcomers, let removed players back in.
 */
function HostControls({ session, players, me, settings, banned, classroom, history }: {
  session: RoomSession
  players: PlayerInfo[]
  me: number
  settings: RoomSettings
  banned: number
  classroom: boolean
  history: HistoryItem[]
}) {
  const closed = settings.closed
  const others = players.filter((p) => p.num !== me && !p.host)
  const last = [...history].reverse().find((h) => !h.undone)
  const removable = others
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
      width={320}
      header={<span className="hk-room-menu-head">{players.length} of {MAX_PLAYERS} players</span>}
      trigger={(props) => <Button {...props} size="sm" variant="secondary" icon={<Settings2 size={16} />}>Room</Button>}
    >
      {last && <MenuItem icon={<Undo2 size={18} />} label="Undo last change" description={`${last.by === me ? 'You' : last.name} ${last.summary}`} onSelect={() => session.undo(last.seq)} />}
      {last && <MenuSeparator />}
      {settings.build
        ? <MenuItem icon={<Lock size={18} />} label="Stop everyone building" description="Building is on: everyone can place and paint bricks." onSelect={() => session.setRoles({ build: false })} />
        : <MenuItem icon={<Hammer size={18} />} label="Let everyone build" description="Building is off: only you can change the game." onSelect={() => session.setRoles({ build: true })} />}
      {settings.code
        ? <MenuItem icon={<Lock size={18} />} label="Turn code off for everyone" description="Code is on for everyone. Players you let in one by one keep it." onSelect={() => session.setRoles({ code: false })} />
        : <MenuItem icon={<Code2 size={18} />} label="Turn code on for everyone" description="Code is off: only you, and players you let in, can change code." onSelect={() => session.setRoles({ code: true })} />}
      {!settings.code && others.map((p) => (
        p.code
          ? <MenuItem key={`code-${p.num}`} icon={<Check size={18} />} label={`${p.name} can change code`} description="Press to turn code off for them." onSelect={() => session.grantCode(p.num, false)} />
          : <MenuItem key={`code-${p.num}`} icon={<Blocks size={18} />} label={`Let ${p.name} change code`} description="Just them: everyone else keeps building." onSelect={() => session.grantCode(p.num, true)} />
      ))}
      <MenuSeparator />
      {removable.map((p) => (
        <MenuItem key={p.num} icon={<UserMinus size={18} />} label={`Remove ${p.name}`} description={p.away ? 'Reconnecting now' : undefined} danger onSelect={() => remove(p)} />
      ))}
      {removable.length > 0 && <MenuSeparator />}
      {closed
        ? <MenuItem icon={<DoorOpen size={18} />} label="Let new players join" description="Closed now: only players already in can rejoin." onSelect={() => session.setClosed(false)} />
        : <MenuItem icon={<DoorClosed size={18} />} label="Close to new players" description="Players already in can still rejoin." onSelect={() => session.setClosed(true)} />}
      {banned > 0 && <MenuItem icon={<Users size={18} />} label={`Let removed players back in (${banned})`} onSelect={() => session.letRemovedBack()} />}
    </Menu>
  )
}
