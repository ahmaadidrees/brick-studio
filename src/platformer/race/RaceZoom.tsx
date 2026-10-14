import { Maximize2, Minus, Plus } from 'lucide-react'

interface Props {
  zoom: number
  max: number
  onZoom: (z: number) => void
}

const STEP = 1.4

/** Zoom out to see more of a race track while building, up to the whole track at once. */
export function RaceZoom({ zoom, max, onZoom }: Props) {
  const whole = zoom >= max - 0.01
  return (
    <div className="p2d-race-zoom" role="group" aria-label="Zoom">
      <button type="button" className="p2d-strip-button p2d-strip-icon" aria-label="Zoom in" title="Zoom in (=)" disabled={zoom <= 1.001} onClick={() => onZoom(zoom / STEP)}>
        <Plus size={16} aria-hidden="true" />
      </button>
      <button type="button" className="p2d-strip-button p2d-strip-icon" aria-label="Zoom out" title="Zoom out (−)" disabled={whole} onClick={() => onZoom(zoom * STEP)}>
        <Minus size={16} aria-hidden="true" />
      </button>
      <button type="button" className="p2d-strip-button" aria-pressed={whole} title="See the whole track (0)" onClick={() => onZoom(whole ? 1 : max)}>
        <Maximize2 size={16} aria-hidden="true" />
        <span>{whole ? 'Close up' : 'Whole track'}</span>
      </button>
    </div>
  )
}

export const ZOOM_STEP = STEP
