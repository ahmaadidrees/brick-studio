import * as Blockly from 'blockly/core'
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { useBrickStore } from '../../brick/store'
import type { DerivedCreation } from '../model/creations'
import { roboToolbox } from '../program/catalog/toolbox'
import { compileContextFor, compileProgram } from '../program/compile'
import { deviceOptions } from '../program/devices'
import type { BlockDiagnostic, CompileResult, DiagnosticSeverity, RoboticsProgram } from '../program/types'
import { DEVICE_FIELD_KINDS } from '../program/catalog/blocks'
import { ensureBlocklyReady, setDeviceOptionsProvider, startScaleFor, workspaceOptions } from './blocklySetup'
import { saveWorkspace } from './programActions'

/** Real edits rest this long before the workspace is written to the document. */
export const SAVE_DEBOUNCE_MS = 400

export type BlocklyWorkspaceHandle = {
  /** Writes a pending edit now (Run, a tab switch, Back to build). */
  flush: () => void
  /** Compiles the workspace as it is right now (after `flush`, the saved program). */
  compileNow: () => CompileResult | null
  /** Scrolls a block's script into view and opens the block's warning bubble. */
  revealBlock: (blockId: string) => void
  zoomBy: (steps: number) => void
  recenter: () => void
  /** Opens or closes the block palette (the flyout); the rail stays. */
  setPaletteOpen: (open: boolean) => void
}

export type BlocklyWorkspaceProps = {
  program: RoboticsProgram
  creation: DerivedCreation
  /** The trimmed first-run palette (contract §6). */
  firstRun: boolean
  /** The palette starts collapsed (flyout closed, rail visible). */
  paletteCollapsed: boolean
  /** Problems the stage's run reported, shown on blocks beside the compiler's. */
  runDiagnostics?: readonly BlockDiagnostic[]
  /** Blocks executing now; they glow. */
  activeBlockIds?: readonly string[]
  onCompiled?: (result: CompileResult) => void
  /** A save was refused (too big, unreadable); the view says so. */
  onSaveProblem?: (message: string | null) => void
  ref?: Ref<BlocklyWorkspaceHandle>
}

const SEVERITY_RANK: Record<DiagnosticSeverity, number> = { info: 0, warning: 1, error: 2 }
const DIAG_CLASSES = ['robo-diag-error', 'robo-diag-warning', 'robo-diag-info'] as const

/** Runs `mutate` with Blockly's event queue off, so the view's own writes never read as edits. */
function withoutEvents<T>(mutate: () => T): T {
  Blockly.Events.disable()
  try {
    return mutate()
  } finally {
    Blockly.Events.enable()
  }
}

/** Which blocks carry which problems: worst severity first, each message once. */
export function diagnosticsByBlock(diagnostics: readonly BlockDiagnostic[]): Map<string, { severity: DiagnosticSeverity; messages: string[] }> {
  const byBlock = new Map<string, { severity: DiagnosticSeverity; messages: string[] }>()
  for (const diagnostic of diagnostics) {
    if (!diagnostic.blockId) continue
    const entry = byBlock.get(diagnostic.blockId) ?? { severity: diagnostic.severity, messages: [] }
    if (SEVERITY_RANK[diagnostic.severity] > SEVERITY_RANK[entry.severity]) entry.severity = diagnostic.severity
    if (!entry.messages.includes(diagnostic.message)) entry.messages.push(diagnostic.message)
    byBlock.set(diagnostic.blockId, entry)
  }
  return byBlock
}

/** A dropdown whose options come from a function keeps its first answer; ask again and redraw the label (`Left motor · C`). */
function refreshDeviceFields(workspace: Blockly.WorkspaceSvg) {
  withoutEvents(() => {
    for (const block of workspace.getAllBlocks(false)) {
      for (const name of Object.keys(DEVICE_FIELD_KINDS)) {
        const field = block.getField(name)
        if (!(field instanceof Blockly.FieldDropdown) || !field.isOptionListDynamic()) continue
        field.getOptions(false)
        ;(field as unknown as { doValueUpdate_: (value: string) => void }).doValueUpdate_(field.getValue() ?? '')
        field.forceRerender()
      }
    }
  })
}

/** A scripts area at least this wide opens with the palette out (the mock's full state); a narrower one keeps it in. */
export const PALETTE_OPEN_MIN_WIDTH = 720

