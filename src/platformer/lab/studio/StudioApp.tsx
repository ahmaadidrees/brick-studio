import { useEffect, useMemo } from 'react'
import { BrickList } from './BrickList'
import { CodeEditor } from './CodeEditor'
import { CostumeEditor } from './CostumeEditor'
import { SoundPanel } from './SoundPanel'
import { Stage } from './Stage'
import { loadProject, watchAndSave } from './storage'
import { StudioStore, useStudio, type EditorTab } from './store'
import './studio.css'

const TABS: { id: EditorTab; label: string }[] = [
  { id: 'code', label: 'Code' },
  { id: 'costumes', label: 'Costumes' },
  { id: 'sounds', label: 'Sounds' },
]

/**
 * /2d/lab/next: Code Lab on the new core (docs/CODE-LAB-BRICK-MODEL.md, build step 2). Code on the left; stage,
 * Build/Play and the brick list on the right. Panels are owned by wave 2 lanes (docs/qa/code-lab-core/WAVE2.md).
 */
export default function StudioApp() {
  const store = useMemo(() => new StudioStore(loadProject()), [])
  useEffect(() => watchAndSave(store), [store])
  const tab = useStudio(store, (s) => s.editorTab)

  return (
    <div className="studio">
      <section className="studio-left" aria-label="Brick editor">
        <nav className="studio-tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => store.setEditorTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <div className="studio-editor">
          {tab === 'code' && <CodeEditor store={store} />}
          {tab === 'costumes' && <CostumeEditor store={store} />}
          {tab === 'sounds' && <SoundPanel store={store} />}
        </div>
      </section>
      <section className="studio-right" aria-label="Level">
        <Stage store={store} />
        <BrickList store={store} />
      </section>
    </div>
  )
}
