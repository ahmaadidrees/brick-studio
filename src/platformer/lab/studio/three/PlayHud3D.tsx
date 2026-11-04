/**
 * What a kid sees over a playing 3D world (the 2D Play's own look: play-hud, p2d-hint, p2d-clear): the keys when Play
 * starts, the coin count and the time, and "You made it!" when the Goal says "you win". It only listens to the game.
 */
import { Hammer, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../../../ui'
import { formatPlayTime, readCoins } from '../builder/playRules'
import { useStudio, type StudioStore } from '../store'
import { MSG_WIN } from './bricks3d'

const HINT_MS = 7000

export function PlayHud3D({ store }: { store: StudioStore }) {
  const runtime = useStudio(store, (s) => s.runtime)
  const [hint, setHint] = useState(true)
  const [coins, setCoins] = useState<number | null>(null)
  const [time, setTime] = useState(0)
  const [won, setWon] = useState<{ time: number; coins: number | null } | null>(null)

  useEffect(() => {
    setHint(true)
    setWon(null)
    if (!runtime) return
    const design = store.getState().project.design
    const start = runtime.world.tick
    let clearedAt: number | null = null
    setCoins(readCoins(runtime, design))
    setTime(0)
    const hintTimer = setTimeout(() => setHint(false), HINT_MS)
    const tick = setInterval(() => {
      setCoins(readCoins(runtime, design))
      setTime((clearedAt ?? runtime.world.tick) - start)
    }, 100)
    const off = runtime.onBroadcast((message) => {
      if (message.trim().toLowerCase() !== MSG_WIN || clearedAt !== null) return
      clearedAt = runtime.world.tick
      setWon({ time: clearedAt - start, coins: readCoins(runtime, design) })
    })
    return () => { clearTimeout(hintTimer); clearInterval(tick); off() }
  }, [runtime, store])

  if (!runtime) return null
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
          <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrows move · <kbd>Space</kbd> jumps · <kbd>Shift</kbd> runs · drag to turn the camera
        </div>
      )}
      {won && (
        <div className="p2d-overlay">
          <div className="p2d-card p2d-clear" role="dialog" aria-label="You made it">
            <p className="p2d-kicker">Goal reached</p>
            <h2 className="p2d-clear-title">You made it!</h2>
            <p className="p2d-clear-time"><span>Time</span> {formatPlayTime(won.time)}</p>
            {won.coins !== null && <p className="p2d-clear-time"><span>Coins</span> {won.coins}</p>}
            <Button variant="primary" fullWidth icon={<RotateCcw size={18} />} autoFocus onClick={() => store.play()}>Play again</Button>
            <Button fullWidth icon={<Hammer size={18} />} onClick={() => store.stop()}>Keep building</Button>
          </div>
        </div>
      )}
    </>
  )
}

/** D2 brings the 3D touch controls (a stick, Jump and Run); until then a touch screen plays with a keyboard. */
export function TouchControls3D() {
  return null
}
