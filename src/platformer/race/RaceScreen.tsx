import { ArrowLeft, Flag, RotateCcw, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CAR_FEEL_GROUPS, CAR_FEEL_PRESETS, DEFAULT_CAR_FEEL, type CarFeel } from '@brick-studio/platformer-core/engine/car'
import { LOOP_REASON_TEXT } from '@brick-studio/platformer-core/engine/laps'
import type { LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { AppHeader } from '../../shell'
import { Button, SegmentedControl } from '../../ui'
import { RaceSession, formatRaceTime, type CameraMode, type RaceHud, type SteerMode } from './raceSession'

/*
 * Racing a race-kit level on your own, against computer racers: the starter tracks today, any race level once the
 * builder lands (milestone 2). The Feel panel tunes the car live and remembers it in this browser.
 */

const FEEL_KEY = 'p2d-race-feel'

interface SavedFeel {
  feel: CarFeel
  steer: SteerMode
  camera: CameraMode
}

function loadFeel(): SavedFeel {
  try {
    const s = JSON.parse(localStorage.getItem(FEEL_KEY) || 'null') as Partial<SavedFeel> | null
    return { feel: { ...DEFAULT_CAR_FEEL, ...(s?.feel ?? {}) }, steer: s?.steer === 'point' ? 'point' : 'turn', camera: s?.camera === 'turn' ? 'turn' : 'map' }
  } catch {
    return { feel: { ...DEFAULT_CAR_FEEL }, steer: 'turn', camera: 'map' }
  }
}
function saveFeel(s: SavedFeel) {
  try {
    localStorage.setItem(FEEL_KEY, JSON.stringify(s))
  } catch {
    // Private windows: the feel just isn't remembered.
  }
}

const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) % 10 === 1 ? 0 : n % 10] || 'th')

