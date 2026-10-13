import { Flag, Hammer, RotateCcw } from 'lucide-react'
import { LOOP_REASON_TEXT } from '@brick-studio/platformer-core/engine/laps'
import { Button } from '../../ui'
import { MAX_RIVALS, formatRaceTime, type RaceHud } from './raceRun'

const ordinal = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) % 10 === 1 ? 0 : n % 10] || 'th')

interface Props {
  hud: RaceHud
  /** Solo races: how many computer racers, and changing it (starts a new race). */
  rivals?: number
  onRivals?: (n: number) => void
  onRaceAgain: () => void
  /** Back to building the track, when this player may build. */
  onBuild?: () => void
  /** Leave (starter tracks have no Build). */
  onExit?: () => void
  exitLabel?: string
  touch?: boolean
}

/** Everything drawn over a race: place, lap, time, standings, the start lights, why laps don't count, and the results. */
export function RaceHudView({ hud, rivals, onRivals, onRaceAgain, onBuild, onExit, exitLabel, touch }: Props) {
  const releaseFocus = () => requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur?.())
  return (
    <>
      <div className="p2d-race-hud" aria-live="off">
        <span className="p2d-race-place">{ordinal(hud.place)}</span>
        <span>{hud.loopProblem ? 'Free drive' : hud.youDone ? 'Finished' : `Lap ${hud.lap}/${hud.laps}`}</span>
        <span>⏱ {formatRaceTime(hud.time)}</span>
        <span>Best lap {hud.bestLap ? formatRaceTime(hud.bestLap) : '—'}</span>
      </div>

      {hud.racers > 1 && (
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

      {hud.lights > 0 && (
        <div className="p2d-race-lights" aria-label={hud.lights === 4 ? 'Go!' : `${4 - hud.lights}`} role="img">
          {[1, 2, 3].map((n) => (
            <i key={n} className={hud.lights === 4 ? 'go' : n <= hud.lights ? 'on' : ''} />
          ))}
        </div>
      )}

      {hud.loopProblem && hud.phase !== 'countdown' && <p className="p2d-race-note">{LOOP_REASON_TEXT[hud.loopProblem]}. Free drive for now.</p>}

      <div className="p2d-race-strip" onClickCapture={releaseFocus}>
        <span className="p2d-race-keys">
          {touch ? (
            'Racing needs a keyboard for now'
          ) : (
            <>
              <kbd>←</kbd>
              <kbd>→</kbd> steer · <kbd>↑</kbd> gas · <kbd>↓</kbd> brake · <kbd>R</kbd> restart
            </>
          )}
        </span>
        {onRivals && rivals !== undefined && (
          <label className="p2d-race-rivals">
            Computer racers
            <select value={rivals} onChange={(e) => onRivals(Number(e.target.value))}>
              {Array.from({ length: MAX_RIVALS + 1 }, (_, n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {hud.phase === 'results' && (
        <div className="p2d-race-results" role="dialog" aria-modal="true" aria-labelledby="p2d-race-results-title">
          <div className="p2d-card">
            <Flag size={28} aria-hidden="true" />
            <h2 id="p2d-race-results-title" className="p2d-clear-title">
              {hud.racers === 1 ? 'Finished!' : hud.place === 1 ? 'You won!' : `${ordinal(hud.place)} place`}
            </h2>
            <p className="p2d-lead">
              {hud.laps} laps in {formatRaceTime(hud.time)} · best lap {formatRaceTime(hud.bestLap)}
            </p>
            {hud.racers > 1 && (
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
            )}
            <div className="p2d-race-actions">
              <Button variant="primary" icon={<RotateCcw size={18} />} onClick={onRaceAgain} autoFocus>
                Race again
              </Button>
              {onBuild && (
                <Button icon={<Hammer size={18} />} onClick={onBuild}>
                  Back to building
                </Button>
              )}
              {!onBuild && onExit && <Button onClick={onExit}>{exitLabel ?? 'Back'}</Button>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
