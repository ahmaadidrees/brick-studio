import { useEffect, useId, useRef, useState } from 'react'

export type ResizeDelta = { width: number; depth: number; height: number }

export type ResizeBrickSheetProps = {
  open: boolean
  selectionCount: number
  onApply: (delta: ResizeDelta) => boolean
  onClose: () => void
}

const AXES = [
  { key: 'width', label: 'Width', unit: 'stud' },
  { key: 'depth', label: 'Depth', unit: 'stud' },
  { key: 'height', label: 'Height', unit: 'plate' },
] as const

export function ResizeBrickSheet({ open, selectionCount, onApply, onClose }: ResizeBrickSheetProps) {
  const titleId = useId()
  const panel = useRef<HTMLDivElement>(null)
  const [delta, setDelta] = useState<ResizeDelta>({ width: 0, depth: 0, height: 0 })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDelta({ width: 0, depth: 0, height: 0 })
    setError(null)
    panel.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="create-brick-sheet resize-brick-sheet">
      <button className="create-brick-backdrop" type="button" aria-label="Cancel resizing" onClick={onClose} />
      <div
        ref={panel}
        className="create-brick-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }}
      >
        <header>
          <div><span>Selection</span><h2 id={titleId}>Resize {selectionCount === 1 ? 'brick' : `${selectionCount} bricks`}</h2></div>
          <button type="button" aria-label="Close resize" onClick={onClose}>×</button>
        </header>
        <p>Change snapped dimensions together. The resize applies only if the complete selection stays valid.</p>
        <div className="resize-brick-axes">
          {AXES.map(({ key, label, unit }) => (
            <section key={key} aria-label={`${label} adjustment`}>
              <span>{label}</span>
              <div>
                <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} onClick={() => setDelta((current) => ({ ...current, [key]: current[key] - 1 }))}>−</button>
                <output aria-live="polite">{delta[key] > 0 ? `+${delta[key]}` : delta[key]} {Math.abs(delta[key]) === 1 ? unit : `${unit}s`}</output>
                <button type="button" aria-label={`Increase ${label.toLowerCase()}`} onClick={() => setDelta((current) => ({ ...current, [key]: current[key] + 1 }))}>+</button>
              </div>
            </section>
          ))}
        </div>
        {error && <p className="create-brick-error" role="alert">{error}</p>}
        <footer>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" onClick={() => {
            if (delta.width === 0 && delta.depth === 0 && delta.height === 0) {
              setError('Choose at least one size change.')
              return
            }
            if (onApply(delta)) onClose()
            else setError('That size does not fit here. Try a smaller change or move the selection first.')
          }}>Apply resize</button>
        </footer>
      </div>
    </div>
  )
}

export default ResizeBrickSheet
