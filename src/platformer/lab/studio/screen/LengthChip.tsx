import { Minus, Plus } from 'lucide-react'
import { useStudio, type StudioStore } from '../store'
import { LENGTH_STEP, MAX_LENGTH, levelLength, shortestLength } from '../builder/levelLength'

/**
 * Build's level length chip for the Platformer (parity bucket B): how long the level is, with − and + a screen (20 tiles)
 * at a time. − stops at the last thing painted or placed, so it never takes anything away.
 */
export function LengthChip({ store }: { store: StudioStore }) {
  const design = useStudio(store, (s) => s.project.design)
  const cols = levelLength(design)
  const shortest = shortestLength(design)
  const shorter = Math.max(shortest, cols - LENGTH_STEP)
  const longer = Math.min(MAX_LENGTH, cols + LENGTH_STEP)
  return (
    <div className="cl-length" role="group" aria-label="Level length">
      <span>Length</span>
      <button type="button" aria-label="Shorter level" title={shorter < cols ? `${shorter} tiles` : 'Something is in the way: move it first'} disabled={shorter >= cols} onClick={() => store.setLevelLength(shorter)}>
        <Minus size={14} aria-hidden="true" />
      </button>
      <b aria-live="polite">{cols} tiles</b>
      <button type="button" aria-label="Longer level" title={`${longer} tiles`} disabled={longer <= cols} onClick={() => store.setLevelLength(longer)}>
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
