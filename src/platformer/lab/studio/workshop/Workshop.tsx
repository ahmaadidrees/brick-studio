import type { StudioStore } from '../store'

/** Stub. Owned by the step 6 "workshop" lane (docs/qa/code-lab-core/STEP6.md): the full-screen Brick Workshop. */
export function Workshop({ store }: { store: StudioStore }) {
  return (
    <div className="studio-stub">
      Brick Workshop — coming in step 6 (workshop lane).{' '}
      <button type="button" onClick={() => store.closeWorkshop()}>Done</button>
    </div>
  )
}
