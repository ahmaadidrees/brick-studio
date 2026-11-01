/**
 * The layered code view, on a Blockly workspace:
 *  - a magnifier field on every My Block call (drill into its definition) and every Platformer block (open the plain
 *    Scratch card);
 *  - one-line labels on each script's hat;
 *  - showing/hiding top-level stacks for the top view, a brick section ("How I move") and a drilled-in definition, and
 *    drawing a section's or the top view's scripts packed together for this visit (PackedLayout).
 * Nothing here is saved except the label, which lives in the block's `data` string (`label:<text>`, see layers.ts).
 */
import * as Blockly from 'blockly/core'
import { isHatOpcode } from '../../core/editor/definitions'
import { currentProccode, currentSection, LABEL_PREFIX, labelData, readLabel, type LayerState } from './layers'
import { sectionOfScript, type ScriptSection } from './sections'

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

const SWITCH_CLASS = 'code-script-switch'
const SWITCH_W = 42
const SWITCH_H = 22

/** Is this script turned off (Blockly's own "disabled", which the compiler skips)? */
export function isScriptOff(block: Blockly.Block): boolean {
  return block.hasDisabledReason(Blockly.constants.MANUALLY_DISABLED)
}

/** Turn a script on or off as one undo step. Turned-off scripts stay in the workspace, greyed, and do not run. */
export function setScriptOff(block: Blockly.Block, off: boolean): void {
  if (isScriptOff(block) === off) return
  Blockly.Events.setGroup(true)
  try {
    block.setDisabledReason(off, Blockly.constants.MANUALLY_DISABLED)
  } finally {
    Blockly.Events.setGroup(false)
  }
}

/**
 * Draw (or remove) each top script's one-line label above its hat, and in front of it an On/Off switch (editable
 * workspaces only): turning a feel script off is how a kid feels what it does.
 */
export function renderLabels(ws: Blockly.WorkspaceSvg): void {
  const editable = !ws.options.readOnly && !ws.isFlyout
  for (const block of ws.getTopBlocks(false)) {
    const root = block.getSvgRoot()
    if (!root) continue
    const hat = takesLabel(block)
    const text = hat ? getLabel(block) : ''
    let sw = root.querySelector(`:scope > .${SWITCH_CLASS}`) as SVGGElement | null
    if (!(hat && editable)) {
      sw?.remove()
      sw = null
    } else {
      if (!sw) sw = createSwitch(block)
      if (sw.parentNode !== root) root.appendChild(sw)
      const off = isScriptOff(block)
      sw.classList.toggle('is-off', off)
      sw.setAttribute('aria-pressed', off ? 'false' : 'true')
      sw.setAttribute('aria-label', `${off ? 'Turn on' : 'Turn off'}: ${text || 'this script'}`)
      const word = sw.querySelector('text')
      if (word && word.textContent !== (off ? 'Off' : 'On')) word.textContent = off ? 'Off' : 'On'
    }
    const existing = root.querySelector(`:scope > .${LABEL_CLASS}`)
    if (!text) {
      existing?.remove()
      continue
    }
    let el = existing as SVGTextElement | null
    if (!el) {
      el = document.createElementNS(SVG_NS, 'text') as SVGTextElement
      el.setAttribute('class', LABEL_CLASS)
      el.setAttribute('y', String(-LABEL_RISE))
      root.appendChild(el)
    }
    el.setAttribute('x', String(sw ? SWITCH_W + 12 : 4))
    if (el.textContent !== text) el.textContent = text
  }
}

function createSwitch(block: Blockly.Block): SVGGElement {
  const g = document.createElementNS(SVG_NS, 'g') as SVGGElement
  g.setAttribute('class', SWITCH_CLASS)
  g.setAttribute('role', 'button')
  g.setAttribute('tabindex', '0')
  g.setAttribute('transform', `translate(4, ${-LABEL_RISE - SWITCH_H + 6})`)
  const pill = document.createElementNS(SVG_NS, 'rect')
  pill.setAttribute('width', String(SWITCH_W))
  pill.setAttribute('height', String(SWITCH_H))
  pill.setAttribute('rx', String(SWITCH_H / 2))
  const word = document.createElementNS(SVG_NS, 'text')
  word.setAttribute('x', String(SWITCH_W / 2))
  word.setAttribute('y', String(SWITCH_H / 2 + 4))
  word.setAttribute('text-anchor', 'middle')
  g.append(pill, word)
  const toggle = () => {
    setScriptOff(block, !isScriptOff(block))
    if (block.workspace instanceof Blockly.WorkspaceSvg) renderLabels(block.workspace)
  }
  // Blockly starts a drag on pointerdown anywhere in the block, so the switch keeps its own pointer events.
  g.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault() })
  g.addEventListener('click', (e) => { e.stopPropagation(); toggle() })
  g.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    e.stopPropagation()
    toggle()
  })
  return g
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
  // A hidden stack's connections leave Blockly's lookup too, so a block dropped where it sits can't snap into it unseen.
  block.setConnectionTracking(shown)
}

