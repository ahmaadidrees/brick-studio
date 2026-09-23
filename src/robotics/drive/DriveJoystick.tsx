import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { joystickAxes } from '../code/StageInput'

/**
 * The Drive view's joystick (docs/robotics/KID-UX.md §D): big, bottom right, dragged with a
 * mouse or one finger. The knob follows the pointer inside the ring and springs back to the
 * middle when it is let go; a second finger is ignored. While the arrow keys (or WASD) are
 * held and nobody is dragging, the knob leans the way the keys push, so a student sees that
 * the keys and the stick are the same control. Until it is first used the knob nudges up,
 * showing which way to drag.
 */
export const DRIVE_JOYSTICK_SIZE = 168
export const DRIVE_KNOB_SIZE = 72
const RADIUS = (DRIVE_JOYSTICK_SIZE - DRIVE_KNOB_SIZE) / 2

export type Axes = { up: number; right: number }
const CENTRE: Axes = { up: 0, right: 0 }

export function DriveJoystick({ onChange, keyAxes = CENTRE, describedBy }: {
  onChange: (up: number, right: number) => void
  /** Where the held keys push (display only: the stage reads the keys itself). */
  keyAxes?: Axes
  describedBy?: string
}) {
  const base = useRef<HTMLDivElement>(null)
  const pointer = useRef<number | null>(null)
  const [drag, setDrag] = useState<Axes | null>(null)
  const [used, setUsed] = useState(false)
  const keysOn = keyAxes.up !== 0 || keyAxes.right !== 0
  useEffect(() => { if (keysOn) setUsed(true) }, [keysOn])
  // Leaving the view (or a remount) with the stick held lets go of it.
  const change = useRef(onChange)
  change.current = onChange
  useEffect(() => () => { if (pointer.current !== null) change.current(0, 0) }, [])

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = base.current?.getBoundingClientRect()
    if (!rect) return
    const next = joystickAxes(event.clientX - (rect.left + rect.width / 2), event.clientY - (rect.top + rect.height / 2), RADIUS)
    setDrag(next)
    onChange(next.up, next.right)
  }
  const release = () => {
    if (pointer.current === null) return
    pointer.current = null
    setDrag(null)
    onChange(0, 0)
  }
  const shown = drag ?? keyAxes
  const knob = { x: (shown.right / 100) * RADIUS, y: (-shown.up / 100) * RADIUS }
  return (
    <div
      ref={base}
      className={`robo-drive-joystick${drag ? ' active' : ''}${used ? '' : ' hint'}`}
      role="group"
      aria-label="Joystick"
      aria-describedby={describedBy}
      data-testid="robo-drive-joystick"
      data-up={shown.up}
      data-right={shown.right}
      style={{ width: DRIVE_JOYSTICK_SIZE, height: DRIVE_JOYSTICK_SIZE }}
      onPointerDown={(event) => {
        if (pointer.current !== null) return
        event.preventDefault()
        pointer.current = event.pointerId
        setUsed(true)
        event.currentTarget.setPointerCapture?.(event.pointerId)
        move(event)
      }}
      onPointerMove={(event) => { if (pointer.current === event.pointerId) move(event) }}
      onPointerUp={(event) => { if (pointer.current === event.pointerId) release() }}
      onPointerCancel={(event) => { if (pointer.current === event.pointerId) release() }}
      onLostPointerCapture={(event) => { if (pointer.current === event.pointerId) release() }}
    >
      <ChevronUp className="robo-drive-chevron up" size={26} strokeWidth={3} aria-hidden="true" />
      <ChevronDown className="robo-drive-chevron down" size={26} strokeWidth={3} aria-hidden="true" />
      <ChevronLeft className="robo-drive-chevron left" size={26} strokeWidth={3} aria-hidden="true" />
      <ChevronRight className="robo-drive-chevron right" size={26} strokeWidth={3} aria-hidden="true" />
      <span className="robo-drive-knob-track" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}>
        <span className="robo-drive-knob" style={{ width: DRIVE_KNOB_SIZE, height: DRIVE_KNOB_SIZE }} />
      </span>
    </div>
  )
}
