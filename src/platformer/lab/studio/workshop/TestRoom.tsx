import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRuntime, type Runtime } from '../../core/index'
import { STAGE_ID, useStudio, type StudioStore } from '../store'
import { FixedStepAccumulator } from '../stage/accumulator'
import { fitCamera, type Viewport } from '../stage/camera'
import { browserKeyToScratchKey } from '../stage/keys'
import { globalImageCache, renderPlayMode, type TargetPose } from '../stage/renderer'
import { HERO_BRICK_ID } from '../hero/heroBrick'
import { buildTestRoom, isHeroBrick } from './roomDesign'

/** How long code or knob edits settle before the room restarts. */
export const RESTART_DEBOUNCE_MS = 350

/** The brick running on its own in a small sandbox. Reuses the Stage's accumulator, camera and renderer. */
export function TestRoom({ store, brickId }: { store: StudioStore; brickId: string }) {
  const brick = useStudio(store, (s) => s.project.design.bricks.find((b) => b.id === brickId))
  const stage = useStudio(store, (s) => s.project.design.stage)
  const projectHero = useStudio(store, (s) => s.project.design.bricks.find((b) => b.id === HERO_BRICK_ID))
  const [restarts, setRestarts] = useState(0)
  const [settled, setSettled] = useState({ brick, stage, projectHero, restarts })

  // Restart (debounced) when the brick, the helper Hero or the stage's variables change, or on the button.
  useEffect(() => {
    const id = setTimeout(() => setSettled({ brick, stage, projectHero, restarts }), RESTART_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [brick, stage, projectHero, restarts])

  const runtime = useMemo<Runtime | null>(() => {
    if (!settled.brick) return null
    const rt = createRuntime(buildTestRoom(settled.brick, settled.stage, { hero: settled.projectHero }))
    rt.greenFlag()
    return rt
  }, [settled])

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [viewport, setViewport] = useState<Viewport>({ width: 320, height: 160 })

  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (r) setViewport({ width: Math.max(10, Math.floor(r.width)), height: Math.max(10, Math.floor(r.height)) })
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [])

  // The play loop: fixed 30 ticks/s, drawn at display rate with interpolation. Paused while the tab is hidden.
  useEffect(() => {
    if (!runtime) return
    const acc = new FixedStepAccumulator()
    let prev = new Map<string, TargetPose>()
    let raf = 0
    const onVis = () => (document.hidden ? acc.pause() : acc.resume())
    document.addEventListener('visibilitychange', onVis)
    const loop = (now: number) => {
      const { ticks, alpha } = acc.advance(now)
      for (let t = 0; t < ticks; t++) {
        prev = new Map(runtime.world.targets.map((x) => [x.id, { x: x.x, y: x.y, direction: x.direction, size: x.size }]))
        runtime.step()
        runtime.notes.length = 0
      }
      const ctx = canvasRef.current?.getContext('2d')
      if (ctx) {
        renderPlayMode(ctx, runtime.world, { camera: fitCamera(runtime.world.bounds, viewport), viewport, prevPoses: prev, interpAlpha: alpha })
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [runtime, viewport])

  useEffect(() => globalImageCache.onImageLoaded(() => undefined), [])

  const keyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const k = browserKeyToScratchKey(e)
      if (!k || !runtime) return
      e.preventDefault()
      runtime.pressKey(k)
    },
    [runtime],
  )
  const keyUp = useCallback(
    (e: React.KeyboardEvent) => {
      const k = browserKeyToScratchKey(e)
      if (k && runtime) runtime.releaseKey(k)
    },
    [runtime],
  )

  if (brickId === STAGE_ID || !brick) {
    return <div className="ws-room ws-room-empty">The Stage has no test room. Pick a brick to see it run.</div>
  }
  const hero = isHeroBrick(brick)
  return (
    <section className="ws-card ws-room" aria-label="Test room">
      <div className="ws-card-head">
        <h2>Test room</h2>
        <button type="button" className="ws-btn" onClick={() => setRestarts((n) => n + 1)} aria-label="Restart the test room">
          ↻ Restart
        </button>
      </div>
      <div ref={wrapRef} className="ws-room-view" tabIndex={0} onKeyDown={keyDown} onKeyUp={keyUp} onPointerDown={(e) => e.currentTarget.focus()} aria-label="Test room view">
        <canvas ref={canvasRef} width={viewport.width} height={viewport.height} />
      </div>
      <p className="ws-hint">{hero ? 'Click the room, then use the arrow keys, space and X.' : 'A helper Hero is in the room. Click it and use the arrow keys to touch your brick.'}</p>
    </section>
  )
}
