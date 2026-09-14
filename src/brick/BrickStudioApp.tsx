import { normalizeCharacterAppearance, type CharacterAppearance } from '@brick-studio/core'
import { getBuildPlateSize, type BuildPlateSize } from './buildPlate'
import { CustomColorPicker } from './CustomColorPicker'
import { StudioSettings } from './ExploreCameraSettings'
import { getExploreKeyboardHint } from './explorePreferences'
import {
  ArrowLeft,
  Box,
  Check,
  ChevronDown,
  ChevronUp,
  Clipboard,
  ClipboardPaste,
  Compass,
  Copy,
  Cuboid,
  Focus,
  Home,
  Users,
  Layers3,
  MapPin,
  Move,
  MousePointer2,
  Mountain,
  UserRound,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import BrickStudioScene, { type BrickStudioSceneProps } from './BrickStudioScene'
import { BrandLockup } from '../brand'
import { Button, SaveStatus, type SaveStatusSource } from '../ui'
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
import { resizeBuildPlate, createBrickStudioDocument, type BrickStudioDocument } from './brickDocument'
import { BRICK_COLORS, BRICK_PART_MAP, BRICK_PARTS, customPartToBrickPart, registerCustomParts } from './parts'
import { StudioMenu, type StudioDocumentCommands } from './StudioMenu'
import { useBrickStore } from './store'
import { normalizeTouchStick } from './touchInput'
import type { CharacterId, CustomPartDefinition, EnvironmentId, ViewPreset } from './types'
import { useBrickStudioDocuments } from './useBrickStudioDocuments'
import { ClassroomPanel } from '../classroom/ClassroomPanel'
import { parseClassroomEntryIntent, type ClassroomEntryIntent } from '../routes'
import { browserClassroomClient } from '../classroom/client'
import { useClassroomWorld } from '../classroom/useClassroomWorld'
import type { ClassroomWorld } from '../classroom/contracts'
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
import { saveLiveWorldSeed } from './live/liveWorldSeed'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY, saveLocalBrickStudioProject } from './documentPersistence'
import './brick-studio.css'
import { installActiveWorldRecovery } from './activeWorldRecovery'

// Lets AppErrorBoundary capture the open world (local, class, or live) from the
// store before a crash unmounts the studio. Idempotent, so module re-evaluation is safe.
installActiveWorldRecovery()

