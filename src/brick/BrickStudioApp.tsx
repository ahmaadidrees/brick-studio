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
  Move,
  MousePointer2,
  Palette,
  Redo2,
  RotateCw,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import BrickStudioScene from './BrickStudioScene'
import { getBrickBudgetProfile, readBrickBudgetEnvironment } from './budgets'
import {
  beginExploreCameraPointer,
  cancelExploreCameraGesture,
  createExploreCameraGesture,
  endExploreCameraPointer,
  normalizeWheelZoom,
  updateExploreCameraPointer,
} from './exploreCameraInput'
import { requestExploreMode } from './modeCommands'
import { OnboardingGuide, useBuilderOnboarding } from './OnboardingGuide'
import { PartThumbnail } from './PartThumbnail'
import { BRICK_COLORS, BRICK_PART_MAP, BRICK_PARTS } from './parts'
import { StudioMenu, type StudioDocumentCommands } from './StudioMenu'
import { useBrickStore } from './store'
import { normalizeTouchStick } from './touchInput'
import type { ViewPreset } from './types'
import { useBrickStudioDocuments } from './useBrickStudioDocuments'
import './brick-studio.css'

function useBuilderShortcuts() {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && target.matches('input, textarea, [contenteditable="true"]')) return
      const interactiveTarget = target instanceof HTMLElement && target.matches('select, button, a')
      const selectionTarget = target instanceof HTMLSelectElement
      const state = useBrickStore.getState()
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? state.redo() : state.undo(); return }
      if (command && event.key.toLowerCase() === 'c') { event.preventDefault(); state.copy(); return }
      if (command && event.key.toLowerCase() === 'v') { event.preventDefault(); state.paste(); return }
      if (command && event.key.toLowerCase() === 'd') { event.preventDefault(); state.duplicate(); return }
      if (event.key === '1') { state.setMode('build'); return }
      if (event.key === '2') { requestExploreMode(); return }
      if (state.mode !== 'build') return
      if (interactiveTarget && (event.key === 'Enter' || event.key === ' ')) return
      if ((event.key === 'Enter' || event.key === ' ') && state.draft) { event.preventDefault(); state.placeDraft(); return }
      if (event.key === 'Escape') {
        event.preventDefault()
        if (state.draft) state.cancelInteraction()
        else state.clearSelection()
        if (state.selectionMode) state.setSelectionMode(false)
        return
      }
      if (event.key === '[') { event.preventDefault(); state.selectAdjacentBrick(-1); return }
      if (event.key === ']') { event.preventDefault(); state.selectAdjacentBrick(1); return }
      if (event.key.toLowerCase() === 'r') state.rotate()
      if (event.key === 'Delete' || event.key === 'Backspace') state.deleteSelected()
      if (!selectionTarget && event.key === 'ArrowLeft') { event.preventDefault(); state.nudge(-1, 0, 0) }
      if (!selectionTarget && event.key === 'ArrowRight') { event.preventDefault(); state.nudge(1, 0, 0) }
      if (!selectionTarget && event.key === 'ArrowUp') { event.preventDefault(); state.nudge(0, 0, -1) }
      if (!selectionTarget && event.key === 'ArrowDown') { event.preventDefault(); state.nudge(0, 0, 1) }
      if (!selectionTarget && event.key === 'PageUp') { event.preventDefault(); state.nudge(0, 1, 0) }
      if (!selectionTarget && event.key === 'PageDown') { event.preventDefault(); state.nudge(0, -1, 0) }
      if (event.key.toLowerCase() === 'f') state.requestView('selection')
      if (event.key === 'Home') state.requestView('home')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}

function useReactiveBrickBudget() {
  const setBudgetProfile = useBrickStore((state) => state.setBudgetProfile)

  useEffect(() => {
    const coarsePointer = window.matchMedia?.('(pointer: coarse)')
    const updateBudget = () => setBudgetProfile(getBrickBudgetProfile(readBrickBudgetEnvironment()))
    updateBudget()
    window.addEventListener('resize', updateBudget)
    window.addEventListener('orientationchange', updateBudget)
    coarsePointer?.addEventListener?.('change', updateBudget)
    return () => {
      window.removeEventListener('resize', updateBudget)
      window.removeEventListener('orientationchange', updateBudget)
      coarsePointer?.removeEventListener?.('change', updateBudget)
    }
  }, [setBudgetProfile])
}

