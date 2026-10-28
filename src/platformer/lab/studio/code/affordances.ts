/**
 * The layered code view, on a Blockly workspace:
 *  - a magnifier field on every My Block call (drill into its definition) and every Platformer block (open the plain
 *    Scratch card);
 *  - one-line labels on each script's hat;
 *  - showing/hiding top-level stacks for the top view and for a drilled-in definition.
 * Nothing here is saved except the label, which lives in the block's `data` string (`label:<text>`, see layers.ts).
 */
import * as Blockly from 'blockly/core'
import { isHatOpcode } from '../../core/editor/definitions'
import { currentProccode, LABEL_PREFIX, labelData, readLabel, type LayerState } from './layers'

export interface WorkspaceHandlers {
  /** The kid clicked the magnifier on a My Block call. */
  drill(proccode: string): void
  /** The kid clicked the magnifier on a Platformer block. */
  explain(opcode: string, blockText: string): void
}

const handlers = new WeakMap<Blockly.Workspace, WorkspaceHandlers>()

export function setWorkspaceHandlers(ws: Blockly.Workspace, h: WorkspaceHandlers | null): void {
  if (h) handlers.set(ws, h)
  else handlers.delete(ws)
}

class FieldMagnifier extends Blockly.FieldLabel {
  constructor(private readonly onClick: (block: Blockly.Block) => void, tooltip: string) {
    super('🔍', 'code-magnifier')
    this.setTooltip(tooltip)
  }

  protected override showEditor_(): void {
    const block = this.getSourceBlock()
    if (block) this.onClick(block)
  }
}

const MAGNIFIER = 'MAGNIFIER'

interface PatchableDef {
  init?: () => void
  __codeLabMagnifier?: boolean
}

function addMagnifier(block: Blockly.Block, make: () => FieldMagnifier): void {
  const ws = block.workspace
  if (ws.isFlyout || (ws.options as { readOnly?: boolean }).readOnly) return
  if (block.getField(MAGNIFIER)) return
  const field = make()
  const first = block.inputList[0] ?? block.appendDummyInput()
  first.insertFieldAt(0, field, MAGNIFIER)
}

function proccodeOf(block: Blockly.Block): string {
  return (block as unknown as { extraState_?: { proccode?: string } }).extraState_?.proccode ?? ''
}

/**
 * Add the magnifier to `procedures_call` and every `platformer_*` block. Call after `registerEditorBlocks` (which
 * redefines the blocks) and after any extra Platformer definitions are registered. Safe to call again.
 */
export function attachAffordances(): void {
  for (const type of Object.keys(Blockly.Blocks)) {
    const isCall = type === 'procedures_call'
    if (!isCall && !type.startsWith('platformer_')) continue
    const def = Blockly.Blocks[type] as PatchableDef | undefined
    if (!def || def.__codeLabMagnifier || typeof def.init !== 'function') continue
    const original = def.init
    def.init = function (this: Blockly.Block) {
      original.call(this)
      if (isCall) {
        addMagnifier(
          this,
          () =>
            new FieldMagnifier((b) => {
              const code = proccodeOf(b)
              if (code) handlers.get(b.workspace)?.drill(code)
            }, 'See inside this block'),
        )
      } else {
        addMagnifier(
          this,
          () =>
            new FieldMagnifier((b) => handlers.get(b.workspace)?.explain(b.type, b.toString()), 'How this works in plain Scratch'),
        )
      }
    }
    def.__codeLabMagnifier = true
  }
}

// ---------------------------------------------------------------- labels

export function getLabel(block: Blockly.Block): string {
  return readLabel(block.data)
}

export function setLabel(block: Blockly.Block, text: string): void {
  block.data = labelData(text) ?? null
}

