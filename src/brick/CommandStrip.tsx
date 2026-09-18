import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Cuboid,
  Focus,
  Layers3,
  Move,
  Palette,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { CustomColorPicker } from './CustomColorPicker'
import { BRICK_COLORS, BRICK_PART_MAP } from './parts'
import { useBrickStore } from './store'
import './command-strip.css'

/**
 * One floating strip at the bottom of the canvas that says what the builder is holding and what
 * they can do with it. It replaces the placing panel, the placement pill, the desktop selection
 * panel, the touch selection bar and the shortcut hint bubble. Three states:
 *
 * - idle: nothing loaded, nothing selected → "Pick a brick from the drawer".
 * - brush: a draft is armed (placing, moving or duplicating) → name, Rotate, Raise/Lower, Cancel, Place.
 * - selected: one or more placed bricks → name or count, Rotate, Duplicate, Color, Delete, Adjust.
 *
 * Keyboard hints hide on coarse pointers; every action reuses the store command that the
 * keyboard shortcut in BrickStudioApp already calls, so the two never drift.
 */
export type CommandStripProps = {
  /** Coarse pointer: hide the keyboard hints and rely on the visible buttons. */
  coarsePointer: boolean
  /** Opens the Resize sheet for the current selection (BuildShell owns the sheet). */
  onResize: () => void
}

type ColorPaletteProps = {
  /** The color the palette is editing; a swatch outside the twelve shows as "Any color". */
  targetColor: string
  onPick: (color: string) => void
  /** Accessible name of the swatch grid. */
  label: string
}

/** Twelve swatches plus "Any color" (the existing CustomColorPicker). Shared by the drawer and the strip. */
export function ColorPalette({ targetColor, onPick, label }: ColorPaletteProps) {
  const [customOpen, setCustomOpen] = useState(false)
  const customSelected = !BRICK_COLORS.some((color) => color.toLowerCase() === targetColor.toLowerCase())
  return (
    <>
      <div className="color-grid" role="group" aria-label={label}>
        {BRICK_COLORS.map((color) => {
          const selected = targetColor.toLowerCase() === color.toLowerCase()
          return (
            <button
              key={color}
              type="button"
              className={selected ? 'active' : ''}
              style={{ background: color }}
              onClick={() => onPick(color)}
              aria-label={`Use color ${color}`}
              aria-pressed={selected}
            >
              {selected && <Check size={13} aria-hidden="true" />}
            </button>
          )
        })}
        <button
          type="button"
          className={`brick-any-color${customSelected ? ' active' : ''}`}
          style={customSelected ? { background: targetColor } : undefined}
          aria-pressed={customSelected}
          aria-label="Choose any brick color"
          title="Any color"
          aria-haspopup="dialog"
          onClick={() => setCustomOpen(true)}
        >{customSelected ? <Check size={13} aria-hidden="true" /> : '+'}</button>
      </div>
      {customOpen && <CustomColorPicker color={targetColor} onApply={onPick} onClose={() => setCustomOpen(false)} />}
    </>
  )
}

function TransformControls({ count, onResize }: { count: number; onResize: () => void }) {
  const nudge = useBrickStore((state) => state.nudge)
  const selectionLabel = count === 1 ? 'brick' : `${count} bricks`
  return (
    <div className="transform-controls" role="group" aria-label={`Position and size ${selectionLabel}`}>
      <button type="button" aria-label={`Move ${selectionLabel} left one stud`} onClick={() => nudge(-1, 0, 0)}><span aria-hidden="true">←</span><small>Left</small></button>
      <button type="button" aria-label={`Move ${selectionLabel} forward one stud`} onClick={() => nudge(0, 0, -1)}><span aria-hidden="true">↑</span><small>Forward</small></button>
      <button type="button" aria-label={`Move ${selectionLabel} back one stud`} onClick={() => nudge(0, 0, 1)}><span aria-hidden="true">↓</span><small>Back</small></button>
      <button type="button" aria-label={`Move ${selectionLabel} right one stud`} onClick={() => nudge(1, 0, 0)}><span aria-hidden="true">→</span><small>Right</small></button>
      <button type="button" aria-label={`Raise ${selectionLabel} one plate`} onClick={() => nudge(0, 1, 0)}><ChevronUp size={18} aria-hidden="true" /><small>Raise</small></button>
      <button type="button" aria-label={`Lower ${selectionLabel} one plate`} onClick={() => nudge(0, -1, 0)}><ChevronDown size={18} aria-hidden="true" /><small>Lower</small></button>
      <button type="button" aria-label={`Resize ${selectionLabel}`} onClick={onResize}><Cuboid size={18} aria-hidden="true" /><small>Resize</small></button>
    </div>
  )
}

