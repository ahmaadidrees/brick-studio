// Scratch harness for the browser check (StudioApp now shows a builder stub, so mount the code editor directly).
import React from 'react'
import { createRoot } from 'react-dom/client'
import { CodeEditor } from '../CodeEditor'
import { StudioStore } from '../store'
import { loadProject } from '../storage'
import { labelData } from './layers'

const project = loadProject()
const store = new StudioStore(project)
const hero = project.design.bricks.find((b) => b.name === 'Hero')!
// Give the Hero's scripts labels, the way the starter lane will.
const ws = project.workspaces[hero.id] as { blocks: { blocks: Array<Record<string, unknown>> } }
const labels: Record<string, string> = { event_whenflagclicked: 'Run the Hero every tick', platformer_whenbump: 'Feel a wall' }
for (const b of ws.blocks.blocks) {
  const text = labels[String(b.type)]
  if (text && !b.data) b.data = labelData(text)
}
store.selectBrick(hero.id)
;(window as unknown as { store: StudioStore }).store = store
createRoot(document.getElementById('root')!).render(
  <div style={{ width: '100vw', height: '100vh' }}>
    <CodeEditor store={store} />
  </div>,
)