function useReducedMotionPreference() {
  const setReducedMotion = useBrickStore((state) => state.setReducedMotion)

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const updatePreference = () => setReducedMotion(preference?.matches ?? false)
    updatePreference()
    preference?.addEventListener?.('change', updatePreference)
    return () => preference?.removeEventListener?.('change', updatePreference)
  }, [setReducedMotion])
}

function useResponsiveDrawer() {
  const [phoneQuery] = useState(() => window.matchMedia?.('(max-width: 600px)') ?? null)
  const [expanded, setExpanded] = useState(() => !(phoneQuery?.matches ?? window.innerWidth <= 600))

  useEffect(() => {
    const adaptToViewport = () => setExpanded(!(phoneQuery?.matches ?? window.innerWidth <= 600))
    phoneQuery?.addEventListener?.('change', adaptToViewport)
    return () => phoneQuery?.removeEventListener?.('change', adaptToViewport)
  }, [phoneQuery])

  return [expanded, setExpanded] as const
}

type HeaderProps = StudioDocumentCommands & {
  onOpenHelp: () => void
}

function Header({ onNewBuild, onImportProject, onExportProject, onOpenHelp }: HeaderProps) {
  const mode = useBrickStore((state) => state.mode)
  const setMode = useBrickStore((state) => state.setMode)
  const bricks = useBrickStore((state) => state.bricks)
  const undo = useBrickStore((state) => state.undo)
  const redo = useBrickStore((state) => state.redo)
  const undoCount = useBrickStore((state) => state.undoStack.length)
  const redoCount = useBrickStore((state) => state.redoStack.length)
  const brickBudget = useBrickStore((state) => state.brickBudget)
  const budgetProfile = useBrickStore((state) => state.budgetProfile)

  return (
    <header className="brick-header">
      <div className="brick-brand">
        <span className="brick-brand-mark"><Cuboid size={22} /></span>
        <div><strong>Brick Studio</strong><span>Build your world</span></div>
      </div>
      <nav className="brick-mode-switch" aria-label="Studio mode">
        <button aria-label="Build mode" className={mode === 'build' ? 'active' : ''} onClick={() => setMode('build')}><Layers3 size={18} /><span>Build</span><kbd>1</kbd></button>
        <button aria-label="Explore mode" className={mode === 'explore' ? 'active' : ''} onClick={requestExploreMode} disabled={bricks.length === 0}><Gamepad2 size={18} /><span>Explore</span><kbd>2</kbd></button>
      </nav>
      <div className="brick-header-actions">
        <span className="brick-count" aria-label={`${bricks.length} of ${brickBudget} brick budget for ${budgetProfile}`}><Box size={16} /> {bricks.length} / {brickBudget}<i> bricks · {budgetProfile}</i></span>
        {mode === 'build' && <>
          <button className="studio-icon-button" onClick={undo} disabled={!undoCount} aria-label="Undo"><Undo2 size={18} /></button>
          <button className="studio-icon-button" onClick={redo} disabled={!redoCount} aria-label="Redo"><Redo2 size={18} /></button>
        </>}
        <StudioMenu
          onNewBuild={onNewBuild}
          onImportProject={onImportProject}
          onExportProject={onExportProject}
          onOpenHelp={onOpenHelp}
        />
      </div>
    </header>
  )
}

type PartLibraryProps = {
  expanded: boolean
  onToggle: () => void
}