type ColorPopoverProps = {
  color: string
  count: number
  onPick: (color: string) => void
  onClose: () => void
}

/**
 * Non-modal popover above the Color button. Escape and an outside tap close it (Escape is taken in the
 * capture phase so the builder shortcut does not also clear the selection); "Any color" stacks the
 * existing CustomColorPicker dialog on top and that dialog owns Escape while it is open.
 */
function ColorPopover({ color, count, onPick, onClose }: ColorPopoverProps) {
  const panel = useRef<HTMLDivElement>(null)
  const headingId = useId()
  useEffect(() => {
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // A stacked modal (Any color) owns Escape.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      event.stopPropagation()
      event.preventDefault()
      onClose()
    }
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (panel.current?.contains(target)) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')?.contains(target)) return
      onClose()
    }
    window.addEventListener('keydown', closeOnEscape, true)
    window.addEventListener('pointerdown', closeOnOutsidePointer)
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true)
      window.removeEventListener('pointerdown', closeOnOutsidePointer)
    }
  }, [onClose])
  return (
    <div ref={panel} className="command-strip-popover" role="dialog" aria-labelledby={headingId}>
      <div className="command-strip-popover-title" id={headingId}>{count > 1 ? `Color all ${count} bricks` : 'Brick color'}</div>
      <ColorPalette targetColor={color} onPick={onPick} label="Brick color" />
    </div>
  )
}

function BrushState({ coarsePointer }: { coarsePointer: boolean }) {
  const draft = useBrickStore((state) => state.draft)
  const movingId = useBrickStore((state) => state.movingId)
  const movingSelection = useBrickStore((state) => state.movingSelection)
  const brickCount = useBrickStore((state) => state.bricks.length)
  const placeDraft = useBrickStore((state) => state.placeDraft)
  const rotate = useBrickStore((state) => state.rotate)
  const nudge = useBrickStore((state) => state.nudge)
  const cancelInteraction = useBrickStore((state) => state.cancelInteraction)
  if (!draft) return null
  const part = BRICK_PART_MAP[draft.partId]
  if (!part) return null
  const groupSize = movingSelection?.originals.length ?? 0
  const moving = Boolean(movingId || movingSelection)
  const eyebrow = movingSelection?.duplicate ? 'Duplicating' : movingId ? 'Moving' : 'Placing'
  const name = groupSize > 1 ? `${groupSize} bricks` : part.name
  const hint = moving
    ? 'Click to drop · Esc cancels the move'
    : brickCount === 0 ? 'Click the plate to place your first brick · Esc puts the brick down' : 'Click to place · Esc puts the brick down'
  return (
    <div className="command-strip-row" role="group" aria-label="Positioned brick actions" data-state={moving ? 'moving' : 'brush'}>
      <span className="command-strip-chip">
        <span className="command-strip-swatch" style={{ background: draft.color }} aria-hidden="true" />
        <span className="command-strip-chip-text"><span className="brick-eyebrow">{eyebrow}</span><strong>{name}</strong></span>
      </span>
      {!coarsePointer && <span className="command-strip-hint">{hint}</span>}
      <div className="command-strip-actions">
        <button className="command-strip-button" type="button" aria-label="Rotate" title="Rotate (R)" disabled={groupSize > 1} onClick={rotate}><RotateCw size={18} aria-hidden="true" /><span>Rotate</span></button>
        <button className="command-strip-button command-strip-icon" type="button" aria-label="Raise brick one plate" title="Raise one plate (Page Up)" onClick={() => nudge(0, 1, 0)}><ChevronUp size={18} aria-hidden="true" /></button>
        <button className="command-strip-button command-strip-icon" type="button" aria-label="Lower brick one plate" title="Lower one plate (Page Down)" onClick={() => nudge(0, -1, 0)}><ChevronDown size={18} aria-hidden="true" /></button>
        <button className="command-strip-button" type="button" aria-label="Cancel" title="Put the brick down (Esc)" onClick={cancelInteraction}><X size={18} aria-hidden="true" /><span>Cancel</span></button>
        <button className="command-strip-button command-strip-primary" type="button" aria-label={movingSelection?.duplicate ? 'Place duplicate' : moving ? 'Place moved brick' : 'Place positioned brick'} title="Place (Enter)" onClick={() => placeDraft()}><Check size={18} aria-hidden="true" /><span>{moving ? 'Place move' : 'Place'}</span></button>
      </div>
    </div>
  )
}

