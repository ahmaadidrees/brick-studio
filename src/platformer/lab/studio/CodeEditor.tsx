import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import * as En from 'blockly/msg/en'

Blockly.setLocale(En as unknown as Record<string, string>)
import type { StudioStore } from './store'
import { STAGE_ID } from './store'
import type { Diagnostic } from '../core/editor/compile'
import { registerEditorBlocks } from '../core/editor/definitions'
import { setEditorContext } from '../core/editor/context'
import { createContinuousToolbox, myBlocksFlyout, registerToolboxPlugins } from '../core/editor/toolbox'
import { buildEditorContext } from './code/context'
import { CODE_DARK_THEME, CODE_LIGHT_THEME } from './code/codeTheme'
import { VariableModal } from './code/VariableModal'
import { ProcedureModal, type ProcedureData } from './code/ProcedureModal'
import { DiagnosticsList, formatKidDiagnostic } from './code/DiagnosticsList'
import { EditorToolbar } from './code/EditorToolbar'
import { DockedEditorToolbar } from './code/DockedEditorToolbar'
import { focusedMyBlocksFlyout } from './code/focusedPalette'
import { LayerBar } from './code/LayerBar'
import { installTouchPaletteScroll } from './code/touchFlyout'
import { fillEmptySlots, refillUnpluggedSlot, slotShadowsFromToolbox } from './code/slotShadows'
import { RenameVariableModal, VariableNoticeModal } from './code/VariableDialogs'
import { refreshVariableFields, renameInWorkspace, variableNameProblem, variableUses, workspaceUsesVariable, type VariableKind } from './code/variables'
import type { EditorContext } from '../core/editor/context'
import { PlainScratchCard } from './code/PlainScratchCard'
import {
  applyView,
  attachAffordances,
  cleanUpShown,
  focusView,
  foldLongDefinitions,
  hasDefinition,
  isShownIn,
  listDefinitions,
  PackedLayout,
  renderLabels,
  SectionTracker,
  setWorkspaceHandlers,
  tidyIfOverlapping,
  undoState,
  untrackHidden,
} from './code/affordances'
import { back, currentProccode, currentSection, drillInto, isTop, openSection, pruneMissing, TOP_VIEW, type LayerState } from './code/layers'
import { sectionEntries, sectionsForBrick, sectionTitle, type SectionEntry } from './code/sections'
import './code/code.css'
import './code/light.css'

/** The open palette (if any) redraws, so its variable menus and blocks are up to date. */
function refreshPalette(ws: Blockly.WorkspaceSvg): void {
  ws.getToolbox()?.refreshSelection()
}

