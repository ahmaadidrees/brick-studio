import { Crown, Link2, Lock, RotateCcw, Save, Users } from 'lucide-react'
import { MAX_PLAYERS, type PlayerInfo } from '@brick-studio/platformer-core/net/protocol'
import { Button, Sheet } from '../../ui'
import type { GameSession } from '../game/session'
import { playerColor } from '../render/art/palette'

interface Props {
  open: boolean
  onClose: () => void
  session: GameSession
  /** Copy the room's link. */
  onInvite?: () => void
  inviteLink?: string
  onInviteMore?: () => void
}

/**
 * The header's People in a room: the invite link, who is here, and (for the host) the room's controls. The game keeps
 * going while it is open, as rooms never pause.
 */
export function PeopleSheet({ open, onClose, session, onInvite, inviteLink, onInviteMore }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="People" description="The game keeps going while this is open" variant="dialog" size="md" className="p2d-menu">
      {session.room && <RoomSection session={session} onInvite={onInvite} inviteLink={inviteLink} onInviteMore={onInviteMore} />}
    </Sheet>
  )
}

function RoomSection({ session, onInvite, inviteLink, onInviteMore }: { session: GameSession; onInvite?: () => void; inviteLink?: string; onInviteMore?: () => void }) {
  const room = session.room!
  const me = room.num
  const host = session.isHost
  const settings = session.settings
  const kick = (pl: PlayerInfo) => {
    if (confirm(`Remove ${pl.name} from the room? They can’t come back unless you let removed players back in.`)) room.kick(pl.num)
  }
  return (
    <section className="p2d-menu-section" aria-label="Room">
      {onInviteMore && <Button icon={<Users size={18} />} onClick={onInviteMore}>Invite more</Button>}
      {onInvite && (
        <>
          <h3>Invite</h3>
          <div className="p2d-invite">
            {inviteLink && <code>{inviteLink.replace(/^https?:\/\//, '')}</code>}
            <Button icon={<Link2 size={18} />} onClick={onInvite}>
              {session.classroomRoom ? 'Copy link for invited classmates' : 'Copy link'}
            </Button>
          </div>
        </>
      )}

      <h3>
        Players <span className="p2d-muted">{room.players.length} of {MAX_PLAYERS}</span>
      </h3>
      <ul className="p2d-players">
        {room.players.map((pl) => (
          <li key={pl.num}>
            <span className="p2d-swatch" style={{ background: playerColor(pl.num)[0] }} aria-hidden="true" />
            <span className="p2d-pname">{pl.name}</span>
            {pl.host && (
              <span className="p2d-tag" title="Host">
                <Crown size={14} aria-hidden="true" /> host
              </span>
            )}
            {!pl.canBuild && <span className="p2d-tag">look only</span>}
            {pl.num === me && <span className="p2d-tag p2d-you">you</span>}
            {host && !pl.host && pl.num !== me && (
              <Button size="sm" onClick={() => kick(pl)}>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>

      {host ? (
        <>
          <h3>Host controls</h3>
          <Switch label="Only I can build" detail="Everyone else can still play" on={settings.buildLocked} onChange={(v) => room.setSettings({ buildLocked: v })} />
          <Switch label="Let new players join" detail="People already here can always rejoin" on={!settings.closed} onChange={(v) => room.setSettings({ closed: !v })} />
          {!session.classroomRoom && (
            <div className="p2d-row-pair">
              <Button fullWidth icon={<Save size={18} />} onClick={() => room.saveLevel()}>
                Save room checkpoint
              </Button>
              <Button
                fullWidth
                icon={<RotateCcw size={18} />}
                onClick={() => {
                  if (confirm('Put the world back the way it was when you last saved it? Everyone sees the change.')) room.restoreLevel()
                }}
              >
                Restore save
              </Button>
            </div>
          )}
          <Button
            fullWidth
            icon={<RotateCcw size={18} />}
            onClick={() => {
              if (confirm('Bring back every coin, block and enemy for everyone?')) session.resetWorld()
            }}
          >
            Bring back coins and enemies
          </Button>
          {session.bannedCount > 0 && (
            <Button fullWidth icon={<Users size={18} />} onClick={() => room.unban()}>
              Let removed players back in ({session.bannedCount})
            </Button>
          )}
          {session.classroomRoom && <p className="p2d-note">This class world saves by itself; restore earlier versions from My worlds.</p>}
        </>
      ) : !session.roomCanBuild ? (
        <p className="p2d-note">
          <Lock size={16} aria-hidden="true" /> You can play this world, but not change it.
        </p>
      ) : settings.buildLocked ? (
        <p className="p2d-note">
          <Lock size={16} aria-hidden="true" /> The host has locked building. You can still play.
        </p>
      ) : null}
    </section>
  )
}

function Switch({ label, detail, on, onChange }: { label: string; detail: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" className="p2d-switch-row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="p2d-switch-text">
        <span className="p2d-switch-label">{label}</span>
        <span className="p2d-switch-detail">{detail}</span>
      </span>
      <span className="p2d-switch" aria-hidden="true">
        <span className="p2d-knob" />
      </span>
    </button>
  )
}
