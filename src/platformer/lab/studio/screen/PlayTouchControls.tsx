import { useEffect, useMemo } from 'react'
import type { Action } from '../../../input/input'
import { TouchControls } from '../../../ui/TouchControls'
import type { Runtime } from '../../core/runtime'
import { keyLabel, powerKeysIn } from '../builder/playRules'

/** The buttons press the same keys the Hero's code reads ("key right arrow pressed?", "key space pressed?", ...). */
export const TOUCH_KEYS: Partial<Record<Action, string>> = {
  left: 'left arrow',
  right: 'right arrow',
  up: 'up arrow',
  down: 'down arrow',
  jump: 'space',
  run: 'x',
}

/**
 * Play on a touch screen: the regular platformer's d-pad, Run and Jump, pressing keys in the running level. So a kid
 * who changes which key the Hero reads changes what the buttons do too, and their own scripts can use them. A snapped
 * power that reads another key (Dash reads z) gets a button of its own, named after the power.
 */
export function PlayTouchControls({ runtime }: { runtime: Runtime }) {
  const keys = useMemo(() => {
    const down = new Set<string>()
    const hold = (key: string, on: boolean) => {
      if (down.has(key) === on) return
      if (on) { down.add(key); runtime.pressKey(key) } else { down.delete(key); runtime.releaseKey(key) }
    }
    return {
      down,
      hold,
      setTouch(action: Action, on: boolean) {
        const key = TOUCH_KEYS[action]
        if (key) hold(key, on)
      },
    }
  }, [runtime])
  const powers = useMemo(() => {
    const world = runtime.world
    const placed = new Set([world.stage.brickId, ...world.targets.map((t) => t.brickId)])
    return powerKeysIn(Object.values(world.bricks), placed)
  }, [runtime])
  // Nothing stays held down when Play stops or the level restarts.
  useEffect(() => () => { for (const key of keys.down) runtime.releaseKey(key) }, [keys, runtime])
  return (
    <>
      <TouchControls input={keys} />
      {powers.length > 0 && (
        <div className="cl-power-keys" role="group" aria-label="Power buttons" onPointerDown={(e) => e.stopPropagation()}>
          {powers.map((p) => (
            <button
              key={p.key}
              type="button"
              className="cl-power-key"
              aria-label={`${p.power} (${keyLabel(p.key)} key)`}
              onPointerDown={(e) => {
                try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not needed for synthetic pointers */ }
                keys.hold(p.key, true)
              }}
              onPointerUp={() => keys.hold(p.key, false)}
              onPointerCancel={() => keys.hold(p.key, false)}
              onLostPointerCapture={() => keys.hold(p.key, false)}
            >
              {p.power}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