function SelectedState({ coarsePointer, onResize }: CommandStripProps) {
  const bricks = useBrickStore((state) => state.bricks)
  const selectedIds = useBrickStore((state) => state.selectedIds)
  const selectedId = useBrickStore((state) => state.selectedId)
  const rotate = useBrickStore((state) => state.rotate)
  const duplicate = useBrickStore((state) => state.duplicate)
  const deleteSelected = useBrickStore((state) => state.deleteSelected)
  const copy = useBrickStore((state) => state.copy)
  const paste = useBrickStore((state) => state.paste)
  const startMove = useBrickStore((state) => state.startMove)
  const requestView = useBrickStore((state) => state.requestView)
  const setColor = useBrickStore((state) => state.setActiveColor)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [colorOpen, setColorOpen] = useState(false)
  const colorTrigger = useRef<HTMLButtonElement>(null)
  const adjustId = useId()
  const count = selectedIds.length
  const selected = bricks.find((brick) => brick.id === selectedId) ?? bricks.find((brick) => selectedIds.includes(brick.id))
  useEffect(() => { if (count === 0) setColorOpen(false) }, [count])
  if (!selected || !count) return null
  const part = BRICK_PART_MAP[selected.partId]
  const single = count === 1
  const label = single ? 'brick' : `${count} selected bricks`
  const closeColor = () => { setColorOpen(false); colorTrigger.current?.focus({ preventScroll: true }) }
  return (
    <div className="command-strip-row" role="group" aria-label={single ? 'Selected brick actions' : `${count} bricks selected`} data-state="selected">
      <span className="command-strip-chip">
        {single
          ? <span className="command-strip-swatch" style={{ background: selected.color }} aria-hidden="true" />
          : <span className="command-strip-swatch command-strip-swatch-multi" aria-hidden="true"><Layers3 size={16} /></span>}
        <span className="command-strip-chip-text"><span className="brick-eyebrow">{single ? 'Selected' : 'Selection'}</span><strong>{single ? part?.name ?? 'Brick' : `${count} bricks`}</strong></span>
      </span>
      {!coarsePointer && <span className="command-strip-hint">Drag to move · R rotate · Esc clears the selection</span>}
      <div className="command-strip-actions">
        <button className="command-strip-button" type="button" aria-label={single ? 'Rotate brick' : `Rotate ${count} bricks`} title="Rotate (R)" onClick={rotate}><RotateCw size={18} aria-hidden="true" /><span>Rotate</span></button>
        <button className="command-strip-button" type="button" aria-label={`Duplicate ${label}`} title="Duplicate (⌘D)" onClick={duplicate}><Copy size={18} aria-hidden="true" /><span>Duplicate</span></button>
        <span className="command-strip-anchor">
          <button ref={colorTrigger} className={`command-strip-button${colorOpen ? ' active' : ''}`} type="button" aria-label={`Recolor ${label}`} aria-haspopup="dialog" aria-expanded={colorOpen} onClick={() => setColorOpen((open) => !open)}>
            <span className="command-strip-color-dot" style={{ background: selected.color }} aria-hidden="true"><Palette size={12} /></span><span>Color</span>
          </button>
          {colorOpen && <ColorPopover color={selected.color} count={count} onPick={setColor} onClose={closeColor} />}
        </span>
        <button className="command-strip-button danger" type="button" aria-label={`Delete ${label}`} title="Delete (Delete)" onClick={deleteSelected}><Trash2 size={18} aria-hidden="true" /><span>Delete</span></button>
        <button className={`command-strip-button command-strip-adjust${adjustOpen ? ' active' : ''}`} type="button" aria-expanded={adjustOpen} aria-controls={adjustId} onClick={() => setAdjustOpen((open) => !open)}><SlidersHorizontal size={18} aria-hidden="true" /><span>Adjust</span></button>
      </div>
      {adjustOpen && (
        <div className="command-strip-details" id={adjustId} role="region" aria-label="Brick properties and editing actions" tabIndex={0}>
          <TransformControls count={count} onResize={onResize} />
          <div className="command-strip-secondary">
            <button type="button" onClick={startMove} aria-label={single ? 'Move brick' : 'Move selected bricks'}><Move size={16} aria-hidden="true" />Move</button>
            <button type="button" onClick={copy} aria-label={`Copy ${label}`}>Copy</button>
            <button type="button" onClick={paste} aria-label="Paste copied bricks">Paste</button>
            <button type="button" onClick={() => requestView('selection')} aria-label={single ? 'Focus selected brick' : 'Focus selected bricks'}><Focus size={16} aria-hidden="true" />Focus</button>
          </div>
          {single && <div className="coordinates"><span>X <strong>{selected.x}</strong></span><span>Height <strong>{selected.y}</strong></span><span>Z <strong>{selected.z}</strong></span></div>}
        </div>
      )}
    </div>
  )
}

