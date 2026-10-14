import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef } from 'react'
import type { Action, Input } from '../input/input'

interface Props {
  input: Input
  /** Show the item button (the track has items on). */
  items: boolean
  /** The item you hold, for the button's label. */
  itemName?: string
}

/**
 * On-screen driving for touch screens: a steering pad under the left thumb (slide between left and right without
 * lifting), Gas and Brake under the right, and the item button above them. They press the same actions as the
 * arrow keys and Space, so racing needs nothing new from the game.
 */
export function RaceTouchControls({ input, items, itemName }: Props) {
  const padRef = useRef<HTMLDivElement>(null)
  const steer = useRef<Action | null>(null)

  const setSteer = (next: Action | null) => {
    if (steer.current === next) return
    if (steer.current) input.setTouch(steer.current, false)
    if (next) input.setTouch(next, true)
    steer.current = next
  }

  const steerFrom = (e: React.PointerEvent) => {
    const r = padRef.current!.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    setSteer(x < 0.45 ? 'left' : x > 0.55 ? 'right' : null)
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
    <div className="p2d-touch p2d-race-touch" onPointerDown={(e) => e.stopPropagation()}>
      <div
        className="p2d-dpad p2d-race-steer"
        ref={padRef}
        role="group"
        aria-label="Steer: slide left or right"
        onPointerDown={(e) => {
          capture(e)
          steerFrom(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons || e.pointerType === 'touch') steerFrom(e)
        }}
        onPointerUp={() => setSteer(null)}
        onPointerCancel={() => setSteer(null)}
        onLostPointerCapture={() => setSteer(null)}
      >
        <ChevronLeft className="p2d-arrow p2d-arrow-l" size={44} aria-hidden="true" />
        <ChevronRight className="p2d-arrow p2d-arrow-r" size={44} aria-hidden="true" />
      </div>
      <div className="p2d-face p2d-race-pedals">
        {items && (
          <button type="button" className="p2d-race-use" {...button('jump')} aria-label={itemName ? `Use ${itemName}` : 'Use item'}>
            {itemName ?? 'Item'}
          </button>
        )}
        <button type="button" className="p2d-race-brake" {...button('down')} aria-label="Brake">
          Brake
        </button>
        <button type="button" className="p2d-race-gas" {...button('up')} aria-label="Gas">
          Gas
        </button>
      </div>
    </div>
  )
}
