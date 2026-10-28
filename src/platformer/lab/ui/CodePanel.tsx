import * as Blockly from 'blockly/core'
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react'
import { labToolbox, type BlockDeclaration, type OptionsProvider, type VariableDeclaration } from '../program/catalog'
import type { DiagnosticSeverity, LabDiagnostic } from '../program/types'
import { ensureBlocklyReady, setDefinitionOpener, setOptionsProvider, setVariableOptionsProvider, workspaceOptions } from './blocklySetup'
import { AuthoringDialog } from './AuthoringDialog'
import { readBlockDeclarations, readVariableDeclarations, withVariableDeclarations } from './authoring'

/** Edits rest this long before they go into the level (and, while playing, into the running things). */
export const SAVE_DEBOUNCE_MS = 220

export interface CodePanelHandle {
  /** Commit a pending block edit before another action reads or changes the open design. */
  flush: () => void
  /** Blocks running now (they glow). */
  setGlow: (ids: readonly string[]) => void
  /** Scroll a block's script into view and open its message. */
  reveal: (blockId: string) => void
  /** Arrange the scripts in a column. */
  tidy: () => void
  zoom: (steps: number) => void
}

interface Props {
  brickId: string
  program: unknown
  options: OptionsProvider
  /** Changes when the level's bricks change, so the dropdown labels refresh. */
  optionsKey: string
  diagnostics: readonly LabDiagnostic[]
  onChange: (brickId: string, workspace: unknown) => void
  ref?: Ref<CodePanelHandle>
}

const RANK: Record<DiagnosticSeverity, number> = { info: 0, warning: 1, error: 2 }
const CLASSES = ['lab-diag-error', 'lab-diag-warning', 'lab-diag-info'] as const

function quietly<T>(mutate: () => T): T {
  Blockly.Events.disable()
  try {
    return mutate()
  } finally {
    Blockly.Events.enable()
  }
}

function byBlock(diagnostics: readonly LabDiagnostic[]) {
  const map = new Map<string, { severity: DiagnosticSeverity; messages: string[] }>()
  for (const d of diagnostics) {
    if (!d.blockId) continue
    const entry = map.get(d.blockId) ?? { severity: d.severity, messages: [] }
    if (RANK[d.severity] > RANK[entry.severity]) entry.severity = d.severity
    if (!entry.messages.includes(d.message)) entry.messages.push(d.message)
    map.set(d.blockId, entry)
  }
  return map
}

function placeScripts(ws: Blockly.WorkspaceSvg) {
  if (!ws.getTopBlocks(false).length) {
    ws.scrollCenter()
    return
  }
  const box = ws.getBlocksBoundingBox()
  ws.scroll(28 - box.left * ws.scale, 24 - box.top * ws.scale)
}

function selectedDefinitionName(ws: Blockly.WorkspaceSvg): string | null {
  const selected = Blockly.getSelected()
  if (!(selected instanceof Blockly.Block) || selected.workspace !== ws || selected.type !== 'lab_call') return null
  const name = selected.getFieldValue('NAME')?.trim()
  return name && ws.getTopBlocks(false).some((b) => b.type === 'lab_define' && b.getFieldValue('NAME')?.trim() === name) ? name : null
}

/**
 * The open brick's code as blocks (after the robotics branch's BlocklyWorkspace). Injected once per mount; a
 * different brick, or code changed from outside (a recipe), loads in place. Real edits are written back after a
 * short rest; the lab compiles them and running things pick them up.
 */