function PartLibrary({ expanded, onToggle }: PartLibraryProps) {
  const activePartId = useBrickStore((state) => state.activePartId)
  const choosePart = useBrickStore((state) => state.choosePart)
  const bricks = useBrickStore((state) => state.bricks)
  const selectedId = useBrickStore((state) => state.selectedId)
  const selectBrick = useBrickStore((state) => state.selectBrick)
  return (
    <aside className={`part-library ${expanded ? 'expanded' : 'collapsed'}`}>
      <div className="library-title">
        <div><span className="brick-eyebrow">Brick drawer</span><h2>Choose a shape</h2></div>
        <button className="studio-icon-button" onClick={onToggle} aria-label={expanded ? 'Collapse brick drawer' : 'Expand brick drawer'} aria-expanded={expanded}><ChevronDown size={19} /></button>
      </div>
      <div className="part-grid">
        {BRICK_PARTS.map((part) => (
          <button key={part.id} className={`library-part ${activePartId === part.id ? 'active' : ''}`} onClick={() => choosePart(part.id)} title={part.name}>
            <PartThumbnail part={part} />
            <span>{part.name}</span>
          </button>
        ))}
      </div>
      <div className="placed-brick-navigator">
        <label htmlFor="placed-brick-select">Placed bricks</label>
        <select
          id="placed-brick-select"
          value={selectedId ?? ''}
          onChange={(event) => selectBrick(event.target.value || null)}
          disabled={bricks.length === 0}
          aria-describedby="placed-brick-help"
          aria-keyshortcuts="BracketLeft BracketRight"
        >
          <option value="">{bricks.length ? `Choose 1 of ${bricks.length}` : 'No placed bricks'}</option>
          {bricks.map((brick, index) => (
            <option key={brick.id} value={brick.id}>
              {index + 1}. {BRICK_PART_MAP[brick.partId].name} — X {brick.x}, Y {brick.y}, Z {brick.z}
            </option>
          ))}
        </select>
        <span id="placed-brick-help">Use this list or [ and ] to select each placed brick.</span>
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
  const selectedIds = useBrickStore((state) => state.selectedIds)
  const selectedId = useBrickStore((state) => state.selectedId)
  const draft = useBrickStore((state) => state.draft)
  const movingId = useBrickStore((state) => state.movingId)
  const bricks = useBrickStore((state) => state.bricks)
  const rotate = useBrickStore((state) => state.rotate)
  const startMove = useBrickStore((state) => state.startMove)
  const duplicate = useBrickStore((state) => state.duplicate)
  const copy = useBrickStore((state) => state.copy)
  const paste = useBrickStore((state) => state.paste)
  const placeDraft = useBrickStore((state) => state.placeDraft)
  const deleteSelected = useBrickStore((state) => state.deleteSelected)
  const requestView = useBrickStore((state) => state.requestView)
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const selected = selectedIds.length > 1 ? undefined : bricks.find((brick) => brick.id === selectedId)
  const moving = Boolean(movingId && draft)
  const target = moving ? draft : selected ?? draft
  if (selectedIds.length > 1 && !draft) {
    return (
      <aside className="brick-inspector multi-selection-inspector" aria-label={`${selectedIds.length} bricks selected`}>
        <div className="inspector-heading">
          <span className="inspector-cube multi-selection-cube"><Layers3 size={19} /></span>
          <div><span className="brick-eyebrow">Selection</span><h2>{selectedIds.length} bricks selected</h2></div>
        </div>
        <p>Bulk actions preserve every brick's spacing, color, rotation, and part.</p>
        <div className="inspector-actions multi-selection-actions">
          <button aria-label={`Copy ${selectedIds.length} selected bricks`} onClick={copy}><Clipboard size={18} /><span>Copy</span><kbd>⌘C</kbd></button>
          <button aria-label={`Paste copied bricks`} onClick={paste}><Clipboard size={18} /><span>Paste</span><kbd>⌘V</kbd></button>
          <button aria-label={`Duplicate ${selectedIds.length} selected bricks`} onClick={duplicate}><Copy size={18} /><span>Duplicate</span><kbd>⌘D</kbd></button>
          <button aria-label={`Delete ${selectedIds.length} selected bricks`} className="danger" onClick={deleteSelected}><Trash2 size={18} /><span>Delete</span></button>
        </div>
      </aside>
    )
  }
  if (!target) return null
  const part = BRICK_PART_MAP[target.partId]

  return (
    <aside className={`brick-inspector ${detailsExpanded ? 'details-expanded' : 'details-collapsed'}`}>
      <div className="inspector-toolbar">
        <div className="inspector-heading"><span className="inspector-cube" style={{ background: target.color }}><Box size={19} /></span><div><span className="brick-eyebrow">{moving ? 'Moving' : selected ? 'Selected brick' : 'Placing'}</span><h2>{part.name}</h2></div></div>
        <div className="inspector-quick-actions">
          {draft && <button aria-label={moving ? 'Place moved brick' : 'Place brick'} onClick={() => placeDraft()}><Check size={18} /></button>}
          <button aria-label="Rotate brick" onClick={rotate}><RotateCw size={18} /></button>
          {selected && <button aria-label="Move brick" onClick={startMove}><Move size={18} /></button>}
          <button className="inspector-sheet-toggle" aria-controls="brick-inspector-properties" aria-expanded={detailsExpanded} aria-label={detailsExpanded ? 'Hide brick properties' : 'Show brick properties'} onClick={() => setDetailsExpanded((expanded) => !expanded)}><ChevronDown size={19} /></button>
        </div>
      </div>
      <div className="inspector-sheet" id="brick-inspector-properties">
        <section><label><Palette size={15} /> Color</label><ColorPalette /></section>
        <div className="inspector-actions">
          {draft && <button className="inspector-sheet-primary" aria-label={moving ? 'Place moved brick' : 'Place brick'} onClick={() => placeDraft()}><Check size={18} /><span>{moving ? 'Place move' : 'Place'}</span><kbd>Enter</kbd></button>}
          <button className="inspector-sheet-primary" aria-label="Rotate brick" onClick={rotate}><RotateCw size={18} /><span>Rotate</span><kbd>R</kbd></button>
          {selected && <button className="inspector-sheet-primary" aria-label="Move brick" onClick={startMove}><Move size={18} /><span>Move</span></button>}
          {selected && <button aria-label="Duplicate brick" onClick={duplicate}><Copy size={18} /><span>Duplicate</span><kbd>⌘D</kbd></button>}
          {selected && <button aria-label="Focus selected brick" onClick={() => requestView('selection')}><Focus size={18} /><span>Focus</span><kbd>F</kbd></button>}
          {selected && <button aria-label="Copy brick" onClick={copy}><Clipboard size={18} /><span>Copy</span><kbd>⌘C</kbd></button>}
          {!selected && <button aria-label="Paste brick" onClick={paste}><Clipboard size={18} /><span>Paste</span><kbd>⌘V</kbd></button>}
          {selected && <button aria-label="Delete brick" className="danger" onClick={deleteSelected}><Trash2 size={18} /><span>Delete</span></button>}
        </div>
        <div className="coordinates"><span>X <strong>{target.x}</strong></span><span>Y <strong>{target.y}</strong></span><span>Z <strong>{target.z}</strong></span></div>
      </div>
    </aside>
  )
}

function ViewControls() {
  const requestView = useBrickStore((state) => state.requestView)
  const views: { id: ViewPreset; label: string }[] = [
    { id: 'top', label: 'Top' }, { id: 'front', label: 'Front' }, { id: 'right', label: 'Side' }, { id: 'perspective', label: '3D' },
  ]
  return (
    <div className="view-controls" aria-label="Build camera views">
      <button className="view-home" onClick={() => requestView('home')} title="Frame Build" aria-label="Frame Build"><Home size={17} /></button>
      {views.map((view) => <button key={view.id} onClick={() => requestView(view.id)}>{view.label}</button>)}
    </div>
  )
}

function SelectionModeControl() {
  const selectionMode = useBrickStore((state) => state.selectionMode)
  const setSelectionMode = useBrickStore((state) => state.setSelectionMode)
  return (
    <button
      className={`selection-mode-control ${selectionMode ? 'active' : ''}`}
      aria-pressed={selectionMode}
      aria-label={selectionMode ? 'Finish selecting bricks' : 'Select multiple bricks'}
      onClick={() => setSelectionMode(!selectionMode)}
    >
      {selectionMode ? <Check size={18} /> : <MousePointer2 size={18} />}
      <span>{selectionMode ? 'Done' : 'Select'}</span>
    </button>
  )
}

function MarqueeOverlay() {
  const marquee = useBrickStore((state) => state.marquee)
  if (!marquee?.dragging) return null
  const left = Math.min(marquee.start.x, marquee.current.x)
  const top = Math.min(marquee.start.y, marquee.current.y)
  return (
    <div
      className="selection-marquee"
      aria-hidden="true"
      style={{
        left,
        top,
        width: Math.abs(marquee.current.x - marquee.start.x),
        height: Math.abs(marquee.current.y - marquee.start.y),
      }}
    />
  )
}

function EmptyState() {
  const count = useBrickStore((state) => state.bricks.length)
  if (count) return null
  return (
    <div className="empty-guide">
      <MousePointer2 size={22} />
      <div>
        <strong>Start with one brick</strong>
        <span className="fine-pointer-copy">Choose a shape, position the blue preview, then click to place.</span>
        <span className="coarse-pointer-copy">Choose a shape, tap to position the blue preview, then use Place.</span>
      </div>
    </div>
  )
}

function TouchPlacementBar() {
  const draft = useBrickStore((state) => state.draft)
  const movingId = useBrickStore((state) => state.movingId)
  const placeDraft = useBrickStore((state) => state.placeDraft)
  const rotate = useBrickStore((state) => state.rotate)
  const cancelInteraction = useBrickStore((state) => state.cancelInteraction)
  if (!draft) return null
  return (
    <div className="touch-placement-bar" role="group" aria-label="Positioned brick actions">
      <button className="studio-button" type="button" onClick={cancelInteraction}>Cancel</button>
      <button className="studio-button" type="button" onClick={rotate}><RotateCw size={18} /> Rotate</button>
      <button className="studio-button studio-button-primary touch-place-button" type="button" aria-label={movingId ? 'Place moved brick from touch controls' : 'Place positioned brick'} onClick={() => placeDraft()}>
        <Check size={20} /> {movingId ? 'Place move' : 'Place'}
      </button>
    </div>
  )
}

type BuildShellProps = {
  drawerExpanded: boolean
  onToggleDrawer: () => void
}

function BuildShell({ drawerExpanded, onToggleDrawer }: BuildShellProps) {
  return (
    <div className={`build-shell ${drawerExpanded ? 'drawer-expanded' : 'drawer-collapsed'}`}>
      <PartLibrary expanded={drawerExpanded} onToggle={onToggleDrawer} />
      <Inspector />
      <ViewControls />
      <SelectionModeControl />
      <TouchPlacementBar />
    </div>
  )
}

function Toast() {
  const toast = useBrickStore((state) => state.toast)
  const clear = useBrickStore((state) => state.clearToast)
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(clear, 3300); return () => window.clearTimeout(timer) }, [toast, clear])
  return toast ? <div className="brick-toast" role="status">{toast}</div> : null
}

