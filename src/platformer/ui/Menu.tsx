import {
  ArrowLeft,
  Crown,
  Gamepad2,
  House,
  Link2,
  Lock,
  Music,
  Play,
  RotateCcw,
  Save,
  Share2,
  SlidersHorizontal,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useState } from 'react'
import { MAX_PLAYERS, type PlayerInfo } from '@brick-studio/platformer-core/net/protocol'
import { Button, SegmentedControl, Sheet, TextField } from '../../ui'
import type { GameSession } from '../game/session'
import { playerColor } from '../render/art/palette'
import { Art } from './art'
import { Controls } from './Controls'
import type { SoundPrefs } from './prefs'

interface Props {
  open: boolean
  session: GameSession
  building: boolean
  title: string
  onTitle: (t: string) => void
  onTitleDone: () => void
  sound: SoundPrefs
  onSound: (p: SoundPrefs) => void
  touch: boolean
  onClose: () => void
  onRestart: () => void
  /** Solo: copy a link that carries the whole level. */
  onShareLink?: () => void
  /** A student's own account level: share it with the class (the shared invite sheet). */
  onShareWithClass?: () => void
  /** Rooms: copy the room's link. */
  onInvite?: () => void
  inviteLink?: string
  onFeel: () => void
  onExit: () => void
  exitLabel: string
}

/**
 * Everything that is not playing or placing things. Solo games pause while it is open; rooms keep going (it says
 * so). The shared Sheet gives it Escape, focus handling and the bottom-sheet layout on phones and tablets.
 */
export function Menu(p: Props) {
  const [view, setView] = useState<'main' | 'controls'>('main')
  const s = p.session
  const room = s.room
  const theme = s.timeline.world.design.theme
  const restartLabel = p.building ? 'Play from the start' : s.solo ? 'Restart the level' : 'Back to the start'
  const kicker = view === 'controls' ? 'Controls' : s.solo ? 'Paused' : 'The game keeps going while this is open'
  return (
    <Sheet
      open={p.open}
      onClose={p.onClose}
      title={p.title || 'Untitled level'}
      description={kicker}
      variant="dialog"
      size="md"
      className="p2d-menu"
      headerStart={view === 'controls' ? <Button variant="quiet" size="sm" iconOnly icon={<ArrowLeft size={18} />} aria-label="Back to the menu" onClick={() => setView('main')}>Back to the menu</Button> : undefined}
    >
      {view === 'controls' ? (
        <Controls touch={p.touch} gamepad={s.input.gamepadName} />
      ) : (
        <div className="p2d-menu-body">
          <div className="p2d-menu-list">
            <Button variant="primary" fullWidth icon={<Play size={18} />} onClick={p.onClose}>
              {p.building ? 'Back to building' : 'Resume'}
            </Button>
            <Button fullWidth icon={<RotateCcw size={18} />} onClick={p.onRestart}>
              {restartLabel}
            </Button>
            <div className="p2d-row-pair">
              <Button fullWidth pressed={!p.sound.muted} icon={p.sound.muted ? <VolumeX size={18} /> : <Volume2 size={18} />} onClick={() => p.onSound({ ...p.sound, muted: !p.sound.muted })}>
                Sound {p.sound.muted ? 'off' : 'on'}
              </Button>
              <Button fullWidth pressed={p.sound.music} icon={<Music size={18} />} onClick={() => p.onSound({ ...p.sound, music: !p.sound.music })}>
                Music {p.sound.music ? 'on' : 'off'}
              </Button>
            </div>
            {p.onShareWithClass && (
              <Button fullWidth icon={<Users size={18} />} onClick={p.onShareWithClass}>
                Share with my class
              </Button>
            )}
            {p.onShareLink && (
              <Button fullWidth icon={<Share2 size={18} />} onClick={p.onShareLink}>
                Copy a link to this level
              </Button>
            )}
          </div>

          {room && <RoomSection session={s} onInvite={p.onInvite} inviteLink={p.inviteLink} />}

          {p.building && s.canBuild && (
            <section className="p2d-menu-section" aria-label="This level">
              <h3>This level</h3>
              <TextField
                label="Name"
                value={p.title}
                maxLength={60}
                autoComplete="off"
                onChange={(e) => p.onTitle(e.target.value)}
                onBlur={p.onTitleDone}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
              <SegmentedControl<'day' | 'underground'>
                label="Look"
                showLabel
                fullWidth
                value={theme}
                onChange={(t) => theme !== t && s.applyEdit([{ o: 'theme', theme: t }])}
                options={[
                  { value: 'day', label: 'Day', icon: <Art k="g:14:day" scale={1} /> },
                  { value: 'underground', label: 'Underground', icon: <Art k="g:14:underground" scale={1} /> },
                ]}
              />
              {s.solo && (
                <Button fullWidth icon={<RotateCcw size={18} />} onClick={() => s.resetWorld()}>
                  Bring back coins and enemies
                </Button>
              )}
            </section>
          )}

          <div className="p2d-menu-list">
            <Button fullWidth variant="quiet" icon={<Gamepad2 size={18} />} onClick={() => setView('controls')}>
              Controls
            </Button>
            <Button fullWidth variant="quiet" icon={<SlidersHorizontal size={18} />} onClick={p.onFeel}>
              Tune how the player moves
            </Button>
            <Button fullWidth variant="quiet" icon={<House size={18} />} onClick={p.onExit}>
              {p.exitLabel}
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}

function RoomSection({ session, onInvite, inviteLink }: { session: GameSession; onInvite?: () => void; inviteLink?: string }) {
  const room = session.room!
  const me = room.num
  const host = session.isHost
  const settings = session.settings
  const kick = (pl: PlayerInfo) => {
    if (confirm(`Remove ${pl.name} from the room? They can’t come back unless you let removed players back in.`)) room.kick(pl.num)
  }
  return (
    <section className="p2d-menu-section" aria-label="Room">
      {onInvite && (
        <>
          <h3>Invite</h3>
          <div className="p2d-invite">
            {inviteLink && <code>{inviteLink.replace(/^https?:\/\//, '')}</code>}
            <Button icon={<Link2 size={18} />} onClick={onInvite}>
              Copy link
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
                Save level
              </Button>
              <Button
                fullWidth
                icon={<RotateCcw size={18} />}
                onClick={() => {
                  if (confirm('Put the level back the way it was when you last saved it? Everyone sees the change.')) room.restoreLevel()
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
          {session.classroomRoom && <p className="p2d-note">This class level saves to its account world by itself; restore earlier versions from My worlds.</p>}
        </>
      ) : !session.roomCanBuild ? (
        <p className="p2d-note">
          <Lock size={16} aria-hidden="true" /> You can play this level, but not change it.
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
