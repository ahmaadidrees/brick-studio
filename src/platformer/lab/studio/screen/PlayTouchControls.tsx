import { useEffect, useMemo } from 'react'
import type { Action } from '../../../input/input'
import { TouchControls } from '../../../ui/TouchControls'
import type { Runtime } from '../../core/runtime'

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
 * who changes which key the Hero reads changes what the buttons do too, and their own scripts can use them.
 */
export function PlayTouchControls({ runtime }: { runtime: Runtime }) {
  const keys = useMemo(() => {
    const down = new Set<string>()
    return {
      down,
      setTouch(action: Action, on: boolean) {
        const key = TOUCH_KEYS[action]
        if (!key || down.has(key) === on) return
        if (on) { down.add(key); runtime.pressKey(key) } else { down.delete(key); runtime.releaseKey(key) }
      },
    }
  }, [runtime])
  // Nothing stays held down when Play stops or the level restarts.
  useEffect(() => () => { for (const key of keys.down) runtime.releaseKey(key) }, [keys, runtime])
  return <TouchControls input={keys} />
}
