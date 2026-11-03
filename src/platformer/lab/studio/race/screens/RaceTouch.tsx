import { useEffect, useMemo } from 'react'
import type { Action } from '../../../../input/input'
import { RaceTouchControls } from '../../../../race/RaceTouchControls'
import type { Runtime } from '../../../core/runtime'
import type { StudioStore } from '../../store'

/** The buttons press the keys the Car's code reads: the steering pad is left and right, Gas is up and Brake is down. */
export const RACE_TOUCH_KEYS: Partial<Record<Action, string>> = {
  left: 'left arrow',
  right: 'right arrow',
  up: 'up arrow',
  down: 'down arrow',
}

/** Button presses → key presses in the running race. Remembers what is held, so it can all be let go at once. */
export function raceTouchKeys(runtime: Pick<Runtime, 'pressKey' | 'releaseKey'>) {
  const down = new Set<string>()
  const hold = (key: string, on: boolean) => {
    if (down.has(key) === on) return
    if (on) { down.add(key); runtime.pressKey(key) } else { down.delete(key); runtime.releaseKey(key) }
  }
  return {
    down,
    setTouch(action: Action, on: boolean) {
      const key = RACE_TOUCH_KEYS[action]
      if (key) hold(key, on)
    },
    releaseAll() {
      for (const key of [...down]) hold(key, false)
    },
  }
}

/**
 * Racing on a touch screen: the race kit's own steering pad, Gas and Brake (no item button), pressing the same keys as
 * the arrow keys. A kid who changes which key the Car reads changes what the buttons do too.
 */
export function RaceTouch({ runtime }: { runtime: Runtime; store: StudioStore }) {
  const keys = useMemo(() => raceTouchKeys(runtime), [runtime])
  // Nothing stays held down when Play stops, pauses or the race restarts.
  useEffect(() => () => keys.releaseAll(), [keys])
  return <RaceTouchControls input={keys} items={false} />
}
