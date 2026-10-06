import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CopyPlacement, Target } from '../core/contracts'
import { activeQuestion, type AskPrompt } from '../core/sensing'
import { StudioStore, useStudio } from './store'
import { FixedStepAccumulator } from './stage/accumulator'
import { AskDialog } from './stage/AskDialog'
import { AudioManager } from './stage/audio'
import {
  clampCamera,
  defaultPlayCameraMode,
  fitCamera,
  followCamera,
  panCamera,
  screenToWorld,
  snapToGrid,
  zoomCameraAt,
  type Camera,
  type PlayCameraMode,
  type Viewport,
} from './stage/camera'
import { browserKeyToScratchKey } from './stage/keys'
import { pickCopy, pickTarget } from './stage/picking'
import { removeCell, selectedCell } from './builder/cells'
import { gridCopyId } from '../core/contracts'
import { builderSession } from './builder/session'
import { addCopyEdit, moveCopyEdit, removeCopyEdit, tileStrokeEdit, type History, type TileChange } from './builder/history'
import { cellsOnLine, decidePress, tileCharAt, worldToCell, type BuildTool, type Cell } from './builder/tilePaint'
import {
  globalImageCache,
  renderBuildMode,
  renderPlayMode,
  type TargetPose,
} from './stage/renderer'
import { StageControls } from './stage/StageControls'
import './stage/stage.css'

/** What the builder chrome hands the stage: the undo history and whether the Erase tool is armed. */
export interface BuildTools {
  history: History
  erasing: boolean
}

/** Bricks snap to an 8-step grid, like the old stage's default. */
const GRID = 8

