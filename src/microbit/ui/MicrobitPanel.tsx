import { X } from 'lucide-react'
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { ACTION_NAMES, EVENT_MODES, EVENT_NAMES, GAME_EVENTS, MODE_NAMES, PARTS, PART_NAMES, actionsFor, type Part, type ReactionShow, type ReactionSound, type RemoteAction } from '../assign'
import { REMOTE_HEX_URL, canFlash, installRemote, preloadFlasher, useFlash } from '../flash'
import { connect, disconnect } from '../link'
import { IMAGES, TILT_MAX, TUNES, type Pin } from '../protocol'
import { useMicrobit } from '../store'
import './microbit.css'

const PRESS_PARTS: Pin[] = ['a', 'b', 'logo', 'p0', 'p1', 'p2']
/** The block editor we host (docs/MICRO-EDITOR.md). */
export const BLOCK_EDITOR_URL = '/micro/'
const label = (s: string) => s.replace(/_/g, ' ')

/** Brickgineers Remote: connect a board, press its parts on screen, and choose what each part does. */
export function MicrobitPanel() {
  const open = useMicrobit((s) => s.panelOpen)
  const setPanelOpen = useMicrobit((s) => s.setPanelOpen)

  // Escape closes the panel before the game sees it (the game would open its menu).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setPanelOpen(false)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, setPanelOpen])

  if (!open) return null
  return <PanelBody onClose={() => setPanelOpen(false)} />
}

