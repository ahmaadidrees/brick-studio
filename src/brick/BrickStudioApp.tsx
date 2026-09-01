import {
  Box,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  ClipboardPaste,
  Copy,
  Cuboid,
  Focus,
  Gamepad2,
  Home,
  Layers3,
  Move,
  MousePointer2,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import BrickStudioScene, { type BrickStudioSceneProps } from './BrickStudioScene'
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
import { createBrickStudioDocument, type BrickStudioDocument } from './brickDocument'
import { BRICK_COLORS, BRICK_PART_MAP, BRICK_PARTS, customPartToBrickPart, registerCustomParts } from './parts'
import { StudioMenu, type StudioDocumentCommands } from './StudioMenu'
import { useBrickStore } from './store'
import { normalizeTouchStick } from './touchInput'
import type { CharacterId, CustomPartDefinition, EnvironmentId, ViewPreset } from './types'
import { useBrickStudioDocuments } from './useBrickStudioDocuments'
import { createPublishedWorldUrl } from './publishedWorlds'
import type { LiveConnectionState, LiveWorldMode } from './liveProtocol'
import {
  CHARACTER_DESCRIPTORS,
  ENVIRONMENT_DESCRIPTORS,
  characterPaletteGroups,
  resolveCharacterId,
} from './contentCatalog'
import { WorldAndCharacterSheet, type ContentPickerSelection } from './contentPicker'
import { loadCharacterPreferences, saveCharacterPreferences } from './contentPreferences'
import type { CharacterPalette } from './characters/types'
import { CreateBrickSheet } from './customParts/CreateBrickSheet'
import { ResizeBrickSheet, type ResizeDelta } from './customParts/ResizeBrickSheet'
import { resizeSelectionDefinitions } from './customParts/resize'
import './brick-studio.css'

export type BrickStudioLivePolicy = {
  connection: LiveConnectionState
  isOwner: boolean
  onRequestMode: (mode: LiveWorldMode) => void
}

export type BrickStudioCustomPartPolicy = {
  customParts: CustomPartDefinition[]
  canEdit: boolean
  help?: string
  onReplaceDocument: (next: { bricks: BrickStudioDocument['bricks']; customParts: CustomPartDefinition[] }) => boolean
}

function useBuilderShortcuts(enabled = true, livePolicy?: BrickStudioLivePolicy) {
  useEffect(() => {
    if (!enabled) return
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
      if (event.key === '1') {
        if (livePolicy) {
          if (livePolicy.isOwner && livePolicy.connection === 'online') livePolicy.onRequestMode('build')
        } else state.setMode('build')
        return
      }
      if (event.key === '2') {
        if (livePolicy) {
          if (livePolicy.isOwner && livePolicy.connection === 'online' && state.bricks.length > 0) livePolicy.onRequestMode('explore')
        } else requestExploreMode()
        return
      }
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
  }, [enabled, livePolicy])
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

function useCoarsePointerPreference() {
  const [coarsePointer, setCoarsePointer] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false)

  useEffect(() => {
    const preference = window.matchMedia?.('(pointer: coarse)')
    const updatePreference = () => setCoarsePointer(preference?.matches ?? false)
    updatePreference()
    preference?.addEventListener?.('change', updatePreference)
    return () => preference?.removeEventListener?.('change', updatePreference)
  }, [])

  return coarsePointer
}

// The canvas-first shell: no docked drawer, a (+) sheet instead, and the placement bar as the
// only control surface while a draft is armed. Mirrors the CSS compact query exactly; the
// innerWidth fallback only covers environments without matchMedia.
function useCompactLayout() {
  const [queries] = useState(() => ['(max-width: 900px)', '(pointer: coarse)'].map((query) => window.matchMedia?.(query) ?? null))
  const matchesCompact = useCallback(() => queries.some((query) => query?.matches) || window.innerWidth <= 900, [queries])
  const [compact, setCompact] = useState(matchesCompact)

  useEffect(() => {
    const update = () => setCompact(matchesCompact())
    update()
    for (const query of queries) query?.addEventListener?.('change', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      for (const query of queries) query?.removeEventListener?.('change', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [queries, matchesCompact])

  return compact
}

type HeaderProps = StudioDocumentCommands & {
  livePolicy?: BrickStudioLivePolicy
  onOpenHelp: () => void
  onOpenWorldSetup: () => void
}

function Header({ onNewBuild, onImportProject, onExportProject, onStartLiveWorld, onPublishWorld, livePolicy, onOpenHelp, onOpenWorldSetup }: HeaderProps) {
  const mode = useBrickStore((state) => state.mode)
  const setMode = useBrickStore((state) => state.setMode)
  const bricks = useBrickStore((state) => state.bricks)
  const undo = useBrickStore((state) => state.undo)
  const redo = useBrickStore((state) => state.redo)
  const undoCount = useBrickStore((state) => state.undoStack.length)
  const redoCount = useBrickStore((state) => state.redoStack.length)
  const brickBudget = useBrickStore((state) => state.brickBudget)
  const budgetProfile = useBrickStore((state) => state.budgetProfile)
  const liveModeDisabled = Boolean(livePolicy && (!livePolicy.isOwner || livePolicy.connection !== 'online'))
  const requestBuild = () => livePolicy ? livePolicy.onRequestMode('build') : setMode('build')
  const requestExplore = () => livePolicy ? livePolicy.onRequestMode('explore') : requestExploreMode()

  return (
    <header className="brick-header">
      <div className="brick-brand">
        <span className="brick-brand-mark"><Cuboid size={22} /></span>
        <div><strong>Brick Studio</strong><span>Build your world</span></div>
      </div>
      <nav className="brick-mode-switch" aria-label="Studio mode">
        <button aria-label="Build mode" className={mode === 'build' ? 'active' : ''} onClick={requestBuild} disabled={liveModeDisabled}><Layers3 size={18} /><span>Build</span><kbd>1</kbd></button>
        <button aria-label="Explore mode" className={mode === 'explore' ? 'active' : ''} onClick={requestExplore} disabled={bricks.length === 0 || liveModeDisabled}><Gamepad2 size={18} /><span>Explore</span><kbd>2</kbd></button>
      </nav>
      <div className="brick-header-actions">
        <span className="brick-count" aria-label={`${bricks.length} of ${brickBudget} brick budget for ${budgetProfile}`}><Box size={16} /> {bricks.length} / {brickBudget}<i> bricks · {budgetProfile}</i></span>
        {mode === 'build' && <>
          <button className="studio-icon-button" onClick={undo} disabled={!undoCount} aria-label="Undo"><Undo2 size={18} /></button>
          <button className="studio-icon-button" onClick={redo} disabled={!redoCount} aria-label="Redo"><Redo2 size={18} /></button>
        </>}
        <StudioMenu
          onNewBuild={livePolicy ? undefined : onNewBuild}
          onImportProject={livePolicy ? undefined : onImportProject}
          onExportProject={onExportProject}
          onStartLiveWorld={livePolicy ? undefined : onStartLiveWorld}
          onPublishWorld={livePolicy ? undefined : onPublishWorld}
          onOpenHelp={onOpenHelp}
          onOpenWorldSetup={onOpenWorldSetup}
        />
      </div>
    </header>
  )
}

type PartGridProps = {
  customParts: CustomPartDefinition[]
  onChoose?: () => void
  onCreatePart: () => void
  canCreatePart: boolean
  customPartHelp?: string
}

function PartGrid({ customParts, onChoose, onCreatePart, canCreatePart, customPartHelp }: PartGridProps) {
  const activePartId = useBrickStore((state) => state.activePartId)
  const choosePart = useBrickStore((state) => state.choosePart)
  const parts = useMemo(() => [
    ...BRICK_PARTS,
    ...customParts.map(customPartToBrickPart),
  ], [customParts])
  return (
    <>
      <button
        className="create-part-entry"
        type="button"
        onClick={onCreatePart}
        disabled={!canCreatePart}
        title={!canCreatePart ? customPartHelp : 'Create a reusable brick with snapped dimensions'}
      >
        <span className="create-part-entry-icon"><Plus size={19} /></span>
        <span><strong>Create a brick</strong><small>{canCreatePart ? 'Choose its shape and size' : customPartHelp}</small></span>
      </button>
      <div className="part-grid">
        {parts.map((part) => (
          <button
            key={part.id}
            className={`library-part ${activePartId === part.id ? 'active' : ''}`}
            type="button"
            onClick={() => { choosePart(part.id); onChoose?.() }}
            title={part.name}
          >
            <PartThumbnail part={part} />
            <span>{part.name}</span>
          </button>
        ))}
      </div>
    </>
  )
}

function PartLibrary({ onCollapse, ...gridProps }: PartGridProps & { onCollapse: () => void }) {
  return (
    <aside className="part-library" id="brick-part-library" aria-label="Brick drawer">
      <div className="library-title">
        <div><span className="brick-eyebrow">Brick drawer</span><h2>Choose a shape</h2></div>
        <button
          className="studio-icon-button library-collapse-button"
          type="button"
          aria-label="Collapse brick drawer"
          aria-controls="brick-part-library"
          aria-expanded="true"
          onClick={onCollapse}
        ><PanelLeftClose size={18} /></button>
      </div>
      <PartGrid {...gridProps} />
    </aside>
  )
}

/** The color the palette is editing: the armed draft, a single selection, or the loaded brush. */
function usePaletteTarget() {
  const draft = useBrickStore((state) => state.draft)
  const bricks = useBrickStore((state) => state.bricks)
  const selectedId = useBrickStore((state) => state.selectedId)
  const selectedIds = useBrickStore((state) => state.selectedIds)
  const activeColor = useBrickStore((state) => state.activeColor)
  if (draft) return draft.color
  if (selectedIds.length === 1) return bricks.find((brick) => brick.id === selectedId)?.color ?? activeColor
  return activeColor
}

function BrickDrawerSheet(props: PartGridProps & { onClose: () => void }) {
  const { onClose } = props
  const selectionCount = useBrickStore((state) => state.selectedIds.length)
  const targetColor = usePaletteTarget()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus()
    // Capture phase: Escape must close the sheet without also reaching the global builder
    // shortcut that cancels the armed brush.
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true)
      restoreTo?.focus()
    }
  }, [onClose])

  return (
    <>
      <div className="brick-sheet-backdrop" data-testid="brick-sheet-backdrop" onPointerDown={onClose} aria-hidden="true" />
      <div ref={panel} className="brick-sheet" role="dialog" aria-modal="true" aria-labelledby="brick-sheet-title" tabIndex={-1}>
        <span className="brick-sheet-grip" aria-hidden="true" />
        <div className="library-title">
          <div><span className="brick-eyebrow">Brick drawer</span><h2 id="brick-sheet-title">Choose a shape</h2></div>
          <button className="studio-icon-button" type="button" aria-label="Close brick drawer" onClick={onClose}><X size={18} /></button>
        </div>
        <PartGrid {...props} onChoose={onClose} />
        <section className="brick-sheet-colors">
          <label><Palette size={15} /> {selectionCount > 1 ? `Color all ${selectionCount}` : 'Color'}</label>
          <ColorPalette targetColor={targetColor} />
        </section>
      </div>
    </>
  )
}