export type BrickStudioLivePolicy = {
  connection: LiveConnectionState
  isOwner: boolean
  onRequestMode: (mode: LiveWorldMode) => void
  onGoHome?: () => void
  /** Room title shown in place of the guest draft's neutral title. */
  roomTitle?: string
  /** Headcount for the header's People entry; omitted while unknown. */
  peopleCount?: number
  /** Opens the live People/room panel from the header or Explore HUD. */
  onOpenPeople?: () => void
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
      if (event.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return
      const target = event.target
      // Menu navigation and Escape belong to the menu, not the build underneath.
      if (target instanceof HTMLElement && target.closest('[role="menu"]')
        && (event.key === 'Escape' || !target.matches('select'))) return
      if (target instanceof HTMLElement && target.matches('input, textarea, [contenteditable="true"]')) return
      const interactiveTarget = target instanceof HTMLElement && target.matches('select, button, a')
      const selectionTarget = target instanceof HTMLSelectElement
      const state = useBrickStore.getState()
      // While the WebGL context is lost the view is blank: no blind edits from the keyboard.
      if (state.graphicsPaused) return
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
      if (event.key === 'Enter' && state.draft) { event.preventDefault(); state.placeDraft(); return }
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
    const updatePreference = () => {
      let saved: string | null = null
      try { saved = localStorage.getItem('brick-studio-motion-preference-v1') } catch { /* System preference remains available when storage is blocked. */ }
      setReducedMotion(saved === 'reduced' || (saved !== 'full' && (preference?.matches ?? false)))
    }
    updatePreference()
    preference?.addEventListener?.('change', updatePreference)
    window.addEventListener('brick-studio-motion-preference-change', updatePreference)
    return () => {
      preference?.removeEventListener?.('change', updatePreference)
      window.removeEventListener('brick-studio-motion-preference-change', updatePreference)
    }
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

/**
 * Blocked storage is the one guest-save failure the header can report truthfully on its own:
 * autosave write results stay inside useBrickStudioDocuments (reported as toasts), so this probes
 * only whether the browser lets the studio reach its existing draft key at all.
 */
function useLocalStorageHealth(enabled: boolean) {
  const [blocked, setBlocked] = useState(false)
  useEffect(() => {
    if (!enabled) { setBlocked(false); return }
    const check = () => {
      try { window.localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY); setBlocked(false) } catch { setBlocked(true) }
    }
    check()
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [enabled])
  return blocked
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

/**
 * The header's save chip is the shared `SaveStatus` primitive fed with the real enum the
 * shell already holds (guest local, `CloudSaveStatus`, `LiveConnectionState`); `detail` is
 * the tooltip/secondary copy. Nothing here infers state from a label.
 */
export type StudioSaveStatus = {
  source: SaveStatusSource
  detail: string
}

type BrandHomeProps = { onGoHome: () => void; wordmark: 'wide' | 'never'; className?: string }

/** Brand lockup as the Home affordance: a real link to `/`, intercepted so unsaved work is flushed first. */
function BrandHome({ onGoHome, wordmark, className }: BrandHomeProps) {
  return (
    <BrandLockup
      href="/"
      size={wordmark === 'never' ? 28 : 32}
      wordmark={wordmark}
      srSuffix="Home"
      title="Home"
      className={className}
      onClick={(event) => { event.preventDefault(); onGoHome() }}
    />
  )
}

type PeopleEntryProps = {
  livePolicy?: BrickStudioLivePolicy
  onStartLiveWorld?: () => void
  compact?: boolean
}

/** People = "Build together" outside a room; inside a room it opens the live People panel. */
function PeopleEntry({ livePolicy, onStartLiveWorld, compact = false }: PeopleEntryProps) {
  if (livePolicy) {
    const count = livePolicy.peopleCount
    const label = count === undefined ? 'People' : `People, ${count} in this world`
    return (
      <Button variant="quiet" className="brick-header-tool brick-people-entry" icon={<Users size={17} />} aria-label={label} title={label} onClick={livePolicy.onOpenPeople} disabled={!livePolicy.onOpenPeople}>
        People{count !== undefined && <strong className="brick-people-count" aria-hidden="true">{count}</strong>}
      </Button>
    )
  }
  if (!onStartLiveWorld) return null
  return (
    <Button variant="quiet" className="brick-header-tool brick-collaborate-entry" icon={<Users size={17} />} onClick={onStartLiveWorld} aria-label="Build together" title="Start a shared world from this build">
      {compact ? 'People' : 'Build together'}
    </Button>
  )
}

type HeaderProps = StudioDocumentCommands & {
  onSaveToAccount?: () => void
  onOpenMyWorlds?: () => void
  onOpenMyClass?: () => void
  onRenameWorld?: (title: string) => Promise<void>
  accountLabel?: string
  worldTitle?: string
  saveStatus: StudioSaveStatus
  livePolicy?: BrickStudioLivePolicy
  onOpenHelp: () => void
  onOpenWorldSetup: (tab?: 'environment' | 'character') => void
  onGoHome: () => void
}

/** Guest drafts have no title field in the schema, so the header shows a neutral name, never the brand. */
const NEUTRAL_WORLD_TITLE = 'My build'

function Header({ onNewBuild, onImportProject, onExportProject, onStartLiveWorld, onPublishWorld, livePolicy, onOpenHelp, onOpenWorldSetup, onSaveToAccount, onOpenMyWorlds, onOpenMyClass, onRenameWorld, worldTitle, saveStatus, onGoHome }: HeaderProps) {
  const mode = useBrickStore((state) => state.mode)
  const setMode = useBrickStore((state) => state.setMode)
  const hasBricks = useBrickStore((state) => state.bricks.length > 0)
  const liveModeDisabled = Boolean(livePolicy && (!livePolicy.isOwner || livePolicy.connection !== 'online'))
  const requestBuild = () => livePolicy ? livePolicy.onRequestMode('build') : setMode('build')
  const requestExplore = () => livePolicy ? livePolicy.onRequestMode('explore') : requestExploreMode()
  const title = worldTitle || livePolicy?.roomTitle || NEUTRAL_WORLD_TITLE

  return (
    <header className="brick-header" aria-label="Studio toolbar">
      <div className="brick-header-world">
        <BrandHome onGoHome={onGoHome} wordmark="wide" className="brick-brand-home" />
        <div className="brick-world-context">
          <StudioMenu
            worldTitle={title}
            onGoHome={onGoHome}
            onSaveToAccount={onSaveToAccount}
            onOpenMyWorlds={onOpenMyWorlds}
            onOpenMyClass={onOpenMyClass}
            onRenameWorld={onRenameWorld}
            onNewBuild={livePolicy ? undefined : onNewBuild}
            onImportProject={livePolicy ? undefined : onImportProject}
            onExportProject={onExportProject}
            onStartLiveWorld={livePolicy ? undefined : onStartLiveWorld}
            onPublishWorld={livePolicy ? undefined : onPublishWorld}
            onOpenHelp={onOpenHelp}
          />
          <SaveStatus source={saveStatus.source} detail={saveStatus.detail} className="brick-save-status" />
        </div>
      </div>
      <div className="brick-header-tools" role="group" aria-label="World tools">
        <Button variant="quiet" className="brick-header-tool" icon={<Mountain size={17} />} title="Scene" onClick={() => onOpenWorldSetup('environment')}>Scene</Button>
        <Button variant="quiet" className="brick-header-tool" icon={<UserRound size={17} />} title="Character" onClick={() => onOpenWorldSetup('character')}>Character</Button>
        <PeopleEntry livePolicy={livePolicy} onStartLiveWorld={onStartLiveWorld} compact />
        <StudioSettings />
      </div>
      <nav className="brick-mode-switch" aria-label="Studio mode">
        {mode === 'build'
          ? <Button variant="primary" aria-label="Explore mode" title={hasBricks ? 'Step inside your world (2)' : 'Place a brick first, then explore'} className="brick-primary-mode" icon={<Compass size={18} />} onClick={requestExplore} disabled={!hasBricks || liveModeDisabled}>Explore<kbd aria-hidden="true">2</kbd></Button>
          : <Button variant="primary" aria-label="Back to building" className="brick-primary-mode" icon={<ArrowLeft size={18} />} onClick={requestBuild} disabled={liveModeDisabled}>Back to building<kbd aria-hidden="true">1</kbd></Button>}
      </nav>
    </header>
  )
}

/** Board 15 read-only viewer chrome: the world is already in Explore; Make a copy starts a guest remix. */
function PublishedWorldBar({ title, onRemix }: { title?: string; onRemix?: () => void }) {
  return (
    <div className="published-world-bar" role="region" aria-label="Published world">
      <BrandLockup wordmark="never" size={28} className="published-world-mark" />
      <div className="published-world-heading"><span>Read-only world</span><strong title={title}>{title}</strong></div>
      <div className="published-world-actions">
        <StudioSettings />
        {onRemix && <Button variant="primary" className="published-world-remix" icon={<Copy size={16} />} onClick={onRemix} title="Save a copy of this world as your guest build">Make a copy</Button>}
      </div>
    </div>
  )
}

type ExploreHudProps = {
  worldTitle?: string
  livePolicy?: BrickStudioLivePolicy
  onStartLiveWorld?: () => void
  onOpenWorldSetup: (tab?: 'environment' | 'character') => void
  onGoHome: () => void
}

/** Board 07: the header steps aside in Explore. Back to building leads; People/Character/Settings stay one tap away. */
function ExploreHud({ worldTitle, livePolicy, onStartLiveWorld, onOpenWorldSetup, onGoHome }: ExploreHudProps) {
  const setMode = useBrickStore((state) => state.setMode)
  const liveModeDisabled = Boolean(livePolicy && (!livePolicy.isOwner || livePolicy.connection !== 'online'))
  const requestBuild = () => livePolicy ? livePolicy.onRequestMode('build') : setMode('build')
  const title = worldTitle || livePolicy?.roomTitle || NEUTRAL_WORLD_TITLE
  return (
    <div className="brick-explore-hud" role="region" aria-label="Explore toolbar">
      <div className="brick-explore-hud-start">
        <BrandHome onGoHome={onGoHome} wordmark="never" className="brick-brand-mark" />
        <Button variant="secondary" aria-label="Back to building" className="brick-explore-back" icon={<ArrowLeft size={18} />} onClick={requestBuild} disabled={liveModeDisabled}>Back to building<kbd aria-hidden="true">1</kbd></Button>
      </div>
      <div className="brick-explore-hud-end">
        <div className="brick-explore-cluster" role="group" aria-label="World tools">
          <PeopleEntry livePolicy={livePolicy} onStartLiveWorld={onStartLiveWorld} compact />
          <Button variant="quiet" className="brick-header-tool" icon={<UserRound size={17} />} title="Character" onClick={() => onOpenWorldSetup('character')}>Character</Button>
          <StudioSettings />
        </div>
        <span className="brick-explore-title-pill" title={title}><MapPin size={14} aria-hidden="true" /><span>{title}</span></span>
      </div>
    </div>
  )
}

function EditingToolbar() {
  const undo = useBrickStore((state) => state.undo)
  const redo = useBrickStore((state) => state.redo)
  const canUndo = useBrickStore((state) => state.undoStack.length > 0 && !state.graphicsPaused)
  const canRedo = useBrickStore((state) => state.redoStack.length > 0 && !state.graphicsPaused)
  const count = useBrickStore((state) => state.bricks.length)
  const budget = useBrickStore((state) => state.brickBudget)
  return <div className="brick-edit-toolbar" role="group" aria-label="Build tools">
    <div className="brick-history-tools" role="group" aria-label="Edit history">
      <button className="studio-icon-button" type="button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)"><Undo2 size={18} aria-hidden="true" /><span>Undo</span></button>
      <button className="studio-icon-button" type="button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)"><Redo2 size={18} aria-hidden="true" /><span>Redo</span></button>
    </div>
    <SelectionModeControl />
    <ViewControls />
    <span className="brick-capacity-status" aria-label={`${count} of ${budget} brick capacity`} title="Bricks placed of the current capacity">{count} / {budget}</span>
  </div>
}

type PartGridProps = {
  customParts: CustomPartDefinition[]
  onChoose?: () => void
  onCreatePart: () => void
  canCreatePart: boolean
  customPartHelp?: string
}

type PartCategory = 'all' | 'blocks' | 'plates' | 'slopes' | 'shapes' | 'custom'
const PART_CATEGORIES: { id: PartCategory; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'plates', label: 'Plates' },
  { id: 'slopes', label: 'Slopes' },
  { id: 'shapes', label: 'Shapes' },
  { id: 'custom', label: 'My bricks' },
]

/** Categories are derived from the real part kinds; nothing here invents shapes the catalog lacks. */
function partCategory(part: { kind: string; id: string }, customIds: ReadonlySet<string>): PartCategory {
  if (customIds.has(part.id)) return 'custom'
  if (part.kind === 'brick') return 'blocks'
  if (part.kind === 'plate') return 'plates'
  if (part.kind === 'slope' || part.kind === 'invertedSlope' || part.kind === 'stair') return 'slopes'
  return 'shapes'
}

function PartGrid({ customParts, onChoose, onCreatePart, canCreatePart, customPartHelp }: PartGridProps) {
  const activePartId = useBrickStore((state) => state.activePartId)
  const choosePart = useBrickStore((state) => state.choosePart)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<PartCategory>('all')
  const searchId = useId()
  const parts = useMemo(() => [
    ...BRICK_PARTS,
    ...customParts.map(customPartToBrickPart),
  ], [customParts])
  const customIds = useMemo(() => new Set(customParts.map((part) => part.id)), [customParts])
  const categories = useMemo(() => PART_CATEGORIES.filter((entry) => entry.id !== 'custom' || customParts.length > 0), [customParts.length])
  const trimmedQuery = query.trim().toLowerCase()
  const visibleParts = useMemo(() => parts.filter((part) => {
    if (category !== 'all' && partCategory(part, customIds) !== category) return false
    return !trimmedQuery || part.name.toLowerCase().includes(trimmedQuery) || part.id.toLowerCase().includes(trimmedQuery)
  }), [parts, category, customIds, trimmedQuery])
  return (
    <>
      <div className="part-search">
        <Search size={16} aria-hidden="true" />
        <input
          id={searchId}
          type="search"
          value={query}
          placeholder="Search bricks…"
          aria-label="Search bricks"
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            // Escape clears the search first; a second Escape leaves the field so the build shortcut can take it.
            if (event.key !== 'Escape') return
            if (query) { event.preventDefault(); event.stopPropagation(); setQuery('') } else event.currentTarget.blur()
          }}
        />
        {query && <button type="button" className="part-search-clear" aria-label="Clear search" onClick={() => setQuery('')}><X size={14} aria-hidden="true" /></button>}
      </div>
      <button
        className="create-part-entry"
        type="button"
        aria-label="Create a brick"
        onClick={onCreatePart}
        disabled={!canCreatePart}
        title={!canCreatePart ? customPartHelp : 'Create a reusable brick with snapped dimensions'}
      >
        <span className="create-part-entry-icon"><Plus size={19} /></span>
        <span><strong>Create a brick</strong><small>{canCreatePart ? 'Choose its shape and size' : customPartHelp}</small></span>
      </button>
      <div className="part-categories" role="tablist" aria-label="Brick categories">
        {categories.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={category === entry.id}
            className={`part-category${category === entry.id ? ' active' : ''}`}
            onClick={() => setCategory(entry.id)}
          >{entry.label}</button>
        ))}
      </div>
      <div className="part-grid" aria-label="Brick shapes">
        {visibleParts.map((part) => (
          <button
            key={part.id}
            className={`library-part ${activePartId === part.id ? 'active' : ''}`}
            type="button"
            aria-pressed={activePartId === part.id}
            onClick={() => { choosePart(part.id); onChoose?.() }}
            title={part.name}
          >
            <PartThumbnail part={part} />
            <span>{part.name}</span>
          </button>
        ))}
        {visibleParts.length === 0 && (
          <p className="part-grid-empty" role="status">No bricks match {trimmedQuery ? `“${query.trim()}”` : 'this category'}.{trimmedQuery && <> <button type="button" className="part-grid-empty-clear" onClick={() => { setQuery(''); setCategory('all') }}>Show all bricks</button></>}</p>
        )}
      </div>
    </>
  )
}