/** The section a top-level stack is folded into, or null (it shows on the top view). */
export type SectionOf = (block: Blockly.Block) => string | null

const NO_SECTIONS: SectionOf = () => null

/**
 * Which section each script of a brick is in: by its hat and label (sections.ts), or, for a script the kid made or pulled
 * out while a section was open, that section, for the rest of this visit (`pin`). Saved nowhere: when the code opens
 * again, the kid's own scripts are on the top view.
 */
export class SectionTracker {
  private readonly pins = new Map<string, string>()
  constructor(readonly sections: readonly ScriptSection[]) {}

  readonly sectionOf: SectionOf = (block) => {
    if (!this.sections.length || block.getParent() || block.type === 'procedures_definition') return null
    return this.pins.get(block.id) ?? sectionOfScript(block.type, getLabel(block), this.sections)
  }

  pin(id: string, section: string | null): void {
    if (section) this.pins.set(id, section)
    else this.pins.delete(id)
  }
}

/** Is this top-level stack shown in the given view? */
export function isShownIn(block: Blockly.Block, state: LayerState, sectionOf: SectionOf = NO_SECTIONS): boolean {
  const cur = currentProccode(state)
  const isDef = block.type === 'procedures_definition'
  if (cur !== null) return isDef && proccodeOf(block) === cur
  return !isDef && sectionOf(block) === currentSection(state)
}

/**
 * Top view: scripts only (definitions and sections kept out of the way). In a section: just its scripts. Drilled in: just
 * that definition. Nothing is moved or saved.
 */
export function applyView(ws: Blockly.WorkspaceSvg, state: LayerState, sectionOf: SectionOf = NO_SECTIONS): void {
  Blockly.Events.disable()
  try {
    for (const block of ws.getTopBlocks(false)) {
      const shown = isShownIn(block, state, sectionOf)
      if (shown && block.type === 'procedures_definition') block.setCollapsed(false)
      setShown(block as Blockly.BlockSvg, shown)
    }
  } finally { Blockly.Events.enable() }
}

/**
 * Take hidden stacks out of Blockly's connection lookup again. Blockly adds every loaded or pasted block back a moment
 * later (a 1 ms timeout), which can land after the view was applied, so the editor calls this when a drag starts.
 */
export function untrackHidden(ws: Blockly.WorkspaceSvg, state: LayerState, sectionOf: SectionOf = NO_SECTIONS): void {
  for (const block of ws.getTopBlocks(false)) if (!isShownIn(block, state, sectionOf)) block.setConnectionTracking(false)
}

/** Long programs open with their definitions folded; drilling into one expands it locally. */
export function foldLongDefinitions(ws: Blockly.Workspace): boolean {
  if (ws.getAllBlocks(false).length <= 30) return false
  Blockly.Events.disable()
  try { for (const definition of listDefinitions(ws)) definition.block.setCollapsed(true) }
  finally { Blockly.Events.enable() }
  return true
}

