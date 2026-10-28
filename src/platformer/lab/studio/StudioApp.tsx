import { useEffect, useMemo } from 'react'
import { StudioShell } from './screen/StudioShell'
import { loadProject, watchAndSave } from './storage'
import { StudioStore } from './store'
import './studio.css'

/**
 * /2d/lab/next: Code Lab on the new core. One shell with Build · Code · Play (docs/qa/code-lab-on-main/UX-AUDIT.md);
 * Code is the only code editor.
 */
export default function StudioApp() {
  const store = useMemo(() => new StudioStore(loadProject()), [])
  useEffect(() => watchAndSave(store), [store])
  // Dev only: the console can reach the store (window.__studio) to check state while testing.
  if (import.meta.env.DEV) (window as unknown as { __studio?: StudioStore }).__studio = store
  return <div className="studio-screen"><StudioShell store={store} /></div>
}