function PartLibrary({ onCollapse, ...gridProps }: PartGridProps & { onCollapse: () => void }) {
  const graphicsPaused = useBrickStore((state) => state.graphicsPaused)
  const selectionCount = useBrickStore((state) => state.selectedIds.length)
  const targetColor = usePaletteTarget()
  return (
    <aside inert={graphicsPaused} className="part-library" id="brick-part-library" aria-label="Brick drawer">
      <div className="library-title">
        <div><span className="brick-eyebrow">Brick drawer</span><h2>Bricks</h2></div>
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
      <section className="library-colors">
        <label><Palette size={15} aria-hidden="true" /> {selectionCount > 1 ? `Color all ${selectionCount}` : 'Color'}</label>
        <ColorPalette targetColor={targetColor} />
      </section>
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
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      if (dialogs[dialogs.length - 1] !== panel.current) return
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
          <div><span className="brick-eyebrow">Brick drawer</span><h2 id="brick-sheet-title">Bricks</h2></div>
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
  const [customOpen, setCustomOpen] = useState(false)
  const customSelected = !BRICK_COLORS.some((color) => color.toLowerCase() === targetColor.toLowerCase())
  const setColor = useBrickStore((state) => state.setActiveColor)
  return (
    <>
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
      <button type="button" className={`brick-any-color${customSelected ? ' active' : ''}`} style={customSelected ? { background: targetColor } : undefined} aria-pressed={customSelected} aria-label="Choose any brick color" title="Choose any color" aria-haspopup="dialog" onClick={() => setCustomOpen(true)}>{customSelected ? <Check size={13} /> : '+'}</button>
    </div>
    {customOpen && <CustomColorPicker color={targetColor} onApply={setColor} onClose={() => setCustomOpen(false)} />}
    </>
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
  const graphicsPaused = useBrickStore((state) => state.graphicsPaused)
  const selectedIds = useBrickStore((state) => state.selectedIds)
  const selectedId = useBrickStore((state) => state.selectedId)
  const activeColor = useBrickStore((state) => state.activeColor)
  const draft = useBrickStore((state) => state.draft)
  const movingId = useBrickStore((state) => state.movingId)
  const movingSelection = useBrickStore((state) => state.movingSelection)
  const cancelInteraction = useBrickStore((state) => state.cancelInteraction)
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
  const selected = draft || selectedIds.length > 1 ? undefined : bricks.find((brick) => brick.id === selectedId)
  const moving = Boolean(movingId && draft)
  const target = moving ? draft : selected ?? draft

  useLayoutEffect(() => {
    if (detailsExpanded && inspectorSheet.current) inspectorSheet.current.scrollTop = 0
  }, [detailsExpanded])

  if (selectedIds.length > 1 && !draft) {
    return (
      <aside inert={graphicsPaused} className="brick-inspector multi-selection-inspector" aria-label={`${selectedIds.length} bricks selected`}>
        <div className="inspector-heading">
          <span className="inspector-cube multi-selection-cube"><Layers3 size={19} /></span>
          <div><span className="brick-eyebrow">Selection</span><h2>{selectedIds.length} bricks selected</h2></div>
        </div>
        <p>Drag a selected brick to move the whole group. Release to place; Esc cancels.</p>
        <section className="inspector-transform-section"><label><Move size={15} /> Position & size</label><TransformControls count={selectedIds.length} onResize={onResize} /></section>
        <div className="inspector-actions multi-selection-actions" role="group" aria-label="Selection editing actions">
          <button aria-label="Move selected bricks" onClick={startMove}><Move size={18} /><span>Move</span></button>
          <button aria-label="Focus selected bricks" onClick={() => requestView('selection')}><Focus size={18} /><span>Focus</span><kbd>F</kbd></button>
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
  if (!part) return null

  return (
    <aside inert={graphicsPaused} className={`brick-inspector ${detailsExpanded ? 'details-expanded' : 'details-collapsed'}`} aria-label="Brick inspector">
      <div className="inspector-toolbar">
        <div className="inspector-heading"><span className="inspector-cube" style={{ background: target.color }}><Box size={19} /></span><div><span className="brick-eyebrow">{movingSelection?.duplicate ? 'Duplicating' : moving ? 'Moving' : selected ? 'Selected brick' : 'Placing'}</span><h2>{movingSelection && movingSelection.originals.length > 1 ? `${movingSelection.originals.length} bricks` : part.name}</h2></div></div>
        <div className="inspector-quick-actions">
          {draft && <button aria-label={moving ? 'Place moved brick' : 'Place brick'} onClick={() => placeDraft()}><Check size={18} /></button>}
          <button aria-label="Rotate brick" disabled={(movingSelection?.originals.length ?? 0) > 1} onClick={rotate}><RotateCw size={18} /></button>
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
          <button className="inspector-sheet-primary" aria-label="Rotate brick" disabled={(movingSelection?.originals.length ?? 0) > 1} onClick={rotate}><RotateCw size={18} /><span>Rotate</span><kbd>R</kbd></button>
          {selected && <button className="inspector-sheet-primary" aria-label="Move brick" onClick={startMove}><Move size={18} /><span>Move</span></button>}
          {selected && <button aria-label="Duplicate brick" onClick={duplicate}><Copy size={18} /><span>Duplicate</span><kbd>⌘D</kbd></button>}
          {selected && <button aria-label="Focus selected brick" onClick={() => requestView('selection')}><Focus size={18} /><span>Focus</span><kbd>F</kbd></button>}
          {selected && <button aria-label="Copy brick" onClick={copy}><Clipboard size={18} /><span>Copy</span><kbd>⌘C</kbd></button>}
          {!selected && <button aria-label="Paste brick" onClick={paste}><Clipboard size={18} /><span>Paste</span><kbd>⌘V</kbd></button>}
          {selected && <button aria-label="Delete brick" className="danger" onClick={deleteSelected}><Trash2 size={18} /><span>Delete</span></button>}
        </div>
        {draft && <button className="studio-button inspector-cancel" type="button" onClick={cancelInteraction}><X size={16} />Cancel placement</button>}
        <p className="inspector-drag-hint">{draft ? 'Position the preview, then place. Esc cancels.' : 'Drag the selected brick to move it. Use arrows for precise steps.'}</p>
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
    <div className="view-controls" role="group" aria-label="Build camera views">
      <button type="button" className="view-home" onClick={() => requestView('home')} title="Frame the whole build (Home)" aria-label="Frame Build"><Home size={17} aria-hidden="true" /><span>Frame build</span></button>
      {views.map((view) => <button type="button" key={view.id} onClick={() => requestView(view.id)} title={`${view.label} view`}>{view.label}</button>)}
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
      aria-label={selectionMode ? 'Cancel box selection' : 'Box select bricks'}
      onClick={() => setSelectionMode(!selectionMode)}
    >
      {selectionMode ? <Check size={18} /> : <MousePointer2 size={18} />}
      <span>{selectionMode ? 'Cancel' : 'Box select'}</span>
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
  const toast = useBrickStore((state) => state.toast)
  if (count || toast) return null
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
  const graphicsPaused = useBrickStore((state) => state.graphicsPaused)
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
      <div inert={graphicsPaused} className="touch-selection-bar" role="group" aria-label={`${count} bricks selected`}>
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
  if (!part) return null
  return (
    <div inert={graphicsPaused} className="touch-selection-bar" role="group" aria-label="Selected brick actions">
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
  const movingSelection = useBrickStore((state) => state.movingSelection)
  const grabInProgress = useBrickStore((state) => state.grabInProgress)
  const placeDraft = useBrickStore((state) => state.placeDraft)
  const rotate = useBrickStore((state) => state.rotate)
  const nudge = useBrickStore((state) => state.nudge)
  const cancelInteraction = useBrickStore((state) => state.cancelInteraction)
  if (!draft || grabInProgress) return null
  const part = BRICK_PART_MAP[draft.partId]
  if (!part) return null
  return (
    <div className="touch-placement-bar" role="group" aria-label="Positioned brick actions">
      <span className="placement-part-chip"><span className="brick-eyebrow">{movingSelection?.duplicate ? 'Duplicating' : movingId ? 'Moving' : 'Placing'}</span><strong>{movingSelection && movingSelection.originals.length > 1 ? `${movingSelection.originals.length} bricks` : part.name}</strong></span>
      <button className="studio-icon-button placement-icon-button" type="button" aria-label="Cancel" onClick={cancelInteraction}><X size={19} /></button>
      <button className="studio-icon-button placement-icon-button" type="button" aria-label="Rotate" disabled={(movingSelection?.originals.length ?? 0) > 1} onClick={rotate}><RotateCw size={19} /></button>
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
      <EditingToolbar />
      <TouchPlacementBar />
      <CreateBrickSheet
        open={createOpen}
        existingCount={customParts.length}
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
  return toast ? <div className="brick-toast" role="status" aria-label="Studio message">{toast}</div> : null
}

function Announcer() {
  const announcement = useBrickStore((state) => state.announcement)
  return <div className="visually-hidden" data-testid="builder-announcer" aria-live="polite" aria-atomic="true">{announcement}</div>
}

function TouchExploreControlsGate(props: { readOnly?: boolean }) {
  // A lost WebGL context parks movement too; the joystick and jump button return with the graphics.
  const graphicsPaused = useBrickStore((state) => state.graphicsPaused)
  return graphicsPaused ? null : <TouchExploreControls {...props} />
}

/** Hints stay hidden for the rest of this visit once dismissed; no new storage key is introduced. */
let exploreHintsDismissedThisVisit = false

function TouchExploreControls({ readOnly = false }: { readOnly?: boolean }) {
  const keyboardMode = useBrickStore((state) => state.exploreKeyboardMode)
  const [hintsDismissed, setHintsDismissed] = useState(() => exploreHintsDismissedThisVisit)
  const dismissHints = useCallback(() => { exploreHintsDismissedThisVisit = true; setHintsDismissed(true) }, [])
  const setMove = useBrickStore((state) => state.setTouchMove)
  const addLook = useBrickStore((state) => state.addTouchLook)
  const setCameraDistance = useBrickStore((state) => state.setTouchCameraDistance)
  const adjustCameraDistance = useBrickStore((state) => state.adjustTouchCameraDistance)
  const recenterCamera = useBrickStore((state) => state.recenterCamera)
  const requestRespawn = useBrickStore((state) => state.requestRespawn)
  const spawnStatus = useBrickStore((state) => state.exploreSpawnStatus)
  const spawnControlsReady = spawnStatus === 'idle' || spawnStatus === 'ready'
  const jump = useBrickStore((state) => state.requestJump)
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
        tabIndex={-1}
        role="region"
        aria-label="Explore camera controls"
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return
          event.currentTarget.focus({ preventScroll: true })
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
      {spawnStatus === 'finding' && <div className="explore-spawn-status" role="status"><strong>Finding a safe spot…</strong><span>Checking for room around your character.</span></div>}
      {spawnStatus === 'unavailable' && <div className="explore-spawn-status explore-spawn-unavailable" role="alert"><strong>No safe spot is open</strong><span>{readOnly ? 'Try again after the builder clears some room.' : 'Use Back to building, clear some room, then Respawn.'}</span></div>}
      {!hintsDismissed && <div className="desktop-explore-hint" role="note" aria-label="Explore controls"><span>{getExploreKeyboardHint(keyboardMode)}</span><span><kbd>Shift</kbd> Run</span><span>Drag: Camera</span><span>Scroll: Zoom</span><span><kbd>Space</kbd> Jump ×2</span>{!readOnly && <span><kbd>Esc</kbd> Build</span>}<button type="button" className="explore-hint-dismiss" aria-label="Hide control hints" onClick={dismissHints}><X size={14} aria-hidden="true" /></button></div>}
      <div className={`touch-explore-hint${hintsDismissed ? ' touch-explore-hint-dismissed' : ''}`} id="touch-explore-hint" role="note">Push farther to run · Drag to look · Pinch to zoom · Jump twice to flip{!hintsDismissed && <button type="button" className="explore-hint-dismiss" aria-label="Hide control hints" onClick={dismissHints}><X size={14} aria-hidden="true" /></button>}</div>
    </div>
  )
}

function ShortcutBar() {
  const coarsePointer = useCoarsePointerPreference()
  if (coarsePointer) return null
  return <div className="shortcut-bar" role="note" aria-label="Keyboard and mouse shortcuts"><span><MousePointer2 size={14} /> Right-drag orbit · ⇧Right-drag pan · Space+drag orbit</span><span>Shift-click multi-select · Drag empty space box-select</span><span>Drag selection to move</span><span><kbd>Enter</kbd> Place</span><span><kbd>Esc</kbd> Clear</span><span><kbd>⌘C</kbd><kbd>⌘V</kbd> Copy/paste</span><span><kbd>⌘D</kbd> Duplicate</span></div>
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
    plateSize?: BuildPlateSize
    environmentId: EnvironmentId
    characterId?: string
    appearance?: CharacterAppearance
    palette?: CharacterPalette
    canChangeEnvironment: boolean
    environmentHelp?: string
    onApply: (selection: ContentPickerSelection, plateSize?: BuildPlateSize) => boolean | void
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
  raceScene,
  raceOverlay,
  livePolicy,
  liveOverlay,
  customPartPolicy,
  contentPolicy,
}: BrickStudioAppProps = {}) {
  const readOnly = Boolean(publishedWorld)
  const [classroomIntent, setClassroomIntent] = useState<ClassroomEntryIntent | null>(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('classroom')) return null
    // Consume the entry intent even when it is unknown so a mistyped link never lingers in the address bar.
    const intent = parseClassroomEntryIntent(url.search)
    url.searchParams.delete('classroom')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    return intent
  })
  const classroomAuth = useSyncExternalStore(browserClassroomClient.subscribe, browserClassroomClient.getSession)
  const cloud = useClassroomWorld(!readOnly && !livePolicy)
  const localStorageBlocked = useLocalStorageHealth(!readOnly && !livePolicy && !cloud.world)
  const closeClassroom = useCallback(() => setClassroomIntent(null), [])
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
  const [localPlateSize, setLocalPlateSize] = useState<BuildPlateSize>(() => getBuildPlateSize(publishedWorld?.document ?? {}))
  const [localAppearance, setLocalAppearance] = useState(loadCharacterPreferences)
  const [worldSetupOpen, setWorldSetupOpen] = useState(false)
  const [worldSetupTab, setWorldSetupTab] = useState<'environment' | 'character'>('environment')
  const [contentPreview, setContentPreview] = useState<ContentPickerSelection | null>(null)
  const [environmentPreviewStatuses, setEnvironmentPreviewStatuses] = useState<Partial<Record<EnvironmentId, 'ready' | 'loading' | 'unavailable'>>>({})
  const customParts = customPartPolicy?.customParts ?? localCustomParts
  const plateSize = contentPolicy ? getBuildPlateSize(contentPolicy) : localPlateSize
  const environmentId = contentPolicy?.environmentId ?? localEnvironmentId
  const characterId: CharacterId = contentPolicy
    ? resolveCharacterId(contentPolicy.characterId)
    : localAppearance.characterId
  const characterAppearance = contentPolicy?.appearance ?? localAppearance.appearance
  const previewCharacterAppearance = contentPreview?.appearance ?? characterAppearance
  const characterPalette = contentPolicy?.palette ?? localAppearance.palette
  const previewEnvironmentId = contentPreview?.environmentId ?? environmentId
  const previewCharacterId = contentPreview?.characterId ?? characterId
  const previewCharacterPalette = contentPreview?.palette ?? characterPalette
  const previewEnvironmentStatus = environmentPreviewStatuses[previewEnvironmentId]
  const updateEnvironmentPreviewStatus = useCallback((id: EnvironmentId, status: 'ready' | 'loading' | 'unavailable') => {
    setEnvironmentPreviewStatuses((current) => current[id] === status ? current : { ...current, [id]: status })
  }, [])
  const contentSelection = useMemo<ContentPickerSelection>(() => ({
    environmentId,
    characterId,
    palette: characterPalette,
    appearance: characterAppearance,
  }), [characterId, characterPalette, characterAppearance, environmentId])
  const selectableEnvironments = useMemo(() => {
    if (!contentPolicy || contentPolicy.canChangeEnvironment) return ENVIRONMENT_DESCRIPTORS
    return ENVIRONMENT_DESCRIPTORS.filter(({ id }) => id === environmentId)
  }, [contentPolicy, environmentId])
  const applyContentSelection = useCallback((selection: ContentPickerSelection, requestedPlateSize?: BuildPlateSize) => {
    if (!selection.environmentId || !selection.characterId) return
    if (useBrickStore.getState().graphicsPaused) return
    if (!contentPolicy && requestedPlateSize && requestedPlateSize !== plateSize) {
      const resized = resizeBuildPlate(useBrickStore.getState().getDocumentSnapshot(), requestedPlateSize)
      if (!resized.ok) { useBrickStore.setState({ toast: resized.error.message }); return }
      const result = useBrickStore.getState().importDocument(JSON.stringify(resized.document), 'Resize build plate')
      if (!result.ok) return
      setLocalPlateSize(requestedPlateSize)
    }
    if (contentPolicy && contentPolicy.onApply(selection, requestedPlateSize) === false) return
    const nextAppearance = {
      characterId: selection.characterId,
      palette: { ...selection.palette },
      appearance: normalizeCharacterAppearance(selection.appearance),
    }
    saveCharacterPreferences(nextAppearance, undefined, selection.environmentId)
    if (!contentPolicy) {
      setLocalEnvironmentId(selection.environmentId)
      setLocalAppearance(nextAppearance)
    }
    setWorldSetupOpen(false)
    setContentPreview(null)
  }, [contentPolicy, plateSize])
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
  useBuilderShortcuts(!readOnly && !classroomIntent && !worldSetupOpen && (!livePolicy || livePolicy.connection === 'online'), livePolicy)
  useReactiveBrickBudget()
  useReducedMotionPreference()
  const mode = useBrickStore((state) => state.mode)
  const brickCount = useBrickStore((state) => state.bricks.length)
  const reducedMotion = useBrickStore((state) => state.reducedMotion)
  const selectionMode = useBrickStore((state) => state.selectionMode)
  const compact = useCompactLayout()
  const onboarding = useBuilderOnboarding()
  const startCurrentWorldLive = useCallback(() => {
    void (async () => {
      try {
        if (cloud.world) {
          if (!await cloud.flush()) {
            useBrickStore.setState({ toast: 'Your account world is still saving. Wait for it to save, then start Build together again.' })
            return
          }
        }
        const document = useBrickStore.getState().getDocumentSnapshot()
        if (!cloud.world) {
          const saved = saveLocalBrickStudioProject(window.localStorage, document)
          if (!saved.ok) throw new Error(saved.error.message)
        }
        saveLiveWorldSeed(document)
        window.location.assign('/live/new')
      } catch (reason) {
        useBrickStore.setState({ toast: reason instanceof Error ? reason.message : 'Could not prepare your build. Export a copy before trying again.' })
      }
    })()
  }, [cloud])
  const documentCommands = useBrickStudioDocuments({
    onNewBuild: onNewBuild ?? (cloud.world ? () => { void (async () => {
      if (!window.confirm('Start a new guest build? Your account world will remain saved separately.')) return
      const saved = await cloud.flush()
      if (!saved && !window.confirm('Some edits are only in recovery storage. Download a recovery copy before leaving if needed. Continue?')) return
      cloud.leave()
      useBrickStore.getState().newBuild()
    })() } : undefined),
    onImportProject,
    onExportProject,
    onStartLiveWorld: onStartLiveWorld ?? startCurrentWorldLive,
    onPublishWorld: onPublishWorld ?? (() => {}),
  }, !readOnly && !livePolicy && !cloud.world, {
    environmentId,
    customParts,
    plateSize,
    onDocumentLoaded: (document) => {
      setLocalPlateSize(getBuildPlateSize(document))
      registerCustomParts(document.customParts)
      setLocalEnvironmentId(document.environmentId)
      setLocalCustomParts(document.customParts)
    },
  })
  useLayoutEffect(() => {
    if (!publishedWorld) return
    registerCustomParts(publishedWorld.document.customParts)
    useBrickStore.getState().restoreDocument(publishedWorld.document)
    setLocalPlateSize(getBuildPlateSize(publishedWorld.document))
    setLocalEnvironmentId(publishedWorld.document.environmentId)
    setLocalCustomParts(publishedWorld.document.customParts)
    useBrickStore.getState().setMode('explore')
  }, [publishedWorld])
  const showOnboarding = onboarding.open && !worldSetupOpen && (brickCount === 0 || onboarding.forced)
  // Labels come only from the real state machines (guest autosave, CloudSaveStatus, LiveConnectionState).
  // Guest autosave failures are reported by useBrickStudioDocuments as toasts and are not exposed as
  // state, so the only local error the header can surface truthfully is blocked storage access.
  const saveStatus: StudioSaveStatus = livePolicy
    ? {
      source: { kind: 'live', connection: livePolicy.connection },
      detail: livePolicy.connection === 'online' ? 'Changes are shared with everyone in this world as you make them.' : 'The shared world connection and recovery details appear in the live session controls.',
    }
    : cloud.world
      ? {
        source: { kind: 'cloud', status: cloud.status },
        detail: cloud.status === 'saved' ? 'Your latest changes are saved to your account.' : cloud.status === 'error' ? cloud.error || 'Your latest changes are not saved online. Use the recovery controls before leaving.' : 'Your latest changes are not saved online yet. Keep this tab open.',
      }
      : localStorageBlocked
        ? {
          source: { kind: 'local', error: 'This browser blocked local storage, so this build cannot be saved here.' },
          detail: 'This browser blocked local storage, so this build cannot be saved here. Download the build to keep it.',
        }
        : {
          source: { kind: 'local' },
          detail: 'This build stays in this browser on this device. Use My Worlds to save a copy to your account, or Download build to keep a file.',
        }
  const goHome = () => { void (async () => {
    if (livePolicy) {
      livePolicy.onGoHome?.()
      return
    }
    if (cloud.world) {
      if (!await cloud.flush()) {
        useBrickStore.setState({ toast: 'Your account save needs attention. Resolve it or download a recovery copy before leaving.' })
        return
      }
    } else {
      const saved = saveLocalBrickStudioProject(window.localStorage, useBrickStore.getState().getDocumentSnapshot())
      if (!saved.ok) { useBrickStore.setState({ toast: saved.error.message }); return }
    }
    window.location.assign('/')
  })().catch(reason => useBrickStore.setState({ toast: String(reason) })) }
  const openWorldSetup = (tab: 'environment' | 'character' = 'environment') => { setWorldSetupTab(tab); setWorldSetupOpen(true) }
  const renameWorld = cloud.world ? async (title: string) => {
    const world = cloud.world
    if (!world) return
    if (!await cloud.flush()) throw new Error('Your latest changes are still saving. Wait for the save to finish, then rename again.')
    const renamed = await browserClassroomClient.request<{ world: ClassroomWorld }>(`/worlds/${world.id}`, 'PATCH', { title })
    if (cloud.world?.id === renamed.world.id) await cloud.reload()
  } : undefined
  return (
    <main className={`brick-studio brick-mode-${mode}${reducedMotion ? ' brick-reduced-motion' : ''}${selectionMode ? ' brick-select-mode' : ''}${livePolicy ? ' brick-live-session' : ''}`}>
      <div className="brick-canvas">
        <BrickStudioScene
          {...raceScene}
          environmentId={previewEnvironmentId ?? environmentId}
          localCharacterId={previewCharacterId ?? characterId}
          localCharacterPalette={previewCharacterPalette}
          localCharacterAppearance={previewCharacterAppearance}
          onEnvironmentStatusChange={updateEnvironmentPreviewStatus}
        />
        <MarqueeOverlay />
      </div>
      {previewEnvironmentStatus === 'loading' && (
        <div className="scene-loading-status" role="status">
          <span className="scene-loading-spinner" aria-hidden="true" />
          Loading {ENVIRONMENT_DESCRIPTORS.find(({ id }) => id === previewEnvironmentId)?.name ?? 'world'}…
        </div>
      )}
      {readOnly ? (
        !raceOverlay && <PublishedWorldBar title={publishedWorld?.title} onRemix={onRemix} />
      ) : mode === 'build' ? (
        <Header
          {...documentCommands}
          onSaveToAccount={() => setClassroomIntent('save')}
          onOpenMyWorlds={() => setClassroomIntent('worlds')}
          onOpenMyClass={() => setClassroomIntent('class')}
          onRenameWorld={renameWorld}
          accountLabel={classroomAuth?.user.username}
          worldTitle={cloud.world?.title}
          saveStatus={saveStatus}
          livePolicy={livePolicy}
          onOpenHelp={onboarding.reopen}
          onOpenWorldSetup={openWorldSetup}
          onGoHome={goHome}
        />
      ) : (
        <ExploreHud
          worldTitle={cloud.world?.title}
          livePolicy={livePolicy}
          onStartLiveWorld={documentCommands.onStartLiveWorld}
          onOpenWorldSetup={openWorldSetup}
          onGoHome={goHome}
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
      ) : <TouchExploreControlsGate readOnly={readOnly || Boolean(livePolicy && (!livePolicy.isOwner || livePolicy.connection !== 'online'))} />}
      <Toast />
      <Announcer />
      <WorldAndCharacterSheet
        open={worldSetupOpen}
        initialTab={worldSetupTab}
        plateSize={plateSize}
        canResizePlate={!readOnly && (!contentPolicy || contentPolicy.canChangeEnvironment)}
        environmentDescriptors={selectableEnvironments}
        characterDescriptors={CHARACTER_DESCRIPTORS}
        selection={contentSelection}
        paletteGroups={characterPaletteGroups(contentPreview?.characterId ?? characterId)}
        description={contentPolicy && !contentPolicy.canChangeEnvironment
          ? contentPolicy.environmentHelp ?? 'Choose your character and colors. The room owner chooses the shared scene.'
          : 'Choose a scene and customize the character you explore as.'}
        onApply={applyContentSelection}
        onDraftChange={setContentPreview}
        previewStatuses={{ environment: environmentPreviewStatuses }}
        onClose={() => {
          setContentPreview(null)
          setWorldSetupOpen(false)
        }}
      />
      {worldSetupOpen && contentPreview && (
        <div className="content-preview-banner" role="status">Preview — only you can see this</div>
      )}
      {(cloud.error || cloud.recovery) && <div className="classroom-recovery" role="alert"><span>{cloud.error || 'Your recovered changes are open in the editor.'}</span><button onClick={cloud.downloadRecovery}>Download recovery copy</button>{cloud.world && <><button onClick={() => void cloud.retry()}>Retry save</button><button onClick={() => { if (window.confirm('Replace your unsaved changes with the account’s saved version? Download a recovery copy first if you want to keep them.')) void cloud.reload().catch(error => useBrickStore.setState({ toast: String(error) })) }}>Reload saved world</button></>}</div>}
      {classroomIntent && <ClassroomPanel
        intent={classroomIntent}
        getDocument={() => useBrickStore.getState().getDocumentSnapshot()}
        onClose={closeClassroom}
        beforeWorldMutation={cloud.flush}
        onWorldUpdated={world => { if (cloud.world?.id === world.id) void cloud.reload().catch(error => useBrickStore.setState({ toast: String(error) })) }}
        onSaved={world => { if (!livePolicy) void cloud.attach(world).catch(error => useBrickStore.setState({ toast: String(error) })) }}
        onOpenWorld={async (document, world) => { if (livePolicy) { const userId = browserClassroomClient.getSession()?.user.id; if (userId) sessionStorage.setItem('brick-studio.active-cloud-world.v1', JSON.stringify({ userId, worldId: world.id })); window.location.assign('/build'); return }; await cloud.attach(world, document) }}
        onJoinWorld={async world => { const saved = await cloud.flush(); if (!saved && !window.confirm('Your latest edits are kept in this tab for recovery but are not saved online. Leave for the shared world?')) return; window.location.assign(`/live/${world.id.replaceAll('-', '')}`) }}
      />}
      {raceOverlay}
      {liveOverlay}
    </main>
  )
}
