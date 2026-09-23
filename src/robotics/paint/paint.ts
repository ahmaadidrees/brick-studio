import { create } from 'zustand'
import { MAX_HISTORY_ENTRIES, useBrickStore, type BrickHistoryDelta, type BrickHistoryEntry } from '../../brick/store'
import { useCodeView } from '../code/codeViewState'
import { useDriveView } from '../drive/driveViewState'
import { registerBrickTap } from '../scene/brickTap'
import { useRoboticsStore } from '../state/roboticsStore'
import { ownerOf, useRobotFocus } from '../ui/robotFocus'
import { colorName, keepsItsColor, robotPaintTargets, sameColor } from './paintRules'
import { registerSelectionPainter } from './selectionPaint'

export { PAINT_COLORS, colorName, keepsItsColor, robotLooksPainted, robotPaintTargets, sameColor } from './paintRules'

/**
 * Painting a robot the way a third grader expects (docs/robotics/KID-UX.md; lane P): pick a
 * colour in the robot panel's Paint row and every brick tapped after that turns that colour
 * (one Undo each) until Done or Esc; "Paint all of <name>" paints the whole robot in one Undo.
 *
 * The colour is the studio's own brush (`activeColor`), so the drawer's Brush color swatches
 * change it too, and the next brick armed from the drawer comes in it. While painting nothing
 * is armed or selected: a tap on a brick is taken from the studio (`scene/brickTap.ts`) and
 * paints it instead of selecting it; arming a part, selecting something, leaving Build or
 * opening Drive / Try it / Code ends it.
 */
export type PaintState = {
  painting: boolean
  start: () => void
  stop: () => void
}

export const usePaintMode = create<PaintState>((set) => ({
  painting: false,
  start: () => set((state) => (state.painting ? state : { painting: true })),
  stop: () => set((state) => (state.painting ? { painting: false } : state)),
}))

function appendHistory(stack: BrickHistoryEntry[], entry: BrickHistoryEntry) {
  const next = [...stack, entry]
  return next.length > MAX_HISTORY_ENTRIES ? next.slice(next.length - MAX_HISTORY_ENTRIES) : next
}

/**
 * Recolours these bricks as one Undo, like the command strip's Color does for a selection. By
 * default nothing is selected before or after it (so Undo never picks a brick while painting);
 * `selection` records what Undo and Redo pick instead. Bricks already in `color` are left out;
 * answers how many changed.
 */
export function paintBricks(ids: readonly string[], color: string, label?: string, selection: readonly string[] = []): number {
  const state = useBrickStore.getState()
  if (state.graphicsPaused || state.mode !== 'build') return 0
  const wanted = new Set(ids)
  const deltas: BrickHistoryDelta[] = []
  const bricks = state.bricks.map((brick, index) => {
    if (!wanted.has(brick.id) || sameColor(brick.color, color)) return brick
    const after = { ...brick, color }
    deltas.push({ before: { ...brick }, after: { ...after }, beforeIndex: index, afterIndex: index })
    return after
  })
  if (!deltas.length) return 0
  const name = colorName(color)
  const entry: BrickHistoryEntry = {
    deltas,
    selectionBefore: [...selection],
    selectionAfter: [...selection],
    label: label ?? `Paint ${deltas.length === 1 ? 'brick' : `${deltas.length} bricks`}${name ? ` ${name}` : ''}`,
    group: null,
    recordedAt: Date.now(),
  }
  useBrickStore.setState({
    bricks,
    undoStack: appendHistory(state.undoStack, entry),
    redoStack: [],
    announcement: deltas.length === 1 ? `Painted it${name ? ` ${name}` : ''}.` : `Painted ${deltas.length} bricks${name ? ` ${name}` : ''}.`,
  })
  return deltas.length
}

/** "Paint all of <name>": the robot's bricks (see `robotPaintTargets`) in the brush colour, one Undo. */
export function paintRobot(creationId: string, color = useBrickStore.getState().activeColor): number {
  const robot = useRoboticsStore.getState().model.creations.find((creation) => creation.id === creationId)
  if (!robot) return 0
  const name = colorName(color)
  const count = paintBricks(robotPaintTargets(robot, useBrickStore.getState().bricks), color, `Paint ${robot.name}${name ? ` ${name}` : ''}`)
  const message = count ? `${robot.name} is ${name ?? 'your color'} now!` : `${robot.name} is already ${name ?? 'that color'}.`
  useBrickStore.setState({ toast: message, announcement: message })
  return count
}

