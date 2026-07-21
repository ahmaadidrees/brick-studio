import {
  Box,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Cuboid,
  Focus,
  Gamepad2,
  Home,
  Layers3,
  Maximize2,
  Move,
  MousePointer2,
  Palette,
  Redo2,
  RotateCw,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import BrickStudioScene from './BrickStudioScene'
import { BRICK_COLORS, BRICK_PART_MAP, BRICK_PARTS } from './parts'
import { useBrickStore } from './store'
import type { ViewPreset } from './types'
import './brick-studio.css'

function useBuilderShortcuts() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches('input, textarea, select')) return
      const state = useBrickStore.getState()
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? state.redo() : state.undo(); return }
      if (command && event.key.toLowerCase() === 'c') { event.preventDefault(); state.copy(); return }
      if (command && event.key.toLowerCase() === 'v') { event.preventDefault(); state.paste(); return }
      if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); state.duplicate(); return }
      if (event.key === '1') state.setMode('build')
      if (event.key === '2') state.setMode('explore')
      if (state.mode !== 'build') return
      if (event.key.toLowerCase() === 'r') state.rotate()
      if (event.key === 'Delete' || event.key === 'Backspace') state.deleteSelected()
      if (event.key === 'ArrowLeft') state.nudge(-1, 0, 0)
      if (event.key === 'ArrowRight') state.nudge(1, 0, 0)
      if (event.key === 'ArrowUp') state.nudge(0, 0, -1)
      if (event.key === 'ArrowDown') state.nudge(0, 0, 1)
      if (event.key === 'PageUp') state.nudge(0, 1, 0)
      if (event.key === 'PageDown') state.nudge(0, -1, 0)
      if (event.key.toLowerCase() === 'f') state.requestView('selection')
      if (event.key === 'Home') state.requestView('home')
      if (event.key === 'Escape') state.selectBrick(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

function Header() {
  const mode = useBrickStore((state) => state.mode)
  const setMode = useBrickStore((state) => state.setMode)
  const bricks = useBrickStore((state) => state.bricks)
  const undo = useBrickStore((state) => state.undo)
  const redo = useBrickStore((state) => state.redo)
  const undoCount = useBrickStore((state) => state.undoStack.length)
  const redoCount = useBrickStore((state) => state.redoStack.length)

  return (
    <header className="brick-header">
      <div className="brick-brand">
        <span className="brick-brand-mark"><Cuboid size={22} /></span>
        <div><strong>Brick Studio</strong><span>Build your world</span></div>
      </div>
      <nav className="brick-mode-switch" aria-label="Studio mode">
        <button aria-label="Build mode" className={mode === 'build' ? 'active' : ''} onClick={() => setMode('build')}><Layers3 size={18} /><span>Build</span><kbd>1</kbd></button>
        <button aria-label="Explore mode" className={mode === 'explore' ? 'active' : ''} onClick={() => setMode('explore')} disabled={bricks.length === 0}><Gamepad2 size={18} /><span>Explore</span><kbd>2</kbd></button>
      </nav>
      <div className="brick-header-actions">
        <span className="brick-count"><Box size={16} /> {bricks.length}<i> bricks</i></span>
        {mode === 'build' && <>
          <button onClick={undo} disabled={!undoCount} aria-label="Undo"><Undo2 size={18} /></button>
          <button onClick={redo} disabled={!redoCount} aria-label="Redo"><Redo2 size={18} /></button>
        </>}
        <a className="rover-link" href="/rover">Rover Lab</a>
      </div>
    </header>
  )
}

function PartLibrary() {
  const activePartId = useBrickStore((state) => state.activePartId)
  const choosePart = useBrickStore((state) => state.choosePart)
  const [expanded, setExpanded] = useState(true)
  return (
    <aside className={`part-library ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="library-title">
        <div><span className="brick-eyebrow">Brick drawer</span><h2>Choose a shape</h2></div>
        <button onClick={() => setExpanded((value) => !value)} aria-label="Toggle brick drawer"><ChevronDown size={19} /></button>
      </div>
      <div className="part-grid">
        {BRICK_PARTS.map((part) => (
          <button key={part.id} className={`library-part ${activePartId === part.id ? 'active' : ''}`} onClick={() => choosePart(part.id)} title={part.name}>
            <span className={`part-shape kind-${part.kind}`}><i>{part.icon}</i></span>
            <span>{part.name}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}

function ColorPalette() {
  const activeColor = useBrickStore((state) => state.activeColor)
  const setColor = useBrickStore((state) => state.setActiveColor)
  return (
    <div className="color-grid" aria-label="Brick color">
      {BRICK_COLORS.map((color) => <button key={color} className={activeColor === color ? 'active' : ''} style={{ background: color }} onClick={() => setColor(color)} aria-label={`Use color ${color}`}>{activeColor === color && <Check size={13} />}</button>)}
    </div>
  )
}

function Inspector() {
  const selectedId = useBrickStore((state) => state.selectedId)
  const draft = useBrickStore((state) => state.draft)
  const bricks = useBrickStore((state) => state.bricks)
  const rotate = useBrickStore((state) => state.rotate)
  const startMove = useBrickStore((state) => state.startMove)
  const duplicate = useBrickStore((state) => state.duplicate)
  const copy = useBrickStore((state) => state.copy)
  const paste = useBrickStore((state) => state.paste)
  const deleteSelected = useBrickStore((state) => state.deleteSelected)
  const requestView = useBrickStore((state) => state.requestView)
  const selected = bricks.find((brick) => brick.id === selectedId)
  const target = selected ?? draft
  if (!target) return null
  const part = BRICK_PART_MAP[target.partId]

  return (
    <aside className="brick-inspector">
      <div className="inspector-heading"><span className="inspector-cube" style={{ background: target.color }}><Box size={19} /></span><div><span className="brick-eyebrow">{selected ? 'Selected brick' : 'Placing'}</span><h2>{part.name}</h2></div></div>
      <section><label><Palette size={15} /> Color</label><ColorPalette /></section>
      <div className="inspector-actions">
        <button aria-label="Rotate brick" onClick={rotate}><RotateCw size={18} /><span>Rotate</span><kbd>R</kbd></button>
        {selected && <button aria-label="Move brick" onClick={startMove}><Move size={18} /><span>Move</span></button>}
        {selected && <button aria-label="Duplicate brick" onClick={duplicate}><Copy size={18} /><span>Duplicate</span><kbd>⌘D</kbd></button>}
        {selected && <button aria-label="Focus selected brick" onClick={() => requestView('selection')}><Focus size={18} /><span>Focus</span><kbd>F</kbd></button>}
        {selected && <button aria-label="Copy brick" onClick={copy}><Clipboard size={18} /><span>Copy</span><kbd>⌘C</kbd></button>}
        {!selected && <button aria-label="Paste brick" onClick={paste}><Clipboard size={18} /><span>Paste</span><kbd>⌘V</kbd></button>}
        {selected && <button aria-label="Delete brick" className="danger" onClick={deleteSelected}><Trash2 size={18} /><span>Delete</span></button>}
      </div>
      <div className="coordinates"><span>X <strong>{target.x}</strong></span><span>Y <strong>{target.y}</strong></span><span>Z <strong>{target.z}</strong></span></div>
    </aside>
  )
}

function ViewControls() {
  const requestView = useBrickStore((state) => state.requestView)
  const views: { id: ViewPreset; label: string }[] = [
    { id: 'top', label: 'Top' }, { id: 'front', label: 'Front' }, { id: 'right', label: 'Side' }, { id: 'perspective', label: '3D' },
  ]
  return (
    <div className="view-controls"><button className="view-home" onClick={() => requestView('home')} title="Frame all"><Home size={17} /></button>{views.map((view) => <button key={view.id} onClick={() => requestView(view.id)}>{view.label}</button>)}</div>
  )
}

function EmptyState() {
  const count = useBrickStore((state) => state.bricks.length)
  if (count) return null
  return <div className="empty-guide"><MousePointer2 size={22} /><div><strong>Start with one brick</strong><span>Move the blue preview anywhere on the plate, then click or tap.</span></div></div>
}

function Toast() {
  const toast = useBrickStore((state) => state.toast)
  const clear = useBrickStore((state) => state.clearToast)
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(clear, 3300); return () => window.clearTimeout(timer) }, [toast, clear])
  return toast ? <div className="brick-toast" role="status">{toast}</div> : null
}

function TouchExploreControls() {
  const setMove = useBrickStore((state) => state.setTouchMove)
  const addYaw = useBrickStore((state) => state.addTouchYaw)
  const jump = useBrickStore((state) => state.requestJump)
  const setMode = useBrickStore((state) => state.setMode)
  const joystick = useRef<{ id: number; x: number; y: number } | null>(null)
  const look = useRef<{ id: number; x: number } | null>(null)

  return (
    <div className="explore-controls">
      <div
        className="look-zone"
        onPointerDown={(event) => { look.current = { id: event.pointerId, x: event.clientX }; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={(event) => { if (look.current?.id !== event.pointerId) return; addYaw((look.current.x - event.clientX) * 0.012); look.current.x = event.clientX }}
        onPointerUp={() => { look.current = null }}
      />
      <div
        className="virtual-stick"
        role="application"
        onPointerDown={(event) => { joystick.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={(event) => { if (joystick.current?.id !== event.pointerId) return; setMove(Math.max(-1, Math.min(1, (event.clientX - joystick.current.x) / 42)), Math.max(-1, Math.min(1, (event.clientY - joystick.current.y) / 42))) }}
        onPointerUp={() => { joystick.current = null; setMove(0, 0) }}
        aria-label="Movement joystick"
      ><span /></div>
      <button className="jump-button" onClick={jump}>Jump</button>
      <button className="return-build" onClick={() => setMode('build')}><Layers3 size={18} /> Return to Build</button>
      <div className="desktop-explore-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span><span><kbd>Space</kbd> Jump</span><span><kbd>Esc</kbd> Build</span></div>
    </div>
  )
}

function ShortcutBar() {
  return <div className="shortcut-bar"><span><MousePointer2 size={14} /> Click to select</span><span>Right-drag rotate view</span><span>Shift-drag pan</span><span>Scroll zoom</span><span><kbd>R</kbd> Rotate</span><span><kbd>⌘D</kbd> Duplicate</span></div>
}

export default function BrickStudioApp() {
  useBuilderShortcuts()
  const mode = useBrickStore((state) => state.mode)
  return (
    <main className={`brick-studio brick-mode-${mode}`}>
      <div className="brick-canvas"><BrickStudioScene /></div>
      <Header />
      {mode === 'build' ? <><PartLibrary /><Inspector /><ViewControls /><EmptyState /><ShortcutBar /></> : <TouchExploreControls />}
      <Toast />
    </main>
  )
}