function TouchExploreControls() {
  const setMove = useBrickStore((state) => state.setTouchMove)
  const addLook = useBrickStore((state) => state.addTouchLook)
  const setCameraDistance = useBrickStore((state) => state.setTouchCameraDistance)
  const adjustCameraDistance = useBrickStore((state) => state.adjustTouchCameraDistance)
  const recenterCamera = useBrickStore((state) => state.recenterCamera)
  const jump = useBrickStore((state) => state.requestJump)
  const setMode = useBrickStore((state) => state.setMode)
  const joystick = useRef<{ id: number; x: number; y: number } | null>(null)
  const joystickSurface = useRef<HTMLDivElement>(null)
  const joystickKnob = useRef<HTMLSpanElement>(null)
  const lookZone = useRef<HTMLDivElement>(null)
  const cameraGesture = useRef(createExploreCameraGesture())
  const resetJoystick = useCallback(() => {
    const pointerId = joystick.current?.id
    joystick.current = null
    if (pointerId !== undefined && joystickSurface.current?.hasPointerCapture?.(pointerId)) joystickSurface.current.releasePointerCapture?.(pointerId)
    setMove(0, 0)
    if (joystickKnob.current) joystickKnob.current.style.transform = 'translate3d(0, 0, 0)'
  }, [setMove])
  const resetLook = useCallback(() => {
    const pointerIds = [...cameraGesture.current.pointers.keys()]
    cancelExploreCameraGesture(cameraGesture.current)
    for (const pointerId of pointerIds) {
      if (lookZone.current?.hasPointerCapture?.(pointerId)) lookZone.current.releasePointerCapture?.(pointerId)
    }
    lookZone.current?.classList.remove('dragging')
  }, [])
  const resetTouchControls = useCallback(() => {
    resetJoystick()
    resetLook()
  }, [resetJoystick, resetLook])

  const updateJoystick = useCallback((clientX: number, clientY: number) => {
    if (!joystick.current) return
    const move = normalizeTouchStick(clientX - joystick.current.x, clientY - joystick.current.y, 42)
    setMove(move.x, move.z, move.magnitude, move.running)
    if (joystickKnob.current) {
      joystickKnob.current.style.transform = `translate3d(${move.x * 42}px, ${-move.z * 42}px, 0)`
    }
  }, [setMove])

  useEffect(() => {
    const handleBlur = () => resetTouchControls()
    const handleVisibility = () => { if (document.visibilityState !== 'visible') resetTouchControls() }
    window.addEventListener('blur', handleBlur)
    window.addEventListener('resize', resetTouchControls)
    window.addEventListener('orientationchange', resetTouchControls)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('resize', resetTouchControls)
      window.removeEventListener('orientationchange', resetTouchControls)
      document.removeEventListener('visibilitychange', handleVisibility)
      resetTouchControls()
    }
  }, [resetTouchControls])

  return (
    <div className="explore-controls">
      <div
        ref={lookZone}
        className="look-zone"
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return
          if (!beginExploreCameraPointer(cameraGesture.current, event.pointerId, event.clientX, event.clientY, useBrickStore.getState().touchCameraDistance)) return
          event.preventDefault()
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          const update = updateExploreCameraPointer(cameraGesture.current, event.pointerId, event.clientX, event.clientY)
          if (update.yawDelta || update.pitchDelta) addLook(update.yawDelta, update.pitchDelta)
          if (update.zoom !== null) setCameraDistance(update.zoom)
          event.currentTarget.classList.toggle('dragging', cameraGesture.current.dragging || cameraGesture.current.pointers.size === 2)
        }}
        onPointerUp={(event) => {
          endExploreCameraPointer(cameraGesture.current, event.pointerId)
          if (!cameraGesture.current.dragging) event.currentTarget.classList.remove('dragging')
        }}
        onPointerCancel={resetLook}
        onLostPointerCapture={(event) => { if (cameraGesture.current.pointers.has(event.pointerId)) resetLook() }}
        onWheel={(event) => {
          event.preventDefault()
          adjustCameraDistance(normalizeWheelZoom(event.deltaY, event.deltaMode))
        }}
        aria-hidden="true"
      />
      <div
        ref={joystickSurface}
        className="virtual-stick"
        role="application"
        onPointerDown={(event) => { joystick.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture?.(event.pointerId); updateJoystick(event.clientX, event.clientY) }}
        onPointerMove={(event) => { if (joystick.current?.id !== event.pointerId) return; updateJoystick(event.clientX, event.clientY) }}
        onPointerUp={resetJoystick}
        onPointerCancel={resetJoystick}
        onLostPointerCapture={resetJoystick}
        aria-label="Movement joystick"
        aria-describedby="touch-explore-hint"
      ><span ref={joystickKnob} aria-hidden="true" /></div>
      <button className="jump-button" onClick={jump} aria-label="Jump; tap again in the air to double jump">Jump</button>
      <button className="recenter-camera" onClick={recenterCamera} aria-label="Recenter camera"><Focus size={18} /><span>Recenter</span></button>
      <button className="return-build" onClick={() => { resetTouchControls(); setMode('build') }}><Layers3 size={18} /> Return to Build</button>
      <div className="desktop-explore-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span><span><kbd>Shift</kbd> Run</span><span>Drag: Camera</span><span>Scroll: Zoom</span><span><kbd>Space</kbd> Jump ×2</span><span><kbd>Esc</kbd> Build</span></div>
      <div className="touch-explore-hint" id="touch-explore-hint">Push farther to run · Drag to look · Pinch to zoom · Jump twice to flip</div>
    </div>
  )
}