type ColorPaletteProps = {
  targetColor: string
}

function ColorPalette({ targetColor }: ColorPaletteProps) {
  const setColor = useBrickStore((state) => state.setActiveColor)
  return (
    <div className="color-grid" aria-label="Brick color">
      {BRICK_COLORS.map((color) => {
        const selected = targetColor === color
        return (
          <button
            key={color}
            className={selected ? 'active' : ''}
            style={{ background: color }}
            onClick={() => setColor(color)}
            aria-label={`Use color ${color}`}
            aria-pressed={selected}
          >
            {selected && <Check size={13} />}
          </button>
        )
      })}
    </div>
  )
}

function TransformControls({ count, onResize, compact = false }: { count: number; onResize: () => void; compact?: boolean }) {
  const nudge = useBrickStore((state) => state.nudge)
  const rotate = useBrickStore((state) => state.rotate)
  const selectionLabel = count === 1 ? 'brick' : `${count} bricks`
  return (
    <div className={`transform-controls${compact ? ' transform-controls-compact' : ''}`} role="group" aria-label={`Position and size ${selectionLabel}`}>
      <button type="button" aria-label={`Move ${selectionLabel} left one stud`} onClick={() => nudge(-1, 0, 0)}><span aria-hidden="true">←</span><small>Left</small></button>
      <button type="button" aria-label={`Move ${selectionLabel} forward one stud`} onClick={() => nudge(0, 0, -1)}><span aria-hidden="true">↑</span><small>Forward</small></button>
      <button type="button" aria-label={`Move ${selectionLabel} back one stud`} onClick={() => nudge(0, 0, 1)}><span aria-hidden="true">↓</span><small>Back</small></button>
      <button type="button" aria-label={`Move ${selectionLabel} right one stud`} onClick={() => nudge(1, 0, 0)}><span aria-hidden="true">→</span><small>Right</small></button>
      <button type="button" aria-label={`Raise ${selectionLabel} one plate`} onClick={() => nudge(0, 1, 0)}><ChevronUp size={18} /><small>Raise</small></button>
      <button type="button" aria-label={`Lower ${selectionLabel} one plate`} onClick={() => nudge(0, -1, 0)}><ChevronDown size={18} /><small>Lower</small></button>
      <button type="button" aria-label={`Rotate ${selectionLabel}`} onClick={rotate}><RotateCw size={18} /><small>Rotate</small></button>
      <button type="button" aria-label={`Resize ${selectionLabel}`} onClick={onResize}><Cuboid size={18} /><small>Resize</small></button>
    </div>
  )
}

