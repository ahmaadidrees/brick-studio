import { normalizeCharacterAppearance, type CharacterAppearance } from '@brick-studio/core'
import { getBuildPlateSize, type BuildPlateSize } from './buildPlate'
import { ColorPalette, CommandStrip } from './CommandStrip'
import { SettingsSheet, StudioSettings } from './ExploreCameraSettings'
import { getExploreKeyboardHint } from './explorePreferences'
import {
  ArrowDownToLine,
  ArrowLeft,
  Box,
  Camera,
  Check,
  ChevronUp,
  Clipboard,
  ClipboardPaste,
  Copy,
  Cuboid,
  Focus,
  Home,
  Users,
  Layers3,
  MapPin,
  Move,
  MousePointer2,
  UserRound,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Redo2,
  RotateCcw,
  RotateCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import type { StudioDocumentCommands } from './StudioMenu'
import { AppHeader, WORLDS_PATH, classroomIntentRedirect, describeLivePresence, goToJoin, goToLiveWorld, goToNewLiveRoom, useClassroomSession, type LivePresence } from '../shell'
import { useBrickStore } from './store'
import { normalizeTouchStick } from './touchInput'
import type { CharacterId, CustomPartDefinition, EnvironmentId, ViewPreset } from './types'
import { useBrickStudioDocuments } from './useBrickStudioDocuments'
import { ClassroomPanel } from '../classroom/ClassroomPanel'
import { BUILD_PATH, parseClassroomEntryIntent, type ClassroomEntryIntent } from '../routes'
import { browserClassroomClient, ClassroomError } from '../classroom/client'
import { useClassroomWorld } from '../classroom/useClassroomWorld'
import type { ClassroomClassmate, ClassroomWorld, ClassroomWorldSharing } from '../classroom/contracts'
import { InviteSheet, inviteAudienceLabel } from '../classroom/InviteSheet'
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
import { BRICK_STUDIO_LOCAL_STORAGE_KEY, clearLocalBrickStudioProject, saveLocalBrickStudioProject } from './documentPersistence'
import './brick-studio.css'
import './touch-layout.css'
import './desktop-layout.css'
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
  /** Classroom rooms: who from the invited roster is here and who is still expected. */
  presence?: LivePresence
  /** Edits the room has not confirmed yet; the header must not present them as shared. */
  pendingOperations?: number
  /** Another tab or device took over this participant's connection. */
  sessionReplaced?: boolean
}

export type BrickStudioCustomPartPolicy = {
  customParts: CustomPartDefinition[]
  canEdit: boolean
  onAddPart?: (part: CustomPartDefinition) => boolean
  help?: string
  onReplaceDocument: (next: { bricks: BrickStudioDocument['bricks']; customParts: CustomPartDefinition[] }) => boolean
}

