import { Hammer, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../../../../ui'
import type { Runtime } from '../../../core/runtime'
import { useStudio, type StudioStore } from '../../store'
import { ordinal, readRaceHud, type RaceHudState } from './raceHudState'
import './raceScreens.css'

/** How often the HUD reads the race (ten times a second is plenty for a lap counter and a countdown). */
export const RACE_HUD_MS = 100
const HINT_MS = 7000

const same = (a: RaceHudState | null, b: RaceHudState): boolean => !!a && JSON.stringify(a) === JSON.stringify(b)

/** The race as the HUD sees it now, read again every RACE_HUD_MS. */
function useRaceHud(runtime: Runtime | null, store: StudioStore): RaceHudState | null {
  const [hud, setHud] = useState<RaceHudState | null>(null)
  useEffect(() => {
    if (!runtime) {
      setHud(null)
      return
    }
    const design = store.getState().project.design
    const read = () => {
      const next = readRaceHud(runtime.world, design)
      setHud((prev) => (same(prev, next) ? prev : next))
    }
    read()
    const timer = setInterval(read, RACE_HUD_MS)
    return () => clearInterval(timer)
  }, [runtime, store])
  return hud
}

/**
 * Racing's Play HUD: the Starter's countdown in big numbers (the Starter can be off camera), the lap and your place,
 * then a results card with Race again and Keep building. It only reads the running race.
 */
export function RaceHud({ store }: { store: StudioStore }) {
  const runtime = useStudio(store, (s) => s.runtime)
  const hud = useRaceHud(runtime, store)
  const [hint, setHint] = useState(true)
  useEffect(() => {
    setHint(true)
    if (!runtime) return
    const t = setTimeout(() => setHint(false), HINT_MS)
    return () => clearTimeout(t)
  }, [runtime])

  if (!runtime || !hud) return null
  const showPlace = hud.place > 0 && hud.racers > 1 && !hud.noLaps
  const status = hud.noLaps ? 'Free drive' : hud.finished ? 'Finished' : `Lap ${hud.lap}/${hud.laps}`

  return (
    <>
      <div className="race-hud" role="status" aria-label={showPlace ? `${status}, ${ordinal(hud.place)}` : status}>
        {showPlace && <span className="race-hud-place">{ordinal(hud.place)}</span>}
        <span className="race-hud-lap">{status}</span>
      </div>

      {hud.countdown && (
        <div className={`race-countdown${/^go\b/i.test(hud.countdown) ? ' is-go' : ''}`} role="status" aria-live="assertive">
          {/* Remount per word, so each one pops in. */}
          <span key={hud.countdown}>{hud.countdown}</span>
        </div>
      )}

      {hud.noLaps && !hud.countdown && <p className="race-hud-note" role="status">{hud.noLaps}. Free drive for now.</p>}

      {hint && !hud.finished && !hud.noLaps && (
        <div className="p2d-hint p2d-hint-top play-hint race-hint" role="status">
          <kbd>←</kbd> <kbd>→</kbd> steer · <kbd>↑</kbd> gas · <kbd>↓</kbd> brake
        </div>
      )}

      {hud.finished && (
        <div className="p2d-overlay race-results">
          <div className="p2d-card p2d-clear" role="dialog" aria-label="Race results">
            <p className="p2d-kicker">{hud.laps === 1 ? '1 lap done' : `${hud.laps} laps done`}</p>
            <h2 className="p2d-clear-title">{hud.racers <= 1 ? 'Finished!' : hud.place === 1 ? 'You won!' : `${ordinal(hud.place)} place`}</h2>
            {hud.standings.length > 1 && (
              <ol className="race-results-list" aria-label="Places">
                {hud.standings.map((s) => (
                  <li key={`${s.place}-${s.name}`} className={s.you ? 'is-you' : undefined}>
                    <b>{ordinal(s.place)}</b>
                    <span>{s.you && s.name.trim().toLowerCase() !== 'you' ? `${s.name} (you)` : s.name}</span>
                    {!s.done && <em>still racing</em>}
                  </li>
                ))}
              </ol>
            )}
            <Button variant="primary" fullWidth icon={<RotateCcw size={18} />} autoFocus onClick={() => store.play()}>
              Race again
            </Button>
            <Button fullWidth icon={<Hammer size={18} />} onClick={() => store.stop()}>
              Keep building
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