/** Desktop-only. Compact layouts get TouchSelectionBar instead. */
function Inspector({ onResize }: { onResize: () => void }) {
  const selectedIds = useBrickStore((state) => state.selectedIds)
  const selectedId = useBrickStore((state) => state.selectedId)
  const activeColor = useBrickStore((state) => state.activeColor)
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
  const inspectorSheet = useRef<HTMLDivElement>(null)
  const selected = selectedIds.length > 1 ? undefined : bricks.find((brick) => brick.id === selectedId)
  const moving = Boolean(movingId && draft)
  const target = moving ? draft : selected ?? draft

  useLayoutEffect(() => {
    if (detailsExpanded && inspectorSheet.current) inspectorSheet.current.scrollTop = 0
  }, [detailsExpanded])

  if (selectedIds.length > 1 && !draft) {
    return (
      <aside className="brick-inspector multi-selection-inspector" aria-label={`${selectedIds.length} bricks selected`}>
        <div className="inspector-heading">
          <span className="inspector-cube multi-selection-cube"><Layers3 size={19} /></span>
          <div><span className="brick-eyebrow">Selection</span><h2>{selectedIds.length} bricks selected</h2></div>
        </div>
        <p>Bulk actions preserve every brick's spacing, color, rotation, and part.</p>
        <section className="inspector-transform-section"><label><Move size={15} /> Position & size</label><TransformControls count={selectedIds.length} onResize={onResize} /></section>
        <div className="inspector-actions multi-selection-actions">
          <button aria-label={`Copy ${selectedIds.length} selected bricks`} onClick={copy}><Clipboard size={18} /><span>Copy</span><kbd>⌘C</kbd></button>
          <button aria-label={`Paste copied bricks`} onClick={paste}><Clipboard size={18} /><span>Paste</span><kbd>⌘V</kbd></button>
          <button aria-label={`Duplicate ${selectedIds.length} selected bricks`} onClick={duplicate}><Copy size={18} /><span>Duplicate</span><kbd>⌘D</kbd></button>
          <button aria-label={`Delete ${selectedIds.length} selected bricks`} className="danger" onClick={deleteSelected}><Trash2 size={18} /><span>Delete</span></button>
        </div>
        <section><label><Palette size={15} /> Color all {selectedIds.length}</label><ColorPalette targetColor={activeColor} /></section>
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
      <div
        ref={inspectorSheet}
        className="inspector-sheet"
        id="brick-inspector-properties"
        role="region"
        aria-label="Brick properties and editing actions"
        tabIndex={detailsExpanded ? 0 : -1}
      >
        <div className="inspector-actions" role="group" aria-label="Brick editing actions">
          {draft && <button className="inspector-sheet-primary" aria-label={moving ? 'Place moved brick' : 'Place brick'} onClick={() => placeDraft()}><Check size={18} /><span>{moving ? 'Place move' : 'Place'}</span><kbd>Enter</kbd></button>}
          <button className="inspector-sheet-primary" aria-label="Rotate brick" onClick={rotate}><RotateCw size={18} /><span>Rotate</span><kbd>R</kbd></button>
          {selected && <button className="inspector-sheet-primary" aria-label="Move brick" onClick={startMove}><Move size={18} /><span>Move</span></button>}
          {selected && <button aria-label="Duplicate brick" onClick={duplicate}><Copy size={18} /><span>Duplicate</span><kbd>⌘D</kbd></button>}
          {selected && <button aria-label="Focus selected brick" onClick={() => requestView('selection')}><Focus size={18} /><span>Focus</span><kbd>F</kbd></button>}
          {selected && <button aria-label="Copy brick" onClick={copy}><Clipboard size={18} /><span>Copy</span><kbd>⌘C</kbd></button>}
          {!selected && <button aria-label="Paste brick" onClick={paste}><Clipboard size={18} /><span>Paste</span><kbd>⌘V</kbd></button>}
          {selected && <button aria-label="Delete brick" className="danger" onClick={deleteSelected}><Trash2 size={18} /><span>Delete</span></button>}
        </div>
        <p className="inspector-scroll-hint">Editing actions are first. Scroll for color and position.</p>
        {(selected || moving) && <section className="inspector-transform-section"><label><Move size={15} /> Position & size</label><TransformControls count={1} onResize={onResize} /></section>}
        <section><label><Palette size={15} /> Color</label><ColorPalette targetColor={target.color} /></section>
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
        <span className="coarse-pointer-copy">Tap + to choose a shape, tap to position the blue preview, then use Place.</span>
      </div>
    </div>
  )
}

/**
 * The compact selection pill: same shape, position, and slide-in as the placement pill, so the
 * two read as one control surface swapping states. Coordinates live on in the desktop inspector
 * only — there is no room for them beside six 44px targets.
 */
function TouchSelectionBar({ onRecolor, onResize }: { onRecolor: () => void; onResize: () => void }) {
  const bricks = useBrickStore((state) => state.bricks)
  const selectedId = useBrickStore((state) => state.selectedId)
  const selectedIds = useBrickStore((state) => state.selectedIds)
  const draft = useBrickStore((state) => state.draft)
  const grabInProgress = useBrickStore((state) => state.grabInProgress)
  const startMove = useBrickStore((state) => state.startMove)
  const duplicate = useBrickStore((state) => state.duplicate)
  const copy = useBrickStore((state) => state.copy)
  const paste = useBrickStore((state) => state.paste)
  const deleteSelected = useBrickStore((state) => state.deleteSelected)
  const requestView = useBrickStore((state) => state.requestView)

  // An armed draft hands the row to the placement pill; a captured drag freezes both pills so
  // the only thing that animates on release is the placement pill sliding in as Moving.
  if (draft || grabInProgress) return null
  const count = selectedIds.length
  if (count > 1) {
    return (
      <div className="touch-selection-bar" role="group" aria-label={`${count} bricks selected`}>
        <span className="selection-part-chip">
          <span className="selection-swatch selection-swatch-multi" aria-hidden="true"><Layers3 size={17} /></span>
          <span className="selection-chip-text"><span className="brick-eyebrow">Selection</span><strong>{count} bricks</strong></span>
        </span>
        <TransformControls count={count} onResize={onResize} compact />
        <button className="studio-icon-button placement-icon-button" type="button" aria-label={`Copy ${count} selected bricks`} onClick={copy}><Clipboard size={19} /></button>
        <button className="studio-icon-button placement-icon-button" type="button" aria-label="Paste copied bricks" onClick={paste}><ClipboardPaste size={19} /></button>
        <button className="studio-icon-button placement-icon-button" type="button" aria-label={`Duplicate ${count} selected bricks`} onClick={duplicate}><Copy size={19} /></button>
        <button className="studio-icon-button placement-icon-button" type="button" aria-label={`Recolor ${count} selected bricks`} onClick={onRecolor}><Palette size={19} /></button>
        <button className="studio-icon-button placement-icon-button danger" type="button" aria-label={`Delete ${count} selected bricks`} onClick={deleteSelected}><Trash2 size={19} /></button>
      </div>
    )
  }
  const selected = bricks.find((brick) => brick.id === selectedId)
  if (!selected) return null
  const part = BRICK_PART_MAP[selected.partId]
  return (
    <div className="touch-selection-bar" role="group" aria-label="Selected brick actions">
      <span className="selection-part-chip">
        <span className="selection-swatch" style={{ background: selected.color }} aria-hidden="true" />
        <span className="selection-chip-text"><span className="brick-eyebrow">Selected</span><strong>{part.name}</strong></span>
      </span>
      <TransformControls count={1} onResize={onResize} compact />
      <button className="studio-icon-button placement-icon-button" type="button" aria-label="Move brick" onClick={startMove}><Move size={19} /></button>
      <button className="studio-icon-button placement-icon-button" type="button" aria-label="Recolor brick" onClick={onRecolor}><Palette size={19} /></button>
      <button className="studio-icon-button placement-icon-button" type="button" aria-label="Duplicate brick" onClick={duplicate}><Copy size={19} /></button>
      <button className="studio-icon-button placement-icon-button" type="button" aria-label="Focus selected brick" onClick={() => requestView('selection')}><Focus size={19} /></button>
      <button className="studio-icon-button placement-icon-button danger" type="button" aria-label="Delete brick" onClick={deleteSelected}><Trash2 size={19} /></button>
    </div>
  )
}

function TouchPlacementBar() {
  const draft = useBrickStore((state) => state.draft)
  const movingId = useBrickStore((state) => state.movingId)
  const grabInProgress = useBrickStore((state) => state.grabInProgress)
  const placeDraft = useBrickStore((state) => state.placeDraft)
  const rotate = useBrickStore((state) => state.rotate)
  const nudge = useBrickStore((state) => state.nudge)
  const cancelInteraction = useBrickStore((state) => state.cancelInteraction)
  if (!draft || grabInProgress) return null
  const part = BRICK_PART_MAP[draft.partId]
  return (
    <div className="touch-placement-bar" role="group" aria-label="Positioned brick actions">
      <span className="placement-part-chip"><span className="brick-eyebrow">{movingId ? 'Moving' : 'Placing'}</span><strong>{part.name}</strong></span>
      <button className="studio-icon-button placement-icon-button" type="button" aria-label="Cancel" onClick={cancelInteraction}><X size={19} /></button>
      <button className="studio-icon-button placement-icon-button" type="button" aria-label="Rotate" onClick={rotate}><RotateCw size={19} /></button>
      <button className="studio-icon-button placement-icon-button" type="button" aria-label="Raise brick one plate" onClick={() => nudge(0, 1, 0)}><ChevronUp size={19} /></button>
      <button className="studio-icon-button placement-icon-button" type="button" aria-label="Lower brick one plate" onClick={() => nudge(0, -1, 0)}><ChevronDown size={19} /></button>
      <button className="studio-button studio-button-primary touch-place-button" type="button" aria-label={movingId ? 'Place moved brick from touch controls' : 'Place positioned brick'} onClick={() => placeDraft()}>
        <Check size={20} /> {movingId ? 'Place move' : 'Place'}
      </button>
    </div>
  )
}

type BuildShellProps = {
  compact: boolean
  customParts: CustomPartDefinition[]
  canEditCustomParts: boolean
  customPartHelp?: string
  onCreatePart: (definition: CustomPartDefinition) => boolean
  onResizeSelection: (delta: ResizeDelta) => boolean
}

function BuildShell({
  compact,
  customParts,
  canEditCustomParts,
  customPartHelp,
  onCreatePart,
  onResizeSelection,
}: BuildShellProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [resizeOpen, setResizeOpen] = useState(false)
  const selectionCount = useBrickStore((state) => state.selectedIds.length)
  const closeSheet = useCallback(() => setSheetOpen(false), [])
  // One open state: the (+) FAB and the pill's Recolor reach the same sheet, whose palette
  // already recolors whatever is selected.
  const openSheet = useCallback(() => setSheetOpen(true), [])
  const openCreate = useCallback(() => {
    setSheetOpen(false)
    setCreateOpen(true)
  }, [])
  const openResize = useCallback(() => setResizeOpen(true), [])

  useEffect(() => { if (!compact) setSheetOpen(false) }, [compact])

  return (
    <div className={`build-shell${compact ? ' compact-shell' : ''}${!compact && !drawerOpen ? ' drawer-collapsed' : ''}`}>
      {compact ? (
        <>
          <button
            className="brick-drawer-fab"
            type="button"
            aria-label="Open brick drawer"
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            onClick={openSheet}
          >
            <Plus size={22} />
            <span>Bricks</span>
          </button>
          <TouchSelectionBar onRecolor={openSheet} onResize={openResize} />
          {sheetOpen && <BrickDrawerSheet
            customParts={customParts}
            canCreatePart={canEditCustomParts}
            customPartHelp={customPartHelp}
            onCreatePart={openCreate}
            onClose={closeSheet}
          />}
        </>
      ) : <>
        {drawerOpen ? <PartLibrary
          customParts={customParts}
          canCreatePart={canEditCustomParts}
          customPartHelp={customPartHelp}
          onCreatePart={openCreate}
          onCollapse={() => setDrawerOpen(false)}
        /> : (
          <button
            className="brick-drawer-toggle"
            type="button"
            aria-label="Open brick drawer"
            aria-controls="brick-part-library"
            aria-expanded="false"
            onClick={() => setDrawerOpen(true)}
          ><PanelLeftOpen size={18} /><span>Bricks</span></button>
        )}
        <Inspector onResize={openResize} />
      </>}
      <ViewControls />
      <SelectionModeControl />
      <TouchPlacementBar />
      <CreateBrickSheet
        open={createOpen}
        onCreate={(definition) => {
          if (onCreatePart(definition)) setCreateOpen(false)
        }}
        onClose={() => setCreateOpen(false)}
      />
      <ResizeBrickSheet
        open={resizeOpen}
        selectionCount={selectionCount}
        onApply={onResizeSelection}
        onClose={() => setResizeOpen(false)}
      />
    </div>
  )
}

function Toast() {
  const toast = useBrickStore((state) => state.toast)
  const clear = useBrickStore((state) => state.clearToast)
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(clear, 3300); return () => window.clearTimeout(timer) }, [toast, clear])
  return toast ? <div className="brick-toast" role="status">{toast}</div> : null
}