/** The picked bricks a colour goes on: one brick as it is; several (a whole kit…) without the parts whose colour says what they do. */
function pickedTargets(): string[] {
  const state = useBrickStore.getState()
  const ids = state.selectedIds.length ? state.selectedIds : state.selectedId ? [state.selectedId] : []
  if (ids.length < 2) return [...ids]
  const byId = new Map(state.bricks.map((brick) => [brick.id, brick]))
  return ids.filter((id) => { const brick = byId.get(id); return brick !== undefined && !keepsItsColor(brick.partId) })
}

/**
 * A drawer swatch with bricks picked (the studio calls it through `selectionPaint.ts`): they are
 * painted as one Undo that picks them again, and the brush takes the colour.
 */
export function paintPicked(color: string): boolean {
  const state = useBrickStore.getState()
  if (state.draft || state.graphicsPaused || state.mode !== 'build') return false
  const selection = state.selectedIds.length ? state.selectedIds : state.selectedId ? [state.selectedId] : []
  if (!selection.length) return false
  paintBricks(pickedTargets(), color, undefined, selection)
  useBrickStore.setState({ activeColor: color })
  return true
}

/**
 * Starts painting in `color` (a Paint chip, or the "Paint it your colors" idea). Whatever was
 * picked is painted first (one Undo, as a drawer swatch paints it); then nothing stays armed or
 * picked, so the next tap on a brick paints it.
 */
export function startPainting(color = useBrickStore.getState().activeColor) {
  const brick = useBrickStore.getState()
  if (brick.graphicsPaused || brick.mode !== 'build') return
  if (!brick.draft) paintBricks(pickedTargets(), color)
  const name = colorName(color)
  useBrickStore.setState({
    activeColor: color,
    draft: null,
    activePartId: null,
    movingId: null,
    movingSelection: null,
    selectedIds: [],
    selectedId: null,
    announcement: `Painting${name ? ` ${name}` : ''}. Tap bricks to paint them. Press Escape or Done to stop.`,
  })
  usePaintMode.getState().start()
}

export function stopPainting() {
  usePaintMode.getState().stop()
}

/** A tap (or a box) on bricks while painting: they are painted, and their robot is the one the panel shows. */
function paintTap(ids: readonly string[]): boolean {
  const brick = useBrickStore.getState()
  if (brick.mode !== 'build') return false
  paintBricks(ids, brick.activeColor)
  const owner = ownerOf(useRoboticsStore.getState().model.creations, ids[0])
  if (owner) useRobotFocus.getState().focus(owner.id)
  return true
}

const EDITABLE = 'input, textarea, select, [contenteditable="true"]'

function escapeStops(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  // A dialog (Any color) and a text field (a name being typed) own their Escape.
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
  if (event.target instanceof Element && event.target.closest(EDITABLE)) return
  event.preventDefault()
  event.stopPropagation()
  stopPainting()
}

let unsubscribers: (() => void)[] = []

/**
 * Wires paint mode to the studio, once (the robot panel installs it): while painting, brick taps
 * are taken and Escape stops; arming a part, selecting, leaving Build or opening Drive, Try it or
 * Code stops it.
 */
export function installPaintMode() {
  if (unsubscribers.length) return
  registerSelectionPainter(paintPicked)
  unsubscribers = [
    () => registerSelectionPainter(null),
    usePaintMode.subscribe((state, previous) => {
      if (state.painting === previous.painting) return
      if (state.painting) {
        registerBrickTap(paintTap)
        window.addEventListener('keydown', escapeStops, true)
      } else {
        registerBrickTap(null)
        window.removeEventListener('keydown', escapeStops, true)
      }
    }),
    useBrickStore.subscribe((state) => {
      if (!usePaintMode.getState().painting) return
      if (state.mode !== 'build' || state.draft !== null || state.selectedIds.length > 0 || state.selectedId !== null) stopPainting()
    }),
    useDriveView.subscribe((state) => { if (state.creationId) stopPainting() }),
    useCodeView.subscribe((state) => { if (state.creationId) stopPainting() }),
  ]
}

/** For tests: stop painting and forget the wiring, so fresh stores can install it again. */
export function resetPaintModeForTests() {
  usePaintMode.getState().stop()
  for (const unsubscribe of unsubscribers) unsubscribe()
  unsubscribers = []
  registerBrickTap(null)
  if (typeof window !== 'undefined') window.removeEventListener('keydown', escapeStops, true)
}
