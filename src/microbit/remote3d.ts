import { resolve } from './assign'
import { useMicrobit } from './store'

/*
 * The micro:bit in the 3D world: read once per frame by the explorer, next to keyboard and touch.
 * Tilt walks (x right, z forward, analog), and jump counts once on the way down, like the jump key.
 */

export interface Remote3DFrame {
  x: number
  z: number
  running: boolean
  jumpPressed: boolean
}

export class Remote3D {
  private jumpHeld = false
  readonly frame: Remote3DFrame = { x: 0, z: 0, running: false, jumpPressed: false }

  poll(now = performance.now()): Remote3DFrame {
    const mb = useMicrobit.getState()
    const out = resolve(mb.assignments['3d'], mb.board, now)
    const jump = out.held.has('jump')
    const f = this.frame
    f.jumpPressed = jump && !this.jumpHeld
    this.jumpHeld = jump
    f.running = out.held.has('run')
    f.x = out.stick?.x ?? 0
    f.z = out.stick?.y ?? 0
    return f
  }

  /** Forget a held jump (graphics paused, spawn pending), so it doesn't fire when play resumes. */
  reset() {
    this.jumpHeld = true
    this.frame.jumpPressed = false
  }
}
