import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CopyPlacement, LevelDesign, Target } from '../core/contracts'
import { TILE_SIZE } from '../core/contracts'
import { targetBounds } from '../core/geometry'
import { activeQuestion, type AskPrompt } from '../core/sensing'
import { StudioStore, useStudio } from './store'
import { FixedStepAccumulator } from './stage/accumulator'
import { AskDialog } from './stage/AskDialog'
import { AudioManager } from './stage/audio'
import {
  clampCamera,
  defaultPlayCameraMode,
  FollowRig,
  buildCamera,
  buildFitCamera,
  fitCamera,
  followCamera,
  followViewWidth,
  panCamera,
  pinchCamera,
  pinchPoint,
  screenToWorld,
  snapToGrid,
  worldToScreen,
  zoomCameraAt,
  type Camera,
  type PinchPoint,
  type PlayCameraMode,
  type Viewport,
} from './stage/camera'
import { browserKeyToScratchKey } from './stage/keys'
import { pickCopy, pickTarget } from './stage/picking'
import { removeCell, selectedCell } from './builder/cells'
import { gridCopyId } from '../core/contracts'
import { builderSession } from './builder/session'
import { addCopyEdit, moveCopyEdit, removeCopyEdit, tileStrokeEdit, type History, type TileChange } from './builder/history'
import { cellsOnLine, decidePress, tileCharAt, worldToCell, type BuildTool, type Cell, type PressDecision } from './builder/tilePaint'
import { clampToLevel, copyBox, landingPose, landingSpot } from './builder/placement'
import {
  globalImageCache,
  renderBuildMode,
  renderPlayMode,
  type TargetPose,
} from './stage/renderer'
import { StageControls } from './stage/StageControls'
import { backgroundOf, isPlayerBrick, screensFor, type KitScreens } from './kitScreens'
import { BLANK_COLS, BLANK_ROWS } from './blank/blankProject'
import './stage/stage.css'

/** What the builder chrome hands the stage: the undo history and whether the Erase tool is armed. */
export interface BuildTools {
  history: History
  erasing: boolean
}

/**
 * The player Play's follow camera looks at: the first placed copy (not a clone) of any brick that is the kit's player,
 * so the Hero, the Car and a remixed "My Car" all count, even when another player brick sits unplaced in the drawer.
 */
export function followTargetOf(design: LevelDesign, targets: readonly Target[]): Target | undefined {
  const players = new Set(design.bricks.filter((b) => isPlayerBrick(design, b.id)).map((b) => b.id))
  return targets.find((t) => !t.isStage && !t.isClone && players.has(t.brickId))
}

/**
 * Seen from above (Racing), the screen's shorter side shows this many steps (15 bricks), whichever way it is held. The
 * classic race view picks a whole-pixel scale that shows 224 to 256 px on the short side on laptops, Chromebooks,
 * tablets and phones; 360 made the cars about 1.5 times smaller than classic (parity bucket A, 2026-11-03).
 */
export const TOP_DOWN_SHORT_SIDE = 240

/**
 * The follow camera's width in steps for a kit. The descriptor's own number wins; a race is seen from above, so it
 * shows about the same patch of track on any screen (the 11-step Car is 11 to 30 pixels long, with road ahead to see); the
 * Platformer keeps its side view (followViewWidth).
 */
export function playFollowWidth(screens: Pick<KitScreens, 'kit' | 'followViewWidth'>, bounds: LevelDesign['bounds'], viewport: Viewport): number {
  if (screens.followViewWidth) return screens.followViewWidth
  if (screens.kit === 'race') {
    const short = Math.min(viewport.width, viewport.height)
    if (short > 0) return (TOP_DOWN_SHORT_SIDE * viewport.width) / short
  }
  return followViewWidth(bounds, viewport)
}

/** Bricks snap to an 8-step grid, like the old stage's default. */
const GRID = 8
/** A finger that moves less than this (pixels) is a tap. */
const TAP_SLOP = 10

/**
 * How much of the level (pixels from its top) is still showing when the brick card covers its bottom part (phones), or
 * null when nothing covers it (wide screens put the card beside the level). Reads the card's resting place, not where
 * its slide-in animation is now.
 */
function coveredFromTop(canvasRect: DOMRect): number | null {
  if (typeof document === 'undefined') return null
  const card = document.querySelector<HTMLElement>('.cl-slot-inspector:not([inert])')
  if (!card) return null
  const r = card.getBoundingClientRect()
  let top = r.top
  const transform = getComputedStyle(card).transform
  if (transform && transform !== 'none' && typeof DOMMatrixReadOnly === 'function') top -= new DOMMatrixReadOnly(transform).m42
  if (r.right <= canvasRect.left || r.left >= canvasRect.right) return null
  if (top <= canvasRect.top || top >= canvasRect.bottom) return null
  return top - canvasRect.top
}