function Announcer() {
  const announcement = useBrickStore((state) => state.announcement)
  return <div className="visually-hidden" data-testid="builder-announcer" aria-live="polite" aria-atomic="true">{announcement}</div>
}

function TouchExploreControls({ readOnly = false }: { readOnly?: boolean }) {
  const setMove = useBrickStore((state) => state.setTouchMove)
  const addLook = useBrickStore((state) => state.addTouchLook)
  const setCameraDistance = useBrickStore((state) => state.setTouchCameraDistance)
  const adjustCameraDistance = useBrickStore((state) => state.adjustTouchCameraDistance)
  const recenterCamera = useBrickStore((state) => state.recenterCamera)
  const requestRespawn = useBrickStore((state) => state.requestRespawn)
  const spawnStatus = useBrickStore((state) => state.exploreSpawnStatus)
  const spawnControlsReady = spawnStatus === 'idle' || spawnStatus === 'ready'
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
        onPointerDown={(event) => {
          if (!spawnControlsReady) return
          joystick.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
          event.currentTarget.setPointerCapture?.(event.pointerId)
          updateJoystick(event.clientX, event.clientY)
        }}
        onPointerMove={(event) => { if (joystick.current?.id !== event.pointerId) return; updateJoystick(event.clientX, event.clientY) }}
        onPointerUp={resetJoystick}
        onPointerCancel={resetJoystick}
        onLostPointerCapture={resetJoystick}
        aria-label="Movement joystick"
        aria-describedby="touch-explore-hint"
        aria-disabled={!spawnControlsReady}
      ><span ref={joystickKnob} aria-hidden="true" /></div>
      <button
        className="jump-button"
        // iOS only synthesizes click for the PRIMARY touch, so a Jump tap while
        // the joystick finger is down never clicked. Pointer-down fires for
        // every touch; onClick stays for keyboard activation only (detail 0).
        onPointerDown={(event) => { event.preventDefault(); jump() }}
        onClick={(event) => { if (event.detail === 0) jump() }}
        aria-label="Jump; tap again in the air to double jump"
        disabled={!spawnControlsReady}
      >Jump</button>
      <button className="recenter-camera" onClick={recenterCamera} aria-label="Recenter camera"><Focus size={18} /><span>Recenter</span></button>
      <button className="respawn-avatar" onClick={requestRespawn} disabled={spawnStatus === 'finding'} aria-label="Respawn at a safe spot"><RotateCcw size={18} /><span>Respawn</span></button>
      {!readOnly && <button className="return-build" onClick={() => { resetTouchControls(); setMode('build') }}><Layers3 size={18} /> Return to Build</button>}
      {spawnStatus === 'finding' && <div className="explore-spawn-status" role="status"><strong>Finding a safe spot…</strong><span>Checking for room around your character.</span></div>}
      {spawnStatus === 'unavailable' && <div className="explore-spawn-status explore-spawn-unavailable" role="alert"><strong>No safe spot is open</strong><span>{readOnly ? 'Try again after the builder clears some room.' : 'Return to Build, clear some room, then Respawn.'}</span></div>}
      <div className="desktop-explore-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Move</span><span><kbd>Shift</kbd> Run</span><span>Drag: Camera</span><span>Scroll: Zoom</span><span><kbd>Space</kbd> Jump ×2</span><span><kbd>Esc</kbd> Build</span></div>
      <div className="touch-explore-hint" id="touch-explore-hint">Push farther to run · Drag to look · Pinch to zoom · Jump twice to flip</div>
    </div>
  )
}

