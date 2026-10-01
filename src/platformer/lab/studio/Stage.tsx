import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CopyPlacement, Target } from '../core/contracts'
import { activeQuestion, type AskPrompt } from '../core/sensing'
import { StudioStore, useStudio } from './store'
import { FixedStepAccumulator } from './stage/accumulator'
import { AskDialog } from './stage/AskDialog'
import { AudioManager } from './stage/audio'
import {
  clampCamera,
  createDefaultCamera,
  panCamera,
  screenToWorld,
  snapToGrid,
  zoomCameraAt,
  type Camera,
  type Viewport,
} from './stage/camera'
import { browserKeyToScratchKey } from './stage/keys'
import { KnobPanel } from './stage/KnobPanel'
import { pickCopy, pickTarget } from './stage/picking'
import {
  globalImageCache,
  renderBuildMode,
  renderPlayMode,
  type TargetPose,
} from './stage/renderer'
import { StageControls } from './stage/StageControls'
import './stage/stage.css'

export function Stage({ store }: { store: StudioStore }) {
  const mode = useStudio(store, (s) => s.mode)
  const runtime = useStudio(store, (s) => s.runtime)
  const design = useStudio(store, (s) => s.project.design)
  const selectedCopyId = useStudio(store, (s) => s.selectedCopyId)
  const brushBrickId = useStudio(store, (s) => s.brushBrickId)
  const revision = useStudio(store, (s) => s.revision)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Camera and Viewport
  const [viewport, setViewport] = useState<Viewport>({ width: 480, height: 360 })
  const [camera, setCamera] = useState<Camera>(() => createDefaultCamera(design.bounds))

  // Build tools
  const [activeTool, setActiveTool] = useState<'select' | 'brush'>('brush')
  const [gridSnap, setGridSnap] = useState(true)
  const [hoverCopyId, setHoverCopyId] = useState<string | null>(null)
  const [brushPreviewPos, setBrushPreviewPos] = useState<{ x: number; y: number } | null>(null)

  // Dragging state
  const dragRef = useRef<{
    mode: 'none' | 'pan' | 'moveCopy'
    startScreenX: number
    startScreenY: number
    startWorldX: number
    startWorldY: number
    startCopyX: number
    startCopyY: number
  }>({
    mode: 'none',
    startScreenX: 0,
    startScreenY: 0,
    startWorldX: 0,
    startWorldY: 0,
    startCopyX: 0,
    startCopyY: 0,
  })

  // Play animation & interpolation
  const accumulator = useMemo(() => new FixedStepAccumulator(), [])
  const audioManager = useMemo(() => new AudioManager(), [])
  const prevPosesRef = useRef<Map<string, TargetPose>>(new Map())
  const [activeAskPrompt, setActiveAskPrompt] = useState<AskPrompt | null>(null)

  // Re-fit camera when design bounds change initially if needed
  const boundsKey = `${design.bounds.left},${design.bounds.right},${design.bounds.bottom},${design.bounds.top}`
  useEffect(() => {
    // Keep camera within bounds
    setCamera((cam) => clampCamera(cam, design.bounds))
  }, [boundsKey, design.bounds])

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
          renderPlayMode(ctx, runtime.world, {
            camera,
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
  }, [mode, runtime, camera, viewport, accumulator, audioManager])

  // Render in Build mode whenever design, camera, viewport, selection or brush changes
  useEffect(() => {
    if (mode !== 'build') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    renderBuildMode(ctx, design, {
      camera,
      viewport,
      gridSnap,
      selectedCopyId,
      hoverCopyId,
      brushBrickId,
      brushPreviewPos,
      tool: activeTool,
    })
  }, [mode, design, camera, viewport, gridSnap, selectedCopyId, hoverCopyId, brushBrickId, brushPreviewPos, activeTool, revision])

  // Listen to image loading to redraw canvas
  useEffect(() => {
    return globalImageCache.onImageLoaded(() => {
      if (mode === 'build') {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        renderBuildMode(ctx, design, {
          camera,
          viewport,
          gridSnap,
          selectedCopyId,
          hoverCopyId,
          brushBrickId,
          brushPreviewPos,
          tool: activeTool,
        })
      }
    })
  }, [mode, design, camera, viewport, gridSnap, selectedCopyId, hoverCopyId, brushBrickId, brushPreviewPos, activeTool])

  // Helper to get canvas-relative coordinates
  const getCanvasCoords = useCallback((e: { clientX: number; clientY: number }): [number, number] => {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    const rect = canvas.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }, [])

  // Pointer interactions
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Canvas takes focus for keyboard events
    wrapRef.current?.focus()
    const [sx, sy] = getCanvasCoords(e)
    const [wx, wy] = screenToWorld(camera, viewport, sx, sy)

    // Middle button or Alt key drags camera in any mode
    if (e.button === 1 || e.altKey) {
      dragRef.current = {
        mode: 'pan',
        startScreenX: sx,
        startScreenY: sy,
        startWorldX: wx,
        startWorldY: wy,
        startCopyX: 0,
        startCopyY: 0,
      }
      return
    }

    if (mode === 'play' && runtime) {
      // Play mode: update mouse and click target
      runtime.world.mouse.x = wx
      runtime.world.mouse.y = wy
      runtime.world.mouse.down = true

      const target = pickTarget(runtime.world, wx, wy)
      runtime.clickTarget(target)
      return
    }

    if (mode === 'build') {
      if (activeTool === 'brush') {
        if (brushBrickId) {
          const finalX = gridSnap ? snapToGrid(wx, 8) : wx
          const finalY = gridSnap ? snapToGrid(wy, 8) : wy
          const newId = store.addCopy(brushBrickId, finalX, finalY)
          store.selectCopy(newId)
        }
      } else if (activeTool === 'select') {
        const hit = pickCopy(design, wx, wy)
        if (hit) {
          store.selectCopy(hit.id)
          dragRef.current = {
            mode: 'moveCopy',
            startScreenX: sx,
            startScreenY: sy,
            startWorldX: wx,
            startWorldY: wy,
            startCopyX: hit.x,
            startCopyY: hit.y,
          }
        } else {
          // Clicked empty space
          store.selectCopy(null)
          // Start pan on empty space drag
          dragRef.current = {
            mode: 'pan',
            startScreenX: sx,
            startScreenY: sy,
            startWorldX: wx,
            startWorldY: wy,
            startCopyX: 0,
            startCopyY: 0,
          }
        }
      }
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = getCanvasCoords(e)
    const [wx, wy] = screenToWorld(camera, viewport, sx, sy)

    if (mode === 'play' && runtime) {
      runtime.world.mouse.x = wx
      runtime.world.mouse.y = wy
      return
    }

    if (mode === 'build') {
      const drag = dragRef.current
      if (drag.mode === 'moveCopy' && selectedCopyId) {
        const dx = wx - drag.startWorldX
        const dy = wy - drag.startWorldY
        let targetX = drag.startCopyX + dx
        let targetY = drag.startCopyY + dy
        if (gridSnap) {
          targetX = snapToGrid(targetX, 8)
          targetY = snapToGrid(targetY, 8)
        }
        store.updateCopy(selectedCopyId, { x: targetX, y: targetY })
      } else if (drag.mode === 'pan') {
        const dx = sx - drag.startScreenX
        const dy = sy - drag.startScreenY
        drag.startScreenX = sx
        drag.startScreenY = sy
        setCamera((c) => panCamera(c, viewport, dx, dy))
      } else {
        // Idle move: update brush preview or hover highlight
        if (activeTool === 'brush') {
          setBrushPreviewPos({ x: wx, y: wy })
          setHoverCopyId(null)
        } else {
          const hit = pickCopy(design, wx, wy)
          setHoverCopyId(hit?.id ?? null)
        }
      }
    }
  }

  const handlePointerUp = () => {
    dragRef.current.mode = 'none'
    if (mode === 'play' && runtime) {
      runtime.world.mouse.down = false
    }
  }

  const handlePointerLeave = () => {
    dragRef.current.mode = 'none'
    setBrushPreviewPos(null)
    setHoverCopyId(null)
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
      setCamera((c) => zoomCameraAt(c, viewport, factor, [sx, sy]))
    } else {
      // Pan
      setCamera((c) => panCamera(c, viewport, -e.deltaX, -e.deltaY))
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
      if (selectedCopyId) {
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          store.deleteCopy(selectedCopyId)
          return
        }

        // Arrow keys nudge
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          e.preventDefault()
          const copy = design.copies.find((c) => c.id === selectedCopyId)
          if (!copy) return

          const step = gridSnap ? 8 : (e.shiftKey ? 8 : 1)
          let dx = 0
          let dy = 0
          if (e.key === 'ArrowLeft') dx = -step
          if (e.key === 'ArrowRight') dx = step
          if (e.key === 'ArrowUp') dy = step
          if (e.key === 'ArrowDown') dy = -step

          store.updateCopy(selectedCopyId, { x: copy.x + dx, y: copy.y + dy })
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

  // Toolbar actions
  const handleTogglePlay = () => {
    if (mode === 'play') {
      store.stop()
    } else {
      store.play()
    }
  }

  const handleGreenFlag = () => {
    if (mode === 'play' && runtime) {
      runtime.greenFlag()
    } else {
      store.play()
    }
  }

  const handleZoomIn = () => {
    setCamera((c) => zoomCameraAt(c, viewport, 1.25))
  }

  const handleZoomOut = () => {
    setCamera((c) => zoomCameraAt(c, viewport, 0.8))
  }

  const handleResetView = () => {
    setCamera(createDefaultCamera(design.bounds))
  }

  // Selected copy info for KnobPanel
  const selectedCopy = design.copies.find((c) => c.id === selectedCopyId)
  const selectedBrick = selectedCopy ? store.brick(selectedCopy.brickId) : undefined
  const showInBuildVars = selectedBrick?.program.variables.filter((v) => v.showInBuild) ?? []

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
        activeTool={activeTool}
        gridSnap={gridSnap}
        onTogglePlay={handleTogglePlay}
        onGreenFlag={handleGreenFlag}
        onSelectTool={setActiveTool}
        onToggleGridSnap={() => setGridSnap((s) => !s)}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
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
        />

        {mode === 'build' && selectedCopy && selectedBrick && (
          <KnobPanel
            store={store}
            copy={selectedCopy}
            brickName={selectedBrick.name}
            variables={showInBuildVars}
          />
        )}

        {mode === 'play' && runtime && activeAskPrompt && (
          <AskDialog runtime={runtime} prompt={activeAskPrompt} />
        )}
      </div>
    </div>
  )
}