export function Stage({ store, tools, codeView = false, onOpenCode }: { store: StudioStore; tools?: BuildTools; codeView?: boolean; /** Build: double-clicking a brick opens its code. */ onOpenCode?: () => void }) {
  const mode = useStudio(store, (s) => s.mode)
  const runtime = useStudio(store, (s) => s.runtime)
  // A room (docs/qa/hackable-rooms M1): `runtime` is then the room's game as screens see it, and the loop plays to
  // the room's clock instead of stepping a game of its own.
  const room = useStudio(store, (s) => s.room)
  const previewPaused = useStudio(store, (s) => s.previewPaused)
  const pendingCodeChanges = useStudio(store, (s) => s.pendingCodeChanges)
  const sceneActive = !!runtime
  const design = useStudio(store, (s) => s.project.design)
  // The kit's screens: whom Play's camera follows, how wide, and what the level's background is.
  const screens = screensFor(design)
  // Start from nothing picks its own backdrop in the Stage card.
  // A 3D design has its own Stage (kitParts `Stage`); were this 2D Stage ever handed one, it would draw the sky.
  const kitBackground = backgroundOf(design)
  const background = kitBackground === '3d' ? 'sky' : kitBackground
  const selectedCopyId = useStudio(store, (s) => s.selectedCopyId)
  const brushBrickId = useStudio(store, (s) => s.brushBrickId)
  const erasing = tools?.erasing ?? false
  const history = tools?.history
  const revision = useStudio(store, (s) => s.revision)
  const pressedKeys = useRef(new Set<string>())

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

  // A new selection pulses once (500 ms), unless the kid asked for less motion.
  const [selectPulse, setSelectPulse] = useState(0)
  useEffect(() => {
    setSelectPulse(0)
    if (!selectedCopyId || mode !== 'build' || typeof requestAnimationFrame !== 'function') return
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = (now - start) / 500
      setSelectPulse(p >= 1 ? 0 : Math.max(p, 0.001))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [selectedCopyId, mode])

  // Build view state (hover only; what is armed lives in the store and the builder chrome)
  const [hoverCopyId, setHoverCopyId] = useState<string | null>(null)
  const [brushPreviewPos, setBrushPreviewPos] = useState<{ x: number; y: number } | null>(null)
  const [tileHover, setTileHover] = useState<Cell | null>(null)
  /** The armed brush, as the pure press logic wants it: a grid brick paints its character, any other brick is placed. */
  const brushBrick = brushBrickId ? design.bricks.find((b) => b.id === brushBrickId) : undefined
  const brushTile = brushBrick?.grid?.char ?? null
  const buildTool: BuildTool = { brushTile, brushBrickId: brushTile ? null : brushBrickId, erasing }

  // Dragging state: one finger (or the mouse) at a time; `ownerRef` is the pointer that started it.
  type DragMode = 'none' | 'pan' | 'panPending' | 'moveCopy' | 'paint' | 'touchPlace' | 'touchErase'
  const dragRef = useRef<{
    mode: DragMode
    moved: boolean
    startScreenX: number
    startScreenY: number
    startWorldX: number
    startWorldY: number
    startCopyX: number
    startCopyY: number
    /** moveCopy: the copy's direction when picked up (a car may turn to face the track when dropped). */
    startCopyDirection: number | undefined
    /** paint: the tile being painted and the cells changed so far (one undo step). */
    paintChar: string
    paintLast: Cell | null
    changes: TileChange[]
    /** What was selected before this press, so a second finger can put it back. */
    prevSelected: string | null
    /** touchPlace / touchErase: the press decided on a finger tap, done when the finger lifts. */
    pending: PressDecision | null
  }>({
    mode: 'none',
    moved: false,
    startScreenX: 0,
    startScreenY: 0,
    startWorldX: 0,
    startWorldY: 0,
    startCopyX: 0,
    startCopyY: 0,
    startCopyDirection: undefined,
    paintChar: '.',
    paintLast: null,
    changes: [],
    prevSelected: null,
    pending: null,
  })
  const ownerRef = useRef<number | null>(null)
  /** Every pointer touching the level now (canvas pixels), for two-finger zoom and pan. */
  const pointersRef = useRef(new Map<number, [number, number]>())
  /** Two fingers zooming and panning the view: which fingers, where they started and the camera then. */
  const pinchRef = useRef<{ ids: [number, number]; from: PinchPoint; start: Camera } | null>(null)
  /** After a two-finger gesture, fingers still down do nothing until all are lifted. */
  const pinchTailRef = useRef(false)
  const lastPointerTypeRef = useRef<string>('mouse')
  /** A selection made while a finger is down is panned into view when it lifts. */
  const revealPendingRef = useRef(false)

  // Play animation & interpolation
  const accumulator = useMemo(() => new FixedStepAccumulator(), [])
  const audioManager = useMemo(() => new AudioManager(), [])
  const prevPosesRef = useRef<Map<string, TargetPose>>(new Map())
  const [activeAskPrompt, setActiveAskPrompt] = useState<AskPrompt | null>(null)

  // Re-fit camera when design bounds change initially if needed
  const boundsKey = `${design.bounds.left},${design.bounds.right},${design.bounds.bottom},${design.bounds.top}`
  useEffect(() => {
    // Until the kid moves the view, keep the whole level in view (letterboxed) as the stage or level changes size.
    // Build starts at the level's full height; Code's small preview shows it whole.
    if (!viewDirty.current) setCamera(codeView ? fitCamera(design.bounds, viewport) : buildCamera(design.bounds, viewport))
    else setCamera((cam) => clampCamera(cam, design.bounds))
  }, [boundsKey, design.bounds, viewport, codeView])

  // Each Play starts from the default camera.
  useEffect(() => {
    setPlayChoice(null)
    setPlayFree(false)
  }, [mode])

  // A game from nothing on one screen shows the whole stage, like Scratch; a bigger one follows its player.
  const oneScreen = screens.fromNothing && design.bounds.right - design.bounds.left <= BLANK_COLS * TILE_SIZE && design.bounds.top - design.bounds.bottom <= BLANK_ROWS * TILE_SIZE
  const playCameraMode: PlayCameraMode = playChoice ?? (oneScreen ? 'whole' : defaultPlayCameraMode(design.bounds, viewport))

  // The follow camera eases after the player like the classic game's (stage/camera.ts FollowRig): a new one each Play.
  const rigKind = screens.kit === 'race' || screens.kit === 'blank' ? 'top' : 'side'
  const rigRef = useRef<{ rig: FollowRig; at: number } | null>(null)
  useEffect(() => {
    rigRef.current = null
  }, [runtime, playCameraMode, rigKind])

  /** The camera for this moment: Build uses the free camera; Play follows its mode unless the kid took over. */
  const computePlayCamera = useCallback(
    (world: Parameters<typeof targetBounds>[0], alpha = 1): Camera => {
      if (playFree) return camera
      if (playCameraMode === 'whole') return fitCamera(world.bounds, viewport)
      // In a room, our own Hero (everyone else's is someone else's to follow).
      const mine = room && room.me ? world.targets.find((t) => t.player === room.me && !t.isClone) : undefined
      const first = mine ?? followTargetOf(design, world.targets)
      const width = playFollowWidth(screens, world.bounds, viewport)
      if (!first) return followCamera(world.bounds, viewport, { x: (world.bounds.left + world.bounds.right) / 2, y: (world.bounds.bottom + world.bounds.top) / 2 }, width)
      // Where the player is drawn this frame (between its last two ticks), and its speed over the last tick.
      const prev = prevPosesRef.current.get(first.id) ?? first
      const x = prev.x + (first.x - prev.x) * alpha
      const y = prev.y + (first.y - prev.y) * alpha
      const box = targetBounds(world, first)
      const feet = rigKind === 'side' && box ? y - (first.y - box.bottom) : y
      const now = typeof performance !== 'undefined' ? performance.now() : 0
      const held = rigRef.current
      const frames = held ? Math.min(4, Math.max(0, ((now - held.at) * 60) / 1000)) : 0
      const rig = held?.rig ?? new FollowRig(rigKind)
      rigRef.current = { rig, at: now }
      return rig.follow({ x, y: feet, vx: first.x - prev.x, vy: first.y - prev.y, onGround: !!first.body?.onGround }, world.bounds, viewport, width, frames)
    },
    [playFree, camera, playCameraMode, viewport, design, screens, room, rigKind],
  )

  /** Camera used for pointer maths. */
  const activeCamera = (): Camera => (sceneActive ? playCamRef.current : camera)
  // Dev only: where a point of the level is on screen, for the demo recordings (scripts/demo/record-hack.mjs).
  if (import.meta.env.DEV) {
    (window as unknown as { __studioStage?: unknown }).__studioStage = {
      toScreen: (wx: number, wy: number) => {
        const rect = canvasRef.current?.getBoundingClientRect()
        if (!rect) return null
        const [sx, sy] = worldToScreen(activeCamera(), viewport, wx, wy)
        return { x: rect.left + sx, y: rect.top + sy }
      },
    }
  }

  /** Move or zoom the view from whatever is on screen now. Marks the view as the kid's own. */
  const updateView = (fn: (c: Camera) => Camera) => {
    // Play's camera always follows the Hero or shows the whole level (the camera buttons): a click or a slip on the
    // level never unhooks it, and Build's view stays where the kid left it.
    if (sceneActive && mode === 'play') return
    const base = activeCamera()
    viewDirty.current = true
    session.viewDirty = true
    if (sceneActive) setPlayFree(true)
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
    if (!sceneActive || previewPaused) {
      audioManager.stopAll()
      prevPosesRef.current.clear()
      setActiveAskPrompt(null)
    }
  }, [sceneActive, previewPaused, audioManager])

  // In Play mode, keys also reach the game from the header. Docked code preview requires stage focus:
  // a kid presses Play and then the arrows. Text fields keep their keys; events inside the stage use its own handlers.
  useEffect(() => {
    if (mode !== 'play' || !runtime || previewPaused) return
    wrapRef.current?.focus()
    const editable = (el: EventTarget | null) =>
      el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    const inStage = (el: EventTarget | null) => el instanceof Node && !!wrapRef.current?.contains(el)
    const onDown = (e: KeyboardEvent) => {
      if (inStage(e.target) || editable(e.target)) return
      const key = browserKeyToScratchKey(e)
      if (key) { e.preventDefault(); pressedKeys.current.add(key); runtime.pressKey(key) }
    }
    const onUp = (e: KeyboardEvent) => {
      if (inStage(e.target)) return
      const key = browserKeyToScratchKey(e)
      if (key) { pressedKeys.current.delete(key); runtime.releaseKey(key) }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [mode, runtime, previewPaused])

  // Play loop
  useEffect(() => {
    if (!sceneActive || !runtime) return

    let animId: number
    accumulator.reset()

    if (room) {
      const roomLoop = (now: number) => {
        const before = room.game
        const poses = new Map<string, TargetPose>()
        for (const target of before?.world.targets ?? []) poses.set(target.id, { x: target.x, y: target.y, direction: target.direction, size: target.size })
        const { ticks, fraction } = room.frame(now)
        const game = room.game
        // One tick ran: blend from where things were a tick ago. More (catching up) or a new game: no blend.
        if (ticks === 1 && game === before) prevPosesRef.current = poses
        else if (ticks > 1 || game !== before) prevPosesRef.current = new Map()
        if (game) {
          while (game.notes.length > 0) {
            const note = game.notes.shift()
            if (note) audioManager.handleNote(note, game.world)
          }
          const canvas = canvasRef.current
          const ctx = canvas?.getContext('2d')
          if (ctx) {
            const playCamera = computePlayCamera(game.world, prevPosesRef.current.size ? fraction : 1)
            playCamRef.current = playCamera
            renderPlayMode(ctx, game.world, { camera: playCamera, viewport, background, prevPoses: prevPosesRef.current, interpAlpha: prevPosesRef.current.size ? fraction : 1 })
          }
        }
        animId = requestAnimationFrame(roomLoop)
      }
      animId = requestAnimationFrame(roomLoop)
      return () => cancelAnimationFrame(animId)
    }

    const loop = (now: number) => {
      const { ticks, alpha } = previewPaused ? { ticks: 0, alpha: 1 } : accumulator.advance(now)

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
          const playCamera = computePlayCamera(runtime.world, alpha)
          playCamRef.current = playCamera
          renderPlayMode(ctx, runtime.world, {
            camera: playCamera,
            viewport,
            background,
            prevPoses: prevPosesRef.current,
            interpAlpha: alpha,
          })
        }
      }

      animId = requestAnimationFrame(loop)
    }

    animId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animId)
  }, [sceneActive, previewPaused, runtime, room, computePlayCamera, viewport, accumulator, audioManager, background])

  // The brush preview is the armed brick (not while a grid brick or the eraser is armed: those preview on the cell).
  const previewBrickId = brushTile || erasing ? null : brushBrickId
  const tileLayer = design.tiles
  const hoverInfo =
    tileHover && tileLayer && (brushTile || erasing)
      ? { col: tileHover.col, row: tileHover.row, costume: erasing ? null : (brushBrick?.costumes[0] ?? null), erase: erasing }
      : null

  // Render in Build mode whenever design, camera, viewport, selection or brush changes; and when a costume finishes loading.
  useEffect(() => {
    if (mode !== 'build' || sceneActive) return
    const draw = () => {
      const ctx = canvasRef.current?.getContext('2d')
      if (!ctx) return
      renderBuildMode(ctx, design, {
        camera,
        viewport,
        background,
        gridSnap: true,
        selectedCopyId,
        selectPulse,
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
  }, [mode, sceneActive, design, camera, viewport, selectedCopyId, selectPulse, hoverCopyId, previewBrickId, brushPreviewPos, tileHover, brushBrick, erasing, revision, background])

  // Helper to get canvas-relative coordinates
  const getCanvasCoords = useCallback((e: { clientX: number; clientY: number }): [number, number] => {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    const rect = canvas.getBoundingClientRect()
    return [e.clientX - rect.left, e.clientY - rect.top]
  }, [])

  // Pointer interactions
  const newDrag = (mode: DragMode, sx: number, sy: number, wx: number, wy: number, extra: Partial<typeof dragRef.current> = {}) => {
    dragRef.current = {
      mode,
      moved: false,
      startScreenX: sx,
      startScreenY: sy,
      startWorldX: wx,
      startWorldY: wy,
      startCopyX: 0,
      startCopyY: 0,
      startCopyDirection: undefined,
      paintChar: '.',
      paintLast: null,
      changes: [],
      prevSelected: store.getState().selectedCopyId,
      pending: null,
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

  /** Put a brick down where the kid pressed: inside the level, a Hero never inside the ground, a car clear of barriers and facing along the track. */
  const placeCopy = (brickId: string, x: number, y: number) => {
    const at = landingPose(store.getState().project.design, { brickId }, x, y, GRID)
    const id = store.addCopy(brickId, at.x, at.y)
    if (at.direction !== undefined) store.updateCopy(id, { direction: at.direction })
    const copy = store.getState().project.design.copies.find((c) => c.id === id)
    if (copy && history) history.push(addCopyEdit(history, copy))
  }

  const eraseCopy = (copy: CopyPlacement) => {
    history?.push(removeCopyEdit(history, copy))
    store.deleteCopy(copy.id)
  }

  const finishStroke = () => {
    const drag = dragRef.current
    if (drag.mode === 'paint' && drag.changes.length > 0) history?.push(tileStrokeEdit(store, drag.changes))
    if (drag.mode === 'moveCopy' && drag.moved && selectedCopyId) {
      let copy = store.getState().project.design.copies.find((c) => c.id === selectedCopyId)
      if (copy) {
        // Dropped: a Hero lands on top of the ground rather than inside it; a car clears barriers and faces along the track.
        const at = landingPose(store.getState().project.design, copy, copy.x, copy.y, GRID)
        if (at.x !== copy.x || at.y !== copy.y || (at.direction !== undefined && at.direction !== copy.direction)) {
          store.updateCopy(copy.id, at)
          copy = { ...copy, ...at }
        }
      }
      const turned = copy !== undefined && copy.direction !== drag.startCopyDirection
      if (copy && history && (copy.x !== drag.startCopyX || copy.y !== drag.startCopyY || turned)) {
        history.push(moveCopyEdit(history, copy.id,
          { x: drag.startCopyX, y: drag.startCopyY, ...(turned ? { direction: drag.startCopyDirection } : {}) },
          { x: copy.x, y: copy.y, ...(turned ? { direction: copy.direction } : {}) }))
      }
    }
  }

  /** Undo what the first finger started (paint, a move, a selection) because a second finger turned it into a pinch. */
  const cancelDrag = () => {
    const drag = dragRef.current
    if (drag.mode === 'paint') {
      for (let i = drag.changes.length - 1; i >= 0; i--) store.setTile(drag.changes[i].col, drag.changes[i].row, drag.changes[i].from)
    }
    const moving = store.getState().selectedCopyId
    if (drag.mode === 'moveCopy' && drag.moved && moving) store.updateCopy(moving, { x: drag.startCopyX, y: drag.startCopyY })
    if (drag.mode !== 'none' && store.getState().selectedCopyId !== drag.prevSelected) store.selectCopy(drag.prevSelected)
    drag.mode = 'none'
    drag.changes = []
    drag.pending = null
    ownerRef.current = null
  }

  const clearHover = () => {
    setBrushPreviewPos(null)
    setHoverCopyId(null)
    setTileHover(null)
  }

  /**
   * On a small screen the brick card slides up over the bottom of the level. If it hides what was just selected, scroll
   * the level so the selection sits in the part still showing. (Wide screens put the card beside the level: no change.)
   */
  const revealSelection = () => {
    const state = store.getState()
    const id = state.selectedCopyId
    const canvas = canvasRef.current
    if (!id || !canvas || state.mode !== 'build' || codeView || sceneActive) return
    const crect = canvas.getBoundingClientRect()
    const visibleH = coveredFromTop(crect)
    if (visibleH === null || visibleH < 64) return
    const d = state.project.design
    const cell = selectedCell(d, id)
    let point: [number, number] | null = null
    if (cell) point = [cell.col * TILE_SIZE + TILE_SIZE / 2, cell.row * TILE_SIZE + TILE_SIZE / 2]
    else {
      const copy = d.copies.find((c) => c.id === id)
      const box = copy && copyBox(d, copy, copy.x, copy.y)
      if (copy) point = box ? [(box.left + box.right) / 2, (box.bottom + box.top) / 2] : [copy.x, copy.y]
    }
    if (!point) return
    const cam = session.camera ?? camera
    const [px, py] = worldToScreen(cam, viewport, point[0], point[1])
    const margin = 32
    const dy = py < margin || py > visibleH - margin ? visibleH / 2 - py : 0
    const dx = px < margin || px > viewport.width - margin ? viewport.width / 2 - px : 0
    if (dx || dy) updateView(() => panCamera(cam, viewport, dx, dy))
  }

  useEffect(() => {
    if (!selectedCopyId || mode !== 'build' || codeView) return
    if (pointersRef.current.size > 0) {
      revealPendingRef.current = true
      return
    }
    if (typeof requestAnimationFrame !== 'function') return
    const raf = requestAnimationFrame(revealSelection)
    return () => cancelAnimationFrame(raf)
    // Only a new selection scrolls the view; revealSelection reads the rest fresh.
  }, [selectedCopyId, mode, codeView])

  const startPinch = () => {
    const [a, b] = [...pointersRef.current.entries()]
    cancelDrag()
    clearHover()
    pinchRef.current = { ids: [a[0], b[0]], from: pinchPoint(a[1], b[1]), start: session.camera ?? camera }
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Canvas takes focus for keyboard events
    wrapRef.current?.focus()
    lastPointerTypeRef.current = e.pointerType
    const [sx, sy] = getCanvasCoords(e)
    pointersRef.current.set(e.pointerId, [sx, sy])

    // Two fingers in Build zoom and pan the view, whatever tool is armed.
    if (e.pointerType === 'touch' && !sceneActive && mode === 'build') {
      if (pinchRef.current || pinchTailRef.current) return
      if (pointersRef.current.size >= 2) {
        startPinch()
        return
      }
    }
    // Keep getting this pointer's moves after it leaves the level, so a drag doesn't drop at the edge.
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not an active pointer (tests) */ }

    const cam = activeCamera()
    const [wx, wy] = screenToWorld(cam, viewport, sx, sy)
    const busy = dragRef.current.mode !== 'none' && ownerRef.current !== null && ownerRef.current !== e.pointerId

    // Middle button or Alt key drags camera in any mode
    if (e.button === 1 || e.altKey) {
      ownerRef.current = e.pointerId
      newDrag('pan', sx, sy, wx, wy)
      return
    }

    if (sceneActive && runtime) {
      // Code's preview: a click goes to the game and the level keeps the keys; it never leaves Code.
      if (mode === 'build' && !codeView) {
        const target = pickTarget(runtime.world, wx, wy)
        if (!target.isStage && target.copyId) store.selectCopy(target.copyId)
        else store.closeCard()
        return
      }
      // Play mode: update mouse and click target
      runtime.world.mouse.x = wx
      runtime.world.mouse.y = wy
      runtime.world.mouse.down = true

      const target = pickTarget(runtime.world, wx, wy)
      if (target.isStage) {
        // Empty space: a drag scrolls the view; a plain click (no drag) clicks the stage on release.
        // Another finger already scrolling keeps the scroll.
        if (busy) return
        ownerRef.current = e.pointerId
        newDrag('panPending', sx, sy, wx, wy)
        return
      }
      runtime.clickTarget(target)
      return
    }

    if (mode === 'build') {
      ownerRef.current = e.pointerId
      const design = store.getState().project.design
      const touch = e.pointerType === 'touch'
      // Right-click erases whatever is under the pointer; the Erase tool does the same for the left button.
      const decision = decidePress(design, buildTool, wx, wy, { erase: e.button === 2, snap: GRID })
      switch (decision.kind) {
        case 'select-copy': {
          newDrag('moveCopy', sx, sy, wx, wy, { startCopyX: decision.copy.x, startCopyY: decision.copy.y, startCopyDirection: decision.copy.direction })
          store.selectCopy(decision.copy.id)
          break
        }
        case 'erase-copy': {
          // A finger erases a brick on a tap (when it lifts), so a second finger can still make it a pinch.
          if (touch) newDrag('touchErase', sx, sy, wx, wy, { pending: decision })
          else eraseCopy(decision.copy)
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
          if (brushTile) newDrag('paint', sx, sy, wx, wy, { paintChar: brushTile, paintLast: decision.cell })
          else newDrag('none', sx, sy, wx, wy)
          store.selectCopy(gridCopyId(decision.cell.col, decision.cell.row))
          break
        }
        case 'place-copy': {
          // A finger places on a tap; a finger drag scrolls the level instead (see handlePointerMove).
          if (touch) newDrag('touchPlace', sx, sy, wx, wy, { pending: decision })
          else placeCopy(decision.brickId, decision.x, decision.y)
          break
        }
        case 'nothing': {
          // Empty space with nothing armed: deselect, and a drag scrolls the view.
          newDrag('pan', sx, sy, wx, wy)
          store.selectCopy(null)
          break
        }
      }
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const [sx, sy] = getCanvasCoords(e)
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, [sx, sy])

    const pinch = pinchRef.current
    if (pinch) {
      if (!pinch.ids.includes(e.pointerId)) return
      const a = pointersRef.current.get(pinch.ids[0])
      const b = pointersRef.current.get(pinch.ids[1])
      if (a && b) updateView(() => pinchCamera(pinch.start, viewport, pinch.from, pinchPoint(a, b)))
      return
    }
    if (pinchTailRef.current) return

    const [wx, wy] = screenToWorld(activeCamera(), viewport, sx, sy)
    const drag = dragRef.current
    // Another pointer's drag is running: this one waits.
    if (drag.mode !== 'none' && ownerRef.current !== null && ownerRef.current !== e.pointerId) return

    // A finger tap that slides becomes a scroll (with a brick armed) or an erasing stroke (with Erase armed).
    if (drag.mode === 'touchPlace' || drag.mode === 'touchErase') {
      if (Math.hypot(sx - drag.startScreenX, sy - drag.startScreenY) < TAP_SLOP) return
      const layer = store.getState().project.design.tiles
      const cell = layer ? worldToCell(layer, wx, wy) : null
      drag.pending = null
      if (drag.mode === 'touchPlace') drag.mode = 'pan'
      else {
        drag.mode = 'paint'
        drag.paintChar = '.'
        drag.paintLast = cell
        if (cell) paintCell(cell, '.')
        return
      }
    }

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

    if (sceneActive && runtime) {
      runtime.world.mouse.x = wx
      runtime.world.mouse.y = wy
      return
    }

    if (mode === 'build') {
      const design = store.getState().project.design
      const layer = design.tiles
      if (drag.mode === 'paint' && layer) {
        // A fast drag can skip cells: fill the straight line from the last cell to this one.
        const cell = worldToCell(layer, wx, wy)
        if (cell && drag.paintLast) {
          for (const c of cellsOnLine(drag.paintLast, cell)) paintCell(c, drag.paintChar)
        }
        if (cell) drag.paintLast = cell
        setTileHover(cell)
      } else if (drag.mode === 'moveCopy' && selectedCopyId) {
        const dx = wx - drag.startWorldX
        const dy = wy - drag.startWorldY
        drag.moved = true
        const copy = design.copies.find((c) => c.id === selectedCopyId)
        const to = { x: snapToGrid(drag.startCopyX + dx, GRID), y: snapToGrid(drag.startCopyY + dy, GRID) }
        // A brick dragged past the edge stops at the edge of the level.
        store.updateCopy(selectedCopyId, copy ? clampToLevel(design, copy, to.x, to.y, GRID) : to)
      } else if (drag.mode === 'none' && e.pointerType !== 'touch') {
        // Idle move: hover highlight, tile cell and brick preview (a mouse or pen only: a finger has no hover)
        const hit = pickCopy(design, wx, wy)
        const hoverCell = !hit && layer ? worldToCell(layer, wx, wy) : null
        const overCell = hoverCell && tileCharAt(layer!, hoverCell.col, hoverCell.row) !== '.' ? hoverCell : null
        setHoverCopyId(hit?.id ?? (overCell ? gridCopyId(overCell.col, overCell.row) : null))
        setTileHover(!hit && layer && (brushTile || erasing) ? worldToCell(layer, wx, wy) : null)
        setBrushPreviewPos(!hit && !overCell && !brushTile && !erasing ? { x: wx, y: wy } : null)
      }
    }
  }

  /** A pointer lifted (`cancelled`: the browser took it away). Returns true when it was this pointer's drag that ended. */
  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    pointersRef.current.delete(e.pointerId)
    const pinch = pinchRef.current
    if (pinch) {
      if (pinch.ids.includes(e.pointerId)) {
        pinchRef.current = null
        pinchTailRef.current = pointersRef.current.size > 0
      }
      return
    }
    if (pinchTailRef.current) {
      if (pointersRef.current.size === 0) pinchTailRef.current = false
      return
    }
    const drag = dragRef.current
    if (ownerRef.current !== null && ownerRef.current !== e.pointerId && drag.mode !== 'none') return
    if (!cancelled) {
      if (drag.mode === 'panPending' && sceneActive && runtime) runtime.clickTarget(runtime.world.stage)
      const pending = drag.pending
      if (drag.mode === 'touchPlace' && pending?.kind === 'place-copy') placeCopy(pending.brickId, pending.x, pending.y)
      if (drag.mode === 'touchErase' && pending?.kind === 'erase-copy') eraseCopy(pending.copy)
    }
    // A stroke or move the browser cancelled is still kept, as one undo step.
    finishStroke()
    drag.mode = 'none'
    drag.changes = []
    drag.pending = null
    ownerRef.current = null
    if (sceneActive && runtime) {
      runtime.world.mouse.down = false
    }
    if (revealPendingRef.current && pointersRef.current.size === 0) {
      revealPendingRef.current = false
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(revealSelection)
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => endPointer(e, false)
  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => endPointer(e, true)

  const handlePointerLeave = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Pointers are captured, so this comes after the press ends; if capture failed, the drag ends here.
    if (dragRef.current.mode !== 'none' && ownerRef.current === e.pointerId) endPointer(e, true)
    clearHover()
  }

  const handleWheel = (e: WheelEvent) => {
    // Not passive: a pinch on a trackpad (or Ctrl+wheel) zooms the level, never the whole page.
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
  /** Safari's trackpad pinch arrives as gesture events (not Ctrl+wheel): zoom the level by the change in scale. */
  const gestureScale = useRef(1)
  const handleGesture = (e: Event & { scale?: number; clientX?: number; clientY?: number }) => {
    e.preventDefault()
    const scale = e.scale ?? 1
    if (e.type === 'gesturestart') {
      gestureScale.current = scale
      return
    }
    if (e.type !== 'gesturechange' || !(gestureScale.current > 0) || !(scale > 0)) return
    const factor = scale / gestureScale.current
    gestureScale.current = scale
    const anchor = e.clientX !== undefined && e.clientY !== undefined ? getCanvasCoords({ clientX: e.clientX, clientY: e.clientY }) : undefined
    updateView((c) => zoomCameraAt(c, viewport, factor, anchor))
  }
  // React's onWheel is passive, so it can't stop the page zooming: listen on the canvas directly (latest handler).
  const wheelHandlers = useRef({ wheel: handleWheel, gesture: handleGesture })
  wheelHandlers.current = { wheel: handleWheel, gesture: handleGesture }
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => wheelHandlers.current.wheel(e)
    const onGesture = (e: Event) => wheelHandlers.current.gesture(e)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) canvas.addEventListener(type, onGesture, { passive: false })
    return () => {
      canvas.removeEventListener('wheel', onWheel)
      for (const type of ['gesturestart', 'gesturechange', 'gestureend']) canvas.removeEventListener(type, onGesture)
    }
  }, [])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const targetEl = e.target as HTMLElement
    if (targetEl.tagName === 'INPUT' || targetEl.tagName === 'TEXTAREA') {
      return
    }

    if (sceneActive && runtime) {
      const scratchKey = browserKeyToScratchKey(e)
      if (scratchKey && !previewPaused) {
        e.preventDefault()
        pressedKeys.current.add(scratchKey)
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

          // Nudges stop at the edge of the level.
          const to = clampToLevel(design, copy, copy.x + dx, copy.y + dy, step)
          if (to.x === copy.x && to.y === copy.y) return
          store.updateCopy(selectedCopyId, to)
          if (history) history.push(moveCopyEdit(history, copy.id, { x: copy.x, y: copy.y }, to))
        }
      }
    }
  }

  const handleKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (sceneActive && runtime) {
      const scratchKey = browserKeyToScratchKey(e)
      if (scratchKey) {
        pressedKeys.current.delete(scratchKey)
        runtime.releaseKey(scratchKey)
      }
    }
  }

  // Clear held input when focus leaves the level; editor typing must never steer the Hero.
  const releaseKeys = () => {
    if (runtime) for (const key of pressedKeys.current) runtime.releaseKey(key)
    pressedKeys.current.clear()
  }
  useEffect(() => {
    window.addEventListener('blur', releaseKeys)
    return () => { window.removeEventListener('blur', releaseKeys); releaseKeys() }
  }, [runtime, previewPaused])

  // Zoom around the view center, so what the kid is looking at stays put.
  const handleZoomIn = () => updateView((c) => zoomCameraAt(c, viewport, 1.25))
  const handleZoomOut = () => updateView((c) => zoomCameraAt(c, viewport, 0.8))

  // Fit: the whole level, letterboxed. In Build on a narrow stage, never smaller than readable (the level's full height,
  // around what is in view now).
  const handleResetView = () => {
    viewDirty.current = false
    session.viewDirty = false
    setCamera(sceneActive ? fitCamera(design.bounds, viewport) : buildFitCamera(design.bounds, viewport, (session.camera ?? camera).x))
    if (sceneActive) {
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
      onBlur={releaseKeys}
      aria-label="Level Stage"
    >
      {!codeView && <StageControls
        codeView={codeView}
        pendingCodeChanges={pendingCodeChanges}
        mode={sceneActive ? 'play' : mode}
        paused={previewPaused}
        onTogglePlay={() => previewPaused ? store.startPreview() : store.pausePreview()}
        onRestart={() => store.restartPreview()}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={handleResetView}
        playCamera={playFree ? null : playCameraMode}
        onPlayCameraChoice={handlePlayCameraChoice}
        followLabel={screens.copy.followLabel}
        wholeLabel={screens.kit === 'race' ? 'Whole track' : undefined}
        playback={room ? (room.host ? 'restart' : 'none') : 'full'}
      />}

      <div className="stage-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="stage-canvas"
          width={viewport.width}
          height={viewport.height}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerLeave}
          onDoubleClick={() => {
            // Selecting tool only: with a brush armed, a double-click is two placements. A finger's double tap is
            // usually meant as a zoom, so it never leaves Build.
            if (lastPointerTypeRef.current === 'touch') return
            if (mode === 'build' && !sceneActive && !brushBrickId && !erasing && store.getState().selectedCopyId) onOpenCode?.()
          }}
          onContextMenu={(e) => e.preventDefault()}
        />

        {/* Rooms have no shared answers yet (each player's own ask is M2), so a question is not asked in one. */}
        {sceneActive && runtime && activeAskPrompt && !room && (
          <AskDialog runtime={runtime} prompt={activeAskPrompt} />
        )}
      </div>
    </div>
  )
}
