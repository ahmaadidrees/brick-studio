import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { PROGRAM_KEYS, type ProgramKey } from '../program/types'
import { programKeyFromEvent } from '../run/input'

/**
 * The stage's inputs (contract §1.4: inputs are things a program reads). An on-screen
 * joystick you drag with a mouse or a finger, and a key pad you can press the same way.
 * The physical arrow keys and space reach the program through the stage itself
 * (`scene/StageLayer.tsx`); the pad only lights up to show them.
 */
export type StageInputProps = {
  onJoystick: (up: number, right: number) => void
  onKey: (key: ProgramKey, down: boolean) => void
  /** Keys the stage reads right now (the pad lights them). */
  disabled?: boolean
}

const JOYSTICK_SIZE = 120
const KNOB_SIZE = 52

/** Pointer offset from the centre → joystick axes, -100..100, clamped to the circle. */
export function joystickAxes(dx: number, dy: number, radius: number): { up: number; right: number } {
  const length = Math.hypot(dx, dy)
  const scale = length > radius ? radius / length : 1
  const clean = (value: number) => (Object.is(value, -0) ? 0 : value)
  return { up: clean(Math.round((-dy * scale * 100) / radius)), right: clean(Math.round((dx * scale * 100) / radius)) }
}

export function Joystick({ onChange, disabled = false }: { onChange: (up: number, right: number) => void; disabled?: boolean }) {
  const base = useRef<HTMLDivElement>(null)
  const pointer = useRef<number | null>(null)
  const [knob, setKnob] = useState({ x: 0, y: 0 })
  const [axes, setAxes] = useState({ up: 0, right: 0 })
  const [active, setActive] = useState(false)
  const radius = (JOYSTICK_SIZE - KNOB_SIZE) / 2

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = base.current?.getBoundingClientRect()
    if (!rect) return
    const dx = event.clientX - (rect.left + rect.width / 2)
    const dy = event.clientY - (rect.top + rect.height / 2)
    const next = joystickAxes(dx, dy, radius)
    setAxes(next)
    setKnob({ x: (next.right / 100) * radius, y: (-next.up / 100) * radius })
    onChange(next.up, next.right)
  }
  const release = () => {
    if (pointer.current === null) return
    pointer.current = null
    setActive(false)
    setKnob({ x: 0, y: 0 })
    setAxes({ up: 0, right: 0 })
    onChange(0, 0)
  }
  // Letting go of the stage (Stop, Reset, leaving Code) always centres the stick.
  useEffect(() => () => { if (pointer.current !== null) onChange(0, 0) }, [onChange])

  return (
    <div
      ref={base}
      className={`robo-joystick${active ? ' active' : ''}`}
      role="slider"
      aria-label="On-screen joystick"
      aria-valuetext={`up ${axes.up}, right ${axes.right}`}
      aria-disabled={disabled || undefined}
      data-testid="robo-joystick"
      style={{ width: JOYSTICK_SIZE, height: JOYSTICK_SIZE }}
      onPointerDown={(event) => {
        if (disabled || pointer.current !== null) return
        event.preventDefault()
        pointer.current = event.pointerId
        setActive(true)
        event.currentTarget.setPointerCapture?.(event.pointerId)
        move(event)
      }}
      onPointerMove={(event) => { if (pointer.current === event.pointerId) move(event) }}
      onPointerUp={(event) => { if (pointer.current === event.pointerId) release() }}
      onPointerCancel={(event) => { if (pointer.current === event.pointerId) release() }}
      onLostPointerCapture={(event) => { if (pointer.current === event.pointerId) release() }}
    >
      <span className="robo-joystick-knob" style={{ width: KNOB_SIZE, height: KNOB_SIZE, transform: `translate(${knob.x}px, ${knob.y}px)` }} />
    </div>
  )
}

const PAD: { key: ProgramKey; label: string; area: string }[] = [
  { key: 'up', label: '↑', area: 'up' },
  { key: 'left', label: '←', area: 'left' },
  { key: 'down', label: '↓', area: 'down' },
  { key: 'right', label: '→', area: 'right' },
  { key: 'space', label: 'space', area: 'space' },
]
const PAD_NAMES: Record<ProgramKey, string> = { up: 'Up arrow', down: 'Down arrow', left: 'Left arrow', right: 'Right arrow', space: 'Space' }

/** Which program keys are physically held (display only; the stage reads the keys itself). */
function useHeldKeys(): Set<ProgramKey> {
  const [held, setHeld] = useState<Set<ProgramKey>>(() => new Set())
  useEffect(() => {
    const update = (key: ProgramKey, down: boolean) => setHeld((current) => {
      if (current.has(key) === down) return current
      const next = new Set(current)
      if (down) next.add(key)
      else next.delete(key)
      return next
    })
    const down = (event: KeyboardEvent) => { const key = programKeyFromEvent(event); if (key) update(key, true) }
    const up = (event: KeyboardEvent) => { const key = programKeyFromEvent(event); if (key) update(key, false) }
    const clear = () => setHeld(new Set())
    // Capture on the window, passive: the stage's own listener stops propagation, not these.
    window.addEventListener('keydown', down, true)
    window.addEventListener('keyup', up, true)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', clear)
    }
  }, [])
  return held
}

export function KeyPad({ onKey, disabled = false }: { onKey: (key: ProgramKey, down: boolean) => void; disabled?: boolean }) {
  const held = useHeldKeys()
  const [pressed, setPressed] = useState<Set<ProgramKey>>(() => new Set())
  const press = (key: ProgramKey, down: boolean) => {
    setPressed((current) => {
      if (current.has(key) === down) return current
      const next = new Set(current)
      if (down) next.add(key)
      else next.delete(key)
      return next
    })
    onKey(key, down)
  }
  useEffect(() => () => { for (const key of PROGRAM_KEYS) onKey(key, false) }, [onKey])
  return (
    <div className="robo-keypad" role="group" aria-label="Keys" data-testid="robo-keypad">
      {PAD.map(({ key, label, area }) => (
        <button
          key={key}
          type="button"
          className={`robo-key robo-key-${area}${held.has(key) || pressed.has(key) ? ' held' : ''}`}
          aria-label={PAD_NAMES[key]}
          aria-pressed={held.has(key) || pressed.has(key)}
          disabled={disabled}
          onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture?.(event.pointerId); press(key, true) }}
          onPointerUp={() => press(key, false)}
          onPointerCancel={() => press(key, false)}
          onLostPointerCapture={() => { if (pressed.has(key)) press(key, false) }}
        >{label}</button>
      ))}
    </div>
  )
}

export type InputMode = 'joystick' | 'keys'

export function StageInput({ onJoystick, onKey, disabled = false }: StageInputProps) {
  const [mode, setMode] = useState<InputMode>('joystick')
  return (
    <div className="robo-stage-input" data-testid="robo-stage-input">
      <div className="robo-seg" role="group" aria-label="Input">
        <button type="button" className={mode === 'joystick' ? 'on' : ''} aria-pressed={mode === 'joystick'} onClick={() => setMode('joystick')}>Joystick</button>
        <button type="button" className={mode === 'keys' ? 'on' : ''} aria-pressed={mode === 'keys'} onClick={() => setMode('keys')}>Keys</button>
      </div>
      {mode === 'joystick' ? <Joystick onChange={onJoystick} disabled={disabled} /> : <KeyPad onKey={onKey} disabled={disabled} />}
    </div>
  )
}