export function RaceScreen({ level, onExit, exitLabel = 'Back' }: { level: LevelDesign; onExit: () => void; exitLabel?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sessionRef = useRef<RaceSession | null>(null)
  const [hud, setHud] = useState<RaceHud | null>(null)
  const [rivals, setRivals] = useState(2)
  const [feelOpen, setFeelOpen] = useState(false)
  const [saved, setSaved] = useState<SavedFeel>(loadFeel)

  useEffect(() => {
    const s = new RaceSession(level, canvasRef.current!, { rivals, onHud: setHud })
    sessionRef.current = s
    s.start()
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.isContentEditable)) return
      if (e.code === 'KeyR' && !e.repeat && !e.metaKey && !e.ctrlKey) s.restart()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      s.stop()
      sessionRef.current = null
    }
    // One session per level; rivals change through restart().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level])

  useEffect(() => {
    const s = sessionRef.current
    if (!s) return
    s.feel = saved.feel
    s.steerMode = saved.steer
    s.cameraMode = saved.camera
    saveFeel(saved)
  }, [saved])

  const restart = () => sessionRef.current?.restart(rivals)
  const changeRivals = (n: number) => {
    setRivals(n)
    sessionRef.current?.restart(n)
  }
  const setFeel = (feel: CarFeel) => setSaved((s) => ({ ...s, feel }))
  const preset = Object.entries(CAR_FEEL_PRESETS).find(([, p]) => (Object.keys(p) as (keyof CarFeel)[]).every((k) => p[k] === saved.feel[k]))?.[0]
  // Clicking a control should not keep the arrow keys from driving.
  const releaseFocus = () => requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur?.())
  const me = hud?.standings.find((s) => s.you)

  return (
    <div className="p2d-game p2d-race p2d-playing">
      <div className="p2d-header">
        <AppHeader
          variant="page"
          title={level.title}
          actions={
            <>
              <Button size="sm" variant="quiet" icon={<SlidersHorizontal size={16} />} pressed={feelOpen} onClick={() => setFeelOpen((o) => !o)}>
                Feel
              </Button>
              <Button size="sm" variant="quiet" icon={<RotateCcw size={16} />} onClick={restart}>
                Restart
              </Button>
              <Button size="sm" icon={<ArrowLeft size={16} />} onClick={onExit}>
                {exitLabel}
              </Button>
            </>
          }
        />
      </div>

      <div className="p2d-body">
        <canvas ref={canvasRef} className="p2d-race-canvas" aria-label={`Race track: ${level.title}`} />

        {hud && (
          <div className="p2d-race-hud" aria-live="off">
            <span className="p2d-race-place">{ordinal(hud.place)}</span>
            <span>{hud.loopProblem ? 'Free drive' : me?.done ? 'Finished' : `Lap ${hud.lap}/${hud.laps}`}</span>
            <span>⏱ {formatRaceTime(hud.time)}</span>
            <span>Best lap {hud.bestLap ? formatRaceTime(hud.bestLap) : '—'}</span>
          </div>
        )}

        {hud && hud.racers > 1 && (
          <ol className="p2d-race-standings" aria-label="Standings">
            {hud.standings.map((s, i) => (
              <li key={s.name} className={s.you ? 'me' : ''}>
                <b>{i + 1}</b>
                <i style={{ background: s.color }} />
                {s.name}
                <em>{s.done ? 'done' : hud.loopProblem ? '' : `lap ${s.lap}`}</em>
              </li>
            ))}
          </ol>
        )}

        {hud && hud.lights > 0 && (
          <div className="p2d-race-lights" aria-label={hud.lights === 4 ? 'Go!' : `${4 - hud.lights}`} role="img">
            {[1, 2, 3].map((n) => (
              <i key={n} className={hud.lights === 4 ? 'go' : n <= hud.lights ? 'on' : ''} />
            ))}
          </div>
        )}

        {hud?.loopProblem && hud.phase !== 'countdown' && <p className="p2d-race-note">{LOOP_REASON_TEXT[hud.loopProblem]}. Free drive for now.</p>}

        <div className="p2d-race-strip" onClickCapture={releaseFocus}>
          <span className="p2d-race-keys">
            <kbd>←</kbd>
            <kbd>→</kbd> steer · <kbd>↑</kbd> gas · <kbd>↓</kbd> brake · <kbd>R</kbd> restart
          </span>
          <label className="p2d-race-rivals">
            Computer racers
            <select value={rivals} onChange={(e) => changeRivals(Number(e.target.value))}>
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {feelOpen && (
          <aside className="p2d-feel p2d-race-feel" aria-label="Tune how the car drives" onKeyDown={(e) => e.stopPropagation()} onPointerUp={releaseFocus}>
            <header>
              <h2>How the car drives</h2>
              <Button variant="quiet" size="sm" iconOnly icon={<X size={18} />} aria-label="Close" onClick={() => setFeelOpen(false)}>
                Close
              </Button>
            </header>
            <p className="p2d-feel-hint">Changes apply right away, even mid-race, and stay in this browser. Each slider becomes a knob on a race brick later.</p>
            <div className="p2d-race-presets" role="group" aria-label="Presets">
              {Object.keys(CAR_FEEL_PRESETS).map((name) => (
                <Button key={name} size="sm" variant={preset === name ? 'primary' : 'secondary'} onClick={() => setFeel({ ...CAR_FEEL_PRESETS[name] })}>
                  {name}
                </Button>
              ))}
            </div>
            {CAR_FEEL_GROUPS.map((g) => (
              <section key={g.title}>
                <h3>{g.title}</h3>
                {g.fields.map((f) => {
                  const v = saved.feel[f.key]
                  return (
                    <label key={f.key} className={v === DEFAULT_CAR_FEEL[f.key] ? '' : 'changed'} title={f.hint}>
                      <span className="name">{f.label}</span>
                      <input type="range" min={f.min} max={f.max} step={f.step} value={v} onChange={(e) => setFeel({ ...saved.feel, [f.key]: Number(e.target.value) })} />
                      <span className="value">{f.step >= 1 ? v : v.toFixed(2)}</span>
                    </label>
                  )
                })}
              </section>
            ))}
            <h3>Controls</h3>
            <div className="p2d-race-choices">
              <SegmentedControl<SteerMode>
                label="Steering"
                showLabel
                size="sm"
                value={saved.steer}
                onChange={(steer) => setSaved((s) => ({ ...s, steer }))}
                options={[{ value: 'turn', label: '← → turn the car' }, { value: 'point', label: 'Arrows point the way' }]}
              />
              <SegmentedControl<CameraMode>
                label="Camera"
                showLabel
                size="sm"
                value={saved.camera}
                onChange={(camera) => setSaved((s) => ({ ...s, camera }))}
                options={[{ value: 'map', label: 'Map stays still' }, { value: 'turn', label: 'Map turns with car' }]}
              />
            </div>
            <footer>
              <Button size="sm" onClick={() => setFeel({ ...DEFAULT_CAR_FEEL })} disabled={preset === 'Kart'}>
                Reset to Kart
              </Button>
              <Button size="sm" onClick={() => void navigator.clipboard?.writeText(JSON.stringify({ ...saved.feel, steer: saved.steer, camera: saved.camera }, null, 2))}>
                Copy settings
              </Button>
            </footer>
          </aside>
        )}

        {hud?.phase === 'results' && (
          <div className="p2d-race-results" role="dialog" aria-modal="true" aria-labelledby="p2d-race-results-title">
            <div className="p2d-card">
              <Flag size={28} aria-hidden="true" />
              <h2 id="p2d-race-results-title" className="p2d-clear-title">
                {hud.place === 1 ? 'You won!' : `${ordinal(hud.place)} place`}
              </h2>
              <p className="p2d-lead">
                {hud.laps} laps in {formatRaceTime(hud.time)} · best lap {formatRaceTime(hud.bestLap)}
              </p>
              <ol className="p2d-race-final">
                {hud.standings.map((s, i) => (
                  <li key={s.name} className={s.you ? 'me' : ''}>
                    <b>{i + 1}</b>
                    <i style={{ background: s.color }} />
                    <span>{s.name}</span>
                    <em>{s.done ? formatRaceTime(s.time) : 'still racing'}</em>
                  </li>
                ))}
              </ol>
              <div className="p2d-race-actions">
                <Button variant="primary" icon={<RotateCcw size={18} />} onClick={restart} autoFocus>
                  Race again
                </Button>
                <Button onClick={onExit}>{exitLabel}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
