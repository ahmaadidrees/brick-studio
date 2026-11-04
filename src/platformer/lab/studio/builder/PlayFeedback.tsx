import { Hammer, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../../ui'
import { useStudio, type StudioStore } from '../store'
import { bestTime, checkLevelForPlay, COURSE_CLEAR, formatPlayTime, HERO_HURT, HERO_OUCH, NO_GOAL_NOTE, PLAY_CONTROLS_HINT, powerKeys, powerKeysHint, readCoins, recordClear, saysOuch } from './playRules'

const HINT_MS = 7000
const HURT_MS = 1600

/**
 * What a kid sees while the level plays, using the real 2D builder's own look (`/2d/build`: p2d-hint, p2d-toast,
 * p2d-clear): a controls hint when Play starts, a coin counter and the time, "Try again" when the Hero is hurt, and
 * "You made it!" with the time and the best time when the Goal says the course is clear. It only listens to the running
 * game; the engine knows nothing about it. The time is the game's own ticks since Play, so it never drifts.
 */
export function PlayFeedback({ store }: { store: StudioStore }) {
  const runtime = useStudio(store, (s) => s.runtime)
  const [hint, setHint] = useState(true)
  const [hurt, setHurt] = useState(0)
  const [won, setWon] = useState<{ coins: number | null; time: number; best: number | null; newBest: boolean } | null>(null)
  const [coins, setCoins] = useState<number | null>(null)
  const [time, setTime] = useState(0)
  const hurtTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setHint(true)
    setHurt(0)
    setWon(null)
    if (!runtime) return
    const design = store.getState().project.design
    setCoins(readCoins(runtime, design))
    setTime(0)
    let clearedAt: number | null = null
    const hintTimer = setTimeout(() => setHint(false), HINT_MS)
    const coinTimer = setInterval(() => {
      setCoins(readCoins(runtime, design))
      setTime(clearedAt ?? runtime.world.tick)
    }, 100)
    const hurtMessage = saysOuch(design) ? HERO_OUCH : HERO_HURT
    const off = runtime.onBroadcast((message) => {
      const m = message.trim().toLowerCase()
      if (m === COURSE_CLEAR) {
        if (clearedAt !== null) return
        clearedAt = runtime.world.tick
        const newBest = recordClear(design, clearedAt)
        setTime(clearedAt)
        setWon({ coins: readCoins(runtime, design), time: clearedAt, best: bestTime(design), newBest })
      } else if (m === hurtMessage) {
        setHurt((n) => n + 1)
        if (hurtTimer.current) clearTimeout(hurtTimer.current)
        hurtTimer.current = setTimeout(() => setHurt(0), HURT_MS)
      }
    })
    return () => {
      clearTimeout(hintTimer)
      clearInterval(coinTimer)
      if (hurtTimer.current) clearTimeout(hurtTimer.current)
      off()
    }
  }, [runtime, store])

  if (!runtime) return null
  const design = store.getState().project.design
  const noGoal = !checkLevelForPlay(design).goal

  return (
    <>
      <div className="play-hud">
        {coins !== null && (
          <div className="play-coins" role="status" aria-label={`Coins: ${coins}`}>
            <span className="play-coin-dot" aria-hidden="true" />
            <span>× {String(coins).padStart(2, '0')}</span>
          </div>
        )}
        <div className="play-coins play-time" role="timer" aria-label={`Time ${formatPlayTime(time)}`}>
          <span aria-hidden="true">⏱</span>
          <span>{formatPlayTime(time)}</span>
        </div>
      </div>
      {hint && !won && (
        <div className="p2d-hint p2d-hint-top play-hint" role="status">
          <kbd>←</kbd> <kbd>→</kbd> {PLAY_CONTROLS_HINT}{powerKeysHint(powerKeys(design))}
          {noGoal && <span className="p2d-hint-goal"> {NO_GOAL_NOTE}</span>}
        </div>
      )}
      {hurt > 0 && !won && (
        <div className="p2d-toast play-hurt" role="status">
          Ouch! Back to the start. Try again!
        </div>
      )}
      {won && (
        <div className="p2d-overlay">
          <div className="p2d-card p2d-clear" role="dialog" aria-label="You made it">
            <p className="p2d-kicker">Goal reached</p>
            <h2 className="p2d-clear-title">{won.newBest ? 'New best time!' : 'You made it!'}</h2>
            <p className="p2d-clear-time">
              <span>Time</span> {formatPlayTime(won.time)}
              {won.best !== null && !won.newBest && (
                <>
                  {' '}
                  · <span>Best</span> {formatPlayTime(won.best)}
                </>
              )}
            </p>
            {won.coins !== null && (
              <p className="p2d-clear-time">
                <span>Coins</span> {won.coins}
              </p>
            )}
            <Button variant="primary" fullWidth icon={<RotateCcw size={18} />} autoFocus onClick={() => store.play()}>
              Play again
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
