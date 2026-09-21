import { Compass, Hammer } from 'lucide-react'
import { useId } from 'react'
import { SegmentedControl } from '../ui'

export type StudioMode = 'build' | 'explore'

export type ModeSwitchProps = {
  mode: StudioMode
  onRequestMode: (mode: StudioMode) => void
  /** False until the build has a brick (Explore needs somewhere to stand). */
  canExplore: boolean
  /** Why Explore is unavailable; read by screen readers and shown as the tooltip. */
  exploreReason?: string
  /** Live rooms: only the owner switches modes, and only while online. Locks both options. */
  locked?: boolean
  lockedReason?: string
  className?: string
}

export const DEFAULT_EXPLORE_REASON = 'Place a brick first, then explore.'
export const DEFAULT_LOCKED_REASON = 'The room owner switches between Build and Explore for everyone.'

/**
 * Build | Explore as one pill (SegmentedControl, radiogroup semantics: one tab
 * stop, arrow keys switch). Keyboard shortcuts 1 and 2 stay in the editor.
 */
export function ModeSwitch({ mode, onRequestMode, canExplore, exploreReason = DEFAULT_EXPLORE_REASON, locked = false, lockedReason = DEFAULT_LOCKED_REASON, className }: ModeSwitchProps) {
  const hintId = useId()
  const hint = locked ? lockedReason : !canExplore ? exploreReason : undefined
  return (
    <div className={['shell-mode-switch', className].filter(Boolean).join(' ')} title={hint} data-mode={mode}>
      <SegmentedControl<StudioMode>
        label="Studio mode"
        size="sm"
        value={mode}
        onChange={(next) => { if (next !== mode) onRequestMode(next) }}
        aria-describedby={hint ? hintId : undefined}
        options={[
          { value: 'build', label: 'Build', icon: <Hammer size={16} />, disabled: locked },
          { value: 'explore', label: 'Explore', icon: <Compass size={16} />, disabled: locked || !canExplore },
        ]}
      />
      {hint && <span id={hintId} className="sr-only">{hint}</span>}
    </div>
  )
}