/** A label belongs on the hat of a top-level script (not on a My Block definition, which has its own name). */
export function takesLabel(block: Blockly.Block): boolean {
  return !block.getParent() && isHatOpcode(block.type)
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const LABEL_CLASS = 'code-script-label'
/** How far above the hat's origin the label sits, in workspace units (the zelos hat cap rises about 20). */
const LABEL_RISE = 26

/** Draw (or remove) each top script's one-line label above its hat. */
export function renderLabels(ws: Blockly.WorkspaceSvg): void {
  for (const block of ws.getTopBlocks(false)) {
    const root = block.getSvgRoot()
    if (!root) continue
    const existing = root.querySelector(`:scope > .${LABEL_CLASS}`)
    const text = takesLabel(block) ? getLabel(block) : ''
    if (!text) {
      existing?.remove()
      continue
    }
    let el = existing as SVGTextElement | null
    if (!el) {
      el = document.createElementNS(SVG_NS, 'text') as SVGTextElement
      el.setAttribute('class', LABEL_CLASS)
      el.setAttribute('x', '4')
      el.setAttribute('y', String(-LABEL_RISE))
      root.appendChild(el)
    }
    if (el.textContent !== text) el.textContent = text
  }
}

// ---------------------------------------------------------------- layers

export interface DefinitionInfo {
  proccode: string
  block: Blockly.Block
}

export function listDefinitions(ws: Blockly.Workspace): DefinitionInfo[] {
  return ws
    .getTopBlocks(true)
    .filter((b) => b.type === 'procedures_definition')
    .map((b) => ({ proccode: proccodeOf(b), block: b }))
}

export function hasDefinition(ws: Blockly.Workspace, proccode: string): boolean {
  return listDefinitions(ws).some((d) => d.proccode === proccode)
}

function setShown(block: Blockly.BlockSvg, shown: boolean): void {
  const root = block.getSvgRoot()
  if (root) root.style.display = shown ? '' : 'none'
}

/** Is this top-level stack shown in the given view? */
export function isShownIn(block: Blockly.Block, state: LayerState): boolean {
  const cur = currentProccode(state)
  const isDef = block.type === 'procedures_definition'
  return cur === null ? !isDef : isDef && proccodeOf(block) === cur
}

/** Top view: scripts only (definitions kept out of the way). Drilled in: just that definition. Nothing is moved or saved. */
export function applyView(ws: Blockly.WorkspaceSvg, state: LayerState): void {
  Blockly.Events.disable()
  try {
    for (const block of ws.getTopBlocks(false)) {
      const shown = isShownIn(block, state)
      if (shown && block.type === 'procedures_definition') block.setCollapsed(false)
      setShown(block as Blockly.BlockSvg, shown)
    }
  } finally { Blockly.Events.enable() }
}

/** Long programs open with their definitions folded; drilling into one expands it locally. */
export function foldLongDefinitions(ws: Blockly.Workspace): boolean {
  if (ws.getAllBlocks(false).length <= 30) return false
  Blockly.Events.disable()
  try { for (const definition of listDefinitions(ws)) definition.block.setCollapsed(true) }
  finally { Blockly.Events.enable() }
  return true
}

/** Fit just the currently visible layer, excluding the hidden procedure bodies. */
export function focusView(ws: Blockly.WorkspaceSvg, state: LayerState): void {
  const shown = ws.getTopBlocks(true).filter((b) => isShownIn(b, state))
  if (shown.length === 0) return
  const rectangles = shown.map((block) => {
    const bounds = block.getBoundingRectangle()
    // The Blockly rectangle excludes our script label above the hat. Include its full text band before fitting or
    // centering, otherwise the label's ascenders can land above the clipped workspace edge.
    return takesLabel(block) && getLabel(block)
      ? new Blockly.utils.Rect(bounds.top - LABEL_BAND, bounds.bottom, bounds.left, bounds.right)
      : bounds
  })
  const left = Math.min(...rectangles.map((r) => r.left))
  const top = Math.min(...rectangles.map((r) => r.top))
  const right = Math.max(...rectangles.map((r) => r.right))
  const bottom = Math.max(...rectangles.map((r) => r.bottom))
  const metrics = ws.getMetrics()
  const padding = 32
  const scale = Math.min(0.85, Math.max(0.65, Math.min((metrics.viewWidth - padding * 2) / Math.max(1, right - left), (metrics.viewHeight - padding * 2) / Math.max(1, bottom - top))))
  ws.setScale(scale)
  const width = metrics.viewWidth / scale
  const height = metrics.viewHeight / scale
  // A layer too long to fit still opens at its first block, rather than halfway down.
  ws.scrollBoundsIntoView(new Blockly.utils.Rect(top - padding, top + height - padding, left - padding, left + width - padding), 0)
}

export { LABEL_PREFIX }

// ---------------------------------------------------------------- tidy on open

export interface PlacedStack {
  id: string
  left: number
  top: number
  right: number
  bottom: number
  /** Does the stack have a one-line label drawn above its hat? */
  labelled: boolean
}

/** Room a label takes above its hat, in workspace units (LABEL_RISE plus the text height). */
export const LABEL_BAND = 34
/** Space left between stacks in a column. */
export const STACK_GAP = 24

function reach(s: PlacedStack): { left: number; top: number; right: number; bottom: number } {
  return { left: s.left, right: s.right, bottom: s.bottom, top: s.labelled ? s.top - LABEL_BAND : s.top }
}

/** Do any two stacks (counting the label above each hat) overlap? Touching edges don't count. */
export function anyOverlap(stacks: PlacedStack[]): boolean {
  for (let i = 0; i < stacks.length; i++) {
    const a = reach(stacks[i])
    for (let j = i + 1; j < stacks.length; j++) {
      const b = reach(stacks[j])
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) return true
    }
  }
  return false
}

