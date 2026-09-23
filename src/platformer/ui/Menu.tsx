import { ArrowLeft, Gamepad2, House, Music, Play, RotateCcw, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Sheet } from '../../ui'
import type { GameSession } from '../game/session'
import { Controls } from './Controls'
import type { SoundPrefs } from './prefs'

export type MenuView = 'main' | 'controls'

interface Props {
  open: boolean
  /** Which page it opens on (Controls from the ⋯ menu). */
  view?: MenuView
  session: GameSession
  building: boolean
  title: string
  sound: SoundPrefs
  onSound: (p: SoundPrefs) => void
  touch: boolean
  onClose: () => void
  onRestart: () => void
  onFeel: () => void
  onExit: () => void
  exitLabel: string
}

/**
 * The pause menu (Escape, the pause button, or Back): resume, restart, sound, controls and the way out. Solo games
 * pause while it is open; rooms keep going (it says so). The level's own things live in the header: its name, Scene,
 * People and the ⋯ menu.
 */
export function Menu(p: Props) {
  const [view, setView] = useState<MenuView>(p.view ?? 'main')
  useEffect(() => {
    if (p.open) setView(p.view ?? 'main')
  }, [p.open, p.view])
  const s = p.session
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
          </div>
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