function ShortcutBar() {
  return <div className="shortcut-bar"><span><MousePointer2 size={14} /> Click · ⌘Click toggle · Shift-drag marquee</span><span><kbd>Enter</kbd> Place</span><span><kbd>Esc</kbd> Clear</span><span><kbd>⌘C</kbd><kbd>⌘V</kbd> Copy/paste</span><span><kbd>⌘D</kbd> Duplicate</span></div>
}

export type BrickStudioAppProps = StudioDocumentCommands

export default function BrickStudioApp({
  onNewBuild,
  onImportProject,
  onExportProject,
}: BrickStudioAppProps = {}) {
  useBuilderShortcuts()
  useReactiveBrickBudget()
  useReducedMotionPreference()
  const mode = useBrickStore((state) => state.mode)
  const brickCount = useBrickStore((state) => state.bricks.length)
  const reducedMotion = useBrickStore((state) => state.reducedMotion)
  const selectionMode = useBrickStore((state) => state.selectionMode)
  const [drawerExpanded, setDrawerExpanded] = useResponsiveDrawer()
  const onboarding = useBuilderOnboarding()
  const documentCommands = useBrickStudioDocuments({ onNewBuild, onImportProject, onExportProject })
  const showOnboarding = onboarding.open && (brickCount === 0 || onboarding.forced)
  return (
    <main className={`brick-studio brick-mode-${mode}${reducedMotion ? ' brick-reduced-motion' : ''}${selectionMode ? ' brick-select-mode' : ''}`}>
      <div className="brick-canvas"><BrickStudioScene /><MarqueeOverlay /></div>
      <Header
        {...documentCommands}
        onOpenHelp={onboarding.reopen}
      />
      {mode === 'build' ? (
        <>
          <BuildShell drawerExpanded={drawerExpanded} onToggleDrawer={() => setDrawerExpanded((expanded) => !expanded)} />
          <EmptyState />
          <ShortcutBar />
          {showOnboarding && <OnboardingGuide onDismiss={onboarding.dismiss} />}
        </>
      ) : <TouchExploreControls />}
      <Toast />
    </main>
  )
}
