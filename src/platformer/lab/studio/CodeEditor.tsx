import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import * as En from 'blockly/msg/en'

Blockly.setLocale(En as unknown as Record<string, string>)
import type { StudioStore } from './store'
import { STAGE_ID } from './store'
import type { Diagnostic } from '../core/editor/compile'
import type { Thread } from '../core/runtime'
import { registerEditorBlocks } from '../core/editor/definitions'
import { setEditorContext } from '../core/editor/context'
import { createContinuousToolbox, myBlocksFlyout, registerToolboxPlugins } from '../core/editor/toolbox'
import { buildEditorContext } from './code/context'
import { CODE_DARK_THEME } from './code/codeTheme'
import { VariableModal } from './code/VariableModal'
import { ProcedureModal, type ProcedureData } from './code/ProcedureModal'
import { DiagnosticsList, formatKidDiagnostic } from './code/DiagnosticsList'
import { EditorToolbar } from './code/EditorToolbar'
import { LayerBar } from './code/LayerBar'
import { PlainScratchCard } from './code/PlainScratchCard'
import {
  applyView,
  attachAffordances,
  focusView,
  hasDefinition,
  isShownIn,
  listDefinitions,
  renderLabels,
  setWorkspaceHandlers,
  tidyIfOverlapping,
  undoState,
} from './code/affordances'
import { back, drillInto, pruneMissing, TOP_VIEW, type LayerState } from './code/layers'
import './code/code.css'

