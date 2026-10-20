import type { PlayerInput } from '@brick-studio/platformer-core/engine/player'
import { resolve, type RemoteAction } from '../../microbit/assign'
import { useMicrobit } from '../../microbit/store'

/*
 * Keyboard, game controller, on-screen touch buttons and a micro:bit (real or the panel's virtual one) merged into one input per tick.
 * Presses are latched so a tap shorter than a frame still counts.
 */

export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'run' | 'toggle' | 'menu' | 'restart'

const KEYS: Record<string, Action> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyX: 'jump',
  KeyK: 'jump',
  ShiftLeft: 'run',
  ShiftRight: 'run',
  KeyZ: 'run',
  KeyJ: 'run',
  Tab: 'toggle',
  Escape: 'menu',
}

/** Buttons by position on a standard-mapping controller. */
const PAD: [number, Action][] = [
  [0, 'jump'], // bottom face button
  [1, 'jump'], // right
  [2, 'run'], // left
  [3, 'run'], // top
  [4, 'run'], // shoulders
  [5, 'run'],
  [7, 'run'], // right trigger
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
  [9, 'menu'], // start / plus
  [8, 'toggle'], // select / minus: switch between playing and building
]

/** How the micro:bit's game actions drive this mode's buttons (race: gas is up, brake is down, the item is jump). */
const REMOTE: Partial<Record<RemoteAction, Action>> = {
  jump: 'jump',
  run: 'run',
  left: 'left',
  right: 'right',
  up: 'up',
  down: 'down',
  restart: 'restart',
  gas: 'up',
  brake: 'down',
  item: 'jump',
}

export interface InputFrame extends PlayerInput {
  togglePressed: boolean
  menuPressed: boolean
  restartPressed: boolean
  /** A micro:bit tilted as a stick: x right +, y forward +, each -1…1. Absent otherwise. */
  stick?: { x: number; y: number }
}

export class Input {
  private held = new Set<Action>()
  private pressed = new Set<Action>()
  private touchHeld = new Set<Action>()
  private padHeld = new Set<Action>()
  private remoteHeld = new Set<Action>()
  private remoteStick: { x: number; y: number } | null = null
  /** Which of the micro:bit's assignment sets this game uses (the session says whether it is a race). */
  remoteMode: () => 'platformer' | 'race' = () => 'platformer'
  /** While a menu is open, only the menu button counts. */
  suspended = false
  gamepadName: string | null = null
  private handlers: [string, (e: Event) => void][] = []

  attach(target: Window) {
    const down = (e: Event) => {
      const k = e as KeyboardEvent
      if (isTyping(k.target)) return
      const a = KEYS[k.code]
      if (!a) return
      if (k.metaKey || k.ctrlKey) return
      if (this.suspended && a !== 'menu') return
      k.preventDefault()
      if (!this.held.has(a) && !k.repeat) this.pressed.add(a)
      this.held.add(a)
    }
    const up = (e: Event) => {
      const a = KEYS[(e as KeyboardEvent).code]
      if (a) this.held.delete(a)
    }
    const blur = () => this.held.clear()
    this.handlers = [
      ['keydown', down],
      ['keyup', up],
      ['blur', blur],
    ]
    for (const [n, h] of this.handlers) target.addEventListener(n, h)
  }

  detach(target: Window) {
    for (const [n, h] of this.handlers) target.removeEventListener(n, h)
    this.handlers = []
  }

  /** Suspend game input (a menu is open): let go of everything that was held. */
  setSuspended(on: boolean) {
    this.suspended = on
    this.held.clear()
    this.touchHeld.clear()
    this.pressed.clear()
  }

  /** Reads the micro:bit through this mode's assignments. A press only counts on the way down, like a key. */
  private pollRemote() {
    const mb = useMicrobit.getState()
    const out = resolve(mb.assignments[this.remoteMode()], mb.board, performance.now())
    const now = new Set<Action>()
    for (const a of out.held) {
      const b = REMOTE[a]
      if (b) now.add(b)
    }
    for (const a of now) if (!this.remoteHeld.has(a) && !this.suspended) this.pressed.add(a)
    this.remoteHeld = now
    this.remoteStick = out.stick
  }

  /** Whether an action was pressed since last asked (polls the controller). */
  consume(a: Action): boolean {
    this.pollPad()
    this.pollRemote()
    return this.pressed.delete(a)
  }

  /** On-screen buttons report here. */
  setTouch(a: Action, on: boolean) {
    if (on && !this.touchHeld.has(a)) this.pressed.add(a)
    if (on) this.touchHeld.add(a)
    else this.touchHeld.delete(a)
  }

  private pollPad() {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const now = new Set<Action>()
    let name: string | null = null
    for (const pad of pads) {
      if (!pad || !pad.connected) continue
      name = pad.id
      for (const [i, a] of PAD) if (pad.buttons[i]?.pressed) now.add(a)
      const ax = pad.axes[0] ?? 0
      const ay = pad.axes[1] ?? 0
      if (ax < -0.4) now.add('left')
      if (ax > 0.4) now.add('right')
      if (ay < -0.6) now.add('up')
      if (ay > 0.6) now.add('down')
    }
    for (const a of now) if (!this.padHeld.has(a) && (!this.suspended || a === 'menu')) this.pressed.add(a)
    this.padHeld = now
    this.gamepadName = name
  }

  private is(a: Action) {
    if (this.suspended) return false
    return this.held.has(a) || this.touchHeld.has(a) || this.padHeld.has(a) || this.remoteHeld.has(a)
  }

  /** Read the input for one tick. Presses are consumed. */
  frame(): InputFrame {
    this.pollPad()
    this.pollRemote()
    const f: InputFrame = {
      left: this.is('left'),
      right: this.is('right'),
      up: this.is('up'),
      down: this.is('down'),
      jump: this.is('jump'),
      run: this.is('run'),
      jumpPressed: this.pressed.has('jump'),
      runPressed: this.pressed.has('run'),
      togglePressed: this.pressed.has('toggle'),
      menuPressed: this.pressed.has('menu'),
      restartPressed: this.pressed.has('restart'),
    }
    if (this.remoteStick && !this.suspended) f.stick = this.remoteStick
    if (f.left && f.right) {
      f.left = false
      f.right = false
    }
    // The menu button is read once per display frame (see consume), even while paused.
    const menu = this.pressed.has('menu')
    this.pressed.clear()
    if (menu) this.pressed.add('menu')
    return f
  }

  /** Held state without consuming presses (for UI such as the editor camera). */
  isHeld(a: Action) {
    return this.is(a)
  }
}

function isTyping(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false
  if (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true
  // Controls that take the arrow keys themselves (the header's Build | Play, tabs, menus) keep them.
  return !!t.closest('[role="radiogroup"], [role="tablist"], [role="menu"]')
}
