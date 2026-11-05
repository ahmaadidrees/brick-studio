/**
 * Room rules (docs/qa/hackable-rooms M2): each player finishes on their own. Everyone else's screen gets a short notice,
 * "Sam finished, 0:42", read from the shared game (so every screen shows the same names and times).
 */
import { useEffect, useRef, useState } from 'react'
import './rooms.css'

/** Someone else who has finished this play: their name, and their time in ticks (null when we don't know it). */
export interface Finisher {
  num: number
  name: string
  ticks: number | null
}

/** How long one notice stays. */
export const FINISH_NOTICE_MS = 4000

/** The words of one notice: "Sam finished, 0:42.3". */
export function finishNotice(f: Finisher, format: (ticks: number) => string): string {
  return f.ticks === null ? `${f.name} finished` : `${f.name} finished, ${format(f.ticks)}`
}

/**
 * Show each new finisher once. `read` is called every `everyMs` and returns everyone else who has finished so far;
 * `play` changes when a new play starts (the notices start over).
 */
export function FinishNotices({ read, format, play, everyMs = 100 }: { read: () => Finisher[]; format: (ticks: number) => string; play: unknown; everyMs?: number }) {
  const [shown, setShown] = useState<{ key: string; text: string }[]>([])
  const seen = useRef(new Set<number>())
  const readRef = useRef(read)
  readRef.current = read
  useEffect(() => {
    seen.current = new Set()
    setShown([])
    const timers = new Set<ReturnType<typeof setTimeout>>()
    const check = () => {
      for (const f of readRef.current()) {
        if (seen.current.has(f.num)) continue
        seen.current.add(f.num)
        const key = `${f.num}-${Date.now()}`
        setShown((list) => [...list, { key, text: finishNotice(f, format) }])
        const t = setTimeout(() => {
          timers.delete(t)
          setShown((list) => list.filter((n) => n.key !== key))
        }, FINISH_NOTICE_MS)
        timers.add(t)
      }
    }
    check()
    const timer = setInterval(check, everyMs)
    return () => {
      clearInterval(timer)
      for (const t of timers) clearTimeout(t)
    }
  }, [play, format, everyMs])
  if (!shown.length) return null
  return (
    <div className="hk-finish-notices" role="status" aria-live="polite">
      {shown.map((n) => (
        <p key={n.key} className="hk-finish-notice">{n.text}</p>
      ))}
    </div>
  )
}