function ShortcutBar() {
  const coarsePointer = useCoarsePointerPreference()
  if (coarsePointer) return null
  return <div className="shortcut-bar" role="note" aria-label="Keyboard and mouse shortcuts"><span><MousePointer2 size={14} /> Click place · Drag orbit · ⇧Drag pan</span><span>⌘Click multi-select</span><span><kbd>Enter</kbd> Place</span><span><kbd>Esc</kbd> Clear</span><span><kbd>⌘C</kbd><kbd>⌘V</kbd> Copy/paste</span><span><kbd>⌘D</kbd> Duplicate</span></div>
}

export type BrickStudioAppProps = StudioDocumentCommands & {
  publishedWorld?: { title: string; document: BrickStudioDocument }
  onRemix?: () => void
  onStartRace?: () => void
  raceScene?: BrickStudioSceneProps
  raceOverlay?: ReactNode
  livePolicy?: BrickStudioLivePolicy
  liveOverlay?: ReactNode
  customPartPolicy?: BrickStudioCustomPartPolicy
  contentPolicy?: {
    environmentId: EnvironmentId
    characterId?: string
    palette?: CharacterPalette
    canChangeEnvironment: boolean
    environmentHelp?: string
    onApply: (selection: ContentPickerSelection) => void
  }
}