/** Fit just the currently visible layer, excluding the hidden procedure bodies and sections. */
export function focusView(ws: Blockly.WorkspaceSvg, state: LayerState, sectionOf: SectionOf = NO_SECTIONS): void {
  const shown = ws.getTopBlocks(true).filter((b) => isShownIn(b, state, sectionOf))
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

function placed(b: Blockly.BlockSvg): PlacedStack {
  const r = b.getBoundingRectangle()
  return { id: b.id, left: r.left, top: r.top, right: r.right, bottom: r.bottom, labelled: takesLabel(b) && !!getLabel(b) }
}

/**
 * When scripts (or their labels) overlap, arrange them in a column. A layout that doesn't overlap is left exactly as the
 * kid made it. Definitions are never on screen together with scripts, so they don't take part; nor are scripts of
 * different sections (`sectionOf`), so only scripts of the same section are checked against each other. Returns whether
 * it moved.
 */
export function tidyIfOverlapping(ws: Blockly.WorkspaceSvg, sectionOf: SectionOf = NO_SECTIONS): boolean {
  const scripts = ws.getTopBlocks(false).filter((b) => b.type !== 'procedures_definition')
  const groups = new Map<string | null, Blockly.BlockSvg[]>()
  for (const b of scripts) {
    const key = sectionOf(b)
    groups.set(key, [...(groups.get(key) ?? []), b])
  }
  const tops: Blockly.BlockSvg[] = []
  const target = new Map<string, { x: number; y: number }>()
  for (const group of groups.values()) {
    const stacks = group.map(placed)
    if (!anyOverlap(stacks)) continue
    tops.push(...group)
    for (const [id, to] of columnLayout(stacks)) target.set(id, to)
  }
  if (!tops.length) return false
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

/**
 * Scratch's "Clean up" for the layer on screen: its stacks in one column, in reading order, with room for each label.
 * Hidden stacks stay where they are (Blockly's own cleanUp would leave gaps where they sit). One undo step.
 */
export function cleanUpShown(ws: Blockly.WorkspaceSvg, state: LayerState, sectionOf: SectionOf = NO_SECTIONS): void {
  const shown = ws.getTopBlocks(true).filter((b) => b.isMovable() && isShownIn(b, state, sectionOf))
  Blockly.Events.setGroup(true)
  try {
    let y = 0
    for (const b of shown) {
      const s = placed(b)
      const top = s.labelled ? y + LABEL_BAND : y
      b.moveBy(-s.left, top - s.top)
      y = top + (s.bottom - s.top) + STACK_GAP
    }
  } finally {
    Blockly.Events.setGroup(false)
  }
}

/**
 * A brick with sections keeps its scripts where it always has, so its top view would open on a few scripts with screens of
 * empty space between them (where the folded ones sit). For this visit only, the shown layer is drawn packed into tidy
 * columns: the moves fire no events and make no undo steps, and `toSaved` writes every saved place back into what the
 * editor saves. A stack the kid drags keeps its offset, so it saves as moved by the same amount.
 */
export class PackedLayout {
  private readonly offsets = new Map<string, { dx: number; dy: number }>()
  constructor(readonly workspace: Blockly.WorkspaceSvg) {}

  /** Put every packed stack back where it is saved. */
  unpack(): void {
    Blockly.Events.disable()
    try {
      for (const [id, o] of this.offsets) {
        const b = this.workspace.getBlockById(id)
        if (b && !b.getParent()) b.moveBy(-o.dx, -o.dy)
      }
    } finally {
      Blockly.Events.enable()
    }
    this.offsets.clear()
  }

  /** Draw these stacks packed into columns (as columnLayout), every column starting at the same height. */
  pack(stacks: Blockly.BlockSvg[]): void {
    this.unpack()
    if (!stacks.length) return
    const at = stacks.map(placed)
    const target = columnLayout(at)
    const top = Math.min(...at.map((s) => (s.labelled ? s.top - LABEL_BAND : s.top)))
    const columnTop = new Map<number, number>()
    for (const s of at) {
      const to = target.get(s.id)!
      const start = to.y - (s.labelled ? LABEL_BAND : 0)
      columnTop.set(to.x, Math.min(columnTop.get(to.x) ?? Infinity, start))
    }
    Blockly.Events.disable()
    try {
      for (const s of at) {
        const to = target.get(s.id)!
        const dx = Math.round(to.x - s.left)
        const dy = Math.round(to.y - (columnTop.get(to.x)! - top) - s.top)
        if (!dx && !dy) continue
        this.workspace.getBlockById(s.id)?.moveBy(dx, dy)
        this.offsets.set(s.id, { dx, dy })
      }
    } finally {
      Blockly.Events.enable()
    }
  }

  /** A packed stack joined another one: it has no place of its own any more. */
  forget(id: string): void {
    this.offsets.delete(id)
  }

  /** The editor's save, with every packed stack at its saved place. */
  toSaved<T>(json: T): T {
    const tops = (json as { blocks?: { blocks?: Array<{ id?: string; x?: number; y?: number }> } }).blocks?.blocks
    if (!this.offsets.size || !Array.isArray(tops)) return json
    for (const b of tops) {
      const o = b.id ? this.offsets.get(b.id) : undefined
      if (!o) continue
      if (typeof b.x === 'number') b.x -= o.dx
      if (typeof b.y === 'number') b.y -= o.dy
    }
    return json
  }
}

/** Can the workspace undo / redo right now? (Blockly keeps its stacks private, so read them defensively.) */
export function undoState(ws: Blockly.Workspace): { canUndo: boolean; canRedo: boolean } {
  const w = ws as unknown as { undoStack_?: unknown[]; redoStack_?: unknown[] }
  return { canUndo: (w.undoStack_?.length ?? 0) > 0, canRedo: (w.redoStack_?.length ?? 0) > 0 }
}