function useBuilderShortcuts(enabled = true, livePolicy?: BrickStudioLivePolicy) {
  useEffect(() => {
    if (!enabled) return
    const handler = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"][aria-modal="true"], dialog[open]')) return
      const target = event.target
      // Any dialog, modal or not (the strip's Color popover, the People panel), and anything marked
      // data-shortcut-pause own the keys while focus is inside them: Delete, R or ⌘D on a swatch must
      // not edit the build underneath. Escape never reaches here from the popover (it closes it first).
      if (target instanceof HTMLElement && target.closest('[data-shortcut-pause], [role="dialog"]')) return
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

const ACTIVE_CLOUD_WORLD_KEY = 'brick-studio.active-cloud-world.v1'
const AUTO_WORLD_TITLE = 'Untitled build'

/** A signed-in account that can own worlds right now (a forced password reset cannot save). */
function signedInUserId() {
  const session = browserClassroomClient.getSession()
  return session && !session.user.resetRequired ? session.user.id : null
}

/** True while this account still has a world to resume (an in-flight resume must not race a new world). */
function hasPendingCloudResume(userId: string) {
  try {
    const raw = sessionStorage.getItem(ACTIVE_CLOUD_WORLD_KEY)
    return raw !== null && (JSON.parse(raw) as { userId?: string }).userId === userId
  } catch { return false }
}

/** Header state while a fresh build is being created in the account, or after that failed. */
type AutoAccountSave = { status: 'idle' } | { status: 'saving' } | { status: 'error'; error: string; retryable: boolean }

/** The in-editor "Build together" sheet: which account world, whose classmates, and whether a request is in flight. */
type InviteSheetState = { world: ClassroomWorld; classId: string; classmates: ClassroomClassmate[] | null; classmatesError?: string; busy: boolean }

/** "Shared with Ben K. They can look…" — display names end in an initial's period, so never add a second one. */
function endSentence(text: string) {
  return text.endsWith('.') ? text : `${text}.`
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

// Narrow and portrait screens use the creative dock. Landscape touch tablets
// have room for a persistent palette without taking away the editing canvas.
function useCompactLayout() {
  const [queries] = useState(() => ['(max-width: 900px)', '(pointer: coarse)'].map((query) => window.matchMedia?.(query) ?? null))
  const matchesCompact = useCallback(() => {
    const touch = queries[1]?.matches ?? false
    // Landscape tablets retain a palette; narrow/portrait screens use the dock.
    const tabletPalette = touch && window.innerWidth >= 960 && window.innerHeight >= 600 && window.innerWidth > window.innerHeight
    return !tabletPalette && (queries.some((query) => query?.matches) || window.innerWidth <= 900)
  }, [queries])
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
    const label = count === undefined ? 'People' : `People, ${count} ${livePolicy.connection === 'online' ? 'here' : 'last seen'}`
    const summary = describeLivePresence(livePolicy.presence)
    const title = summary ? `${label}. ${summary}` : label
    return (
      <Button variant="quiet" className="brick-header-tool brick-people-entry" icon={<Users size={17} />} aria-label={title} title={title} onClick={livePolicy.onOpenPeople} disabled={!livePolicy.onOpenPeople}>
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

/** Guest drafts have no title field in the schema, so the header shows a neutral name, never the brand. */
const NEUTRAL_WORLD_TITLE = 'My build'

/** Board 15 read-only viewer chrome: the world is already in Explore; Make a copy starts a guest remix. */
function PublishedWorldBar({ title, onRemix }: { title?: string; onRemix?: () => void }) {
  return (
    <div className="published-world-bar" role="region" aria-label="Published world">
      <BrandLockup wordmark="never" size={28} className="published-world-mark" />
      <div className="published-world-heading"><span>Read-only world</span><strong title={title}>{title}</strong></div>
      <div className="published-world-actions">
        <StudioSettings />
        {onRemix && <Button variant="primary" className="published-world-remix" icon={<Copy size={16} />} onClick={onRemix} aria-label="Make a copy" title="Save a copy of this world as your guest build">Make a copy</Button>}
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

/** Top-left beside the drawer: history, the touch-only box-select tool and the capacity readout. */
function HistoryCluster() {
  const undo = useBrickStore((state) => state.undo)
  const redo = useBrickStore((state) => state.redo)
  const canUndo = useBrickStore((state) => state.undoStack.length > 0 && !state.graphicsPaused)
  const canRedo = useBrickStore((state) => state.redoStack.length > 0 && !state.graphicsPaused)
  const count = useBrickStore((state) => state.bricks.length)
  const budget = useBrickStore((state) => state.brickBudget)
  return <div className="brick-history-cluster" role="group" aria-label="Build tools">
    <div className="brick-history-tools" role="group" aria-label="Edit history">
      <button className="studio-icon-button" type="button" onClick={undo} disabled={!canUndo} aria-label="Undo" title="Undo (⌘Z)"><Undo2 size={18} aria-hidden="true" /><span>Undo</span></button>
      <button className="studio-icon-button" type="button" onClick={redo} disabled={!canRedo} aria-label="Redo" title="Redo (⇧⌘Z)"><Redo2 size={18} aria-hidden="true" /><span>Redo</span></button>
    </div>
    <SelectionModeControl />
    <span className="brick-capacity-status" aria-label={`${count} of ${budget} brick capacity`} title="Bricks placed of the current capacity">{count} / {budget}</span>
  </div>
}

type PartGridProps = {
  denseCatalog?: boolean
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

function PartGrid({ customParts, onChoose, onCreatePart, canCreatePart, customPartHelp, denseCatalog = false }: PartGridProps) {
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
      <div className="part-search-row">
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
      {denseCatalog && <select className="part-category-select" aria-label="Brick category" value={category} onChange={event => setCategory(event.target.value as PartCategory)}>{categories.map(entry => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select>}
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
      {!denseCatalog && <div className="part-categories" role="tablist" aria-label="Brick categories">
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
      </div>}
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
  const brushColor = useBrickStore((state) => state.activeColor)
  const setBrushColor = useBrushColor()
  return (
    <aside inert={graphicsPaused} className="part-library" id="brick-part-library" aria-label="Brick drawer">
      <div className="library-title">
        <h2 className="library-heading"><Box size={27} aria-hidden="true" />Bricks</h2>
        <button
          className="studio-icon-button library-collapse-button"
          type="button"
          aria-label="Collapse brick drawer"
          aria-controls="brick-part-library"
          aria-expanded="true"
          onClick={onCollapse}
        ><PanelLeftClose size={18} /></button>
      </div>
      <PartGrid {...gridProps} denseCatalog />
      <section className="library-colors">
        <label><Palette size={15} aria-hidden="true" /> Brush color</label>
        <ColorPalette targetColor={brushColor} onPick={setBrushColor} label="Brush color" />
      </section>
    </aside>
  )
}

/**
 * The drawer palette sets only the brush: the armed draft (or the group being moved) takes the
 * color through the store's brush path, but placed bricks are never recolored from here — the
 * command strip's Color popover owns selection recolor. Nothing here touches history.
 */
function useBrushColor() {
  return useCallback((color: string) => {
    const state = useBrickStore.getState()
    if (state.draft) state.setActiveColor(color)
    else useBrickStore.setState({ activeColor: color })
  }, [])
}

function BrickDrawerSheet(props: PartGridProps & { onClose: () => void }) {
  const { onClose } = props
  const [expanded, setExpanded] = useState(false)
  const brushColor = useBrickStore((state) => state.activeColor)
  const setBrushColor = useBrushColor()
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null
    panel.current?.focus({ preventScroll: true })
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
      restoreTo?.focus({ preventScroll: true })
    }
  }, [onClose])

  return (
    <>
      <div className="brick-sheet-backdrop" data-testid="brick-sheet-backdrop" onPointerDown={onClose} aria-hidden="true" />
      <div ref={panel} className={`brick-sheet${expanded ? ' brick-sheet-expanded' : ''}`} role="dialog" aria-modal="true" aria-labelledby="brick-sheet-title" tabIndex={-1}>
        <button type="button" className="brick-sheet-size" aria-label={expanded ? 'Make brick drawer smaller' : 'Expand brick drawer'} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span className="brick-sheet-grip" aria-hidden="true" /></button>
        <div className="library-title">
          <h2 className="library-heading" id="brick-sheet-title"><Box size={24} aria-hidden="true" />Bricks</h2>
          <button className="studio-icon-button" type="button" aria-label="Close brick drawer" onClick={onClose}><X size={18} /></button>
        </div>
        <PartGrid {...props} onChoose={onClose} />
        <section className="brick-sheet-colors">
          <label><Palette size={15} aria-hidden="true" /> Brush color</label>
          <ColorPalette targetColor={brushColor} onPick={setBrushColor} label="Brush color" />
        </section>
      </div>
    </>
  )
}

const CAMERA_VIEWS: { id: ViewPreset; label: string; title: string; icon: typeof Home }[] = [
  { id: 'top', label: 'Top', title: 'Look straight down', icon: ArrowDownToLine },
  { id: 'front', label: 'Front', title: 'Look from the front', icon: Cuboid },
  { id: 'perspective', label: '3D', title: 'Angled 3D view', icon: Box },
]

const SHORT_TOUCH_VIEWPORT = '(max-height: 600px) and (pointer: coarse)'

/**
 * Short touch screens (320×568, landscape phones) have no room for a four-button camera column
 * next to a command strip whose Adjust panel can take 280 px: the column collapses to one
 * "Camera" button and the four choices move into a popover under it.
 */
function useShortTouchViewport() {
  const [short, setShort] = useState(() => window.matchMedia?.(SHORT_TOUCH_VIEWPORT).matches ?? false)
  useEffect(() => {
    const query = window.matchMedia?.(SHORT_TOUCH_VIEWPORT)
    const update = () => setShort(query?.matches ?? false)
    update()
    query?.addEventListener?.('change', update)
    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    return () => {
      query?.removeEventListener?.('change', update)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
  return short
}

/** Bottom-right camera cluster: Frame plus the three view presets, pressed state from the last request. */
function CameraCluster() {
  const graphicsPaused = useBrickStore((state) => state.graphicsPaused)
  const preset = useBrickStore((state) => state.viewRequest.preset)
  const requestView = useBrickStore((state) => state.requestView)
  const collapsed = useShortTouchViewport()
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const cluster = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!collapsed) setOpen(false) }, [collapsed])
  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      event.stopPropagation()
      event.preventDefault()
      setOpen(false)
      trigger.current?.focus({ preventScroll: true })
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (cluster.current?.contains(event.target as Node)) return
      setOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape, true)
    window.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true)
      window.removeEventListener('pointerdown', closeOnOutsidePointer)
    }
  }, [open])
  const choose = (view: ViewPreset) => {
    requestView(view)
    if (!collapsed) return
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }
  const choices = (
    <>
      <button type="button" className="brick-camera-button brick-camera-frame" onClick={() => choose('home')} title="Frame the whole build (Home)" aria-label="Frame build"><Home size={18} aria-hidden="true" /><span>Frame</span></button>
      {CAMERA_VIEWS.map(({ id, label, title, icon: Icon }) => (
        <button key={id} type="button" className={`brick-camera-button${preset === id ? ' active' : ''}`} aria-pressed={preset === id} aria-label={`${label} view`} title={title} onClick={() => choose(id)}><Icon size={18} aria-hidden="true" /><span>{label}</span></button>
      ))}
    </>
  )
  if (!collapsed) {
    return (
      <div inert={graphicsPaused} className="brick-camera-cluster" role="group" aria-label="Camera view">{choices}</div>
    )
  }
  return (
    <div ref={cluster} inert={graphicsPaused} className="brick-camera-cluster brick-camera-cluster-collapsed" role="group" aria-label="Camera view">
      <button
        ref={trigger}
        type="button"
        className={`brick-camera-button brick-camera-toggle${open ? ' active' : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Camera"
        title="Camera views"
        onClick={() => setOpen((value) => !value)}
      ><Camera size={18} aria-hidden="true" /><span>Camera</span></button>
      {open && <div className="brick-camera-popover" data-shortcut-pause="">{choices}</div>}
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
      title="Select several bricks by dragging a box around them."
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

type BuildShellProps = {
  compact: boolean
  onOpenWorldSetup: (tab: 'environment' | 'character') => void
  customParts: CustomPartDefinition[]
  canEditCustomParts: boolean
  customPartHelp?: string
  onCreatePart: (definition: CustomPartDefinition) => boolean
  onResizeSelection: (delta: ResizeDelta) => boolean
}

function BuildShell({
  compact,
  onOpenWorldSetup,
  customParts,
  canEditCustomParts,
  customPartHelp,
  onCreatePart,
  onResizeSelection,
}: BuildShellProps) {
  const coarsePointer = useCoarsePointerPreference()
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
          {/* Scene and Character live in the header's "World tools" row; the dock keeps only the
              brick drawer, which the header has no equivalent for. */}
          <nav className="brick-creative-dock" aria-label="Creative tools">
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
          </nav>
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
      </>}
      <HistoryCluster />
      <CameraCluster />
      <CommandStrip coarsePointer={coarsePointer} onResize={openResize} />
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
  // Entry links carry `classroom=<intent>` and, for class invites, `classCode=`. Both are consumed
  // once here so neither lingers in the address bar; the code is handed to the panel as a prop.
  const [classroomEntry] = useState<{ intent: ClassroomEntryIntent | null; classCode?: string; worldId?: string; newBuild?: boolean }>(() => {
    const url = new URL(window.location.href)
    if (!url.searchParams.has('classroom') && !url.searchParams.has('classCode') && !url.searchParams.has('world') && !url.searchParams.has('new')) return { intent: null }
    // `/build?new=1` starts a fresh build: the current draft is cleared after the same confirm as the
    // New build menu item, and a previously open account world is not resumed on top of it.
    const newBuild = url.searchParams.get('new') === '1'
    if (newBuild) { try { sessionStorage.removeItem(ACTIVE_CLOUD_WORLD_KEY) } catch { /* nothing to resume */ } }
    // Consume the entry intent even when it is unknown so a mistyped link never lingers in the address bar.
    const intent = url.searchParams.has('classroom') ? parseClassroomEntryIntent(url.search) : null
    const classCode = url.searchParams.get('classCode')?.trim().slice(0, 40) || undefined
    // `/worlds` opens an account world with `/build?world=<id>` (own worlds only; shared worlds use /live).
    const worldId = url.searchParams.get('world')?.trim().slice(0, 80) || undefined
    const entrySearch = url.search
    url.searchParams.delete('classroom')
    url.searchParams.delete('classCode')
    url.searchParams.delete('world')
    url.searchParams.delete('new')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    // Flows v2: only `save` opens the in-editor sheet; worlds/class/join/signin/teacher are pages now
    // (W2's classroomIntentRedirect carries an invite class code through to /join).
    if (intent && intent !== 'save' && classroomIntentRedirect(intent, undefined, entrySearch)) return { intent: null, classCode, worldId, newBuild }
    return { intent, classCode, worldId, newBuild }
  })
  const [classroomIntent, setClassroomIntent] = useState<ClassroomEntryIntent | null>(classroomEntry.intent)
  const [inviteSheet, setInviteSheet] = useState<InviteSheetState | null>(null)
  const cloud = useClassroomWorld(!readOnly && !livePolicy)
  // Build together needs the student's class (classmates come from `/classes/<id>/classmates`) and its name for the sheet.
  const session = useClassroomSession()
  const studentClassId = session.status === 'student' ? session.classes?.[0]?.id : undefined
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
  const [settingsOpen, setSettingsOpen] = useState(false)
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
      // W5 widened the sheet's onApply to accept `{ ok: false, message }` so the rejection shows
      // inline beside the plate controls; the toast stays for hosts that ignore the return value.
      if (!resized.ok) { useBrickStore.setState({ toast: resized.error.message }); return { ok: false as const, message: resized.error.message } }
      const result = useBrickStore.getState().importDocument(JSON.stringify(resized.document), 'Resize build plate')
      if (!result.ok) return { ok: false as const, message: result.error.message }
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
    if (customPartPolicy && !(customPartPolicy.onAddPart ? customPartPolicy.onAddPart(definition) : customPartPolicy.onReplaceDocument({
      bricks: useBrickStore.getState().bricks,
      customParts: nextCustomParts,
    }))) {
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
  useBuilderShortcuts(!readOnly && !classroomIntent && !worldSetupOpen && !inviteSheet && (!livePolicy || livePolicy.connection === 'online'), livePolicy)
  useReactiveBrickBudget()
  useReducedMotionPreference()
  const mode = useBrickStore((state) => state.mode)
  const brickCount = useBrickStore((state) => state.bricks.length)
  const reducedMotion = useBrickStore((state) => state.reducedMotion)
  // Sheets and dialogs portal to <body>, so the in-app motion preference must reach the root as well.
  useEffect(() => {
    document.documentElement.classList.toggle('brick-reduced-motion', reducedMotion)
    return () => { document.documentElement.classList.remove('brick-reduced-motion') }
  }, [reducedMotion])
  const selectionMode = useBrickStore((state) => state.selectionMode)
  const compact = useCompactLayout()
  const onboarding = useBuilderOnboarding()
  /**
   * A signed-in builder's fresh build becomes an account world on its first placed brick or import, so
   * cloud autosave runs from then on without a Save step. A browser draft that already had bricks when
   * the editor opened (built while signed out) is left alone: it keeps the Save to my account flow.
   * Guests are untouched. If creation fails the draft stays in this browser and the header says so.
   */
  const [autoSave, setAutoSave] = useState<AutoAccountSave>({ status: 'idle' })
  const cloudRef = useRef(cloud)
  cloudRef.current = cloud
  const autoSaveRef = useRef(autoSave)
  autoSaveRef.current = autoSave
  // `/build?world=<id>` attaches asynchronously; until it settles no other world may be created.
  const entryWorldPending = useRef(false)
  // Attaching the new world re-runs the subscription effect below, so the in-flight state and the
  // unmount guard live for the component, not for one subscription.
  const creating = useRef(false)
  const unmounted = useRef(false)
  useEffect(() => () => { unmounted.current = true }, [])
  /**
   * Creates the account world for the current draft and attaches it; resolves null when that failed
   * (the header explains, and the draft stays in this browser). Shared by the first-brick auto-create
   * and by Build together on an unsaved fresh build.
   */
  const createAccountWorld = useCallback(async (): Promise<ClassroomWorld | null> => {
    creating.current = true
    setAutoSave({ status: 'saving' })
    const document = useBrickStore.getState().getDocumentSnapshot()
    const sent = JSON.stringify(document)
    try {
      const world = await browserClassroomClient.createWorld({ title: AUTO_WORLD_TITLE, document })
      if (unmounted.current) return null
      await cloudRef.current.attach(world)
      if (unmounted.current) return null
      // attach() rebuilds the brick array, so compare content: only edits made during the request need saving.
      if (JSON.stringify(useBrickStore.getState().getDocumentSnapshot()) !== sent) cloudRef.current.scheduleCurrent()
      // The draft was blank before this build, so the browser copy attach() preserved is not a
      // separate build; the account now owns it.
      clearLocalBrickStudioProject(localStorage)
      setAutoSave({ status: 'idle' })
      return world
    } catch (reason) {
      if (unmounted.current) return null
      const message = reason instanceof Error ? reason.message : 'Could not save this build to your account.'
      const retryable = reason instanceof ClassroomError && reason.status === 0
      setAutoSave({ status: 'error', retryable, error: `${message} This build stays in this browser for now. Use Save this build to my account to try again.` })
      return null
    } finally { creating.current = false }
  }, [])
  /**
   * Build together (mock board "Owner lands in the room"). A signed-in student on an account world
   * invites classmates through the one InviteSheet and lands in the world's live room; an unsaved
   * fresh build becomes an account world first. Guests and teachers keep the seeded /live/new room.
   */
  // The latest sharing the server confirmed, so reopening the sheet preloads audience and picks.
  const sharedWorld = useRef<ClassroomWorld | null>(null)
  const openInviteSheet = useCallback((world: ClassroomWorld, classId: string) => {
    const current = sharedWorld.current?.id === world.id ? sharedWorld.current : world
    setInviteSheet({ world: current, classId, classmates: null, busy: false })
    const forThisWorld = (update: (sheet: InviteSheetState) => InviteSheetState) => setInviteSheet(sheet => sheet && sheet.world.id === world.id ? update(sheet) : sheet)
    browserClassroomClient.request<{ classmates: ClassroomClassmate[] }>(`/classes/${classId}/classmates`)
      .then(result => forThisWorld(sheet => ({ ...sheet, classmates: result.classmates })))
      .catch(reason => forThisWorld(sheet => ({ ...sheet, classmates: [], classmatesError: reason instanceof Error ? reason.message : 'Could not load your classmates. Try again.' })))
  }, [])
  const patchSharing = useCallback(async (sheet: InviteSheetState, sharing: ClassroomWorldSharing) => {
    setInviteSheet({ ...sheet, busy: true })
    try {
      if (!await cloud.flush()) {
        useBrickStore.setState({ toast: 'Your account world is still saving. Wait for it to save, then start Build together again.' })
        setInviteSheet(current => current ? { ...current, busy: false } : current)
        return null
      }
      const result = await browserClassroomClient.request<{ world: ClassroomWorld }>(`/worlds/${sheet.world.id}/sharing`, 'PATCH', sharing)
      sharedWorld.current = result.world
      return result.world
    } catch (reason) {
      useBrickStore.setState({ toast: reason instanceof Error ? reason.message : 'Could not share this world. Try again.' })
      setInviteSheet(current => current ? { ...current, busy: false } : current)
      return null
    }
  }, [cloud])
  const submitInvite = async (sharing: ClassroomWorldSharing) => {
    const sheet = inviteSheet
    if (!sheet || sheet.busy) return
    const world = await patchSharing(sheet, sharing)
    if (!world) return
    // Building together: the owner goes into the room the friends' "Join and build" opens. The sheet
    // stays busy while the page navigates away.
    if (sharing.canEdit) { goToLiveWorld(world.id, { invited: true }); return }
    useBrickStore.setState({ toast: `${endSentence(`Shared with ${inviteAudienceLabel(sharing, sheet.classmates ?? [])}`)} They can look from their Worlds page.` })
    setInviteSheet(null)
  }
  const stopSharing = async () => {
    const sheet = inviteSheet
    if (!sheet || sheet.busy) return
    const world = await patchSharing(sheet, { visibility: 'private', canEdit: false })
    if (!world) return
    useBrickStore.setState({ toast: 'Stopped sharing. Only you can open this world now.' })
    setInviteSheet(null)
  }
  const startCurrentWorldLive = useCallback(() => {
    void (async () => {
      try {
        if (cloud.world) {
          if (!await cloud.flush()) {
            useBrickStore.setState({ toast: 'Your account world is still saving. Wait for it to save, then start Build together again.' })
            return
          }
        }
        const userId = signedInUserId()
        if (studentClassId && userId) {
          let world = cloud.world
          if (!world) {
            if (creating.current || entryWorldPending.current || hasPendingCloudResume(userId)) {
              useBrickStore.setState({ toast: 'Your build is still being saved to your account. Try Build together again in a moment.' })
              return
            }
            world = await createAccountWorld()
            if (!world) {
              useBrickStore.setState({ toast: 'Could not save this build to your account, so it cannot be shared yet. Try again in a moment.' })
              return
            }
          }
          if (world.kind === 'personal') { openInviteSheet(world, studentClassId); return }
        }
        const document = useBrickStore.getState().getDocumentSnapshot()
        if (!cloud.world) {
          const saved = saveLocalBrickStudioProject(window.localStorage, document)
          if (!saved.ok) throw new Error(saved.error.message)
        }
        saveLiveWorldSeed(document)
        goToNewLiveRoom()
      } catch (reason) {
        useBrickStore.setState({ toast: reason instanceof Error ? reason.message : 'Could not prepare your build. Export a copy before trying again.' })
      }
    })()
  }, [cloud, studentClassId, createAccountWorld, openInviteSheet])
  const documentCommands = useBrickStudioDocuments({
    onNewBuild: onNewBuild ?? (cloud.world ? () => { void (async () => {
      if (!window.confirm('Start a new build? Your current world stays saved in your account.')) return
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
  // `/build?new=1`: the draft is loaded by the effect above, so the confirm sees the real build. A blank
  // draft needs no confirm. The guest path of onNewBuild owns the message; the cloud path never applies
  // here because the entry parser dropped the resume key before any world could attach.
  const newBuildCommand = useRef(documentCommands.onNewBuild)
  newBuildCommand.current = documentCommands.onNewBuild
  const newBuildEntryHandled = useRef(false)
  useEffect(() => {
    if (!classroomEntry.newBuild || readOnly || livePolicy || newBuildEntryHandled.current) return
    newBuildEntryHandled.current = true
    if (useBrickStore.getState().bricks.length > 0) newBuildCommand.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Any attached world (automatic or from the save sheet) supersedes an earlier automatic-save failure.
  useEffect(() => { if (cloud.world) setAutoSave({ status: 'idle' }) }, [cloud.world])
  const autoCreateEnabled = !readOnly && !livePolicy && !cloud.world
  useEffect(() => {
    if (!autoCreateEnabled) return
    const unsubscribe = useBrickStore.subscribe((state, previous) => {
      if (state.bricks === previous.bricks || state.bricks.length === 0 || creating.current || cloudRef.current.world) return
      const userId = signedInUserId()
      if (!userId || entryWorldPending.current || hasPendingCloudResume(userId)) return
      const current = autoSaveRef.current
      // First bricks on a blank plate start a world; after a connection failure any later edit retries.
      const firstEdit = previous.bricks.length === 0
      if (!firstEdit && !(current.status === 'error' && current.retryable)) return
      void createAccountWorld()
    })
    return unsubscribe
  }, [autoCreateEnabled, createAccountWorld])
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
      detail: livePolicy.sessionReplaced
        ? 'This room is open in another tab or device. Building is paused here.'
        : livePolicy.connection === 'online' && (livePolicy.pendingOperations ?? 0) > 0
          ? `${livePolicy.pendingOperations} ${livePolicy.pendingOperations === 1 ? 'change is' : 'changes are'} still waiting for the room to confirm.`
          : livePolicy.connection === 'online' ? 'Changes are shared with everyone in this world as you make them.' : 'The shared world connection and recovery details appear in the live session controls.',
    }
    : cloud.world
      ? {
        source: { kind: 'cloud', status: cloud.status },
        detail: cloud.status === 'saved' ? 'Your latest changes are saved to your account.' : cloud.status === 'error' ? cloud.error || 'Your latest changes are not saved online. Use the recovery controls before leaving.' : 'Your latest changes are not saved online yet. Keep this tab open.',
      }
      : autoSave.status === 'saving'
        ? { source: { kind: 'cloud', status: 'saving' }, detail: 'Creating a world in your account for this build.' }
        : autoSave.status === 'error'
          ? { source: { kind: 'local', error: autoSave.error }, detail: autoSave.error }
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
  /**
   * The one way a cloud world enters this editor: the save sheet's Open and `/build?world=<id>`
   * both land here. Inside a live room the world is handed to a fresh /build via the active-world key.
   */
  const openCloudWorld = useCallback(async (document: BrickStudioDocument, world: ClassroomWorld) => {
    if (livePolicy) {
      const userId = browserClassroomClient.getSession()?.user.id
      if (userId) sessionStorage.setItem(ACTIVE_CLOUD_WORLD_KEY, JSON.stringify({ userId, worldId: world.id }))
      window.location.assign('/build')
      return
    }
    await cloud.attach(world, document)
  }, [cloud, livePolicy])
  const [worldUnavailable, setWorldUnavailable] = useState(false)
  const entryWorldId = readOnly ? undefined : classroomEntry.worldId
  entryWorldPending.current = Boolean(entryWorldId) && !cloud.world && !worldUnavailable
  useEffect(() => {
    if (!entryWorldId) return
    // Signed out: sign in first, then come straight back to this world.
    if (!browserClassroomClient.getSession()) {
      goToJoin({ mode: 'signin', next: `${BUILD_PATH}?world=${encodeURIComponent(entryWorldId)}` })
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const world = await browserClassroomClient.getWorld(entryWorldId)
        if (cancelled) return
        if (!world.document) throw new Error('This world did not include a complete build.')
        await openCloudWorld(world.document, world)
      } catch {
        // Unknown, hidden, unshared or someone else's world: keep the current build and say so.
        if (!cancelled) setWorldUnavailable(true)
      }
    })()
    return () => { cancelled = true }
    // The entry id is read once on mount; openCloudWorld is stable for the session it belongs to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryWorldId])
  const renameWorld = cloud.world ? async (title: string) => {
    const world = cloud.world
    if (!world) return
    if (!await cloud.flush()) throw new Error('Your latest changes are still saving. Wait for the save to finish, then rename again.')
    const renamed = await browserClassroomClient.request<{ world: ClassroomWorld }>(`/worlds/${world.id}`, 'PATCH', { title })
    if (cloud.world?.id === renamed.world.id) await cloud.reload()
  } : undefined
  return (
    <main className={`brick-studio${compact ? ' brick-compact-layout' : ''}${showOnboarding ? ' brick-onboarding-open' : ''} brick-mode-${mode}${reducedMotion ? ' brick-reduced-motion' : ''}${selectionMode ? ' brick-select-mode' : ''}${livePolicy ? ' brick-live-session' : ''}`}>
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
        <AppHeader
          variant="editor"
          {...documentCommands}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenHelp={onboarding.reopen}
          worldTitle={cloud.world?.title}
          onRenameWorld={renameWorld}
          saveStatus={saveStatus}
          onOpenWorldSetup={openWorldSetup}
          livePolicy={livePolicy}
          mode={mode}
          onRequestMode={(next) => {
            if (livePolicy) livePolicy.onRequestMode(next)
            else if (next === 'explore') requestExploreMode()
            else useBrickStore.getState().setMode('build')
          }}
          canExplore={brickCount > 0}
          exploreReason="Place a brick first, then explore."
          onSaveToAccount={cloud.world || livePolicy || autoSave.status === 'saving' ? undefined : () => setClassroomIntent('save')}
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
            onOpenWorldSetup={openWorldSetup}
            customParts={customParts}
            canEditCustomParts={canEditCustomParts}
            customPartHelp={customPartHelp}
            onCreatePart={createCustomPart}
            onResizeSelection={resizeSelection}
          />
          {showOnboarding && <OnboardingGuide onDismiss={onboarding.dismiss} />}
        </>
      ) : <TouchExploreControlsGate readOnly={readOnly || Boolean(livePolicy && (!livePolicy.isOwner || livePolicy.connection !== 'online'))} />}
      <Toast />
      <Announcer />
      {!readOnly && <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
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
      {worldUnavailable && <div className="classroom-recovery brick-world-unavailable" role="alert"><span>That world isn't available. It may have been removed, hidden by your teacher, or belong to another account.</span><a className="brick-world-unavailable-link" href={WORLDS_PATH}>Back to My worlds</a><button type="button" onClick={() => setWorldUnavailable(false)}>Keep building</button></div>}
      {(cloud.error || cloud.recovery) && <div className="classroom-recovery" role="alert"><span>{cloud.error || 'Your recovered changes are open in the editor.'}</span><button onClick={cloud.downloadRecovery}>Download recovery copy</button>{cloud.world && <><button onClick={() => void cloud.retry()}>Retry save</button><button onClick={() => { if (window.confirm('Replace your unsaved changes with the account’s saved version? Download a recovery copy first if you want to keep them.')) void cloud.reload().catch(error => useBrickStore.setState({ toast: String(error) })) }}>Reload saved world</button></>}</div>}
      {inviteSheet && <InviteSheet
        world={inviteSheet.world}
        className={session.className ?? 'your class'}
        classmates={inviteSheet.classmates}
        classmatesError={inviteSheet.classmatesError}
        busy={inviteSheet.busy}
        onInvite={sharing => { void submitInvite(sharing) }}
        onStopSharing={inviteSheet.world.visibility !== 'private' ? () => { void stopSharing() } : undefined}
        onClose={() => { if (!inviteSheet.busy) setInviteSheet(null) }}
      />}
      {classroomIntent && <ClassroomPanel
        intent={classroomIntent}
        invitedClassCode={classroomEntry.classCode}
        getDocument={() => useBrickStore.getState().getDocumentSnapshot()}
        onClose={closeClassroom}
        beforeWorldMutation={cloud.flush}
        onWorldUpdated={world => { if (cloud.world?.id === world.id) void cloud.reload().catch(error => useBrickStore.setState({ toast: String(error) })) }}
        onSaved={world => { if (!livePolicy) void cloud.attach(world).catch(error => useBrickStore.setState({ toast: String(error) })) }}
        onOpenWorld={openCloudWorld}
        onJoinWorld={async world => { const saved = await cloud.flush(); if (!saved && !window.confirm('Your latest edits are kept in this tab for recovery but are not saved online. Leave for the shared world?')) return; window.location.assign(`/live/${world.id.replaceAll('-', '')}`) }}
      />}
      {raceOverlay}
      {liveOverlay}
    </main>
  )
}
