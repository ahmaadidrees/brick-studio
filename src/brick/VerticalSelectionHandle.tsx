import { getBuildPlateSize } from './buildPlate'
import { Html } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import './vertical-selection-handle.css'
import { MoveVertical } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Vector3 } from 'three'
import { getBuildBounds } from './bounds'
import { BRICK_PART_MAP, PLATE_HEIGHT, STUD, rotatedSize } from './parts'
import { selectionDraftIsValid, useBrickStore, type BrickState } from './store'
import { finishVerticalSelectionMove, verticalDragHeight } from './verticalSelectionDrag'
import { isRoboticsPrototypeEnabled } from '../robotics/flag'
import { REFUSAL_TEXT, handleOffset, restOffsets } from '../robotics/basics/support'
import { keepsStudioNudge } from '../robotics/basics/moves'

type Drag = {
  pointerId: number
  element: HTMLButtonElement
  selection: BrickState['movingSelection']
  startClientY: number
  startY: number
  lowestY: number
  highestY: number
  x: number
  z: number
  pixelsPerPlate: number
  /**
   * Robot Workshop kid basics (prototype only): the heights (offsets from the start) the selection can
   * sit at in its column; the handle moves between them so a part is never left in the air.
   */
  restOffsets?: number[]
  /** Kid basics: the student pulled higher than anywhere it can sit (said on release). */
  pulledIntoAir?: boolean
}

/** Robot Workshop kid basics: pixels kept between the top of the selection on screen and the handle. */
const KID_HANDLE_GAP_PX = 30