/**
 * Below `PALETTE_OPEN_MIN_WIDTH` the palette floats (Blockly's `autoClose`): it opens over the
 * scripts and goes back in when a block is taken out of it or the scripts are tapped. Pinned
 * beside the scripts, it left an iPad in portrait (a 408 px scripts area) 126 px beside Motion
 * and nothing beside Sensing, and Blockly keeps a pinned palette's width reserved after it
 * closes, so the scripts stayed pushed off the editor's right edge.
 */
export function paletteFloats(containerWidth: number): boolean {
  return containerWidth < PALETTE_OPEN_MIN_WIDTH
}

/** Pins or floats the palette for the scripts area's width (a floating one is put away first). */
function fitPalette(workspace: Blockly.WorkspaceSvg, containerWidth: number) {
  const flyout = workspace.getToolbox()?.getFlyout()
  const floats = paletteFloats(containerWidth)
  if (!flyout || flyout.autoClose === floats) return
  if (floats) workspace.getToolbox()?.clearSelection()
  flyout.autoClose = floats
  workspace.recordDragTargets()
  // Re-apply the scroll against the new left edge (a pinned palette counted in it; a floating one does not).
  workspace.scroll(workspace.scrollX, workspace.scrollY)
}

/**
 * Puts the scripts at the top left of the scripts area, as in the mock. A pinned palette
 * (wide scripts area) is counted in the workspace's left edge, so scripts shown here start
 * beside it, never under it; a floating one is closed whenever scripts are placed.
 */
function placeScripts(workspace: Blockly.WorkspaceSvg) {
  if (!workspace.getTopBlocks(false).length) { workspace.scrollCenter(); return }
  const box = workspace.getBlocksBoundingBox()
  workspace.scroll(36 - box.left * workspace.scale, 28 - box.top * workspace.scale)
}

/** Opens the palette for a program that is past its first run, when there is room beside it. */
function openPaletteIfRoomy(workspace: Blockly.WorkspaceSvg, container: HTMLElement | null, collapsed: boolean) {
  const toolbox = workspace.getToolbox()
  if (!toolbox) return
  if (collapsed || (container?.clientWidth ?? 0) < PALETTE_OPEN_MIN_WIDTH) toolbox.clearSelection()
  else if (!toolbox.getSelectedItem()) toolbox.selectItemByPosition(0)
}

/**
 * One themed Blockly workspace for the open program (CP2-PLAN §7).
 *
 * Injected once per mount and disposed in the effect cleanup, so React 19 Strict Mode's
 * double mount leaves exactly one behind. Never re-injected for a resize, a device rename,
 * a run or a program switch: switching programs reloads in place. It loads the program's
 * workspace, debounce-saves real edits (never its own loads or decorations) through
 * `saveProgramWorkspace` with `history: false`, compiles after every save and on load, and
 * shows the diagnostics on the blocks (warning text, and a red / amber / grey outline by
 * severity). While a run goes, the blocks it is executing glow.
 */
