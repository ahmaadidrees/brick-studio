import type { PlayerInput } from '@brick-studio/platformer-core/engine/player'

/*
 * Keyboard, game controller and on-screen touch buttons merged into one input per tick.
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

export interface InputFrame extends PlayerInput {
  togglePressed: boolean
  menuPressed: boolean
  restartPressed: boolean
}

export class Input {
  private held = new Set<Action>()
  private pressed = new Set<Action>()
  private touchHeld = new Set<Action>()
  private padHeld = new Set<Action>()
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

  /** Whether an action was pressed since last asked (polls the controller). */
  consume(a: Action): boolean {
    this.pollPad()
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
    return this.held.has(a) || this.touchHeld.has(a) || this.padHeld.has(a)
  }

  /** Read the input for one tick. Presses are consumed. */
  frame(): InputFrame {
    this.pollPad()
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
