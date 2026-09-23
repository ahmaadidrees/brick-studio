import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import type { Action, Input } from '../input/input'

interface Props {
  input: Input
}

/**
 * On-screen buttons for touch screens. The d-pad is one surface: sliding a thumb from left to right changes
 * direction without lifting, like a real d-pad. It sits in from the left edge, where Safari's swipe means Back.
 */
export function TouchControls({ input }: Props) {
  const padRef = useRef<HTMLDivElement>(null)
  const padActions = useRef<Set<Action>>(new Set())

  const setPad = (next: Set<Action>) => {
    for (const a of padActions.current) if (!next.has(a)) input.setTouch(a, false)
    for (const a of next) if (!padActions.current.has(a)) input.setTouch(a, true)
    padActions.current = next
  }

  const padFrom = (e: React.PointerEvent) => {
    const r = padRef.current!.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    const next = new Set<Action>()
    if (x < 0.4) next.add('left')
    else if (x > 0.6) next.add('right')
    if (y > 0.68) next.add('down')
    if (y < 0.25) next.add('up')
    setPad(next)
  }

  const capture = (e: React.PointerEvent) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Some browsers refuse capture for synthetic or already-released pointers; not needed then.
    }
  }

  const button = (a: Action) => ({
    onPointerDown: (e: React.PointerEvent) => {
      capture(e)
      input.setTouch(a, true)
    },
    onPointerUp: () => input.setTouch(a, false),
    onPointerCancel: () => input.setTouch(a, false),
    onLostPointerCapture: () => input.setTouch(a, false),
  })

  return (
    <div className="p2d-touch" onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="p2d-dpad"
        ref={padRef}
        role="group"
        aria-label="Move: slide left or right, down to crouch"
        onPointerDown={(e) => {
          capture(e)
          padFrom(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons || e.pointerType === 'touch') padFrom(e)
        }}
        onPointerUp={() => setPad(new Set())}
        onPointerCancel={() => setPad(new Set())}
        onLostPointerCapture={() => setPad(new Set())}
      >
        <ChevronLeft className="p2d-arrow p2d-arrow-l" size={40} aria-hidden="true" />
        <ChevronRight className="p2d-arrow p2d-arrow-r" size={40} aria-hidden="true" />
        <ChevronDown className="p2d-arrow p2d-arrow-d" size={30} aria-hidden="true" />
      </div>
      <div className="p2d-face">
        <button type="button" className="p2d-run" {...button('run')} aria-label="Run">
          Run
        </button>
        <button type="button" className="p2d-jump" {...button('jump')} aria-label="Jump">
          Jump
        </button>
      </div>
    </div>
  )
}