/** Keyboard/screen-reader path to each placed brick: the list mirrors [ and ] (the shortcuts stay in the editor). */
function JumpToBrick() {
  const bricks = useBrickStore((state) => state.bricks)
  const selectBrick = useBrickStore((state) => state.selectBrick)
  const id = useId()
  if (!bricks.length) return null
  return (
    <span className="command-strip-jump">
      <label htmlFor={id}>Jump to brick</label>
      <select id={id} value="" aria-keyshortcuts="BracketLeft BracketRight" title="Select a placed brick ([ and ] step through them)" onChange={(event) => { if (event.target.value) selectBrick(event.target.value) }}>
        <option value="">{`Choose 1 of ${bricks.length}`}</option>
        {bricks.map((brick, index) => (
          <option key={brick.id} value={brick.id}>{index + 1}. {BRICK_PART_MAP[brick.partId]?.name ?? 'Brick'} — X {brick.x}, Y {brick.y}, Z {brick.z}</option>
        ))}
      </select>
    </span>
  )
}

function IdleState({ coarsePointer }: { coarsePointer: boolean }) {
  const brickCount = useBrickStore((state) => state.bricks.length)
  return (
    <div className="command-strip-row command-strip-idle" role="note" aria-label="Build hint" data-state="idle">
      <strong>Pick a brick from the drawer</strong>
      {!coarsePointer && <span className="command-strip-hint">{brickCount ? 'Click a brick to select it · Drag empty space to box-select' : 'Then click the plate to place it'}</span>}
      <JumpToBrick />
    </div>
  )
}

export function CommandStrip({ coarsePointer, onResize }: CommandStripProps) {
  const graphicsPaused = useBrickStore((state) => state.graphicsPaused)
  const hasDraft = useBrickStore((state) => state.draft !== null)
  const hasSelection = useBrickStore((state) => state.selectedIds.length > 0)
  const grabInProgress = useBrickStore((state) => state.grabInProgress)
  // A captured drag freezes the strip so the only thing that animates on release is the Moving state.
  if (grabInProgress) return null
  return (
    <div inert={graphicsPaused} className="command-strip" data-testid="command-strip">
      {hasDraft ? <BrushState coarsePointer={coarsePointer} /> : hasSelection ? <SelectedState coarsePointer={coarsePointer} onResize={onResize} /> : <IdleState coarsePointer={coarsePointer} />}
    </div>
  )
}