/** A DOM handle isolates vertical gestures from canvas orbit, marquee and brick drag. */
export function VerticalSelectionHandle() {
  const { camera, size } = useThree()
  const plateSize = useBrickStore(state => getBuildPlateSize(state.documentMetadata))
  const bricks = useBrickStore((state) => state.bricks)
  const selectedIds = useBrickStore((state) => state.selectedIds)
  const selectedId = useBrickStore((state) => state.selectedId)
  const draft = useBrickStore((state) => state.draft)
  const movingSelection = useBrickStore((state) => state.movingSelection)
  const graphicsPaused = useBrickStore((state) => state.graphicsPaused)
  const active = useRef<Drag | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const selected = useMemo(() => {
    const ids = new Set(selectedIds.length ? selectedIds : selectedId ? [selectedId] : [])
    return bricks.filter((brick) => ids.has(brick.id))
  }, [bricks, selectedIds, selectedId])
  const bounds = useMemo(() => getBuildBounds(selected, plateSize), [selected, plateSize])
  const owned = Boolean(active.current && active.current.selection === movingSelection)
  const deltaY = owned && draft ? (draft.y - active.current!.startY) * PLATE_HEIGHT : 0
  const position: [number, number, number] = [bounds.center[0], bounds.max[1] + deltaY, bounds.center[2]]
  const valid = !owned || selectionDraftIsValid(useBrickStore.getState())
  const kid = isRoboticsPrototypeEnabled()

  // Robot Workshop kid basics (prototype only): the handle floats clear above the selection on screen,
  // never over the part itself, so grabbing a part anywhere (even from the top view, where the part's
  // middle is right under its top) drags it sideways instead of starting a height change.
  const corner = useMemo(() => new Vector3(), [])
  const anchor = useMemo(() => new Vector3(), [])
  useFrame(() => {
    const element = button.current
    if (!kid || !element || !selected.length) return
    anchor.set(...position).project(camera)
    const anchorY = (1 - anchor.y) * size.height / 2
    let top = anchorY
    const lift = deltaY / PLATE_HEIGHT
    for (const brick of selected) {
      const part = BRICK_PART_MAP[brick.partId]
      if (!part) continue
      const footprint = rotatedSize(part, brick.rotation)
      const x0 = (brick.x - plateSize / 2) * STUD
      const z0 = (brick.z - plateSize / 2) * STUD
      for (const dx of [0, footprint.width]) for (const dz of [0, footprint.depth]) for (const dy of [0, part.height]) {
        corner.set(x0 + dx * STUD, (brick.y + dy + lift) * PLATE_HEIGHT, z0 + dz * STUD).project(camera)
        if (corner.z > -1 && corner.z < 1) top = Math.min(top, (1 - corner.y) * size.height / 2)
      }
    }
    // Clear of the part, but never pushed off the top of the canvas.
    const shift = Math.max(16, Math.min(anchorY - 28, anchorY - top + KID_HANDLE_GAP_PX))
    element.style.transform = `translateY(${-Math.round(shift)}px)`
  })

  const finish = useCallback((commit: boolean) => {
    const drag = active.current
    if (!drag) return
    active.current = null
    const state = useBrickStore.getState()
    // Kid basics: a pull into the air that could not lift the part says why instead of doing nothing silently.
    const refusedFloat = commit && drag.pulledIntoAir && state.draft?.y === drag.startY
    if (state.movingSelection === drag.selection) finishVerticalSelectionMove(state, commit)
    if (refusedFloat) useBrickStore.setState({ toast: REFUSAL_TEXT.cannotFloat })
    useBrickStore.getState().setGrabInProgress(false)
    if (drag.element.hasPointerCapture?.(drag.pointerId)) drag.element.releasePointerCapture(drag.pointerId)
  }, [])

  useEffect(() => {
    const cancel = () => finish(false)
    const visibility = () => { if (document.visibilityState !== 'visible') cancel() }
    const key = (event: KeyboardEvent) => {
      if (!active.current || event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      cancel()
    }
    const unsubscribe = useBrickStore.subscribe((state) => {
      if (active.current && (state.graphicsPaused || state.mode !== 'build' || state.movingSelection !== active.current.selection)) cancel()
    })
    window.addEventListener('blur', cancel)
    window.addEventListener('resize', cancel)
    window.addEventListener('orientationchange', cancel)
    window.addEventListener('keydown', key, true)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      unsubscribe()
      window.removeEventListener('blur', cancel)
      window.removeEventListener('resize', cancel)
      window.removeEventListener('orientationchange', cancel)
      window.removeEventListener('keydown', key, true)
      document.removeEventListener('visibilitychange', visibility)
      cancel()
    }
  }, [finish])

  const start = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.button !== 0 || active.current || !selected.length || useBrickStore.getState().draft) return
    const screen = new Vector3(...position).project(camera)
    const above = new Vector3(position[0], position[1] + PLATE_HEIGHT, position[2]).project(camera)
    useBrickStore.getState().startMove()
    const state = useBrickStore.getState()
    if (!state.draft || !state.movingSelection) return
    const moving = new Set(state.movingSelection.originals.map((brick) => brick.id))
    active.current = {
      pointerId: event.pointerId, element: event.currentTarget, selection: state.movingSelection,
      startClientY: event.clientY, startY: state.draft.y,
      lowestY: Math.min(...state.movingSelection.originals.map((brick) => brick.y)),
      highestY: Math.max(...state.movingSelection.originals.map((brick) => brick.y)),
      x: state.draft.x, z: state.draft.z, pixelsPerPlate: (screen.y - above.y) * size.height / 2,
      // A lone axle or wheel keeps the studio's free handle, as it keeps the studio's arrows (moves.ts).
      ...(kid && !keepsStudioNudge(state.movingSelection.originals) ? { restOffsets: restOffsets(state.movingSelection.originals, state.bricks.filter((brick) => !moving.has(brick.id)), plateSize) } : {}),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    state.setGrabInProgress(true)
  }
  const move = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const drag = active.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const y = verticalDragHeight(drag.startY, drag.lowestY, drag.startClientY, event.clientY, drag.pixelsPerPlate, drag.highestY)
    if (drag.restOffsets) {
      // Kid basics: only heights where it sits on something (the ground or a brick under it).
      const requested = y - drag.startY
      const offset = handleOffset(requested, drag.restOffsets) ?? 0
      drag.pulledIntoAir = requested > offset
      useBrickStore.getState().setDraftPosition(drag.x, drag.startY + offset, drag.z)
      return
    }
    useBrickStore.getState().setDraftPosition(drag.x, y, drag.z)
  }

  if (!selected.length || (draft && !owned)) return null
  return (
    <Html position={position} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <button
        ref={button}
        type="button"
        aria-label="Drag selection up or down"
        title="Drag up or down to change height. Escape cancels. You can also use the height buttons in the selection panel."
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={(event) => { event.stopPropagation(); if (active.current?.pointerId === event.pointerId) finish(true) }}
        onPointerCancel={() => finish(false)}
        onLostPointerCapture={() => finish(false)}
        onClick={(event) => { event.preventDefault(); event.stopPropagation() }}
        inert={graphicsPaused}
        className={`vertical-selection-handle${owned ? ' is-dragging' : ''}${valid ? '' : ' is-blocked'}`}
      >
        <span className="vertical-selection-handle-grip"><MoveVertical size={17} aria-hidden="true" /></span>
        {owned && draft && <span className="vertical-selection-handle-value">{draft.y - active.current!.startY >= 0 ? '+' : ''}{draft.y - active.current!.startY}</span>}
      </button>
    </Html>
  )
}
