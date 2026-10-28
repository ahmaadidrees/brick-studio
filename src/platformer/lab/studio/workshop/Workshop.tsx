import { CodeEditor } from '../CodeEditor'
import { CostumeEditor } from '../CostumeEditor'
import { SoundPanel } from '../SoundPanel'
import { STAGE_ID, useStudio, type EditorTab, type StudioStore } from '../store'
import { StorageNoticeBar } from '../persist/StorageNoticeBar'
import { KnobsCard } from './KnobsCard'
import { TestRoom } from './TestRoom'
import './workshop.css'
import { cellCount } from '../builder/cells'

const TABS: ReadonlyArray<{ id: EditorTab; label: string }> = [
  { id: 'code', label: 'Code' },
  { id: 'costumes', label: 'Costumes' },
  { id: 'sounds', label: 'Sounds' },
]

/** The full-screen Brick Workshop: Code / Costumes / Sounds on the left, Test room and Knobs on the right. */
export function Workshop({ store }: { store: StudioStore }) {
  const brickId = useStudio(store, (s) => s.workshopBrickId ?? s.selectedBrickId)
  const tab = useStudio(store, (s) => s.editorTab)
  const brick = useStudio(store, (s) => (brickId === STAGE_ID ? s.project.design.stage : s.project.design.bricks.find((b) => b.id === brickId)))
  // Grid bricks (step 7) live as cells, not copies.
  const copies = useStudio(store, (s) => {
    const d = s.project.design
    const grid = d.bricks.find((b) => b.id === brickId)?.grid
    return grid ? cellCount(d, grid.char) : d.copies.filter((c) => c.brickId === brickId).length
  })
  const icon = brick?.costumes[0]?.asset

  return (
    <div className="ws">
      <StorageNoticeBar />
      <header className="ws-header">
        <button type="button" className="ws-done" onClick={() => store.closeWorkshop()} aria-label="Done: back to the builder">
          ✓ Done
        </button>
        <div className="ws-icon" aria-hidden="true">
          {icon ? <img src={icon} alt="" /> : null}
        </div>
        <div className="ws-title">
          <h1>{brick?.name ?? 'Brick'}</h1>
          <span>{brickId === STAGE_ID ? 'The Stage' : `${copies} in My world`}</span>
        </div>
        <span className="ws-note">Changes apply to every copy</span>
      </header>
      <div className="ws-body">
        <section className="ws-left" aria-label="Brick editor">
          <div className="ws-tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => store.setEditorTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="ws-editor">
            {tab === 'code' && <CodeEditor store={store} />}
            {tab === 'costumes' && <CostumeEditor store={store} />}
            {tab === 'sounds' && <SoundPanel store={store} />}
          </div>
        </section>
        <aside className="ws-right">
          <TestRoom store={store} brickId={brickId} />
          <KnobsCard store={store} brickId={brickId} />
        </aside>
      </div>
    </div>
  )
}
