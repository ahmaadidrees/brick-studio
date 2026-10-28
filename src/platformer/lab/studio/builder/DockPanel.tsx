import { useRef, type ReactNode } from 'react'

// Do not carry the old narrow card width into the focused code view.
export const CODE_PANEL_WIDTH_KEY = 'brick-code-panel-width-v2'

export function clampDockWidth(width: number, viewport = window.innerWidth): number {
  const minimum = Math.min(480, viewport * 0.6)
  return Math.min(Math.max(minimum, width), viewport * 0.67)
}

/** A compact tuning card becomes a spacious, resizable panel only while coding. */
export function DockPanel({ width, onWidth, resizable = true, children }: { width: number; onWidth: (width: number) => void; resizable?: boolean; children: ReactNode }) {
  const drag = useRef<{ start: number; width: number } | null>(null)
  const safeWidth = resizable ? clampDockWidth(width) : width
  const save = (next: number) => {
    const value = clampDockWidth(next)
    onWidth(value)
    try { localStorage.setItem(CODE_PANEL_WIDTH_KEY, String(value)) } catch { /* Browser may block storage. */ }
  }
  return <aside className={`builder-dock${resizable ? ' builder-dock-code' : ' builder-dock-card'}`} aria-label="Brick card">
    {resizable && <div role="separator" aria-label="Resize brick panel" aria-orientation="vertical" aria-valuemin={Math.round(Math.min(480, window.innerWidth * 0.6))} aria-valuemax={Math.floor(window.innerWidth * 0.67)} aria-valuenow={Math.round(safeWidth)} tabIndex={0} className="builder-dock-resize"
      onPointerDown={(event) => { drag.current = { start: event.clientX, width: safeWidth }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }}
      onPointerMove={(event) => { if (drag.current) save(drag.current.width + drag.current.start - event.clientX) }}
      onPointerUp={(event) => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }}
      onPointerCancel={() => { drag.current = null }}
      onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); save(safeWidth + (event.key === 'ArrowLeft' ? 20 : -20)) } }} />}
    {children}
  </aside>
}
