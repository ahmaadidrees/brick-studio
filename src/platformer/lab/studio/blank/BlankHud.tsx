import { Hammer, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../../ui'
import { useStudio, type StudioStore } from '../store'
import { aboutMyHero, formatPlayTime } from '../builder/playRules'
import { hasPlayer } from '../kitScreens'
import { BLANK_COPY } from './blankProject'
import { HURT_MESSAGE, readScore, WIN_MESSAGE } from './blankRules'

const HINT_MS = 6000
const HURT_MS = 1600

/**
 * Over a Start from nothing game while it plays (docs/qa/blank-2d, board 3c): the Score, when a Collect job keeps one
 * (one team score in v1), a short keys line, "Ouch!" when a Hurts brick sends the player back, and "You win!" when the
 * player reaches a Goal. Like the Platformer's PlayFeedback, it only listens to the running game.
 */
export function BlankHud({ store }: { store: StudioStore }) {
  const runtime = useStudio(store, (s) => s.runtime)
  const [hint, setHint] = useState(true)
  const [hurt, setHurt] = useState(0)
  const [won, setWon] = useState<{ score: number | null; time: number } | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const hurtTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setHint(true)
    setHurt(0)
    setWon(null)
    if (!runtime) return
    const design = store.getState().project.design
    const room = store.getState().room
    const start = runtime.world.tick
    let done = false
    setScore(readScore(runtime, design))
    const hintTimer = setTimeout(() => setHint(false), HINT_MS)
    const scoreTimer = setInterval(() => setScore(readScore(runtime, design)), 100)
    const off = runtime.onBroadcast((message, from) => {
      const m = message.trim().toLowerCase()
      if ((m === WIN_MESSAGE || m === HURT_MESSAGE) && !aboutMyHero(runtime.world, from, room?.me ?? 0)) return
      if (m === WIN_MESSAGE) {
        if (done) return
        done = true
        setWon({ score: readScore(runtime, design), time: runtime.world.tick - start })
      } else if (m === HURT_MESSAGE) {
        setHurt((n) => n + 1)
        if (hurtTimer.current) clearTimeout(hurtTimer.current)
        hurtTimer.current = setTimeout(() => setHurt(0), HURT_MS)
      }
    })
    return () => {
      clearTimeout(hintTimer)
      clearInterval(scoreTimer)
      if (hurtTimer.current) clearTimeout(hurtTimer.current)
      off()
    }
  }, [runtime, store])

  if (!runtime) return null
  const design = store.getState().project.design
  const player = hasPlayer(design)
  return (
    <>
      {score !== null && <BlankScore score={score} />}
      {hint && !won && player && (
        <div className="p2d-hint p2d-hint-top play-hint" role="status"><kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> {BLANK_COPY.controlsHint}</div>
      )}
      {hurt > 0 && !won && <div className="p2d-toast play-hurt" role="status">Ouch! Back to the start.</div>}
      {won && (
        <div className="p2d-overlay">
          <div className="p2d-card p2d-clear" role="dialog" aria-label="You win">
            <p className="p2d-kicker">Goal reached</p>
            <h2 className="p2d-clear-title">You win!</h2>
            <p className="p2d-clear-time"><span>Time</span> {formatPlayTime(won.time)}</p>
            {won.score !== null && <p className="p2d-clear-time"><span>Score</span> {won.score}</p>}
            <Button variant="primary" fullWidth icon={<RotateCcw size={18} />} autoFocus onClick={() => store.play()}>Play again</Button>
            <Button fullWidth icon={<Hammer size={18} />} onClick={() => store.stop()}>Keep building</Button>
          </div>
        </div>
      )}
    </>
  )
}

/** The Score, drawn like a Scratch variable monitor in the stage's top-left corner. */
export function BlankScore({ score }: { score: number }) {
  return (
    <div className="cl-blank-score" role="status" aria-label={`Score ${score}`}>
      <span>Score</span><b>{score}</b>
    </div>
  )
}
