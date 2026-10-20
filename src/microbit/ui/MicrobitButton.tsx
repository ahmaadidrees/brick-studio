import { useMicrobit } from '../store'
import './microbit.css'

/** The board icon: five little LEDs between two buttons. */
function BoardIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" className="mb-icon">
      <rect x="1.5" y="5" width="21" height="14" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6" cy="12" r="1.7" fill="currentColor" />
      <circle cx="18" cy="12" r="1.7" fill="currentColor" />
      <rect x="10" y="9" width="1.6" height="1.6" fill="currentColor" />
      <rect x="12.4" y="9" width="1.6" height="1.6" fill="currentColor" />
      <rect x="10" y="12.6" width="1.6" height="1.6" fill="currentColor" />
      <rect x="12.4" y="12.6" width="1.6" height="1.6" fill="currentColor" />
    </svg>
  )
}

/** Top-bar button that opens and closes the Brickgineers Remote panel. Used by the 2D game and the 3D mode. */
export function MicrobitButton({ className = '' }: { className?: string }) {
  const open = useMicrobit((s) => s.panelOpen)
  const connected = useMicrobit((s) => s.status === 'connected')
  const setPanelOpen = useMicrobit((s) => s.setPanelOpen)
  return (
    <button
      type="button"
      className={`mb-button ${open ? 'is-open' : ''} ${className}`.trim()}
      aria-pressed={open}
      aria-label={connected ? 'Remote (connected)' : 'Remote'}
      title="Brickgineers Remote"
      onClick={(e) => {
        setPanelOpen(!open)
        // Hand the keyboard back to the game after a mouse or touch click.
        if (e.detail > 0) e.currentTarget.blur()
      }}
    >
      <BoardIcon />
      <span className="mb-button-label">Remote</span>
      {connected && <span className="mb-dot" aria-hidden="true" />}
    </button>
  )
}
