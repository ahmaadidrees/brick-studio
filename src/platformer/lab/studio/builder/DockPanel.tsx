import { useEffect, useRef, type ReactNode } from 'react'

export function clampDockWidth(width: number, viewport = window.innerWidth): number {
  return Math.min(Math.max(380, width), Math.max(380, viewport * 0.6))
}

/** The card and code use one reserved panel, so neither can cover the world. */
export function DockPanel({ width, onWidth, children }: { width: number; onWidth: (width: number) => void; children: ReactNode }) {
  const drag = useRef<{ start: number; width: number } | null>(null)
  const safeWidth = clampDockWidth(width)
  useEffect(() => {
    const resize = () => onWidth(clampDockWidth(width))
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [width, onWidth])
  const save = (next: number) => {
    const value = clampDockWidth(next)
    onWidth(value)
    try { localStorage.setItem('brick-code-panel-width', String(value)) } catch { /* Browser may block storage. */ }
  }
  return <aside className="builder-dock" aria-label="Brick card">
    <div role="separator" aria-label="Resize brick panel" aria-orientation="vertical" aria-valuemin={380} aria-valuemax={Math.floor(Math.max(380, window.innerWidth * 0.6))} aria-valuenow={Math.round(safeWidth)} tabIndex={0} className="builder-dock-resize"
      onPointerDown={(event) => { drag.current = { start: event.clientX, width: safeWidth }; event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault() }}
      onPointerMove={(event) => { if (drag.current) save(drag.current.width + drag.current.start - event.clientX) }}
      onPointerUp={(event) => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId) }}
      onPointerCancel={() => { drag.current = null }}
      onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); save(safeWidth + (event.key === 'ArrowLeft' ? 20 : -20)) } }} />
    {children}
  </aside>
}
