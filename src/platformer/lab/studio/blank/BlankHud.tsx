import { Eye, Hammer, RotateCcw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '../../../../ui'
import { FinishNotices, type Finisher } from '../../rooms/FinishNotices'
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
 *
 * In a room (docs/qa/hackable-rooms M2: each player is on their own) the screen shows its own player's "Ouch!" and
 * "You win!" only. A friend's Goal finishes only them (PlayerSlot.finished): the others see "Ana finished, 0:12", the
 * round ends when everyone has finished, and only the host starts the next one. The clock counts from the room's play
 * (rooms/session.ts `playStart`), so every screen shows the same times.
 */
export function BlankHud({ store }: { store: StudioStore }) {
  const runtime = useStudio(store, (s) => s.runtime)
  const room = useStudio(store, (s) => s.room)
  const [hint, setHint] = useState(true)
  const [hurt, setHurt] = useState(0)
  const [won, setWon] = useState<{ score: number | null; time: number } | null>(null)
  const [score, setScore] = useState<number | null>(null)
  const [everyone, setEveryone] = useState(false)
  const [watching, setWatching] = useState(false)
  const hurtTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Where this play's clock starts (room plays carry on across Play again). */
  const startRef = useRef(0)

  useEffect(() => {
    setHint(true)
    setHurt(0)
    setWon(null)
    setEveryone(false)
    setWatching(false)
    if (!runtime) return
    const design = store.getState().project.design
    const room = store.getState().room
    let start = runtime.world.tick
    startRef.current = start
    let wonAt: number | null = null
    // The room's play this screen is showing (undefined: none seen yet).
    let play: number | null | undefined
    const samePlay = () => {
      if (!room || room.playStart === play) return
      const again = play !== undefined
      play = room.playStart
      // Joined part way (from a keyframe): count from the game's own green flag, which every screen agrees on.
      start = play ?? runtime.world.timerStartTick
      startRef.current = start
      wonAt = null
      if (!again) return
      setWon(null)
      setHurt(0)
      setEveryone(false)
      setWatching(false)
    }
    const win = (at: number) => {
      if (wonAt !== null) return
      wonAt = at
      setWon({ score: readScore(runtime, design), time: at - start })
    }
    samePlay()
    setScore(readScore(runtime, design))
    const hintTimer = setTimeout(() => setHint(false), HINT_MS)
    const scoreTimer = setInterval(() => {
      samePlay()
      // In a room the game says when we finished (a Goal finished our player), whatever the Goal says.
      const players = room ? runtime.world.players : undefined
      const mine = players?.find((p) => p.num === room!.me)
      if (mine?.finished !== undefined) win(mine.finished)
      setEveryone(!!players?.length && players.every((p) => p.finished !== undefined))
      setScore(readScore(runtime, design))
    }, 100)
    const off = runtime.onBroadcast((message, from, about) => {
      samePlay()
      const m = message.trim().toLowerCase()
      if ((m === WIN_MESSAGE || m === HURT_MESSAGE) && !aboutMyHero(runtime.world, from, room?.me ?? 0, about)) return
      if (m === WIN_MESSAGE) {
        // In a room our own finish comes from our slot (above); solo, the Goal's word is the win.
        if (!room) win(runtime.world.tick)
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

  const readFinishers = useCallback((): Finisher[] => {
    const me = room?.me ?? 0
    const players = runtime?.world.players
    if (!me || !players) return []
    return players
      .filter((p) => p.num !== me && p.finished !== undefined)
      .map((p) => ({ num: p.num, name: room?.playerName?.(p.num) ?? p.name, ticks: p.finished! - startRef.current }))
  }, [runtime, room])

  if (!runtime) return null
  const design = store.getState().project.design
  const player = hasPlayer(design)
  // In a room only the host starts everyone again; the others wait for them (or watch the rest finish).
  const guest = !!room && !room.host
  return (
    <>
      {score !== null && <BlankScore score={score} />}
      {hint && !won && player && (
        <div className="p2d-hint p2d-hint-top play-hint" role="status"><kbd>←</kbd> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>→</kbd> {BLANK_COPY.controlsHint}</div>
      )}
      {hurt > 0 && !won && <div className="p2d-toast play-hurt" role="status">Ouch! Back to the start.</div>}
      {room && <FinishNotices read={readFinishers} format={formatPlayTime} play={room.playStart} />}
      {won && !watching && (
        <div className="p2d-overlay">
          <div className="p2d-card p2d-clear" role="dialog" aria-label="You win">
            <p className="p2d-kicker">Goal reached</p>
            <h2 className="p2d-clear-title">You win!</h2>
            <p className="p2d-clear-time"><span>Time</span> {formatPlayTime(won.time)}</p>
            {won.score !== null && <p className="p2d-clear-time"><span>Score</span> {won.score}</p>}
            {room && (
              <p className="p2d-note hk-finish-round" role="status">
                {everyone ? 'Everyone has finished.' : 'Others are still playing.'} {guest ? 'The host starts the next round.' : 'Play again starts everyone again.'}
              </p>
            )}
            {!guest && <Button variant="primary" fullWidth icon={<RotateCcw size={18} />} autoFocus onClick={() => (room ? store.restartPreview() : store.play())}>Play again</Button>}
            {room && !everyone && <Button fullWidth icon={<Eye size={18} />} autoFocus={guest} onClick={() => setWatching(true)}>Watch the others</Button>}
            {!guest && <Button fullWidth icon={<Hammer size={18} />} onClick={() => store.stop()}>Keep building</Button>}
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
