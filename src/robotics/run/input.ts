import { PROGRAM_KEYS, type JoystickAxis, type ProgramKey } from '../program/types'
import type { InputSample } from './types'

/**
 * The input sampler (contract §8, tick step 1): latches keys and the on-screen joystick
 * between ticks and hands the runtime one coherent `InputSample` per tick.
 *
 * - `held` is the state now; `pressed` lists the keys that went down since the previous
 *   `sample()`. A repeated key-down without a key-up (browser key repeat) adds no edge;
 *   a tap that goes down and up between two samples still reports its edge once.
 * - The joystick axes are -100..100. While the on-screen joystick is centred, the arrow
 *   keys drive the same axes (up/down → `up`, right/left → `right`), so a joystick
 *   program works from the keyboard too. The on-screen joystick wins when it is off centre.
 * - `clearAll` (window blur, hidden tab) releases every key and centres the joystick.
 *
 * Ported from `codex/robotics-workshop` (`runtime/inputSampler.ts`) with the logical
 * buttons replaced by the program's keys and the axes by the joystick's up/right.
 */
export type InputSampler = {
  keyDown(key: ProgramKey): void
  keyUp(key: ProgramKey): void
  setKey(key: ProgramKey, down: boolean): void
  /** The on-screen joystick, -100..100 on each axis (non-finite reads as centred). */
  setJoystick(up: number, right: number): void
  clearAll(): void
  /** The sample for this tick; consumes the pressed edges. */
  sample(): InputSample
  /** The current state without consuming edges. */
  peek(): InputSample
}

/** Anything smaller than this (percent) counts as a centred on-screen joystick. */
export const JOYSTICK_DEADZONE = 0.5

const isKey = (key: unknown): key is ProgramKey => (PROGRAM_KEYS as readonly unknown[]).includes(key)
const clampAxis = (value: number) => (Number.isFinite(value) ? Math.max(-100, Math.min(100, value)) : 0)

/** DOM `KeyboardEvent.key` / `.code` → program key, or null for keys a program cannot name. */
export function programKeyFromEvent(event: { key?: string; code?: string }): ProgramKey | null {
  switch (event.key) {
    case 'ArrowUp': return 'up'
    case 'ArrowDown': return 'down'
    case 'ArrowLeft': return 'left'
    case 'ArrowRight': return 'right'
    case ' ':
    case 'Spacebar': return 'space'
  }
  return event.code === 'Space' ? 'space' : null
}

export function createInputSampler(): InputSampler {
  const held = new Set<ProgramKey>()
  const pressed = new Set<ProgramKey>()
  const joystick: Record<JoystickAxis, number> = { up: 0, right: 0 }

  const build = (): InputSample => {
    const heldRecord = Object.fromEntries(PROGRAM_KEYS.map((key) => [key, held.has(key)])) as Record<ProgramKey, boolean>
    const centred = Math.abs(joystick.up) < JOYSTICK_DEADZONE && Math.abs(joystick.right) < JOYSTICK_DEADZONE
    const axes: Record<JoystickAxis, number> = centred
      ? { up: (held.has('up') ? 100 : 0) - (held.has('down') ? 100 : 0), right: (held.has('right') ? 100 : 0) - (held.has('left') ? 100 : 0) }
      : { up: joystick.up, right: joystick.right }
    return { held: heldRecord, pressed: PROGRAM_KEYS.filter((key) => pressed.has(key)), joystick: axes }
  }

  const keyDown = (key: ProgramKey) => {
    if (!isKey(key) || held.has(key)) return
    held.add(key)
    pressed.add(key)
  }
  const keyUp = (key: ProgramKey) => {
    if (!isKey(key)) return
    held.delete(key)
  }

  return {
    keyDown,
    keyUp,
    setKey: (key, down) => (down ? keyDown(key) : keyUp(key)),
    setJoystick(up, right) {
      joystick.up = clampAxis(up)
      joystick.right = clampAxis(right)
    },
    clearAll() {
      held.clear()
      pressed.clear()
      joystick.up = 0
      joystick.right = 0
    },
    sample() {
      const sample = build()
      pressed.clear()
      return sample
    },
    peek: build,
  }
}