function PanelBody({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<Part>('a')
  return (
    <aside className="mb-panel" aria-label="Brickgineers Remote" onKeyDown={(e) => e.stopPropagation()}>
      <header className="mb-head">
        <h2>Brickgineers Remote</h2>
        <button type="button" className="mb-icon-btn" aria-label="Close" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <ConnectRow />
      <OwnProgram />
      <VirtualBoard selected={selected} onSelect={setSelected} />
      <AssignList selected={selected} onSelect={setSelected} />
      <Reactions />
      <Monitor />
    </aside>
  )
}

function ConnectRow() {
  const status = useMicrobit((s) => s.status)
  const hello = useMicrobit((s) => s.hello)
  const error = useMicrobit((s) => s.error)
  const connected = status === 'connected'
  return (
    <section className="mb-section" aria-label="Connection">
      {status === 'unsupported' ? (
        <p className="mb-note">This browser can't connect over USB. Use Chrome or Edge on a computer or Chromebook. The on-screen board below still works.</p>
      ) : connected ? (
        <>
          <p className={`mb-status ${hello ? 'is-ok' : 'is-wait'}`} role="status">
            {hello ? 'Remote program running' : "Connected, but the Brickgineers Remote program isn't on it yet"}
          </p>
          <button type="button" className="mb-btn" onClick={() => void disconnect()}>Disconnect</button>
        </>
      ) : (
        <button type="button" className="mb-btn mb-btn-primary" disabled={status === 'connecting'} onClick={() => void connect()}>
          {status === 'connecting' ? 'Connecting…' : 'Connect micro:bit'}
        </button>
      )}
      {error && <p className="mb-error" role="alert">{error}</p>}
      <InstallRow />
    </section>
  )
}

/** Puts the remote program on the micro:bit from the page, or (no WebUSB) the file to drag onto the MICROBIT drive. */
function InstallRow() {
  const { phase, progress, error } = useFlash()
  const linked = useMicrobit((s) => s.status === 'connected')
  const usb = canFlash()
  useEffect(() => {
    if (usb) void preloadFlasher()
  }, [usb])
  if (!usb) {
    return (
      <p className="mb-note">
        <a href={REMOTE_HEX_URL} download>Get the remote program</a>. Drag it onto the MICROBIT drive.
      </p>
    )
  }
  const busy = phase === 'choosing' || phase === 'installing'
  return (
    <div className="mb-install">
      <button type="button" className="mb-btn" disabled={busy} onClick={() => void installRemote()}>
        {phase === 'installing' ? `Installing… ${Math.round(progress * 100)}%` : phase === 'choosing' ? 'Pick your micro:bit…' : 'Install the remote program'}
      </button>
      {phase === 'installing' && (
        <div className="mb-progress" role="progressbar" aria-label="Installing the remote program" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {phase === 'installing' && <p className="mb-note">Keep the micro:bit plugged in.</p>}
      {phase === 'done' && <p className="mb-status is-ok" role="status">Installed. The micro:bit shows a happy face.{linked ? '' : ' Now press Connect micro:bit.'}</p>}
      {phase === 'error' && <p className="mb-error" role="alert">{error}</p>}
      <p className="mb-note">
        Puts the remote on your micro:bit (do it once). Or <a href={REMOTE_HEX_URL} download>download the file</a> and drag it onto the MICROBIT drive.
      </p>
    </div>
  )
}

/** The block editor opens in its own tab, so the game keeps running. */
function OwnProgram() {
  return (
    <section className="mb-section" aria-label="Your own program">
      <a className="mb-btn" href={BLOCK_EDITOR_URL} target="_blank" rel="noopener">Code your micro:bit</a>
      <p className="mb-note">Opens the block editor in a new tab. Only one tab can use the micro:bit at a time, so close it before you press Connect micro:bit.</p>
    </section>
  )
}

function VirtualBoard({ selected, onSelect }: { selected: Part; onSelect: (p: Part) => void }) {
  const mode = useMicrobit((s) => s.mode)
  const board = useMicrobit((s) => s.board)
  const setPin = useMicrobit((s) => s.setPin)
  const setTilt = useMicrobit((s) => s.setTilt)
  const gesture = useMicrobit((s) => s.gesture)
  const tilt = board.tilt

  const press = (pin: Pin) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      onSelect(pin)
      setPin(pin, true)
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId)
      } catch {
        // No live pointer to capture (some browsers, synthetic events): pointerup still lets go.
      }
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      setPin(pin, false)
      // Hand the keyboard back to the game, so arrows and space work right after a tap.
      e.currentTarget.blur()
    },
    onPointerCancel: () => setPin(pin, false),
    onLostPointerCapture: () => setPin(pin, false),
    // Keyboard and screen readers: Enter or Space gives a short tap.
    onClick: (e: React.MouseEvent) => {
      if (e.detail !== 0) return
      onSelect(pin)
      setPin(pin, true)
      window.setTimeout(() => setPin(pin, false), 150)
    },
  })
  const partClass = (part: Part, extra = '') => `mb-part ${extra} ${selected === part ? 'sel' : ''} ${part in board.pins && board.pins[part as Pin] ? 'down' : ''}`.trim()

  // A little LED follows the lean, like the real board's tilt demo.
  const col = Math.max(0, Math.min(4, Math.round(2 + (tilt.x / TILT_MAX) * 2.5)))
  const row = Math.max(0, Math.min(4, Math.round(2 - (tilt.y / TILT_MAX) * 2.5)))
  const rotate = (tilt.x / TILT_MAX) * 18

  const springBack = (axis: 'x' | 'y') => () => setTilt(axis === 'x' ? 0 : tilt.x, axis === 'y' ? 0 : tilt.y)

  return (
    <section className="mb-section" aria-label="Board on screen">
      <div className="mb-board" style={{ transform: `rotate(${rotate}deg)` }}>
        <div className="mb-board-top">
          <button type="button" className={partClass('logo', 'mb-logo')} aria-label="Press Touch logo" {...press('logo')}>logo</button>
        </div>
        <div className="mb-board-mid">
          <button type="button" className={partClass('a', 'mb-round')} aria-label="Press Button A" {...press('a')}>A</button>
          <div className="mb-leds" aria-hidden="true">
            {Array.from({ length: 25 }, (_, i) => (
              <span key={i} className={`mb-led ${i === row * 5 + col && (tilt.x !== 0 || tilt.y !== 0) ? 'lit' : ''}`} />
            ))}
          </div>
          <button type="button" className={partClass('b', 'mb-round')} aria-label="Press Button B" {...press('b')}>B</button>
        </div>
        <div className="mb-board-pins">
          {(['p0', 'p1', 'p2'] as const).map((p) => (
            <button key={p} type="button" className={partClass(p, 'mb-pin')} aria-label={`Press ${PART_NAMES[p]}`} {...press(p)}>{p.toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div className="mb-moments">
        <button type="button" className={partClass('tilt', 'mb-chip')} aria-pressed={selected === 'tilt'} onClick={() => onSelect('tilt')}>Tilt</button>
        <button type="button" className={partClass('shake', 'mb-chip')} onClick={() => { onSelect('shake'); gesture('shake') }}>Shake</button>
        <button type="button" className={partClass('loud', 'mb-chip')} onClick={() => { onSelect('loud'); gesture('loud') }}>Clap</button>
      </div>

      <label className="mb-tilt">
        <span>Lean left or right</span>
        <input
          type="range" min={-TILT_MAX} max={TILT_MAX} step={16} value={tilt.x}
          onChange={(e) => { onSelect('tilt'); setTilt(Number(e.target.value), tilt.y) }}
          onPointerUp={springBack('x')} onPointerCancel={springBack('x')} onBlur={springBack('x')} onKeyUp={springBack('x')}
        />
      </label>
      {mode === '3d' && (
        <label className="mb-tilt">
          <span>Lean back or forward</span>
          <input
            type="range" min={-TILT_MAX} max={TILT_MAX} step={16} value={tilt.y}
            onChange={(e) => { onSelect('tilt'); setTilt(tilt.x, Number(e.target.value)) }}
            onPointerUp={springBack('y')} onPointerCancel={springBack('y')} onBlur={springBack('y')} onKeyUp={springBack('y')}
          />
        </label>
      )}
    </section>
  )
}

function AssignList({ selected, onSelect }: { selected: Part; onSelect: (p: Part) => void }) {
  const mode = useMicrobit((s) => s.mode)
  const assignments = useMicrobit((s) => s.assignments[s.mode])
  const assign = useMicrobit((s) => s.assign)
  const reset = useMicrobit((s) => s.resetAssignments)
  return (
    <section className="mb-section" aria-label="What each part does">
      <h3>What each part does <span className="mb-mode">{MODE_NAMES[mode]}</span></h3>
      <ul className="mb-rows">
        {PARTS.map((part) => (
          <li key={part} className={`mb-row ${selected === part ? 'sel' : ''}`} onClick={() => onSelect(part)}>
            <label htmlFor={`mb-assign-${part}`}>{PART_NAMES[part]}</label>
            <select id={`mb-assign-${part}`} value={assignments[part]} onFocus={() => onSelect(part)} onChange={(e) => assign(mode, part, e.target.value as RemoteAction)}>
              {actionsFor(mode, part).map((a) => <option key={a} value={a}>{ACTION_NAMES[a]}</option>)}
            </select>
          </li>
        ))}
      </ul>
      <button type="button" className="mb-btn" onClick={() => reset(mode)}>Reset to starter</button>
    </section>
  )
}

function Reactions() {
  const mode = useMicrobit((s) => s.mode)
  const reactions = useMicrobit((s) => s.reactions)
  const setReaction = useMicrobit((s) => s.setReaction)
  const react = useMicrobit((s) => s.react)
  const events = GAME_EVENTS.filter((e) => EVENT_MODES[e].includes(mode))
  return (
    <section className="mb-section" aria-label="When the game says">
      <h3>When the game says…</h3>
      <ul className="mb-rows">
        {events.map((event) => {
          const r = reactions[event]
          return (
            <li key={event} className="mb-react">
              <span className="mb-react-name">{EVENT_NAMES[event]}</span>
              <label>
                <span>Show</span>
                <select value={r.show} onChange={(e) => setReaction(event, { ...r, show: e.target.value as ReactionShow })}>
                  {IMAGES.map((i) => <option key={i} value={i}>{label(i)}</option>)}
                  <option value="count">the number</option>
                  <option value="none">nothing</option>
                </select>
              </label>
              <label>
                <span>Sound</span>
                <select value={r.sound} onChange={(e) => setReaction(event, { ...r, sound: e.target.value as ReactionSound })}>
                  {TUNES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
                  <option value="beep">beep</option>
                  <option value="buzz">buzz</option>
                  <option value="none">none</option>
                </select>
              </label>
              <button type="button" className="mb-btn" onClick={() => react(event, 3)}>Try it</button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Monitor() {
  const monitor = useMicrobit((s) => s.monitor)
  return (
    <details className="mb-section mb-monitor">
      <summary>Live monitor</summary>
      <div className="mb-log" role="log" aria-label="Messages to and from the board">
        {monitor.length === 0 && <span className="mb-note">Nothing yet.</span>}
        {monitor.map((l, i) => (
          <div key={i} className={`mb-line ${l.dir}`}>
            <b>{l.dir === 'in' ? '← in' : '→ out'}</b> {l.text}
          </div>
        ))}
      </div>
    </details>
  )
}
