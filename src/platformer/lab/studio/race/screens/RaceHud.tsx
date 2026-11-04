import { Hammer, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../../../../ui'
import type { Runtime } from '../../../core/runtime'
import { useStudio, type StudioStore } from '../../store'
import { formatRaceTime, ordinal, readRaceHud, type RaceHudState } from './raceHudState'
import './raceScreens.css'

/** How often the HUD reads the race (ten times a second is plenty for a lap counter and a countdown). */
export const RACE_HUD_MS = 100
const HINT_MS = 7000

const same = (a: RaceHudState | null, b: RaceHudState): boolean => !!a && JSON.stringify(a) === JSON.stringify(b)

/** What the Starter says when the race starts (raceTrack.ts): the race clock counts from that tick. */
export const RACE_GO = 'go'

/** The race as the HUD sees it now, read again every RACE_HUD_MS. */
function useRaceHud(runtime: Runtime | null, store: StudioStore): RaceHudState | null {
  const [hud, setHud] = useState<RaceHudState | null>(null)
  useEffect(() => {
    if (!runtime) {
      setHud(null)
      return
    }
    const design = store.getState().project.design
    let startTick: number | null = null
    const read = () => {
      const next = readRaceHud(runtime.world, design, startTick)
      setHud((prev) => (same(prev, next) ? prev : next))
    }
    // The first "go" of this game starts the clock, on the exact tick it was said.
    const off = runtime.onBroadcast((message) => {
      if (startTick === null && message.trim().toLowerCase() === RACE_GO) startTick = runtime.world.tick
    })
    read()
    const timer = setInterval(read, RACE_HUD_MS)
    return () => {
      clearInterval(timer)
      off()
    }
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
        {hud.time !== null && <span className="race-hud-time" role="timer">⏱ {formatRaceTime(hud.time)}</span>}
        {hud.time !== null && !hud.noLaps && <span className="race-hud-best">Best lap {hud.bestLap !== null ? formatRaceTime(hud.bestLap) : '—'}</span>}
      </div>

      {hud.live.length > 1 && !hud.finished && (
        <ol className="race-standings" aria-label="Standings">
          {hud.live.map((s) => (
            <li key={`${s.place}-${s.name}`} className={s.you ? 'is-you' : undefined}>
              <b>{s.place}</b>
              <span>{s.name}</span>
              <em>{s.done ? 'done' : `lap ${s.lap}`}</em>
            </li>
          ))}
        </ol>
      )}

      {hud.countdown && (
        <div className={`race-countdown${/^go\b/i.test(hud.countdown) ? ' is-go' : ''}`} role="status" aria-live="assertive">
          {/* Remount per word, so each one pops in. */}
          <span key={hud.countdown}>{hud.countdown}</span>
        </div>
      )}

      {hud.noLaps && !hud.countdown && <p className="race-hud-note" role="status">{hud.noLaps}. Free drive for now.</p>}

      {hint && !hud.finished && !hud.noLaps && (
        <div className="p2d-hint p2d-hint-top play-hint race-hint" role="status">
          <kbd>←</kbd> <kbd>→</kbd> steer · <kbd>↑</kbd> gas · <kbd>↓</kbd> brake · or <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd>
        </div>
      )}

      {hud.finished && (
        <div className="p2d-overlay race-results">
          <div className="p2d-card p2d-clear" role="dialog" aria-label="Race results">
            <p className="p2d-kicker">{hud.laps === 1 ? '1 lap done' : `${hud.laps} laps done`}</p>
            <h2 className="p2d-clear-title">{hud.racers <= 1 ? 'Finished!' : hud.place === 1 ? 'You won!' : `${ordinal(hud.place)} place`}</h2>
            {hud.time !== null && (
              <p className="p2d-clear-time">
                <span>Time</span> {formatRaceTime(hud.time)}
                {hud.bestLap !== null && (
                  <>
                    {' '}
                    · <span>Best lap</span> {formatRaceTime(hud.bestLap)}
                  </>
                )}
              </p>
            )}
            {hud.standings.length > 1 && (
              <ol className="race-results-list" aria-label="Places">
                {hud.standings.map((s) => (
                  <li key={`${s.place}-${s.name}`} className={s.you ? 'is-you' : undefined}>
                    <b>{ordinal(s.place)}</b>
                    <span>{s.you && s.name.trim().toLowerCase() !== 'you' ? `${s.name} (you)` : s.name}</span>
                    {!s.done && <em>still racing</em>}
                    {s.done && s.time != null && <em className="race-results-time">{formatRaceTime(s.time)}</em>}
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
