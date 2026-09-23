import { ArrowRight } from 'lucide-react'
import { useSyncExternalStore } from 'react'

/**
 * "It looks this way →" (kid lane Y): an arrow beside the line that says the sensor did not see
 * the visitor, turned the way the sensor's beam runs on the screen, so it points where the
 * sensor looks. The stage scene measures the beam's direction on screen while the line shows
 * (`setBeamScreenAngle`); until it has, the arrow points right.
 */
let angle: number | null = null
const listeners = new Set<() => void>()

/** Degrees clockwise from pointing right, as the beam runs on screen; null when there is none. */
export function setBeamScreenAngle(next: number | null) {
  if (next === angle || (next !== null && angle !== null && Math.abs(next - angle) < 2)) return
  angle = next
  for (const listener of listeners) listener()
}

export function beamScreenAngle(): number | null {
  return angle
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function BeamArrow() {
  const degrees = useSyncExternalStore(subscribe, beamScreenAngle, beamScreenAngle)
  return (
    <span className="robo-beam-arrow" aria-hidden="true" data-angle={degrees === null ? undefined : Math.round(degrees)} style={{ transform: `rotate(${degrees ?? 0}deg)` }}>
      <ArrowRight size={18} strokeWidth={3} />
    </span>
  )
}
