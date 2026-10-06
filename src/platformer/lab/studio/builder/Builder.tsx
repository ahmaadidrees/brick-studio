import { BrickList } from '../BrickList'
import { Stage } from '../Stage'
import type { StudioStore } from '../store'

/**
 * Stub. Owned by the step 6 "builder" lane (docs/qa/code-lab-core/STEP6.md): the Brickgineers 2D builder look
 * (header, Bricks drawer, Placing strip, See inside popover) around the existing Stage.
 */
export function Builder({ store }: { store: StudioStore }) {
  return (
    <div className="studio-builder-stub" style={{ display: 'grid', gridTemplateRows: '1fr auto', height: '100%' }}>
      <Stage store={store} />
      <BrickList store={store} />
    </div>
  )
}