/** Stacks whose left edges are further apart than this are in different columns. */
export const COLUMN_SPLIT = 300

/**
 * Scratch's "Clean up", keeping columns: stacks are grouped into the columns they were laid out in (left edges more
 * than COLUMN_SPLIT apart), and each column becomes one tidy column in reading order, each stack under the last with
 * room for its label. Columns stay left to right and never overlap each other. Most layouts are one column.
 */
export function columnLayout(stacks: PlacedStack[]): Map<string, { x: number; y: number }> {
  const byLeft = [...stacks].sort((a, b) => a.left - b.left)
  const columns: PlacedStack[][] = []
  for (const s of byLeft) {
    const last = columns[columns.length - 1]
    if (last && s.left - last[0].left <= COLUMN_SPLIT) last.push(s)
    else columns.push([s])
  }
  const out = new Map<string, { x: number; y: number }>()
  let minX = -Infinity
  for (const column of columns) {
    const sorted = [...column].sort((a, b) => a.top - b.top || a.left - b.left)
    const x = Math.max(Math.min(...sorted.map((s) => s.left)), minX)
    let y = sorted[0].top - (sorted[0].labelled ? LABEL_BAND : 0)
    for (const s of sorted) {
      const top = s.labelled ? y + LABEL_BAND : y
      out.set(s.id, { x, y: top })
      y = top + (s.bottom - s.top) + STACK_GAP
    }
    minX = x + Math.max(...sorted.map((s) => s.right - s.left)) + STACK_GAP * 2
  }
  return out
}

/**
 * When scripts (or their labels) overlap, arrange them in a column. A layout that doesn't overlap is left exactly as the
 * kid made it. Definitions are never on screen together with scripts, so they don't take part. Returns whether it moved.
 */
export function tidyIfOverlapping(ws: Blockly.WorkspaceSvg): boolean {
  const tops = ws.getTopBlocks(false).filter((b) => b.type !== 'procedures_definition')
  const stacks: PlacedStack[] = tops.map((b) => {
    const r = b.getBoundingRectangle()
    return { id: b.id, left: r.left, top: r.top, right: r.right, bottom: r.bottom, labelled: takesLabel(b) && !!getLabel(b) }
  })
  if (!anyOverlap(stacks)) return false
  const target = columnLayout(stacks)
  Blockly.Events.disable()
  try {
    for (const b of tops) {
      const to = target.get(b.id)
      if (!to) continue
      const at = b.getBoundingRectangle()
      b.moveBy(to.x - at.left, to.y - at.top)
    }
  } finally {
    Blockly.Events.enable()
  }
  ws.clearUndo()
  return true
}

/** Can the workspace undo / redo right now? (Blockly keeps its stacks private, so read them defensively.) */
export function undoState(ws: Blockly.Workspace): { canUndo: boolean; canRedo: boolean } {
  const w = ws as unknown as { undoStack_?: unknown[]; redoStack_?: unknown[] }
  return { canUndo: (w.undoStack_?.length ?? 0) > 0, canRedo: (w.redoStack_?.length ?? 0) > 0 }
}
