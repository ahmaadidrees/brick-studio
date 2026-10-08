import { Hammer, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../../ui'
import { useStudio, type StudioStore } from '../store'
import { checkLevelForPlay, COURSE_CLEAR, HERO_HURT, NO_GOAL_NOTE, PLAY_CONTROLS_HINT, readCoins } from './playRules'

const HINT_MS = 7000
const HURT_MS = 1600

/**
 * What a kid sees while the level plays, using the real 2D builder's own look (`/2d/build`: p2d-hint, p2d-toast,
 * p2d-clear): a controls hint when Play starts, a coin counter, "Try again" when the Hero is hurt, and "You made it!"
 * when the Goal says the course is clear. It only listens to the running game; the engine knows nothing about it.
 */
export function PlayFeedback({ store }: { store: StudioStore }) {
  const runtime = useStudio(store, (s) => s.runtime)
  const [hint, setHint] = useState(true)
  const [hurt, setHurt] = useState(0)
  const [won, setWon] = useState<{ coins: number | null } | null>(null)
  const [coins, setCoins] = useState<number | null>(null)
  const hurtTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setHint(true)
    setHurt(0)
    setWon(null)
    if (!runtime) return
    const design = store.getState().project.design
    setCoins(readCoins(runtime, design))
    const hintTimer = setTimeout(() => setHint(false), HINT_MS)
    const coinTimer = setInterval(() => setCoins(readCoins(runtime, design)), 100)
    const off = runtime.onBroadcast((message) => {
      const m = message.trim().toLowerCase()
      if (m === COURSE_CLEAR) {
        setWon({ coins: readCoins(runtime, design) })
      } else if (m === HERO_HURT) {
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
  const noGoal = !checkLevelForPlay(store.getState().project.design).goal

  return (
    <>
      {coins !== null && (
        <div className="play-coins" role="status" aria-label={`Coins: ${coins}`}>
          <span className="play-coin-dot" aria-hidden="true" />
          <span>× {String(coins).padStart(2, '0')}</span>
        </div>
      )}
      {hint && !won && (
        <div className="p2d-hint p2d-hint-top play-hint" role="status">
          <kbd>←</kbd> <kbd>→</kbd> {PLAY_CONTROLS_HINT}
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
            <h2 className="p2d-clear-title">You made it!</h2>
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