export function Stage({ store, tools }: { store: StudioStore; tools?: BuildTools }) {
  const mode = useStudio(store, (s) => s.mode)
  const runtime = useStudio(store, (s) => s.runtime)
  const design = useStudio(store, (s) => s.project.design)
  const selectedCopyId = useStudio(store, (s) => s.selectedCopyId)
  const brushBrickId = useStudio(store, (s) => s.brushBrickId)
  const erasing = tools?.erasing ?? false
  const history = tools?.history
  const revision = useStudio(store, (s) => s.revision)
  const selectedBrickId = useStudio(store, (s) => s.selectedBrickId)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Camera and Viewport
  const [viewport, setViewport] = useState<Viewport>({ width: 480, height: 360 })
  const session = builderSession(store)
  const [camera, setCameraState] = useState<Camera>(() => session.camera ?? fitCamera(design.bounds, { width: 480, height: 360 }))
  const setCamera = (next: Camera | ((c: Camera) => Camera)) =>
    setCameraState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      session.camera = value
      return value
    })
  // View state lives here in the UI, never in World. `viewDirty`: the kid moved or zoomed the view, so don't auto-fit.
  const viewDirty = useRef(session.viewDirty)
  // Play camera: 'whole' / 'follow' picked from the controls (null = default for this level and stage size),
  // or free (kid dragged/zoomed), in which case `camera` is used as-is.
  const [playChoice, setPlayChoice] = useState<PlayCameraMode | null>(null)
  const [playFree, setPlayFree] = useState(false)
  // The camera actually used for the last Play frame, so pointer maths matches what is on screen.
  const playCamRef = useRef<Camera>(camera)

  // Build view state (hover only; what is armed lives in the store and the builder chrome)
  const [hoverCopyId, setHoverCopyId] = useState<string | null>(null)
  const [brushPreviewPos, setBrushPreviewPos] = useState<{ x: number; y: number } | null>(null)
  const [tileHover, setTileHover] = useState<Cell | null>(null)
  /** The armed brush, as the pure press logic wants it: a grid brick paints its character, any other brick is placed. */
  const brushBrick = brushBrickId ? design.bricks.find((b) => b.id === brushBrickId) : undefined
  const brushTile = brushBrick?.grid?.char ?? null
  const buildTool: BuildTool = { brushTile, brushBrickId: brushTile ? null : brushBrickId, erasing }

  // Dragging state
  const dragRef = useRef<{
    mode: 'none' | 'pan' | 'panPending' | 'moveCopy' | 'paint'
    moved: boolean
    startScreenX: number
    startScreenY: number
    startWorldX: number
    startWorldY: number
    startCopyX: number
    startCopyY: number
    /** paint: the tile being painted and the cells changed so far (one undo step). */
    paintChar: string
    paintLast: Cell | null
    changes: TileChange[]
  }>({
    mode: 'none',
    moved: false,
    startScreenX: 0,
    startScreenY: 0,
    startWorldX: 0,
    startWorldY: 0,
    startCopyX: 0,
    startCopyY: 0,
    paintChar: '.',
    paintLast: null,
    changes: [],
  })

  // Play animation & interpolation
  const accumulator = useMemo(() => new FixedStepAccumulator(), [])
  const audioManager = useMemo(() => new AudioManager(), [])
  const prevPosesRef = useRef<Map<string, TargetPose>>(new Map())
  const [activeAskPrompt, setActiveAskPrompt] = useState<AskPrompt | null>(null)

  // Re-fit camera when design bounds change initially if needed
  const boundsKey = `${design.bounds.left},${design.bounds.right},${design.bounds.bottom},${design.bounds.top}`
  useEffect(() => {
    // Until the kid moves the view, keep the whole level in view (letterboxed) as the stage or level changes size.
    if (!viewDirty.current) setCamera(fitCamera(design.bounds, viewport))
    else setCamera((cam) => clampCamera(cam, design.bounds))
  }, [boundsKey, design.bounds, viewport])

  // Each Play starts from the default camera.
  useEffect(() => {
    setPlayChoice(null)
    setPlayFree(false)
  }, [mode])

  const playCameraMode: PlayCameraMode = playChoice ?? defaultPlayCameraMode(design.bounds, viewport)

  /** The camera for this moment: Build uses the free camera; Play follows its mode unless the kid took over. */
  const computePlayCamera = useCallback(
    (world: { targets: Target[]; bounds: typeof design.bounds }): Camera => {
      if (playFree) return camera
      if (playCameraMode === 'whole') return fitCamera(world.bounds, viewport)
      const first = world.targets.find((t) => !t.isStage && !t.isClone && t.brickId === selectedBrickId)
      const point = first ?? {
        x: (world.bounds.left + world.bounds.right) / 2,
        y: (world.bounds.bottom + world.bounds.top) / 2,
      }
      return followCamera(world.bounds, viewport, point)
    },
    [playFree, camera, playCameraMode, viewport, selectedBrickId],
  )

  /** Camera used for pointer maths. */
  const activeCamera = (): Camera => (mode === 'play' ? playCamRef.current : camera)

  /** Move or zoom the view from whatever is on screen now. Marks the view as the kid's own. */
  const updateView = (fn: (c: Camera) => Camera) => {
    const base = activeCamera()
    viewDirty.current = true
    session.viewDirty = true
    if (mode === 'play') setPlayFree(true)
    setCamera(clampCamera(fn(base), design.bounds))
  }

  // ResizeObserver on wrapper
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        const w = Math.max(10, Math.floor(entry.contentRect.width))
        const h = Math.max(10, Math.floor(entry.contentRect.height))
        setViewport({ width: w, height: h })
      }
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // Tab visibility changes: pause accumulator to prevent catch-up burst
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        accumulator.pause()
      } else {
        accumulator.resume()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [accumulator])

  // Cleanup audio on unmount
  useEffect(() => {
    return () => audioManager.destroy()
  }, [audioManager])

  // Stop audio on mode change away from play
  useEffect(() => {
    if (mode !== 'play') {
      audioManager.stopAll()
      prevPosesRef.current.clear()
      setActiveAskPrompt(null)
    }
  }, [mode, audioManager])

  // Play keys reach the game wherever focus is (the Play button, the code editor), not only when the stage is focused:
  // a kid presses Play and then the arrows. Text fields keep their keys; events inside the stage use its own handlers.
  useEffect(() => {
    if (mode !== 'play' || !runtime) return
    wrapRef.current?.focus()
    const editable = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    const inStage = (el: EventTarget | null) => el instanceof Node && !!wrapRef.current?.contains(el)
    const onDown = (e: KeyboardEvent) => {
      if (inStage(e.target) || editable(e.target)) return
      const key = browserKeyToScratchKey(e)
      if (key) runtime.pressKey(key)
    }
    const onUp = (e: KeyboardEvent) => {
      if (inStage(e.target)) return
      const key = browserKeyToScratchKey(e)
      if (key) runtime.releaseKey(key)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [mode, runtime])

  // Play loop
  useEffect(() => {
    if (mode !== 'play' || !runtime) return

    let animId: number
    accumulator.reset()

    const loop = (now: number) => {
      const { ticks, alpha } = accumulator.advance(now)

      // Step runtime
      for (let t = 0; t < ticks; t++) {
        // Record previous poses for interpolation
        const currentPoses = new Map<string, TargetPose>()
        for (const target of runtime.world.targets) {
          currentPoses.set(target.id, {
            x: target.x,
            y: target.y,
            direction: target.direction,
            size: target.size,
          })
        }
        prevPosesRef.current = currentPoses

        runtime.step()

        // Handle emitted audio notes
        while (runtime.notes.length > 0) {
          const note = runtime.notes.shift()
          if (note) {
            audioManager.handleNote(note, runtime.world)
          }
        }
      }

      // Check active ask question
      const q = activeQuestion(runtime.world)
      setActiveAskPrompt(q)

      // Render frame
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const playCamera = computePlayCamera(runtime.world)
          playCamRef.current = playCamera
          renderPlayMode(ctx, runtime.world, {
            camera: playCamera,
            viewport,
            prevPoses: prevPosesRef.current,
            interpAlpha: alpha,
          })
        }
      }

      animId = requestAnimationFrame(loop)
    }

    animId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animId)
  }, [mode, runtime, computePlayCamera, viewport, accumulator, audioManager])

  // The brush preview is the armed brick (not while a grid brick or the eraser is armed: those preview on the cell).
  const previewBrickId = brushTile || erasing ? null : brushBrickId
  const tileLayer = design.tiles
  const hoverInfo =
    tileHover && tileLayer && (brushTile || erasing)
      ? { col: tileHover.col, row: tileHover.row, costume: erasing ? null : (brushBrick?.costumes[0] ?? null), erase: erasing }
      : null

  // Render in Build mode whenever design, camera, viewport, selection or brush changes; and when a costume finishes loading.
  useEffect(() => {
    if (mode !== 'build') return
    const draw = () => {
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      renderBuildMode(ctx, design, {
        camera,
        viewport,
        gridSnap: true,
        selectedCopyId,
        hoverCopyId,
        brushBrickId: previewBrickId,
        brushPreviewPos,
        tool: 'brush',
        tileHover: hoverInfo,
      })
    }
    draw()
    return globalImageCache.onImageLoaded(draw)
    // hoverInfo is derived from tileHover, the brush brick and erasing; revision covers design changes.
  }, [mode, design, camera, viewport, selectedCopyId, hoverCopyId, previewBrickId, brushPreviewPos, tileHover, brushBrick, erasing, revision])

  // Helper to get canvas-relative coordinates
  const getCanvasCoords = useCallback((e: { clientX: number; clientY: number }): [number, number] => {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    const rect = canvas.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }, [])

  // Pointer interactions
  const newDrag = (mode: 'none' | 'pan' | 'panPending' | 'moveCopy' | 'paint', sx: number, sy: number, wx: number, wy: number, extra: Partial<typeof dragRef.current> = {}) => {
    dragRef.current = {
      mode,
      moved: false,
      startScreenX: sx,
      startScreenY: sy,
      startWorldX: wx,
      startWorldY: wy,
      startCopyX: 0,
      startCopyY: 0,
      paintChar: '.',
      paintLast: null,
      changes: [],
      ...extra,
    }
  }

  /** Paint (or erase with '.') one cell of the tile layer, remembering what was there for undo. */
  const paintCell = (cell: Cell, ch: string) => {
    const layer = store.getState().project.design.tiles
    if (!layer) return
    const from = tileCharAt(layer, cell.col, cell.row)
    if (from === ch) return
    store.setTile(cell.col, cell.row, ch)
    dragRef.current.changes.push({ col: cell.col, row: cell.row, from, to: ch })
  }

  const finishStroke = () => {
    const drag = dragRef.current
    if (drag.mode === 'paint' && drag.changes.length > 0) history?.push(tileStrokeEdit(store, drag.changes))
    if (drag.mode === 'moveCopy' && drag.moved && selectedCopyId) {
      const copy = store.getState().project.design.copies.find((c) => c.id === selectedCopyId)
      if (copy && history && (copy.x !== drag.startCopyX || copy.y !== drag.startCopyY)) {
        history.push(moveCopyEdit(history, copy.id, { x: drag.startCopyX, y: drag.startCopyY }, { x: copy.x, y: copy.y }))
      }
    }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Canvas takes focus for keyboard events
    wrapRef.current?.focus()
    const [sx, sy] = getCanvasCoords(e)
    const cam = activeCamera()
    const [wx, wy] = screenToWorld(cam, viewport, sx, sy)

    // Middle button or Alt key drags camera in any mode
    if (e.button === 1 || e.altKey) {
      newDrag('pan', sx, sy, wx, wy)
      return
    }

    if (mode === 'play' && runtime) {
      // Play mode: update mouse and click target
      runtime.world.mouse.x = wx
      runtime.world.mouse.y = wy
      runtime.world.mouse.down = true

      const target = pickTarget(runtime.world, wx, wy)
      if (target.isStage) {
        // Empty space: a drag scrolls the view; a plain click (no drag) clicks the stage on release.
        newDrag('panPending', sx, sy, wx, wy)
        return
      }
      runtime.clickTarget(target)
      return
    }

    if (mode === 'build') {
      const design = store.getState().project.design
      // Right-click erases whatever is under the pointer; the Erase tool does the same for the left button.
      const decision = decidePress(design, buildTool, wx, wy, { erase: e.button === 2, snap: GRID })
      switch (decision.kind) {
        case 'select-copy': {
          store.selectCopy(decision.copy.id)
          newDrag('moveCopy', sx, sy, wx, wy, { startCopyX: decision.copy.x, startCopyY: decision.copy.y })
          break
        }
        case 'erase-copy': {
          history?.push(removeCopyEdit(history, decision.copy))
          store.deleteCopy(decision.copy.id)
          break
        }
        case 'paint-tile': {
          newDrag('paint', sx, sy, wx, wy, { paintChar: decision.ch, paintLast: decision.cell })
          paintCell(decision.cell, decision.ch)
          // Erasing the selected cell deselects it.
          if (decision.ch === '.' && store.getState().selectedCopyId === gridCopyId(decision.cell.col, decision.cell.row)) store.selectCopy(null)
          break
        }
        case 'select-cell': {
          // A painted cell: select it (the card shows See inside). With a grid brick armed, a drag keeps painting.
          store.selectCopy(gridCopyId(decision.cell.col, decision.cell.row))
          if (brushTile) newDrag('paint', sx, sy, wx, wy, { paintChar: brushTile, paintLast: decision.cell })
          else newDrag('none', sx, sy, wx, wy)
          break
        }
        case 'place-copy': {
          const id = store.addCopy(decision.brickId, decision.x, decision.y)
          const copy = store.getState().project.design.copies.find((c) => c.id === id)
          if (copy && history) history.push(addCopyEdit(history, copy))
          break
        }
        case 'nothing': {
          // Empty space with nothing armed: deselect, and a drag scrolls the view.
          store.selectCopy(null)
          newDrag('pan', sx, sy, wx, wy)
          break
        }
      }
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = getCanvasCoords(e)
    const [wx, wy] = screenToWorld(activeCamera(), viewport, sx, sy)
    const drag = dragRef.current

    // Drag-to-scroll, in Build and Play.
    if (drag.mode === 'panPending' || drag.mode === 'pan') {
      const dx = sx - drag.startScreenX
      const dy = sy - drag.startScreenY
      if (drag.mode === 'panPending') {
        if (Math.hypot(dx, dy) < 4) return
        drag.mode = 'pan'
      }
      drag.moved = true
      drag.startScreenX = sx
      drag.startScreenY = sy
      updateView((c) => panCamera(c, viewport, dx, dy))
      return
    }

    if (mode === 'play' && runtime) {
      runtime.world.mouse.x = wx
      runtime.world.mouse.y = wy
      return
    }

    if (mode === 'build') {
      const layer = store.getState().project.design.tiles
      if (drag.mode === 'paint' && layer) {
        // A fast drag can skip cells: fill the straight line from the last cell to this one.
        const cell = worldToCell(layer, wx, wy)
        if (cell && drag.paintLast) {
          for (const c of cellsOnLine(drag.paintLast, cell)) paintCell(c, drag.paintChar)
          drag.paintLast = cell
        }
        setTileHover(cell)
      } else if (drag.mode === 'moveCopy' && selectedCopyId) {
        const dx = wx - drag.startWorldX
        const dy = wy - drag.startWorldY
        drag.moved = true
        store.updateCopy(selectedCopyId, { x: snapToGrid(drag.startCopyX + dx, GRID), y: snapToGrid(drag.startCopyY + dy, GRID) })
      } else {
        // Idle move: hover highlight, tile cell and brick preview
        const hit = pickCopy(store.getState().project.design, wx, wy)
        const hoverCell = !hit && layer ? worldToCell(layer, wx, wy) : null
        const overCell = hoverCell && tileCharAt(layer!, hoverCell.col, hoverCell.row) !== '.' ? hoverCell : null
        setHoverCopyId(hit?.id ?? (overCell ? gridCopyId(overCell.col, overCell.row) : null))
        setTileHover(!hit && layer && (brushTile || erasing) ? worldToCell(layer, wx, wy) : null)
        setBrushPreviewPos(!hit && !overCell && !brushTile && !erasing ? { x: wx, y: wy } : null)
      }
    }
  }

  const handlePointerUp = () => {
    const drag = dragRef.current
    if (drag.mode === 'panPending' && mode === 'play' && runtime) {
      runtime.clickTarget(runtime.world.stage)
    }
    finishStroke()
    drag.mode = 'none'
    drag.changes = []
    if (mode === 'play' && runtime) {
      runtime.world.mouse.down = false
    }
  }

  const handlePointerLeave = () => {
    if (dragRef.current.mode === 'paint') finishStroke()
    dragRef.current.mode = 'none'
    dragRef.current.changes = []
    setBrushPreviewPos(null)
    setHoverCopyId(null)
    setTileHover(null)
    if (mode === 'play' && runtime) {
      runtime.world.mouse.down = false
    }
  }

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const [sx, sy] = getCanvasCoords(e)
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const factor = e.deltaY < 0 ? 1.15 : 0.87
      updateView((c) => zoomCameraAt(c, viewport, factor, [sx, sy]))
    } else {
      // Pan
      updateView((c) => panCamera(c, viewport, -e.deltaX, -e.deltaY))
    }
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const targetEl = e.target as HTMLElement
    if (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') {
      return
    }

    if (mode === 'play' && runtime) {
      const scratchKey = browserKeyToScratchKey(e)
      if (scratchKey) {
        runtime.pressKey(scratchKey)
      }
      return
    }

    if (mode === 'build') {
      const cell = selectedCell(design, selectedCopyId)
      if (cell) {
        // A selected grid cell: Delete clears it (one undo step); cells do not nudge.
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          removeCell(store, history, cell.col, cell.row)
        }
        return
      }
      if (selectedCopyId) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          const gone = design.copies.find((c) => c.id === selectedCopyId)
          if (gone && history) history.push(removeCopyEdit(history, gone))
          store.deleteCopy(selectedCopyId)
          return
        }

        // Arrow keys nudge
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault()
          const copy = design.copies.find((c) => c.id === selectedCopyId)
          if (!copy) return

          const step = e.shiftKey ? 1 : GRID
          let dx = 0
          let dy = 0
          if (e.key === 'ArrowLeft') dx = -step
          if (e.key === 'ArrowRight') dx = step
          if (e.key === 'ArrowUp') dy = step
          if (e.key === 'ArrowDown') dy = -step

          const to = { x: copy.x + dx, y: copy.y + dy }
          store.updateCopy(selectedCopyId, to)
          if (history) history.push(moveCopyEdit(history, copy.id, { x: copy.x, y: copy.y }, to))
        }
      }
    }
  }

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (mode === 'play' && runtime) {
      const scratchKey = browserKeyToScratchKey(e)
      if (scratchKey) {
        runtime.releaseKey(scratchKey)
      }
    }
  }

  // Green flag (Play)
  const handleGreenFlag = () => {
    if (mode === 'play' && runtime) {
      runtime.greenFlag()
    } else {
      store.play()
    }
  }

  // Zoom around the view center, so what the kid is looking at stays put.
  const handleZoomIn = () => updateView((c) => zoomCameraAt(c, viewport, 1.25))
  const handleZoomOut = () => updateView((c) => zoomCameraAt(c, viewport, 0.8))

  // Fit: the whole level, letterboxed.
  const handleResetView = () => {
    viewDirty.current = false
    session.viewDirty = false
    setCamera(fitCamera(design.bounds, viewport))
    if (mode === 'play') {
      setPlayChoice('whole')
      setPlayFree(false)
    }
  }

  const handlePlayCameraChoice = (choice: PlayCameraMode) => {
    setPlayChoice(choice)
    setPlayFree(false)
  }

  return (
    <div
      ref={wrapRef}
      className="stage-container"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      aria-label="Level Stage"
    >
      <StageControls
        mode={mode}
        onGreenFlag={handleGreenFlag}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
        playCamera={playFree ? null : playCameraMode}
        onPlayCameraChoice={handlePlayCameraChoice}
      />

      <div className="stage-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="stage-canvas"
          width={viewport.width}
          height={viewport.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        />

        {mode === 'play' && runtime && activeAskPrompt && (
          <AskDialog runtime={runtime} prompt={activeAskPrompt} />
        )}
      </div>
    </div>
  )
}
