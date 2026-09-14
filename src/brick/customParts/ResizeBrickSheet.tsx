import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { CUSTOM_BRICK_MAX_WIDTH, CUSTOM_BRICK_MAX_DEPTH, CUSTOM_BRICK_MAX_HEIGHT } from '../brickDocument'
import { Button, Dialog } from '../../ui'
import './create-brick-sheet.css'

export type ResizeDelta = { width: number; depth: number; height: number }

/**
 * `onApply` returns whether the atomic resize was accepted. Hosts that have
 * the real `resizeSelectionDefinitions` result may return it directly
 * (`{ ok: false, message }`) so the sheet can show the actual reason —
 * occupied space, size limits, matching round/cone footprints or the
 * custom-part cap — instead of a generic message.
 */
export type ResizeApplyResult = boolean | { ok: true } | { ok: false; message: string }

export type ResizeBrickSheetProps = {
  open: boolean
  selectionCount: number
  onApply: (delta: ResizeDelta) => ResizeApplyResult
  onClose: () => void
}

export const RESIZE_GENERIC_REJECTION = 'That size does not fit here. Try a smaller change or move the selection first.'
export const RESIZE_NO_CHANGE = 'Choose at least one size change.'

const AXES = [
  { key: 'width', label: 'Width', unit: 'stud', max: CUSTOM_BRICK_MAX_WIDTH },
  { key: 'depth', label: 'Depth', unit: 'stud', max: CUSTOM_BRICK_MAX_DEPTH },
  { key: 'height', label: 'Height', unit: 'plate', max: CUSTOM_BRICK_MAX_HEIGHT },
] as const

const ZERO: ResizeDelta = { width: 0, depth: 0, height: 0 }

function plural(count: number, unit: string) {
  return Math.abs(count) === 1 ? unit : `${unit}s`
}

function describeDelta(delta: ResizeDelta) {
  const parts = AXES
    .filter(({ key }) => delta[key] !== 0)
    .map(({ key, label, unit }) => `${label.toLowerCase()} ${delta[key] > 0 ? '+' : '−'}${Math.abs(delta[key])} ${plural(delta[key], unit)}`)
  return parts.length ? `Change: ${parts.join(', ')}.` : 'No change yet. Use − and + to adjust each dimension.'
}

/**
 * "Resize brick(s)" (board 10): one snapped delta applied to the whole
 * selection. The change is atomic — the host either accepts it for every
 * selected brick or reports why not, and that reason stays inline here.
 */
export function ResizeBrickSheet({ open, selectionCount, onApply, onClose }: ResizeBrickSheetProps) {
  const [delta, setDelta] = useState<ResizeDelta>(ZERO)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setDelta(ZERO)
    setError(null)
  }, [open])

  const unchanged = delta.width === 0 && delta.depth === 0 && delta.height === 0
  const adjust = (key: keyof ResizeDelta, step: number) => {
    setError(null)
    setDelta((current) => ({ ...current, [key]: current[key] + step }))
  }

  const apply = () => {
    if (unchanged) {
      setError(RESIZE_NO_CHANGE)
      return
    }
    const result = onApply(delta)
    if (result === true || (typeof result === 'object' && result !== null && result.ok)) {
      onClose()
      return
    }
    setError(typeof result === 'object' && result !== null && !result.ok && result.message ? result.message : RESIZE_GENERIC_REJECTION)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Resize ${selectionCount === 1 ? 'brick' : `${selectionCount} bricks`}`}
      description="Sizes snap to studs and plates. The change applies only if every selected brick still fits."
      closeLabel="Close resize"
      className="resize-brick-sheet"
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={apply}>Apply resize</Button>
        </>
      )}
    >
      <div className="resize-brick-axes">
        {AXES.map(({ key, label, unit, max }) => (
          <section key={key} className="resize-brick-axis" aria-label={`${label} adjustment`}>
            <span className="resize-brick-axis-label">
              <strong>{label}</strong>
              <small>{unit}s · max {max}</small>
            </span>
            <div className="resize-brick-axis-controls">
              <Button variant="secondary" iconOnly icon={<Minus size={18} />} aria-label={`Decrease ${label.toLowerCase()}`} onClick={() => adjust(key, -1)}>Decrease {label.toLowerCase()}</Button>
              <output className="resize-brick-axis-value" aria-live="polite">{delta[key] > 0 ? `+${delta[key]}` : delta[key]} {plural(delta[key], unit)}</output>
              <Button variant="secondary" iconOnly icon={<Plus size={18} />} aria-label={`Increase ${label.toLowerCase()}`} onClick={() => adjust(key, 1)}>Increase {label.toLowerCase()}</Button>
            </div>
          </section>
        ))}
      </div>
      <p className="resize-brick-summary" aria-live="polite">{describeDelta(delta)}</p>
      {error && <p className="create-brick-error" role="alert">{error}</p>}
    </Dialog>
  )
}

export default ResizeBrickSheet