export function CodePanel({ brickId, program, options, optionsKey, diagnostics, onChange, ref }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null)
  const loaded = useRef<{ brick: string; json: string } | null>(null)
  const lastSavedSnapshot = useRef<string | null>(null)
  const loading = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const glowing = useRef<string[]>([])
  const marked = useRef(new Set<string>())
  const [selectedCall, setSelectedCall] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'variable' | 'block' | null>(null)
  const [declarations, setDeclarations] = useState<{ variables: VariableDeclaration[]; blocks: BlockDeclaration[] }>({ variables: [], blocks: [] })
  const variablesRef = useRef<VariableDeclaration[]>([])
  const definitionsRef = useRef<BlockDeclaration[]>([])
  const toolboxKey = useRef('')
  const props = useRef({ brickId, program, options, onChange, diagnostics })
  props.current = { brickId, program, options, onChange, diagnostics }

  const decorate = useCallback(() => {
    const ws = wsRef.current
    if (!ws) return
    const map = byBlock(props.current.diagnostics)
    quietly(() => {
      for (const id of marked.current) {
        if (map.has(id)) continue
        const b = ws.getBlockById(id)
        if (!b) continue
        b.setWarningText(null)
        for (const c of CLASSES) b.removeClass(c)
      }
      for (const [id, entry] of map) {
        const b = ws.getBlockById(id)
        if (!b) continue
        const text = entry.messages.join('\n')
        const icon = b.getIcon(Blockly.icons.IconType.WARNING) as Blockly.icons.WarningIcon | undefined
        if (icon?.getText() !== text) {
          b.setWarningText(null)
          b.setWarningText(text)
        }
        for (const c of CLASSES) if (c !== `lab-diag-${entry.severity}`) b.removeClass(c)
        b.addClass(`lab-diag-${entry.severity}`)
      }
    })
    marked.current = new Set(map.keys())
  }, [])

  const syncCallInputs = useCallback(() => {
    const ws = wsRef.current
    if (!ws) return
    const definitions = new Map(
      ws.getTopBlocks(false)
        .filter((b) => b.type === 'lab_define')
        .map((b) => [b.getFieldValue('NAME')?.trim(), b]),
    )
    quietly(() => {
      for (const call of ws.getAllBlocks(false).filter((b) => b.type === 'lab_call')) {
        const definition = definitions.get(call.getFieldValue('NAME')?.trim())
        const names = definition
          ? ['ARG1', 'ARG2', 'ARG3'].map((key) => definition.getFieldValue(key)?.trim() ?? '')
          : ['amount', '', '']
        let changed = false
        for (let i = 0; i < 3; i++) {
          const key = `ARG${i + 1}`
          const field = call.getField(`LABEL${i + 1}`)
          const visible = Boolean(names[i])
          if (field && field.getValue() !== names[i]) {
            field.setValue(names[i])
            changed = true
          }
          const input = call.getInput(key)
          if (input && input.isVisible() !== visible) {
            input.setVisible(visible)
            changed = true
          }
        }
        if (changed && call instanceof Blockly.BlockSvg) call.render()
      }
    })
  }, [])

  const refreshToolbox = useCallback(() => {
    const ws = wsRef.current
    if (!ws) return
    const blocks = readBlockDeclarations(Blockly.serialization.workspaces.save(ws))
    definitionsRef.current = blocks
    const key = JSON.stringify([variablesRef.current, blocks])
    if (key === toolboxKey.current) return
    toolboxKey.current = key
    ws.updateToolbox(labToolbox(variablesRef.current, blocks))
    quietly(() => {
      for (const block of ws.getAllBlocks(false)) {
        const field = block.getField('NAME')
        if (field instanceof Blockly.FieldDropdown && ['lab_variable', 'lab_set_variable', 'lab_change_variable'].includes(block.type)) {
          field.getOptions(false)
          field.forceRerender()
        }
      }
    })
    setDeclarations({ variables: [...variablesRef.current], blocks })
  }, [])

  const save = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const ws = wsRef.current
    const at = loaded.current
    if (!ws || !at || loading.current) return
    const json = withVariableDeclarations(Blockly.serialization.workspaces.save(ws), variablesRef.current)
    const snapshot = JSON.stringify(json)
    if (snapshot === lastSavedSnapshot.current) return
    lastSavedSnapshot.current = snapshot
    loaded.current = { brick: at.brick, json: snapshot }
    props.current.onChange(at.brick, json)
  }, [])

  const load = useCallback(
    (brick: string, source: unknown) => {
      const ws = wsRef.current
      if (!ws) return
      loading.current = true
      glowing.current = []
      marked.current = new Set()
      try {
        variablesRef.current = readVariableDeclarations(source)
        quietly(() => {
          ws.clear()
          Blockly.serialization.workspaces.load((source ?? {}) as Record<string, unknown>, ws)
        })
      } catch {
        quietly(() => ws.clear())
      } finally {
        loading.current = false
        loaded.current = { brick, json: JSON.stringify(source ?? {}) }
        lastSavedSnapshot.current = JSON.stringify(withVariableDeclarations(Blockly.serialization.workspaces.save(ws), variablesRef.current))
      }
      ws.clearUndo()
      setSelectedCall(null)
      placeScripts(ws)
      syncCallInputs()
      refreshToolbox()
      decorate()
    },
    [decorate, refreshToolbox, syncCallInputs],
  )

  const openDefinition = useCallback((name: string) => {
    const ws = wsRef.current
    if (!ws) return
    const definition = ws.getTopBlocks(false).find((b) => b.type === 'lab_define' && b.getFieldValue('NAME')?.trim() === name.trim())
    if (!definition) return
    ws.scrollBoundsIntoView(definition.getBoundingRectangle(), 32)
    definition.select()
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    ensureBlocklyReady()
    const release = setOptionsProvider((menu, current) => props.current.options(menu, current))
    const releaseVariables = setVariableOptionsProvider((current) => {
      const names = [...new Set([...variablesRef.current.map((variable) => variable.name), ...(current ? [current] : [])])]
      return (names.length ? names : ['points']).map((name) => [name, name])
    })
    const releaseOpener = setDefinitionOpener(openDefinition)
    const ws = Blockly.inject(host, workspaceOptions(labToolbox()))
    wsRef.current = ws
    ws.registerButtonCallback('LAB_MAKE_VARIABLE', () => setDialog('variable'))
    ws.registerButtonCallback('LAB_MAKE_BLOCK', () => setDialog('block'))
    const listener = (e: Blockly.Events.Abstract) => {
      if (e.isUiEvent) {
        setSelectedCall(selectedDefinitionName(ws))
        return
      }
      if (loading.current || e.type === Blockly.Events.FINISHED_LOADING) return
      syncCallInputs()
      refreshToolbox()
      setSelectedCall(selectedDefinitionName(ws))
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(save, SAVE_DEBOUNCE_MS)
    }
    ws.addChangeListener(listener)
    load(props.current.brickId, props.current.program)
    if (import.meta.env.DEV) (window as unknown as { __labWorkspace?: () => Blockly.WorkspaceSvg | null }).__labWorkspace = () => wsRef.current
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => wsRef.current && Blockly.svgResize(wsRef.current))
    observer?.observe(host)
    return () => {
      observer?.disconnect()
      ws.removeChangeListener(listener)
      if (timer.current) save()
      release()
      releaseVariables()
      releaseOpener()
      wsRef.current = null
      loaded.current = null
      lastSavedSnapshot.current = null
      toolboxKey.current = ''
      ws.dispose()
    }
    // Inject once; later props arrive through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createVariable = useCallback((variable: VariableDeclaration) => {
    variablesRef.current = [...variablesRef.current, variable]
    refreshToolbox()
    save()
    setDialog(null)
  }, [refreshToolbox, save])

  const createBlock = useCallback((definition: BlockDeclaration) => {
    const ws = wsRef.current
    if (!ws) return
    const block = ws.newBlock('lab_define') as Blockly.BlockSvg
    block.setFieldValue(definition.name, 'NAME')
    for (let index = 0; index < 3; index++) block.setFieldValue(definition.args[index] ?? '', `ARG${index + 1}`)
    block.initSvg()
    block.render()
    const bounds = ws.getBlocksBoundingBox()
    block.moveBy(Math.max(28, bounds.right + 30), 30)
    refreshToolbox()
    save()
    block.select()
    ws.scrollBoundsIntoView(block.getBoundingRectangle(), 30)
    setDialog(null)
  }, [refreshToolbox, save])

  // Another brick, or its code changed from outside the editor (a recipe, "Back to the original"): load it.
  const programJson = useMemo(() => JSON.stringify(program ?? {}), [program])
  useEffect(() => {
    const at = loaded.current
    if (!wsRef.current || (at && at.brick === brickId && at.json === programJson)) return
    if (timer.current && at && at.brick !== brickId) save()
    load(brickId, program)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brickId, programJson])

  // New bricks in the level: dropdowns that list bricks ask again.
  useEffect(() => {
    const ws = wsRef.current
    if (!ws) return
    quietly(() => {
      for (const b of ws.getAllBlocks(false)) {
        for (const name of ['BRICK', 'TARGET']) {
          const field = b.getField(name)
          if (!(field instanceof Blockly.FieldDropdown) || !field.isOptionListDynamic()) continue
          field.getOptions(false)
          ;(field as unknown as { doValueUpdate_: (v: string) => void }).doValueUpdate_(field.getValue() ?? '')
          field.forceRerender()
        }
      }
    })
  }, [optionsKey])

  const diagKey = diagnostics.map((d) => `${d.code}|${d.blockId}|${d.message}`).join('\n')
  useEffect(() => decorate(), [diagKey, decorate])

  useImperativeHandle(
    ref,
    () => ({
      flush: () => {
        save()
      },
      setGlow: (ids) => {
        const ws = wsRef.current
        if (!ws) return
        const next = new Set(ids)
        quietly(() => {
          for (const id of glowing.current) if (!next.has(id)) ws.getBlockById(id)?.setHighlighted(false)
          for (const id of next) ws.getBlockById(id)?.setHighlighted(true)
        })
        glowing.current = [...next]
      },
      reveal: (blockId) => {
        const ws = wsRef.current
        const b = ws?.getBlockById(blockId)
        if (!ws || !b) return
        ws.scrollBoundsIntoView(b.getRootBlock().getBoundingRectangle(), 24)
        const icon = b.getIcon(Blockly.icons.IconType.WARNING) as Blockly.icons.WarningIcon | undefined
        void icon?.setBubbleVisible(true)
      },
      tidy: () => {
        const ws = wsRef.current
        if (!ws) return
        ws.cleanUp()
        placeScripts(ws)
      },
      zoom: (steps) => wsRef.current?.zoomCenter(steps),
    }),
    [save],
  )

  return (
    <>
      <div className="lab-code-blockly" ref={hostRef} data-testid="lab-blockly" />
      {selectedCall && (
        <button type="button" className="lab-open-definition" onClick={() => openDefinition(selectedCall)}>
          Open “{selectedCall}” definition
        </button>
      )}
      {dialog && <AuthoringDialog mode={dialog} variables={declarations.variables} blocks={declarations.blocks} onVariable={createVariable} onBlock={createBlock} onClose={() => setDialog(null)} />}
    </>
  )
}