export default function BrickStudioApp({
  onNewBuild,
  onImportProject,
  onExportProject,
  onStartLiveWorld,
  onPublishWorld,
  publishedWorld,
  onRemix,
  onStartRace,
  raceScene,
  raceOverlay,
  livePolicy,
  liveOverlay,
  customPartPolicy,
  contentPolicy,
}: BrickStudioAppProps = {}) {
  const readOnly = Boolean(publishedWorld)
  const [localEnvironmentId, setLocalEnvironmentId] = useState<EnvironmentId>(
    () => publishedWorld?.document.environmentId ?? 'classic',
  )
  const [localCustomParts, setLocalCustomParts] = useState<CustomPartDefinition[]>(
    () => {
      const initial = publishedWorld?.document.customParts ?? []
      registerCustomParts(initial)
      return initial
    },
  )
  const [localAppearance, setLocalAppearance] = useState(loadCharacterPreferences)
  const [worldSetupOpen, setWorldSetupOpen] = useState(false)
  const [contentPreview, setContentPreview] = useState<ContentPickerSelection | null>(null)
  const customParts = customPartPolicy?.customParts ?? localCustomParts
  const environmentId = contentPolicy?.environmentId ?? localEnvironmentId
  const characterId: CharacterId = contentPolicy
    ? resolveCharacterId(contentPolicy.characterId)
    : localAppearance.characterId
  const characterPalette = contentPolicy?.palette ?? localAppearance.palette
  const previewEnvironmentId = contentPreview?.environmentId ?? environmentId
  const previewCharacterId = contentPreview?.characterId ?? characterId
  const previewCharacterPalette = contentPreview?.palette ?? characterPalette
  const contentSelection = useMemo<ContentPickerSelection>(() => ({
    environmentId,
    characterId,
    palette: characterPalette,
  }), [characterId, characterPalette, environmentId])
  const selectableEnvironments = useMemo(() => {
    if (!contentPolicy || contentPolicy.canChangeEnvironment) return ENVIRONMENT_DESCRIPTORS
    return ENVIRONMENT_DESCRIPTORS.filter(({ id }) => id === environmentId)
  }, [contentPolicy, environmentId])
  const applyContentSelection = useCallback((selection: ContentPickerSelection) => {
    if (!selection.environmentId || !selection.characterId) return
    const nextAppearance = {
      characterId: selection.characterId,
      palette: { ...selection.palette },
    }
    saveCharacterPreferences(nextAppearance, undefined, selection.environmentId)
    if (contentPolicy) contentPolicy.onApply({ ...selection, palette: nextAppearance.palette })
    else {
      setLocalEnvironmentId(selection.environmentId)
      setLocalAppearance(nextAppearance)
    }
    setWorldSetupOpen(false)
    setContentPreview(null)
  }, [contentPolicy])
  useLayoutEffect(() => {
    registerCustomParts(customParts)
  }, [customParts])
  const canEditCustomParts = !readOnly && (livePolicy ? customPartPolicy?.canEdit === true : true)
  const customPartHelp = readOnly
    ? 'Remix this world before changing its brick library.'
    : customPartPolicy?.help ?? (livePolicy ? 'The room owner can edit the shared brick library while everyone is in Build.' : undefined)
  const createCustomPart = useCallback((definition: CustomPartDefinition) => {
    const nextCustomParts = customParts.some((part) => part.id === definition.id)
      ? customParts
      : [...customParts, definition]
    if (customPartPolicy && !customPartPolicy.onReplaceDocument({
      bricks: useBrickStore.getState().bricks,
      customParts: nextCustomParts,
    })) {
      useBrickStore.setState({ toast: 'The shared brick library is still syncing. Try again in a moment.' })
      return false
    }
    registerCustomParts(nextCustomParts)
    if (!customPartPolicy) setLocalCustomParts(nextCustomParts)
    useBrickStore.getState().choosePart(definition.id)
    useBrickStore.setState({ toast: `${definition.name} is ready to place.` })
    return true
  }, [customPartPolicy, customParts])
  const resizeSelection = useCallback((delta: ResizeDelta) => {
    const state = useBrickStore.getState()
    const selected = state.bricks.filter((brick) => state.selectedIds.includes(brick.id))
    const result = resizeSelectionDefinitions(selected, delta, customParts)
    if (!result.ok) {
      useBrickStore.setState({ toast: result.message })
      return false
    }
    if (customPartPolicy) {
      const nextBricks = state.bricks.map((brick) => {
        const partId = result.partIdsByBrickId[brick.id]
        return partId ? { ...brick, partId } : brick
      })
      const replaced = customPartPolicy.onReplaceDocument({
        bricks: nextBricks,
        customParts: result.definitions,
      })
      if (!replaced) {
        useBrickStore.setState({ toast: 'The shared world is still syncing. Try the resize again in a moment.' })
        return false
      }
      registerCustomParts(result.definitions)
      useBrickStore.setState({ toast: `Resized ${selected.length === 1 ? 'brick' : `${selected.length} bricks`} together.` })
      return true
    }
    registerCustomParts(result.definitions)
    const resized = state.resizeSelectedParts(result.partIdsByBrickId)
    if (!resized) {
      registerCustomParts(customParts)
      return false
    }
    setLocalCustomParts(result.definitions)
    return true
  }, [customPartPolicy, customParts])
  useBuilderShortcuts(!readOnly && (!livePolicy || livePolicy.connection === 'online'), livePolicy)
  useReactiveBrickBudget()
  useReducedMotionPreference()
  const mode = useBrickStore((state) => state.mode)
  const brickCount = useBrickStore((state) => state.bricks.length)
  const reducedMotion = useBrickStore((state) => state.reducedMotion)
  const selectionMode = useBrickStore((state) => state.selectionMode)
  const compact = useCompactLayout()
  const onboarding = useBuilderOnboarding()
  const startCurrentWorldLive = useCallback(() => {
    window.location.assign('/live/new')
  }, [])
  const publishCurrentWorld = useCallback(async () => {
    const title = window.prompt('Name this world', 'My Brick World')?.trim()
    if (title === undefined) return
    try {
      const shareUrl = await createPublishedWorldUrl(createBrickStudioDocument(
        useBrickStore.getState().bricks,
        { environmentId, customParts },
      ), title || undefined)
      try { await navigator.clipboard.writeText(shareUrl) } catch { /* The link is still shown below. */ }
      window.prompt('Share this read-only Explore link:', shareUrl)
      useBrickStore.setState({ toast: 'Explore snapshot link copied.' })
    } catch (error) {
      useBrickStore.setState({ toast: error instanceof Error ? error.message : 'Could not publish this world.' })
    }
  }, [customParts, environmentId])
  const documentCommands = useBrickStudioDocuments({
    onNewBuild,
    onImportProject,
    onExportProject,
    onStartLiveWorld: onStartLiveWorld ?? startCurrentWorldLive,
    onPublishWorld: onPublishWorld ?? publishCurrentWorld,
  }, !readOnly && !livePolicy, {
    environmentId,
    customParts,
    onDocumentLoaded: (document) => {
      registerCustomParts(document.customParts)
      setLocalEnvironmentId(document.environmentId)
      setLocalCustomParts(document.customParts)
    },
  })
  useLayoutEffect(() => {
    if (!publishedWorld) return
    registerCustomParts(publishedWorld.document.customParts)
    useBrickStore.getState().restoreDocument(publishedWorld.document)
    setLocalEnvironmentId(publishedWorld.document.environmentId)
    setLocalCustomParts(publishedWorld.document.customParts)
    useBrickStore.getState().setMode('explore')
  }, [publishedWorld])
  const showOnboarding = onboarding.open && (brickCount === 0 || onboarding.forced)
  return (
    <main className={`brick-studio brick-mode-${mode}${reducedMotion ? ' brick-reduced-motion' : ''}${selectionMode ? ' brick-select-mode' : ''}${livePolicy ? ' brick-live-session' : ''}`}>
      <div className="brick-canvas">
        <BrickStudioScene
          {...raceScene}
          environmentId={previewEnvironmentId ?? environmentId}
          localCharacterId={previewCharacterId ?? characterId}
          localCharacterPalette={previewCharacterPalette}
        />
        <MarqueeOverlay />
      </div>
      {readOnly ? (
        !raceOverlay && <div className="published-world-bar">
          <div><span>Published world</span><strong>{publishedWorld?.title}</strong></div>
          <div className="published-world-actions">
            {onStartRace && <button className="race-primary-button" type="button" onClick={onStartRace}>Start a race</button>}
            {onRemix && <button type="button" onClick={onRemix}>Remix this world</button>}
          </div>
        </div>
      ) : (
        <Header
          {...documentCommands}
          livePolicy={livePolicy}
          onOpenHelp={onboarding.reopen}
          onOpenWorldSetup={() => setWorldSetupOpen(true)}
        />
      )}
      {mode === 'build' ? (
        <>
          <BuildShell
            compact={compact}
            customParts={customParts}
            canEditCustomParts={canEditCustomParts}
            customPartHelp={customPartHelp}
            onCreatePart={createCustomPart}
            onResizeSelection={resizeSelection}
          />
          <EmptyState />
          <ShortcutBar />
          {showOnboarding && <OnboardingGuide onDismiss={onboarding.dismiss} />}
        </>
      ) : <TouchExploreControls readOnly={readOnly} />}
      <Toast />
      <Announcer />
      <WorldAndCharacterSheet
        open={worldSetupOpen}
        environmentDescriptors={selectableEnvironments}
        characterDescriptors={CHARACTER_DESCRIPTORS}
        selection={contentSelection}
        paletteGroups={characterPaletteGroups(contentPreview?.characterId ?? characterId)}
        description={contentPolicy && !contentPolicy.canChangeEnvironment
          ? contentPolicy.environmentHelp ?? 'Choose your character and colors. The room owner controls the shared environment.'
          : 'Choose where your world lives and customize the character you explore as.'}
        onApply={applyContentSelection}
        onDraftChange={setContentPreview}
        onClose={() => {
          setContentPreview(null)
          setWorldSetupOpen(false)
        }}
      />
      {worldSetupOpen && contentPreview && (
        <div className="content-preview-banner" role="status">Preview — only you can see this</div>
      )}
      {raceOverlay}
      {liveOverlay}
    </main>
  )
}
