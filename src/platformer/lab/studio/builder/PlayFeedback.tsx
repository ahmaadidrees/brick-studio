import { Eye, Hammer, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../../../ui'
import { FinishNotices, type Finisher } from '../../rooms/FinishNotices'
import { useStudio, type StudioStore } from '../store'
import { aboutMyHero, bestTime, checkLevelForPlay, COURSE_CLEAR, formatPlayTime, HERO_HURT, HERO_OUCH, NO_GOAL_NOTE, PLAY_CONTROLS_HINT, powerKeys, powerKeysHint, readCoins, recordClear, saysOuch } from './playRules'

const HINT_MS = 7000
const HURT_MS = 1600

/**
 * What a kid sees while the level plays, using the real 2D builder's own look (`/2d/build`: p2d-hint, p2d-toast,
 * p2d-clear): a controls hint when Play starts, a coin counter and the time, "Try again" when the Hero is hurt, and
 * "You made it!" with the time and the best time when the Goal says the course is clear. It only listens to the running
 * game; the engine knows nothing about it. The time is the game's own ticks since Play, so it never drifts.
 *
 * In a room the game goes on across the host's Play again (one clock for the room, rooms/session.ts `playStart`):
 * the time counts from the play's start, and a new play forgets the last one's finish. Each screen shows its own
 * Hero's "Try again" and "You made it!" only (playRules.ts aboutMyHero). Each player finishes on their own
 * (PlayerSlot.finished): the others see "Sam finished, 0:42", and the round ends when everyone has finished or the host
 * starts again.
 */
export function PlayFeedback({ store }: { store: StudioStore }) {
  const runtime = useStudio(store, (s) => s.runtime)
  const [hint, setHint] = useState(true)
  const [hurt, setHurt] = useState(0)
  const [won, setWon] = useState<{ coins: number | null; time: number; best: number | null; newBest: boolean } | null>(null)
  const [coins, setCoins] = useState<number | null>(null)
  const [time, setTime] = useState(0)
  const [everyone, setEveryone] = useState(false)
  const [watching, setWatching] = useState(false)
  const hurtTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Where this play's clock starts (room plays carry on across Play again). */
  const startRef = useRef(0)
  const room = useStudio(store, (s) => s.room)

  useEffect(() => {
    setHint(true)
    setHurt(0)
    setWon(null)
    setEveryone(false)
    setWatching(false)
    if (!runtime) return
    const design = store.getState().project.design
    const room = store.getState().room
    setCoins(readCoins(runtime, design))
    setTime(0)
    let clearedAt: number | null = null
    let startTick = 0
    // The room's play this screen is showing (undefined: none seen yet).
    let play: number | null | undefined
    const samePlay = () => {
      if (!room || room.playStart === play) return
      const again = play !== undefined
      play = room.playStart
      // Joined part way: count from now, the nearest we know.
      startTick = play ?? runtime.world.tick
      startRef.current = startTick
      clearedAt = null
      if (!again) return
      setWon(null)
      setHurt(0)
      setEveryone(false)
      setWatching(false)
    }
    const clear = (at: number) => {
      if (clearedAt !== null) return
      clearedAt = at
      const time = clearedAt - startTick
      const newBest = recordClear(design, time)
      setTime(time)
      setWon({ coins: readCoins(runtime, design), time, best: bestTime(design), newBest })
    }
    samePlay()
    const hintTimer = setTimeout(() => setHint(false), HINT_MS)
    const coinTimer = setInterval(() => {
      samePlay()
      // In a room the game says when we finished (the Goal finished our player), whatever our Goal says.
      const players = room ? runtime.world.players : undefined
      const mine = players?.find((p) => p.num === room!.me)
      if (mine?.finished !== undefined) clear(mine.finished)
      setEveryone(!!players?.length && players.every((p) => p.finished !== undefined))
      setCoins(readCoins(runtime, design))
      setTime((clearedAt ?? runtime.world.tick) - startTick)
    }, 100)
    const hurtMessage = saysOuch(design) ? HERO_OUCH : HERO_HURT
    const off = runtime.onBroadcast((message, from, about) => {
      samePlay()
      const m = message.trim().toLowerCase()
      if ((m === COURSE_CLEAR || m === hurtMessage) && !aboutMyHero(runtime.world, from, room?.me ?? 0, about)) return
      if (m === COURSE_CLEAR) {
        clear(runtime.world.tick)
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

  const readFinishers = useCallback((): Finisher[] => {
    const me = room?.me ?? 0
    const players = runtime?.world.players
    if (!me || !players) return []
    return players
      .filter((p) => p.num !== me && p.finished !== undefined)
      .map((p) => ({ num: p.num, name: p.name, ticks: p.finished! - startRef.current }))
  }, [runtime, room])

  if (!runtime) return null
  const design = store.getState().project.design
  const noGoal = !checkLevelForPlay(design).goal
  // In a room only the host starts everyone again; the others wait for them (or watch the rest finish).
  const guest = !!room && !room.host

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
      {room && <FinishNotices read={readFinishers} format={formatPlayTime} play={room.playStart} />}
      {won && !watching && (
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
            {room && (
              <p className="p2d-note hk-finish-round" role="status">
                {everyone ? 'Everyone has finished.' : 'Others are still playing.'} {guest ? 'The host starts the next round.' : 'Play again starts everyone again.'}
              </p>
            )}
            {!guest && (
              <Button variant="primary" fullWidth icon={<RotateCcw size={18} />} autoFocus onClick={() => (room ? store.restartPreview() : store.play())}>
                Play again
              </Button>
            )}
            {room && !everyone && (
              <Button fullWidth icon={<Eye size={18} />} autoFocus={guest} onClick={() => setWatching(true)}>
                Watch the others
              </Button>
            )}
            {!guest && (
              <Button fullWidth icon={<Hammer size={18} />} onClick={() => store.stop()}>
                Keep building
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