export function BlocklyWorkspace({ program, creation, firstRun, paletteCollapsed, runDiagnostics = [], activeBlockIds = [], onCompiled, onSaveProblem, ref }: BlocklyWorkspaceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const workspaceRef = useRef<Blockly.WorkspaceSvg | null>(null)
  const programRef = useRef(program)
  const creationRef = useRef(creation)
  const loadedIdRef = useRef<string | null>(null)
  const loadingRef = useRef(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const compileRef = useRef<CompileResult | null>(null)
  const runDiagnosticsRef = useRef(runDiagnostics)
  const markedRef = useRef<Set<string>>(new Set())
  const highlightedRef = useRef<string[]>([])
  const onCompiledRef = useRef(onCompiled)
  const onSaveProblemRef = useRef(onSaveProblem)
  const toolboxKeyRef = useRef('')
  const [notice, setNotice] = useState<string | null>(null)

  programRef.current = program
  creationRef.current = creation
  runDiagnosticsRef.current = runDiagnostics
  onCompiledRef.current = onCompiled
  onSaveProblemRef.current = onSaveProblem

  const decorate = useCallback(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const all = [...(compileRef.current?.diagnostics ?? []), ...runDiagnosticsRef.current]
    const byBlock = diagnosticsByBlock(all)
    withoutEvents(() => {
      for (const id of markedRef.current) {
        if (byBlock.has(id)) continue
        const block = workspace.getBlockById(id)
        if (!block) continue
        block.setWarningText(null)
        for (const name of DIAG_CLASSES) block.removeClass(name)
      }
      for (const [id, entry] of byBlock) {
        const block = workspace.getBlockById(id)
        if (!block) continue
        const text = entry.messages.join('\n')
        const icon = block.getIcon(Blockly.icons.IconType.WARNING) as Blockly.icons.WarningIcon | undefined
        if (icon?.getText() !== text) {
          block.setWarningText(null)
          block.setWarningText(text)
        }
        for (const name of DIAG_CLASSES) if (name !== `robo-diag-${entry.severity}`) block.removeClass(name)
        block.addClass(`robo-diag-${entry.severity}`)
      }
    })
    markedRef.current = new Set(byBlock.keys())
  }, [])

  const compileJson = useCallback((json: unknown): CompileResult => {
    const bricks = useBrickStore.getState().bricks
    const result = compileProgram(json, compileContextFor(creationRef.current, programRef.current, new Set(bricks.map((brick) => brick.id))))
    compileRef.current = result
    decorate()
    onCompiledRef.current?.(result)
    return result
  }, [decorate])

  const saveNow = useCallback(() => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    const workspace = workspaceRef.current
    const programId = loadedIdRef.current
    if (!workspace || !programId || loadingRef.current) return
    const json = Blockly.serialization.workspaces.save(workspace)
    const result = saveWorkspace(programId, json, creationRef.current)
    if (!result.ok) {
      const message = result.reason === 'too-big' ? 'This program is too big to save. Take some blocks out, or split it into two programs.' : 'This program could not be saved.'
      setNotice(message)
      onSaveProblemRef.current?.(message)
    } else {
      setNotice(null)
      onSaveProblemRef.current?.(null)
      programRef.current = result.program
    }
    compileJson(json)
  }, [compileJson])

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      saveNow()
    }, SAVE_DEBOUNCE_MS)
  }, [saveNow])

  /** Replaces the workspace contents with the program's, without saving anything. */
  const load = useCallback((next: RoboticsProgram) => {
    const workspace = workspaceRef.current
    if (!workspace) return
    loadingRef.current = true
    markedRef.current = new Set()
    highlightedRef.current = []
    try {
      withoutEvents(() => {
        workspace.clear()
        Blockly.serialization.workspaces.load(next.workspace as Record<string, unknown>, workspace)
      })
      setNotice(null)
    } catch {
      withoutEvents(() => workspace.clear())
      setNotice('This program could not be opened. It was left as it was saved; start a new program to keep going.')
    } finally {
      loadingRef.current = false
      loadedIdRef.current = next.id
    }
    workspace.clearUndo()
    compileJson(next.workspace)
  }, [compileJson])

  // Inject once per mount; dispose in cleanup.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    ensureBlocklyReady()
    const releaseProvider = setDeviceOptionsProvider((kind, current) => deviceOptions(creationRef.current, programRef.current, kind, current))
    const toolbox = roboToolbox({ firstRun, controller: programStarterIsController(programRef.current) })
    toolboxKeyRef.current = JSON.stringify(toolbox)
    const workspace = Blockly.inject(container, workspaceOptions(toolbox, startScaleFor(container.clientWidth)))
    workspaceRef.current = workspace
    const flyout = workspace.getToolbox()?.getFlyout()
    if (flyout) flyout.autoClose = paletteFloats(container.clientWidth)
    const onChange = (event: Blockly.Events.Abstract) => {
      if (event.isUiEvent || loadingRef.current || event.type === Blockly.Events.FINISHED_LOADING) return
      scheduleSave()
    }
    workspace.addChangeListener(onChange)
    load(programRef.current)
    openPaletteIfRoomy(workspace, container, paletteCollapsed)
    placeScripts(workspace)
    // Dev only: the QA harness (scripts/qa/robotics-cp2-code.mjs) aims a real pointer at blocks and fields.
    const host = window as unknown as { __robotics?: Record<string, unknown> }
    if (import.meta.env.DEV) host.__robotics = Object.assign(host.__robotics ?? {}, { codeWorkspace: () => workspaceRef.current })
    return () => {
      workspace.removeChangeListener(onChange)
      if (saveTimerRef.current !== null) saveNow()
      releaseProvider()
      workspaceRef.current = null
      loadedIdRef.current = null
      markedRef.current = new Set()
      highlightedRef.current = []
      workspace.dispose()
    }
    // Inject-time inputs are read through refs; a change of them never re-injects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Another program: save the pending edit to the old one, then load in place.
  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace || loadedIdRef.current === program.id) return
    if (saveTimerRef.current !== null) saveNow()
    load(program)
    openPaletteIfRoomy(workspace, containerRef.current, paletteCollapsed)
    placeScripts(workspace)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program.id])

  // The palette follows the program's state: trimmed on a first run, controller blocks for a controller starter.
  const controller = programStarterIsController(program)
  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const toolbox = roboToolbox({ firstRun, controller })
    const key = JSON.stringify(toolbox)
    if (key === toolboxKeyRef.current) return
    toolboxKeyRef.current = key
    workspace.updateToolbox(toolbox as Blockly.utils.toolbox.ToolboxDefinition)
  }, [firstRun, controller])

  // A device renamed, re-plugged or removed: relabel the dropdowns and recompile.
  const deviceKey = JSON.stringify([...creation.motors, ...creation.hinges, ...creation.sensors, ...creation.lights, ...creation.buttons].map((device) => [device.brickId, device.name, device.port?.port ?? null]))
    + JSON.stringify(creation.drivePair)
  const deviceKeyRef = useRef(deviceKey)
  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace || deviceKeyRef.current === deviceKey) return
    deviceKeyRef.current = deviceKey
    refreshDeviceFields(workspace)
    compileJson(Blockly.serialization.workspaces.save(workspace))
  }, [deviceKey, compileJson])

  // The run's own problems join the compiler's on the blocks.
  const runKey = runDiagnostics.map((diagnostic) => `${diagnostic.code}|${diagnostic.blockId}|${diagnostic.message}`).join('\n')
  useEffect(() => { decorate() }, [runKey, decorate])

  // The glow on the blocks a run is executing.
  const activeKey = activeBlockIds.join('|')
  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) return
    const next = activeKey ? activeKey.split('|') : []
    const previous = highlightedRef.current
    withoutEvents(() => {
      for (const id of previous) if (!next.includes(id)) workspace.getBlockById(id)?.setHighlighted(false)
      for (const id of next) workspace.getBlockById(id)?.setHighlighted(true)
    })
    highlightedRef.current = next
  }, [activeKey])

  // Resize: re-lay out the SVG (scroll and zoom are Blockly's own and survive), and pin or float the palette for the new width.
  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      const workspace = workspaceRef.current
      if (!workspace) return
      Blockly.svgResize(workspace)
      fitPalette(workspace, container.clientWidth)
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useImperativeHandle(ref, () => ({
    flush: () => { if (saveTimerRef.current !== null) saveNow() },
    compileNow: () => {
      const workspace = workspaceRef.current
      return workspace ? compileJson(Blockly.serialization.workspaces.save(workspace)) : null
    },
    revealBlock: (blockId) => {
      const workspace = workspaceRef.current
      const block = workspace?.getBlockById(blockId)
      if (!workspace || !block) return
      // Scroll just enough to show its whole script (not centre the one block), and leave the red outline visible.
      workspace.scrollBoundsIntoView(block.getRootBlock().getBoundingRectangle(), 24)
      const icon = block.getIcon(Blockly.icons.IconType.WARNING) as Blockly.icons.WarningIcon | undefined
      void icon?.setBubbleVisible(true)
    },
    zoomBy: (steps) => { workspaceRef.current?.zoomCenter(steps) },
    recenter: () => {
      const workspace = workspaceRef.current
      if (!workspace) return
      workspace.setScale(startScaleFor(containerRef.current?.clientWidth ?? 0))
      placeScripts(workspace)
    },
    setPaletteOpen: (open) => {
      const toolbox = workspaceRef.current?.getToolbox()
      if (!toolbox) return
      if (open) { if (!toolbox.getSelectedItem()) toolbox.selectItemByPosition(0) } else toolbox.clearSelection()
    },
  }), [saveNow, compileJson])

  return (
    <div className="robo-code-blockly-host">
      <div className="robo-code-blockly" ref={containerRef} data-testid="robo-blockly" />
      {notice && <p className="robo-code-notice" role="alert">{notice}</p>}
    </div>
  )
}

function programStarterIsController(program: Pick<RoboticsProgram, 'starter'>): boolean {
  return program.starter === 'joystick-drive'
}

export default BlocklyWorkspace
