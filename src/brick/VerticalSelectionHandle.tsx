import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import './vertical-selection-handle.css'
import { MoveVertical } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { Vector3 } from 'three'
import { getBuildBounds } from './bounds'
import { PLATE_HEIGHT } from './parts'
import { selectionDraftIsValid, useBrickStore, type BrickState } from './store'
import { finishVerticalSelectionMove, verticalDragHeight } from './verticalSelectionDrag'

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
}

/** A DOM handle isolates vertical gestures from canvas orbit, marquee and brick drag. */
export function VerticalSelectionHandle() {
  const { camera, size } = useThree()
  const bricks = useBrickStore((state) => state.bricks)
  const selectedIds = useBrickStore((state) => state.selectedIds)
  const selectedId = useBrickStore((state) => state.selectedId)
  const draft = useBrickStore((state) => state.draft)
  const movingSelection = useBrickStore((state) => state.movingSelection)
  const active = useRef<Drag | null>(null)
  const selected = useMemo(() => {
    const ids = new Set(selectedIds.length ? selectedIds : selectedId ? [selectedId] : [])
    return bricks.filter((brick) => ids.has(brick.id))
  }, [bricks, selectedIds, selectedId])
  const bounds = useMemo(() => getBuildBounds(selected), [selected])
  const owned = Boolean(active.current && active.current.selection === movingSelection)
  const deltaY = owned && draft ? (draft.y - active.current!.startY) * PLATE_HEIGHT : 0
  const position: [number, number, number] = [bounds.center[0], bounds.max[1] + deltaY, bounds.center[2]]
  const valid = !owned || selectionDraftIsValid(useBrickStore.getState())

  const finish = useCallback((commit: boolean) => {
    const drag = active.current
    if (!drag) return
    active.current = null
    const state = useBrickStore.getState()
    if (state.movingSelection === drag.selection) finishVerticalSelectionMove(state, commit)
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
      if (active.current && (state.mode !== 'build' || state.movingSelection !== active.current.selection)) cancel()
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
    active.current = {
      pointerId: event.pointerId, element: event.currentTarget, selection: state.movingSelection,
      startClientY: event.clientY, startY: state.draft.y,
      lowestY: Math.min(...state.movingSelection.originals.map((brick) => brick.y)),
      highestY: Math.max(...state.movingSelection.originals.map((brick) => brick.y)),
      x: state.draft.x, z: state.draft.z, pixelsPerPlate: (screen.y - above.y) * size.height / 2,
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
    useBrickStore.getState().setDraftPosition(drag.x, y, drag.z)
  }

  if (!selected.length || (draft && !owned)) return null
  return (
    <Html position={position} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
      <button
        type="button"
        aria-label="Drag selection up or down"
        title="Drag up or down to change height. Escape cancels. You can also use the height buttons in the selection panel."
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={(event) => { event.stopPropagation(); if (active.current?.pointerId === event.pointerId) finish(true) }}
        onPointerCancel={() => finish(false)}
        onLostPointerCapture={() => finish(false)}
        onClick={(event) => { event.preventDefault(); event.stopPropagation() }}
        className={`vertical-selection-handle${owned ? ' is-dragging' : ''}${valid ? '' : ' is-blocked'}`}
      >
        <span className="vertical-selection-handle-grip"><MoveVertical size={17} aria-hidden="true" /></span>
        {owned && draft && <span className="vertical-selection-handle-value">{draft.y - active.current!.startY >= 0 ? '+' : ''}{draft.y - active.current!.startY}</span>}
      </button>
    </Html>
  )
}
