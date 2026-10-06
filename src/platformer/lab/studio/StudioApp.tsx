import { useEffect, useMemo } from 'react'
import { Builder } from './builder/Builder'
import { loadProject, watchAndSave } from './storage'
import { StudioStore, useStudio } from './store'
import { Workshop } from './workshop/Workshop'
import './studio.css'

/**
 * /2d/lab/next: Code Lab on the new core. Step 6 (docs/qa/code-lab-core/STEP6.md): the screen is the Brickgineers
 * 2D builder; "See inside" or "+ New brick" opens the full-screen Brick Workshop, and Done comes back.
 */
export default function StudioApp() {
  const store = useMemo(() => new StudioStore(loadProject()), [])
  useEffect(() => watchAndSave(store), [store])
  const workshopBrickId = useStudio(store, (s) => s.workshopBrickId)

  return <div className="studio-screen">{workshopBrickId ? <Workshop store={store} /> : <Builder store={store} />}</div>
}
