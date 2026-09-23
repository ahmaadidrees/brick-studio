import { Eye, Undo2 } from 'lucide-react'
import { useEffect } from 'react'
import { useBrickStore } from '../../brick/store'
import { clearFarNotice, reportPlaced, useBasicsStore } from './basicsState'
import './basics.css'

/**
 * Kid basics (Robot Workshop prototype only): when a placement lands where the student cannot see it
 * (out of view, or so far back it is a few pixels big), one line says so with two big buttons:
 * "Show me" frames it (and flashes it again), "Undo" takes it back. It goes away on the next edit,
 * after a while, or with either button. Mounted by the studio next to its status toast.
 */
const NOTICE_SECONDS = 9

/** Frames the parts with the robotics layer's framing (loaded only when asked) and flashes them again. */
async function showMe(ids: string[]) {
  clearFarNotice()
  const { useRoboticsStore } = await import('../state/roboticsStore')
  useRoboticsStore.getState().requestFrame(ids)
  reportPlaced(ids)
}

export default function BasicsOverlay() {
  const notice = useBasicsStore((state) => state.farNotice)
  const bricks = useBrickStore((state) => state.bricks)
  const present = notice ? notice.ids.filter((id) => bricks.some((brick) => brick.id === id)) : []

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(clearFarNotice, NOTICE_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [notice])
  useEffect(() => { if (notice && !present.length) clearFarNotice() }, [notice, present.length])

  if (!notice || !present.length) return null
  const one = present.length === 1
  return (
    <div className="kid-basics-notice" role="status" data-testid="kid-basics-far-notice">
      <span>{one ? 'Your part landed far away.' : 'Your parts landed far away.'}</span>
      <button type="button" onClick={() => { void showMe(present) }}><Eye size={18} aria-hidden="true" />Show me</button>
      <button type="button" onClick={() => { useBrickStore.getState().undo(); clearFarNotice() }}><Undo2 size={18} aria-hidden="true" />Undo</button>
    </div>
  )
}
