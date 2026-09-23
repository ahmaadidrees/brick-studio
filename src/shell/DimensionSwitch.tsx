import { Box, Square } from 'lucide-react'

export type BuildDimension = '3d' | '2d'

/** Where each builder opens: your last 3D build, or your last 2D level (a new one when there is none). */
export const DIMENSION_HREF: Record<BuildDimension, string> = { '3d': '/build', '2d': '/2d/build' }

const LABELS: Record<BuildDimension, { short: string; long: string }> = {
  '3d': { short: '3D', long: '3D bricks' },
  '2d': { short: '2D', long: '2D worlds' },
}

export type DimensionSwitchProps = {
  current: BuildDimension
  /** Leave for the other builder. Builders pass their own so they can save first; defaults to a plain navigation. */
  onSwitch?: (target: BuildDimension) => void
  className?: string
}

/**
 * 3D ⇄ 2D: the same pill in both builders' headers (and on the 2D pages), so either builder is one tap from the
 * other. It looks like the shared SegmentedControl but is navigation, not a setting: the current side carries
 * `aria-current="page"` and the other side leaves.
 */
export function DimensionSwitch({ current, onSwitch, className }: DimensionSwitchProps) {
  const go = (target: BuildDimension) => {
    if (target === current) return
    if (onSwitch) onSwitch(target)
    else window.location.assign(DIMENSION_HREF[target])
  }
  return (
    <nav className={['ui-segmented', 'ui-segmented-sm', 'shell-dimension-switch', className].filter(Boolean).join(' ')} aria-label="Build in 3D or 2D">
      <div className="ui-segmented-track">
        {(['3d', '2d'] as const).map((dimension) => {
          const selected = dimension === current
          return (
            <button
              key={dimension}
              type="button"
              className={['ui-segmented-option', selected && 'ui-segmented-selected'].filter(Boolean).join(' ')}
              aria-current={selected ? 'page' : undefined}
              aria-label={LABELS[dimension].long}
              title={selected ? `You are building in ${LABELS[dimension].long}` : `Switch to ${LABELS[dimension].long}`}
              onClick={() => go(dimension)}
            >
              <span className="ui-segmented-icon" aria-hidden="true">{dimension === '3d' ? <Box size={16} /> : <Square size={16} />}</span>
              <span aria-hidden="true">{LABELS[dimension].short}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