export interface CodeEditorProps {
  store: StudioStore
  docked?: boolean
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ store, docked = false }) => {
  // Subscribe to store state
  const state = useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getState(),
  )

  const selectedBrickId = state.selectedBrickId
  const isStage = selectedBrickId === STAGE_ID
  const brick = store.brick(selectedBrickId)
  const targetName = isStage ? 'Stage' : brick?.name ?? 'Brick'

  // Host element ref for Blockly injection
  const hostRef = useRef<HTMLDivElement | null>(null)
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null)
  const isDisposedRef = useRef<boolean>(true)
  const brickIdRef = useRef<string>(selectedBrickId)
  brickIdRef.current = selectedBrickId
  // The brick the mounted workspace belongs to. Saves must go here, never to the current selection: when the kid opens
  // another brick, the selection changes before the old workspace is flushed and disposed, and saving by selection wrote
  // the old brick's code over the new brick's.
  const workspaceBrickIdRef = useRef<string>(selectedBrickId)
  const workspaceResetRevisionRef = useRef(state.editorResetRevision)

  // True when this brick's saved blocks could not be loaded into the editor. Nothing may be saved for the brick until a
  // load succeeds: the editor holds an empty workspace, and saving it would wipe the brick's code.
  const loadBlockedRef = useRef<boolean>(false)
  const [loadFailed, setLoadFailed] = useState<boolean>(false)

  // Debounced save timer
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Modals state
  const [varModalMode, setVarModalMode] = useState<'variable' | 'list' | null>(null)
  const [procModalOpen, setProcModalOpen] = useState<boolean>(false)
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true)
  // The variable menu's Rename / Delete, and what the kid is asked or told about it.
  const [renaming, setRenaming] = useState<{ id: string; name: string; kind: VariableKind } | null>(null)
  const [variableNotice, setVariableNotice] = useState<{ title: string; message: string; confirm?: { text: string; run: () => void } } | null>(null)
  const ctxRef = useRef<EditorContext | null>(null)
  const variableMenuRef = useRef<(action: 'rename' | 'delete', id: string) => void>(() => {})

  // Layered view: top scripts, or drilled into a My Block definition. And the open "plain Scratch" card.
  const [view, setView] = useState<LayerState>(TOP_VIEW)
  const viewRef = useRef<LayerState>(TOP_VIEW)
  const [definitions, setDefinitions] = useState<string[]>([])
  // A brick's folded sections ("How I move") and which script is in which; the packed drawing of the layer on screen.
  const sectionsRef = useRef<SectionTracker>(new SectionTracker([]))
  const layoutRef = useRef<PackedLayout | null>(null)
  const [sections, setSections] = useState<SectionEntry[]>([])
  const [undoable, setUndoable] = useState({ canUndo: false, canRedo: false })
  const [card, setCard] = useState<{ opcode: string; blockText: string } | null>(null)

  // Diagnostics for current brick
  const diagnostics: Diagnostic[] = state.diagnostics[selectedBrickId] ?? []

  // Count knobs for current brick
  const knobsCount = !isStage
    ? (brick?.program?.variables ?? []).filter((v) => v.showInBuild).length
    : 0

  // What the editor saves: the workspace, with any stack drawn packed (PackedLayout) at its saved place.
  const serialize = (ws: Blockly.WorkspaceSvg) => {
    const json = Blockly.serialization.workspaces.save(ws)
    return layoutRef.current?.workspace === ws ? layoutRef.current.toSaved(json) : json
  }

  // Flush any pending debounced save
  const flushSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
      const ws = workspaceRef.current
      if (workspaceResetRevisionRef.current !== store.getState().editorResetRevision) return
      if (ws && !isDisposedRef.current && !loadBlockedRef.current) {
        store.setWorkspace(workspaceBrickIdRef.current, serialize(ws))
      }
    }
  }

  // Save workspace immediately
  const saveWorkspaceNow = (ws: Blockly.WorkspaceSvg) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    if (loadBlockedRef.current || workspaceResetRevisionRef.current !== store.getState().editorResetRevision) return
    store.setWorkspace(workspaceBrickIdRef.current, serialize(ws))
  }

  // Draw a layer: only its stacks shown; a brick with sections draws its top view or a section packed together.
  const showLayer = (ws: Blockly.WorkspaceSvg, layer: LayerState) => {
    const { sectionOf, sections: brickSections } = sectionsRef.current
    const layout = layoutRef.current?.workspace === ws ? layoutRef.current : null
    layout?.unpack()
    applyView(ws, layer, sectionOf)
    if (layout && brickSections.length && currentProccode(layer) === null) {
      layout.pack(ws.getTopBlocks(false).filter((b) => isShownIn(b, layer, sectionOf)))
    }
    focusView(ws, layer, sectionOf)
  }

  // Show a layer: open a section, drill into a definition, go back, or return to the top. Nothing here changes the saved code.
  const navigate = (next: LayerState) => {
    const ws = workspaceRef.current
    if (!ws || isDisposedRef.current) return
    const valid = pruneMissing(next, (code) => hasDefinition(ws, code), (id) => sectionsRef.current.sections.some((s) => s.id === id))
    viewRef.current = valid
    setView(valid)
    Blockly.hideChaff()
    showLayer(ws, valid)
  }
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate

  // Mount Blockly workspace whenever selectedBrickId changes
  useEffect(() => {
    const container = hostRef.current
    if (!container) return

    // 1. Flush any pending save from previous brick
    flushSave()

    // 2. Dispose previous workspace cleanly
    if (workspaceRef.current && !isDisposedRef.current) {
      isDisposedRef.current = true
      workspaceRef.current.dispose()
      workspaceRef.current = null
    }
    container.innerHTML = ''

    // 3. Register plugins and block definitions
    registerToolboxPlugins()
    installTouchPaletteScroll()
    // Menus read the open workspace's own variables, so a new or renamed variable shows at once.
    const ctx = buildEditorContext(store, {
      variables: () => {
        const live = workspaceRef.current
        if (!live || isDisposedRef.current) return []
        return live.getVariableMap().getAllVariables().map((v) => ({ id: v.getId(), name: v.getName(), type: v.getType() }))
      },
      onVariableMenu: (action, id) => variableMenuRef.current(action, id),
    })
    ctxRef.current = ctx
    setEditorContext(ctx)
    registerEditorBlocks(ctx)
    attachAffordances()

    // 4. Configure continuous toolbox (filter Motion if stage selected)
    const toolboxDef = createContinuousToolbox(ctx, { isStage })
    const slotShadows = slotShadowsFromToolbox(toolboxDef)
    const variableValue = (id: string) => ctx.getVariables?.().find((v) => v.id === id)?.value

    // 5. Inject Blockly workspace
    const ws = Blockly.inject(container, {
      toolbox: toolboxDef,
      renderer: 'zelos',
      theme: docked ? CODE_LIGHT_THEME : CODE_DARK_THEME,
      grid: {
        spacing: 24,
        length: 3,
        colour: docked ? '#e9e4d8' : '#2a2e38',
        snap: false,
      },
      zoom: {
        controls: false,
        wheel: true,
        // Tablets and a Duo opened up show more of the script at a slightly smaller size.
        startScale: typeof window !== 'undefined' && window.innerWidth < 1024 ? 0.72 : 0.85,
        maxScale: 2,
        minScale: docked ? 0.65 : 0.4,
        scaleSpeed: 1.1,
      },
      trashcan: true,
      sounds: false,
      plugins: docked ? {} : {
        toolbox: 'ContinuousToolbox',
        flyoutsVerticalToolbox: 'ContinuousFlyout',
        metricsManager: 'ContinuousMetrics',
      },
      move: {
        scrollbars: true,
        drag: true,
        wheel: true,
      },
    })
    workspaceRef.current = ws
    // Dev only: the console can reach the open workspace (window.__codeWorkspace) while testing.
    if (import.meta.env.DEV) (window as unknown as { __codeWorkspace?: Blockly.WorkspaceSvg }).__codeWorkspace = ws
    workspaceBrickIdRef.current = selectedBrickId
    workspaceResetRevisionRef.current = state.editorResetRevision
    isDisposedRef.current = false

    // 6. Register toolbox button callbacks
    ws.registerButtonCallback('MAKE_A_VARIABLE', () => {
      setVarModalMode('variable')
    })
    ws.registerButtonCallback('MAKE_A_LIST', () => {
      setVarModalMode('list')
    })
    ws.registerButtonCallback('MAKE_A_PROCEDURE', () => {
      setProcModalOpen(true)
    })

    // 7. Register dynamic flyout category callback for My Blocks (PROCEDURE)
    ws.registerToolboxCategoryCallback('PROCEDURE', (targetWs: Blockly.WorkspaceSvg) => {
      const items = docked
        ? focusedMyBlocksFlyout(targetWs, (code) => navigateRef.current(drillInto(viewRef.current, code)))
        : myBlocksFlyout(targetWs)
      return items as unknown as Blockly.utils.toolbox.FlyoutDefinition
    })

    // The toolbox draws its first category as soon as it is injected, before the callback above exists: that first
    // draw would list Blockly's own My Blocks (the plugin's "to do something"). Draw it again with ours.
    ws.getToolbox()?.refreshSelection()

    // 8. Load workspace for this brick
    loadBlockedRef.current = false
    setLoadFailed(false)
    const savedWorkspace = store.getState().project.workspaces[selectedBrickId]
    if (savedWorkspace) {
      try {
        const wsData = typeof savedWorkspace === 'string' ? JSON.parse(savedWorkspace) : savedWorkspace
        Blockly.serialization.workspaces.load(wsData, ws)
      } catch (err) {
        console.error('Failed to load workspace:', err)
        // Keep the brick's saved code exactly as it is: block every save from this editor until a load works.
        loadBlockedRef.current = true
        setLoadFailed(true)
        ws.clear()
      }
    } else {
      // Ensure declared variables exist in workspace
      const currentBrick = store.brick(selectedBrickId)
      const vm = ws.getVariableMap()
      if (currentBrick?.program?.variables) {
        for (const v of currentBrick.program.variables) {
          if (!vm.getVariableById(v.id)) {
            vm.createVariable(v.name, '', v.id)
          }
        }
      }
      if (currentBrick?.program?.lists) {
        for (const l of currentBrick.program.lists) {
          if (!vm.getVariableById(l.id)) {
            vm.createVariable(l.name, 'list', l.id)
          }
        }
      }
    }

    // Slots emptied before this fix (a reporter pulled out) get a number to type into again.
    if (!loadBlockedRef.current) fillEmptySlots(ws, slotShadows)

    if (docked) ws.getToolbox()?.clearSelection()
    foldLongDefinitions(ws)
    ws.getToolbox()?.refreshSelection() // calls for the definitions that just loaded
    if (docked) ws.getToolbox()?.clearSelection()

    // 8b. Layered view: scripts on top, My Block definitions and sections out of the way; magnifiers open definitions and cards
    viewRef.current = TOP_VIEW
    setView(TOP_VIEW)
    setCard(null)
    const tracker = new SectionTracker(isStage ? [] : sectionsForBrick(store.brick(selectedBrickId)))
    sectionsRef.current = tracker
    layoutRef.current = new PackedLayout(ws)
    setWorkspaceHandlers(ws, {
      drill: (code) => navigateRef.current(drillInto(viewRef.current, code)),
      explain: (opcode, blockText) => setCard({ opcode, blockText }),
    })
    const syncDefinitions = () => {
      const codes = listDefinitions(ws).map((d) => d.proccode)
      setDefinitions((prev) => (prev.join('\n') === codes.join('\n') ? prev : codes))
      const entries = sectionEntries(tracker.sections, ws.getTopBlocks(false).map(tracker.sectionOf))
      setSections((prev) => (JSON.stringify(prev) === JSON.stringify(entries) ? prev : entries))
    }
    const showTopView = () => {
      if (isDisposedRef.current || workspaceRef.current !== ws) return
      // Rendered sizes are known now: if scripts or labels overlap, arrange them like Scratch's "Clean up".
      if (tidyIfOverlapping(ws, tracker.sectionOf)) saveWorkspaceNow(ws)
      renderLabels(ws)
      syncDefinitions()
      showLayer(ws, viewRef.current)
      // Blockly re-adds the loaded blocks to its connection lookup 1 ms after loading: take the hidden ones out again.
      setTimeout(() => {
        if (!isDisposedRef.current && workspaceRef.current === ws) untrackHidden(ws, viewRef.current, tracker.sectionOf)
      }, 2)
    }
    setUndoable({ canUndo: false, canRedo: false })
    syncDefinitions()
    applyView(ws, TOP_VIEW, tracker.sectionOf)
    renderLabels(ws)
    Promise.resolve(Blockly.renderManagement.finishQueuedRenders()).then(showTopView, showTopView)

    // 9. Change listener with debounced save (~300ms), skipping UI-only events
    const changeListener = (event: Blockly.Events.Abstract) => {
      // Layered view upkeep (labels, the My Blocks shelf, a definition deleted while drilled in)
      if (!event.isUiEvent && event.type !== Blockly.Events.FINISHED_LOADING) {
        // A reporter pulled out of a slot leaves a number to type into (the variable's own number, if it had one).
        refillUnpluggedSlot(ws, event, slotShadows, variableValue)
        if (event.type === Blockly.Events.VAR_RENAME) refreshVariableFields(ws, (event as Blockly.Events.VarRename).varId ?? '')
        if (event.type === Blockly.Events.VAR_CREATE || event.type === Blockly.Events.VAR_DELETE || event.type === Blockly.Events.VAR_RENAME) {
          refreshPalette(ws)
        }
        // A script made, or pulled out of another, while a section is open stays in that section for this visit.
        if (event.type === Blockly.Events.BLOCK_CREATE || event.type === Blockly.Events.BLOCK_MOVE) {
          const id = (event as Blockly.Events.BlockBase).blockId ?? ''
          const moved = ws.getBlockById(id)
          if (moved && !moved.getParent()) {
            if (event.type === Blockly.Events.BLOCK_CREATE || (event as Blockly.Events.BlockMove).oldParentId) tracker.pin(id, currentSection(viewRef.current))
          } else if (moved) {
            tracker.pin(id, null)
            layoutRef.current?.forget(id)
          }
        }
        renderLabels(ws)
        syncDefinitions()
        if (event.type === Blockly.Events.BLOCK_CREATE && (event as Blockly.Events.BlockCreate).ids?.length) {
          const created = ws.getBlockById((event as Blockly.Events.BlockCreate).blockId ?? '')
          if (created?.type === 'procedures_definition') applyView(ws, viewRef.current, tracker.sectionOf)
        }
        if (event.type === Blockly.Events.BLOCK_DELETE && viewRef.current.stack.length) {
          const kept = pruneMissing(viewRef.current, (code) => hasDefinition(ws, code))
          if (kept !== viewRef.current) queueMicrotask(() => navigateRef.current(kept))
        }
      }
      // Nothing may snap into a stack that is out of view (Blockly re-adds loaded blocks to its lookup a moment later).
      if (event.type === Blockly.Events.BLOCK_DRAG && (event as Blockly.Events.BlockDrag).isStart) untrackHidden(ws, viewRef.current, tracker.sectionOf)
      const u = undoState(ws)
      setUndoable((prev) => (prev.canUndo === u.canUndo && prev.canRedo === u.canRedo ? prev : u))
      // Skip UI events
      if (event.isUiEvent) return
      if (event.type === Blockly.Events.FINISHED_LOADING) return
      if (event.type === Blockly.Events.VIEWPORT_CHANGE) return
      if (event.type === Blockly.Events.SELECTED) return
      if (event.type === Blockly.Events.CLICK) return
      if (event.type === Blockly.Events.THEME_CHANGE) return
      if (event.type === Blockly.Events.BLOCK_DRAG && (event as unknown as { isStart?: boolean }).isStart) return

      // Debounce save
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = setTimeout(() => {
        saveTimeoutRef.current = null
        if (!isDisposedRef.current && !loadBlockedRef.current && workspaceResetRevisionRef.current === store.getState().editorResetRevision) {
          store.setWorkspace(workspaceBrickIdRef.current, serialize(ws))
        }
      }, 300)
    }

    ws.addChangeListener(changeListener)
    const unsubscribeBeforeRun = store.onBeforeRun(flushSave)

    // Resize workspace to fit container
    Blockly.svgResize(ws)
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      if (!isDisposedRef.current && workspaceRef.current === ws) Blockly.svgResize(ws)
    }) : null
    resizeObserver?.observe(container)

    return () => {
      unsubscribeBeforeRun()
      resizeObserver?.disconnect()
      flushSave()
      setWorkspaceHandlers(ws, null)
      ws.removeChangeListener(changeListener)
      isDisposedRef.current = true
      ws.dispose()
      workspaceRef.current = null
    }
  }, [selectedBrickId, isStage, store, state.editorResetRevision, docked])

  // Update block warning badges when diagnostics change
  useEffect(() => {
    const ws = workspaceRef.current
    if (!ws || isDisposedRef.current) return

    const warningMap = new Map<string, string[]>()
    for (const d of diagnostics) {
      if (d.blockId) {
        const list = warningMap.get(d.blockId) ?? []
        const { title, hint } = formatKidDiagnostic(d)
        list.push(`${title}: ${hint}`)
        warningMap.set(d.blockId, list)
      }
    }

    for (const block of ws.getAllBlocks(false)) {
      const msgs = warningMap.get(block.id)
      if (msgs && msgs.length > 0) {
        block.setWarningText(msgs.join('\n'))
      } else {
        block.setWarningText(null)
      }
    }
  }, [diagnostics])

  // Capture actual execution, including short-lived statements that finish between draws.
  // Collect three 30Hz ticks into one 10Hz visual update; looking inside never changes scheduling.
  useEffect(() => {
    const runtime = state.runtime
    const ws = workspaceRef.current
    if (!runtime || state.previewPaused || !ws || isDisposedRef.current) return
    let glowing = new Set<string>()
    let pending = new Set<string>()
    const clear = () => {
      for (const id of glowing) ws.getBlockById(id)?.setHighlighted(false)
      glowing.clear()
      pending.clear()
    }
    const unsubscribe = runtime.onExecutedBlocks((snapshot) => {
      if (snapshot.size === 0) { clear(); return }
      for (const [targetId, ids] of snapshot) {
        const target = runtime.world.targets.find((target) => target.id === targetId) ?? runtime.executionTarget(targetId)
        if (!target || target.brickId !== selectedBrickId) continue
        if (state.selectedCopyId && target.copyId !== state.selectedCopyId) continue
        for (const id of ids) pending.add(id)
      }
    })
    const timer = setInterval(() => {
      if (isDisposedRef.current || workspaceRef.current !== ws) return
      for (const id of glowing) if (!pending.has(id)) ws.getBlockById(id)?.setHighlighted(false)
      for (const id of pending) if (!glowing.has(id)) ws.getBlockById(id)?.setHighlighted(true)
      glowing = pending
      pending = new Set()
    }, 100)
    return () => { unsubscribe(); clearInterval(timer); if (!isDisposedRef.current) clear() }
  }, [state.runtime, state.previewPaused, state.selectedCopyId, selectedBrickId, state.editorResetRevision])

  // Select and scroll to a diagnostic block
  const handleSelectBlock = (blockId: string) => {
    const ws = workspaceRef.current
    if (!ws || isDisposedRef.current) return
    const block = ws.getBlockById(blockId)
    if (!block) return

    // The block may sit in a definition or a section that is out of the way: show the layer it lives in first.
    const root = block.getRootBlock()
    const { sectionOf } = sectionsRef.current
    if (!isShownIn(root, viewRef.current, sectionOf)) {
      const section = sectionOf(root)
      navigate(root.type === 'procedures_definition'
        ? drillInto(TOP_VIEW, (root as unknown as { extraState_?: { proccode?: string } }).extraState_?.proccode ?? '')
        : section ? openSection(section) : TOP_VIEW)
    }
    block.select()
    if ('scrollBoundsIntoView' in ws) {
      const root = block.getRootBlock()
      const bounds = root.getBoundingRectangle()
      ws.scrollBoundsIntoView(bounds, 32)
    } else if ('centerOnBlock' in ws) {
      ;(ws as unknown as { centerOnBlock: (id: string) => void }).centerOnBlock(blockId)
    }
  }

  // Handle variable creation
  const handleCreateVariable = (name: string, scope: 'brick' | 'stage', showInBuild: boolean) => {
    const ws = workspaceRef.current
    if (!ws || isDisposedRef.current) return

    const varId = `var_${name.replace(/\s+/g, '_')}_${Date.now().toString(36)}`

    if (scope === 'brick' && !isStage) {
      // Add variable to current brick workspace
      ws.getVariableMap().createVariable(name, '', varId)
      if (showInBuild) {
        store.setVariableKnob(selectedBrickId, varId, true)
      }
      saveWorkspaceNow(ws)
    } else {
      // Global variable on stage
      if (isStage) {
        ws.getVariableMap().createVariable(name, '', varId)
        saveWorkspaceNow(ws)
      } else {
        // Update stage's workspace in store
        const stageWs = store.getState().project.workspaces[STAGE_ID]
        let parsedStageWs: { variables?: Array<{ id: string; name: string; type: string }>; blocks?: Record<string, unknown> }
        if (stageWs && typeof stageWs === 'object') {
          parsedStageWs = { ...(stageWs as Record<string, unknown>) }
        } else if (typeof stageWs === 'string') {
          try {
            parsedStageWs = JSON.parse(stageWs)
          } catch {
            parsedStageWs = { variables: [], blocks: { languageVersion: 0, blocks: [] } }
          }
        } else {
          parsedStageWs = { variables: [], blocks: { languageVersion: 0, blocks: [] } }
        }

        parsedStageWs.variables = parsedStageWs.variables ?? []
        parsedStageWs.variables.push({ id: varId, name, type: '' })
        store.setWorkspace(STAGE_ID, parsedStageWs)
      }
    }

    // Menus read variables when they open; the open palette shows the new one now.
    refreshPalette(ws)
  }

  // Handle list creation
  const handleCreateList = (name: string, scope: 'brick' | 'stage') => {
    const ws = workspaceRef.current
    if (!ws || isDisposedRef.current) return

    const listId = `list_${name.replace(/\s+/g, '_')}_${Date.now().toString(36)}`

    if (scope === 'brick' && !isStage) {
      ws.getVariableMap().createVariable(name, 'list', listId)
      saveWorkspaceNow(ws)
    } else {
      if (isStage) {
        ws.getVariableMap().createVariable(name, 'list', listId)
        saveWorkspaceNow(ws)
      } else {
        const stageWs = store.getState().project.workspaces[STAGE_ID]
        let parsedStageWs: { variables?: Array<{ id: string; name: string; type: string }>; blocks?: Record<string, unknown> }
        if (stageWs && typeof stageWs === 'object') {
          parsedStageWs = { ...(stageWs as Record<string, unknown>) }
        } else if (typeof stageWs === 'string') {
          try {
            parsedStageWs = JSON.parse(stageWs)
          } catch {
            parsedStageWs = { variables: [], blocks: { languageVersion: 0, blocks: [] } }
          }
        } else {
          parsedStageWs = { variables: [], blocks: { languageVersion: 0, blocks: [] } }
        }

        parsedStageWs.variables = parsedStageWs.variables ?? []
        parsedStageWs.variables.push({ id: listId, name, type: 'list' })
        store.setWorkspace(STAGE_ID, parsedStageWs)
      }
    }

    refreshPalette(ws)
  }

  // ---------------------------------------------------------------- variable names, Rename and Delete

  /** Names a new (or renamed) variable must not repeat: the ones its blocks can see, and for a shared one, every brick's. */
  const namesInUse = (kind: VariableKind, scope: 'brick' | 'stage', exceptId?: string): string[] => {
    const ctx = ctxRef.current
    const items = (kind === 'list' ? ctx?.getLists?.() : ctx?.getVariables?.()) ?? []
    const names = items.filter((v) => v.id !== exceptId).map((v) => v.name)
    if (scope === 'stage' || isStage) {
      const d = store.getState().project.design
      for (const b of [d.stage, ...d.bricks]) {
        for (const v of (kind === 'list' ? b.program.lists : b.program.variables) ?? []) if (v.id !== exceptId) names.push(v.name)
      }
    }
    return names
  }
  const nameProblem = (kind: VariableKind) => (name: string, scope: 'brick' | 'stage') => variableNameProblem(name, namesInUse(kind, scope), kind)

  const variableName = (id: string): string => ctxRef.current?.getVariables?.().find((v) => v.id === id)?.name ?? 'this variable'

  /** Rename: in this brick's code, or a shared variable in the Stage's saved code. */
  const renameVariable = (id: string, name: string) => {
    const ws = workspaceRef.current
    if (!ws || isDisposedRef.current) return
    const own = ws.getVariableMap().getVariableById(id)
    if (own) {
      ws.getVariableMap().renameVariable(own, name)
      saveWorkspaceNow(ws)
    } else {
      const renamed = renameInWorkspace(store.getState().project.workspaces[STAGE_ID], id, name)
      if (renamed) store.setWorkspace(STAGE_ID, renamed)
    }
    refreshVariableFields(ws, id)
    refreshPalette(ws)
  }

  /** Delete: the variable and every block that uses it, in one undo step. */
  const deleteVariable = (id: string) => {
    const ws = workspaceRef.current
    if (!ws || isDisposedRef.current) return
    const variable = ws.getVariableMap().getVariableById(id)
    if (!variable) return
    Blockly.Events.setGroup(true)
    try {
      for (const block of variableUses(ws, id)) if (!block.isDeadOrDying()) block.dispose(true)
      ws.getVariableMap().deleteVariable(variable)
    } finally {
      Blockly.Events.setGroup(false)
    }
    saveWorkspaceNow(ws)
    refreshPalette(ws)
  }

  variableMenuRef.current = (action, id) => {
    const ws = workspaceRef.current
    if (!ws || isDisposedRef.current || loadBlockedRef.current) return
    const name = variableName(id)
    if (action === 'rename') {
      setRenaming({ id, name, kind: 'variable' })
      return
    }
    if (!ws.getVariableMap().getVariableById(id)) {
      setVariableNotice({ title: `“${name}” is shared`, message: `Every brick can use “${name}”. To delete it, open the Stage’s code.` })
      return
    }
    if (isStage) {
      const d = store.getState().project.design
      const users = d.bricks.filter((b) => workspaceUsesVariable(store.getState().project.workspaces[b.id], id)).map((b) => b.name)
      if (users.length) {
        setVariableNotice({ title: `“${name}” is still in use`, message: `${users.length === 1 ? 'This brick uses' : 'These bricks use'} “${name}”: ${users.join(', ')}. Take it out of their code first.` })
        return
      }
    }
    const uses = variableUses(ws, id).length
    if (uses === 0) return deleteVariable(id)
    setVariableNotice({
      title: `Delete “${name}”?`,
      message: `${uses === 1 ? '1 block uses' : `${uses} blocks use`} “${name}”. ${uses === 1 ? 'It goes' : 'They go'} too. You can undo this.`,
      confirm: { text: 'Delete', run: () => deleteVariable(id) },
    })
  }

  // Handle custom block (procedure) creation
  const handleCreateProcedure = (data: ProcedureData) => {
    const ws = workspaceRef.current
    if (!ws || isDisposedRef.current) return

    // Position new definition block near center of viewport
    const metrics = ws.getMetrics()
    const x = metrics ? metrics.viewLeft + 60 : 60
    const y = metrics ? metrics.viewTop + 60 : 60

    const blockJson = {
      type: 'procedures_definition',
      x,
      y,
      extraState: {
        proccode: data.proccode,
        argumentNames: data.argumentNames,
        warp: data.warp,
      },
    }

    try {
      Blockly.serialization.blocks.append(blockJson, ws, { recordUndo: true })
      saveWorkspaceNow(ws)
      // Open the new block so the kid can fill it in.
      navigate(drillInto(TOP_VIEW, data.proccode))
      // Refresh continuous toolbox to include callers in flyout
      ws.getToolbox()?.refreshSelection()
    } catch (err) {
      console.error('Failed to append custom block:', err)
    }
  }

  // Workspace controls
  const handleCleanUp = () => {
    const ws = workspaceRef.current
    if (!ws || isDisposedRef.current) return
    // With sections, Blockly's own cleanUp would also line up the folded scripts and leave gaps where they sit.
    if (sectionsRef.current.sections.length) cleanUpShown(ws, viewRef.current, sectionsRef.current.sectionOf)
    else ws.cleanUp()
  }

  const handleUndo = () => {
    const ws = workspaceRef.current
    if (ws && !isDisposedRef.current) ws.undo(false)
  }

  const handleRedo = () => {
    const ws = workspaceRef.current
    if (ws && !isDisposedRef.current) ws.undo(true)
  }

  const handleZoomIn = () => {
    const ws = workspaceRef.current
    if (ws && !isDisposedRef.current) ws.zoomCenter(1)
  }

  const handleZoomOut = () => {
    const ws = workspaceRef.current
    if (ws && !isDisposedRef.current) ws.zoomCenter(-1)
  }

  const handleResetZoom = () => {
    const ws = workspaceRef.current
    if (ws && !isDisposedRef.current) {
      // Hidden procedure bodies and sections must not pull the current code out of view.
      focusView(ws, viewRef.current, sectionsRef.current.sectionOf)
    }
  }

  return (
    <div className={`code-editor-root${docked ? ' code-editor-root-docked code-light' : ''}`}>
      {/* Accessible Editor Toolbar */}
      {docked ? <DockedEditorToolbar
        diagnosticsCount={diagnostics.length}
        showDiagnostics={showDiagnostics}
        onToggleDiagnostics={() => setShowDiagnostics((prev) => !prev)}
        canUndo={undoable.canUndo}
        canRedo={undoable.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCleanUp={handleCleanUp}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
      /> : <EditorToolbar
        targetName={targetName}
        isStage={isStage}
        diagnosticsCount={diagnostics.length}
        showDiagnostics={showDiagnostics}
        knobsCount={knobsCount}
        onOpenVariableModal={(mode) => setVarModalMode(mode)}
        onOpenProcedureModal={() => setProcModalOpen(true)}
        onToggleDiagnostics={() => setShowDiagnostics((prev) => !prev)}
        canUndo={undoable.canUndo}
        canRedo={undoable.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCleanUp={handleCleanUp}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
      />}

      {/* Sections and the My Blocks shelf (top view), or breadcrumb + Back (in a section or a My Block). Docked, My Blocks are in the palette. */}
      {(!docked || !isTop(view) || sections.length > 0) && <LayerBar
        brickName={targetName}
        state={view}
        definitions={docked ? [] : definitions}
        sections={sections}
        sectionTitle={(id) => sectionTitle(sectionsRef.current.sections, id)}
        onChange={navigate}
        onBack={() => navigate(back(viewRef.current))}
        onOpen={(code) => navigate(drillInto(viewRef.current, code))}
        onOpenSection={(id) => navigate(openSection(id))}
      />}

      {/* Main Workspace Injection Container */}
      <div className="code-workspace-container">
        {/* Code mode's column offers its own "Start from…" here instead. */}
        {!docked && brick?.program.scripts.length === 1 && brick.program.scripts[0].body.length === 0 && <p className="code-starter-hint">Drag blocks under this hat.</p>}
        {loadFailed && (
          <div className="code-load-failed" role="alert">
            <strong>We could not open this brick&apos;s blocks.</strong>
            <span> They are safe: nothing here will be saved over them. Close this editor, then open the brick again.</span>
          </div>
        )}
        <div ref={hostRef} className="code-blockly-host" />

        {/* Diagnostics Drawer (kid words, click to select block) */}
        {showDiagnostics && diagnostics.length > 0 && (
          <DiagnosticsList
            diagnostics={diagnostics}
            onSelectBlock={handleSelectBlock}
            onDismiss={() => setShowDiagnostics(false)}
          />
        )}
      </div>

      {card && <PlainScratchCard opcode={card.opcode} blockText={card.blockText} light={docked} onClose={() => setCard(null)} />}

      {renaming && <RenameVariableModal
        name={renaming.name}
        problemFor={(name) => variableNameProblem(name, namesInUse(renaming.kind, isStage || !workspaceRef.current?.getVariableMap().getVariableById(renaming.id) ? 'stage' : 'brick', renaming.id), renaming.kind)}
        onRename={(name) => { renameVariable(renaming.id, name); setRenaming(null) }}
        onClose={() => setRenaming(null)}
      />}
      {variableNotice && <VariableNoticeModal
        title={variableNotice.title}
        message={variableNotice.message}
        confirmText={variableNotice.confirm?.text}
        onConfirm={variableNotice.confirm ? () => { variableNotice.confirm?.run(); setVariableNotice(null) } : undefined}
        onClose={() => setVariableNotice(null)}
      />}

      {/* Make a Variable / Make a List Dialog (a fresh one each time it opens) */}
      {varModalMode !== null && <VariableModal
        isOpen
        mode={varModalMode ?? 'variable'}
        isStage={isStage}
        onClose={() => setVarModalMode(null)}
        onCreateVariable={handleCreateVariable}
        onCreateList={handleCreateList}
        nameProblem={nameProblem(varModalMode === 'list' ? 'list' : 'variable')}
      />}

      {/* Make a Block Dialog (Scratch-spirit custom blocks) */}
      <ProcedureModal
        isOpen={procModalOpen}
        onClose={() => setProcModalOpen(false)}
        onCreateProcedure={handleCreateProcedure}
      />
    </div>
  )
}