export interface CodeEditorProps {
  store: StudioStore
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ store }) => {
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

  // Debounced save timer
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Modals state
  const [varModalMode, setVarModalMode] = useState<'variable' | 'list' | null>(null)
  const [procModalOpen, setProcModalOpen] = useState<boolean>(false)
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true)

  // Layered view: top scripts, or drilled into a My Block definition. And the open "plain Scratch" card.
  const [view, setView] = useState<LayerState>(TOP_VIEW)
  const viewRef = useRef<LayerState>(TOP_VIEW)
  const [definitions, setDefinitions] = useState<string[]>([])
  const [undoable, setUndoable] = useState({ canUndo: false, canRedo: false })
  const [card, setCard] = useState<{ opcode: string; blockText: string } | null>(null)

  // Diagnostics for current brick
  const diagnostics: Diagnostic[] = state.diagnostics[selectedBrickId] ?? []

  // Count knobs for current brick
  const knobsCount = !isStage
    ? (brick?.program?.variables ?? []).filter((v) => v.showInBuild).length
    : 0

  // Flush any pending debounced save
  const flushSave = () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
      const ws = workspaceRef.current
      if (ws && !isDisposedRef.current) {
        const json = Blockly.serialization.workspaces.save(ws)
        store.setWorkspace(workspaceBrickIdRef.current, json)
      }
    }
  }

  // Save workspace immediately
  const saveWorkspaceNow = (ws: Blockly.WorkspaceSvg) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
      saveTimeoutRef.current = null
    }
    const json = Blockly.serialization.workspaces.save(ws)
    store.setWorkspace(workspaceBrickIdRef.current, json)
  }

  // Show a layer: drill into a definition, go back, or return to the top. Nothing here changes the saved code.
  const navigate = (next: LayerState) => {
    const ws = workspaceRef.current
    if (!ws || isDisposedRef.current) return
    const valid = pruneMissing(next, (code) => hasDefinition(ws, code))
    viewRef.current = valid
    setView(valid)
    Blockly.hideChaff()
    applyView(ws, valid)
    focusView(ws, valid)
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
    const ctx = buildEditorContext(store)
    setEditorContext(ctx)
    registerEditorBlocks(ctx)
    attachAffordances()

    // 4. Configure continuous toolbox (filter Motion if stage selected)
    const toolboxDef = createContinuousToolbox(ctx, { isStage })

    // 5. Inject Blockly workspace
    const ws = Blockly.inject(container, {
      toolbox: toolboxDef,
      renderer: 'zelos',
      theme: CODE_DARK_THEME,
      grid: {
        spacing: 24,
        length: 3,
        colour: '#2a2e38',
        snap: false,
      },
      zoom: {
        controls: false,
        wheel: true,
        startScale: 0.85,
        maxScale: 2,
        minScale: 0.4,
        scaleSpeed: 1.1,
      },
      trashcan: true,
      sounds: false,
      plugins: {
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
    workspaceBrickIdRef.current = selectedBrickId
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
      const items = myBlocksFlyout(targetWs)
      return items as unknown as Blockly.utils.toolbox.FlyoutDefinition
    })

    // 8. Load workspace for this brick
    const savedWorkspace = store.getState().project.workspaces[selectedBrickId]
    if (savedWorkspace) {
      try {
        const wsData = typeof savedWorkspace === 'string' ? JSON.parse(savedWorkspace) : savedWorkspace
        Blockly.serialization.workspaces.load(wsData, ws)
      } catch (err) {
        console.error('Failed to load workspace:', err)
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

    // 8b. Layered view: scripts on top, My Block definitions out of the way; magnifiers open definitions and cards
    viewRef.current = TOP_VIEW
    setView(TOP_VIEW)
    setCard(null)
    setWorkspaceHandlers(ws, {
      drill: (code) => navigateRef.current(drillInto(viewRef.current, code)),
      explain: (opcode, blockText) => setCard({ opcode, blockText }),
    })
    const syncDefinitions = () => {
      const codes = listDefinitions(ws).map((d) => d.proccode)
      setDefinitions((prev) => (prev.join('\n') === codes.join('\n') ? prev : codes))
    }
    const showTopView = () => {
      if (isDisposedRef.current || workspaceRef.current !== ws) return
      // Rendered sizes are known now: if scripts or labels overlap, arrange them like Scratch's "Clean up".
      if (tidyIfOverlapping(ws)) saveWorkspaceNow(ws)
      renderLabels(ws)
      syncDefinitions()
      applyView(ws, viewRef.current)
      focusView(ws, viewRef.current)
    }
    setUndoable({ canUndo: false, canRedo: false })
    syncDefinitions()
    applyView(ws, TOP_VIEW)
    renderLabels(ws)
    Promise.resolve(Blockly.renderManagement.finishQueuedRenders()).then(showTopView, showTopView)

    // 9. Change listener with debounced save (~300ms), skipping UI-only events
    const changeListener = (event: Blockly.Events.Abstract) => {
      // Layered view upkeep (labels, the My Blocks shelf, a definition deleted while drilled in)
      if (!event.isUiEvent && event.type !== Blockly.Events.FINISHED_LOADING) {
        renderLabels(ws)
        syncDefinitions()
        if (event.type === Blockly.Events.BLOCK_CREATE && (event as Blockly.Events.BlockCreate).ids?.length) {
          const created = ws.getBlockById((event as Blockly.Events.BlockCreate).blockId ?? '')
          if (created?.type === 'procedures_definition') applyView(ws, viewRef.current)
        }
        if (event.type === Blockly.Events.BLOCK_DELETE && viewRef.current.stack.length) {
          const kept = pruneMissing(viewRef.current, (code) => hasDefinition(ws, code))
          if (kept !== viewRef.current) queueMicrotask(() => navigateRef.current(kept))
        }
      }
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
        if (!isDisposedRef.current) {
          const json = Blockly.serialization.workspaces.save(ws)
          store.setWorkspace(workspaceBrickIdRef.current, json)
        }
      }, 300)
    }

    ws.addChangeListener(changeListener)

    // Resize workspace to fit container
    Blockly.svgResize(ws)

    return () => {
      flushSave()
      setWorkspaceHandlers(ws, null)
      ws.removeChangeListener(changeListener)
      isDisposedRef.current = true
      ws.dispose()
      workspaceRef.current = null
    }
  }, [selectedBrickId, isStage, store])

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

  // Real-time block glow for running threads during Play mode
  useEffect(() => {
    let animId: number | null = null
    let glowingBlockIds = new Set<string>()

    const checkRunningThreads = () => {
      const currentState = store.getState()
      const ws = workspaceRef.current

      if (currentState.mode === 'play' && currentState.runtime && ws && !isDisposedRef.current) {
        const activeIds = new Set<string>()
        const threads = currentState.runtime.threads()

        for (const t of threads) {
          const thread = t as Thread
          if (thread.done || thread.status === 'done') continue
          if (thread.target.brickId !== currentState.selectedBrickId) continue

          // Script hat block
          if (thread.script?.id) {
            activeIds.add(thread.script.id)
          }

          // Executing statement block
          const topFrame = thread.stack[thread.stack.length - 1]
          if (topFrame && topFrame.statements) {
            const currentStmt =
              topFrame.statements[topFrame.pc] ??
              topFrame.statements[topFrame.statements.length - 1]
            if (currentStmt?.id) {
              activeIds.add(currentStmt.id)
            }
          }
        }

        // Apply diff to highlighted blocks
        for (const id of glowingBlockIds) {
          if (!activeIds.has(id)) {
            ws.getBlockById(id)?.setHighlighted(false)
          }
        }
        for (const id of activeIds) {
          if (!glowingBlockIds.has(id)) {
            ws.getBlockById(id)?.setHighlighted(true)
          }
        }
        glowingBlockIds = activeIds
      } else {
        // Clear all highlights when not playing
        if (glowingBlockIds.size > 0 && ws && !isDisposedRef.current) {
          for (const id of glowingBlockIds) {
            ws.getBlockById(id)?.setHighlighted(false)
          }
          glowingBlockIds = new Set()
        }
      }

      animId = requestAnimationFrame(checkRunningThreads)
    }

    animId = requestAnimationFrame(checkRunningThreads)

    return () => {
      if (animId !== null) cancelAnimationFrame(animId)
      const ws = workspaceRef.current
      if (ws && !isDisposedRef.current) {
        for (const id of glowingBlockIds) {
          ws.getBlockById(id)?.setHighlighted(false)
        }
      }
    }
  }, [store])

  // Select and scroll to a diagnostic block
  const handleSelectBlock = (blockId: string) => {
    const ws = workspaceRef.current
    if (!ws || isDisposedRef.current) return
    const block = ws.getBlockById(blockId)
    if (!block) return

    // The block may sit in a definition that is out of the way: show the layer it lives in first.
    const root = block.getRootBlock()
    if (!isShownIn(root, viewRef.current)) {
      navigate(root.type === 'procedures_definition' ? drillInto(TOP_VIEW, (root as unknown as { extraState_?: { proccode?: string } }).extraState_?.proccode ?? '') : TOP_VIEW)
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

    // Refresh context and definitions
    const updatedCtx = buildEditorContext(store)
    setEditorContext(updatedCtx)
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

    const updatedCtx = buildEditorContext(store)
    setEditorContext(updatedCtx)
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
    if (ws && !isDisposedRef.current) ws.cleanUp()
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
      ws.setScale(0.85)
      ws.scrollCenter()
    }
  }

  return (
    <div className="code-editor-root">
      {/* Accessible Editor Toolbar */}
      <EditorToolbar
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
      />

      {/* My Blocks shelf (top view) or breadcrumb + Back (inside a My Block) */}
      <LayerBar
        brickName={targetName}
        state={view}
        definitions={definitions}
        onChange={navigate}
        onBack={() => navigate(back(viewRef.current))}
        onOpen={(code) => navigate(drillInto(viewRef.current, code))}
      />

      {/* Main Workspace Injection Container */}
      <div className="code-workspace-container">
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

      {card && <PlainScratchCard opcode={card.opcode} blockText={card.blockText} onClose={() => setCard(null)} />}

      {/* Make a Variable / Make a List Dialog */}
      <VariableModal
        isOpen={varModalMode !== null}
        mode={varModalMode ?? 'variable'}
        isStage={isStage}
        onClose={() => setVarModalMode(null)}
        onCreateVariable={handleCreateVariable}
        onCreateList={handleCreateList}
      />

      {/* Make a Block Dialog (Scratch-spirit custom blocks) */}
      <ProcedureModal
        isOpen={procModalOpen}
        onClose={() => setProcModalOpen(false)}
        onCreateProcedure={handleCreateProcedure}
      />
    </div>
  )
}
