/**
 * Hackable 3D's Stage (docs/qa/hackable-3d/D1.md): the one world view the studio shell keeps mounted in Build, Code and
 * Play, in place of the 2D Stage.
 *
 *   Build: the build plate from an orbit camera. Drag to look around, scroll to zoom. With a brick armed, a see-through
 *          box shows where it goes and a click places it; Erase removes; otherwise a click selects a code brick (its
 *          card opens) and a double-click opens its code.
 *   Code:  the running world beside the code (the store's preview game). Click it to give it the keys.
 *   Play:  the camera follows the Hero; drag to turn it. The Hero walks the way the camera looks, so the camera's yaw is
 *          game input (lookPlayer3d, whole degrees: in a room, D3 sends it as an event like a key).
 *
 * The game runs at 30 ticks a second (the shared FixedStepAccumulator) and is drawn every frame, moved smoothly between
 * ticks. three.js only draws (render3d.ts).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Target } from '../../core/contracts'
import type { Runtime } from '../../core/runtime'
import { PLATE, STUD, isTarget3, plateOf, type BrickDef3, type LevelDesign3, type Target3, type World3 } from '../../kit3d/contracts3d'
import { DEFAULT_SHAPE3, isHero3dBrick, lookPlayer3d } from '../../kit3d/engine3d'
import { HERO_SIZE } from '../../kit3d/physics3d'
import { partsOf } from '../../kit3d/parts3d'
import type { BuildTools } from '../Stage'
import { FixedStepAccumulator } from '../stage/accumulator'
import { browserKeyToScratchKey } from '../stage/keys'
import { useStudio, type StudioStore } from '../store'
import { addScenery, build3d, codePlacement, partBox, partPlacement, placeCode, removeCode, removeScenery, type Surface } from './build3d'
import { World3View, lookOf, placeCamera, type Draw3, type Hit3, type Orbit } from './render3d'
import './three.css'

const STOCK = partsOf(undefined)
const DRAG_PX = 5

type Pose = [x: number, y: number, z: number, direction: number, facing: number]

function poseOf(t: Target3): Pose {
  return [t.x, t.y, t.z, t.direction, t.body3?.character?.facing ?? 180]
}

const lerp = (a: number, b: number, k: number) => a + (b - a) * k

/** How long the drawn Hero takes to follow a step up or down (seconds): a plate pop becomes a short glide. */
const STEP_EASE = 0.07
const STEP_MAX = 0.22

/**
 * Drawing only (docs/qa/hackable-3d/feel/FEEL.md, fix B): a grounded Hero's drawn height eases over a step of up to
 * a plate or so (slopes are plate-high steps), instead of popping. The game itself is untouched.
 */
function easeSteps(list: Draw3[], shown: Map<string, number>, dt: number): void {
  const k = 1 - Math.exp(-Math.max(0, dt) / STEP_EASE)
  const seen = new Set<string>()
  for (const t of list) {
    if (t.model !== 'hero') continue
    seen.add(t.id)
    const was = shown.get(t.id)
    const y = was !== undefined && t.grounded && Math.abs(t.y - was) <= STEP_MAX ? lerp(was, t.y, k) : t.y
    shown.set(t.id, y)
    t.y = y
  }
  for (const id of shown.keys()) if (!seen.has(id)) shown.delete(id)
}
/** Shortest way round between two angles. */
const lerpAngle = (a: number, b: number, k: number) => a + ((((b - a + 180) % 360) + 360) % 360 - 180) * k

function drawCopies(design: LevelDesign3): Draw3[] {
  const out: Draw3[] = []
  for (const c of design.copies) {
    const brick = design.bricks.find((b) => b.id === c.brickId) as BrickDef3 | undefined
    if (!brick) continue
    const hero = isHero3dBrick(brick)
    const look = lookOf(brick.shape3d, DEFAULT_SHAPE3)
    out.push({
      id: c.id, copyId: c.id, brickId: brick.id, x: c.x, y: c.y, z: c.z ?? 0, direction: c.direction ?? 90, facing: 180,
      visible: c.visible !== false, ...look, ...(hero ? { ...HERO_SIZE, model: 'hero' as const } : {}),
    })
  }
  return out
}

function drawTargets(world: World3, prev: Map<string, Pose>, alpha: number): Draw3[] {
  const out: Draw3[] = []
  for (const t of world.targets) {
    if (!isTarget3(t) || !t.body3) continue
    const brick = world.bricks[t.brickId] as BrickDef3 | undefined
    const look = lookOf(brick?.shape3d, DEFAULT_SHAPE3)
    const hero = !!t.body3.character
    const now = poseOf(t)
    const was = prev.get(t.id) ?? now
    out.push({
      id: t.id, copyId: t.copyId, brickId: t.brickId,
      x: lerp(was[0], now[0], alpha), y: lerp(was[1], now[1], alpha), z: lerp(was[2], now[2], alpha),
      direction: lerpAngle(was[3], now[3], alpha), facing: lerpAngle(was[4], now[4], alpha),
      visible: t.visible, w: t.body3.w, h: t.body3.h, d: t.body3.d, color: look.color, model: hero ? 'hero' : look.model,
      player: t.player, bubble: t.bubble?.text, grounded: t.body3.onGround,
    })
  }
  return out
}

/** The Hero the camera follows: this screen's player's in a room, else the first Hero. */
function followed(world: World3, me: number | undefined): Target3 | undefined {
  const heroes = world.targets.filter((t): t is Target3 => isTarget3(t) && !!t.body3?.character && t.visible)
  return (me !== undefined ? heroes.find((t) => t.player === me) : undefined) ?? heroes[0]
}

/** The camera that frames what is built (or the middle of the plate when it is empty), seen from the front right. */
function homeOrbit(design: LevelDesign3): Orbit {
  const plate = plateOf(design)
  const parts = partsOf(design)
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = 0
  const grow = (x: number, z: number, y = 0) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); top = Math.max(top, y) }
  for (const b of design.scenery3d ?? []) {
    const part = parts[b.partId]
    if (!part) continue
    const odd = b.rotation % 2 === 1
    grow((b.x - plate / 2) * STUD, (b.z - plate / 2) * STUD, (b.y + part.height) * PLATE)
    grow((b.x + (odd ? part.depth : part.width) - plate / 2) * STUD, (b.z + (odd ? part.width : part.depth) - plate / 2) * STUD)
  }
  for (const c of design.copies) grow(c.x, c.z ?? 0, c.y)
  if (!Number.isFinite(x0)) return { yaw: 30, pitch: 38, dist: 16, tx: 0, ty: 0, tz: 0 }
  const span = Math.max(x1 - x0, z1 - z0, top * 1.5, 6)
  return { yaw: 30, pitch: 38, dist: Math.min(plate * 0.6, Math.max(9, span * 1.35)), tx: (x0 + x1) / 2, ty: top / 3, tz: (z0 + z1) / 2 }
}

export function Stage3D({ store, tools, codeView = false, onOpenCode }: { store: StudioStore; tools?: BuildTools; codeView?: boolean; onOpenCode?: () => void }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewRef = useRef<World3View | null>(null)
  const mode = useStudio(store, (s) => s.mode)
  const runtime = useStudio(store, (s) => s.runtime)
  const paused = useStudio(store, (s) => s.previewPaused)
  const design = useStudio(store, (s) => s.project.design) as LevelDesign3
  const selectedCopyId = useStudio(store, (s) => s.selectedCopyId)
  const build = build3d(store)
  useSyncExternalStore(build.subscribe, build.getVersion)
  const erasing = tools?.erasing ?? false
  const history = tools?.history
  const playing = mode === 'play'
  const building = mode === 'build' && !codeView
  const [bubbles, setBubbles] = useState<Array<{ id: string; text: string; x: number; y: number }>>([])
  const [webgl, setWebgl] = useState(true)

  // The camera: the Build orbit is remembered across screens; Play has its own that follows the Hero.
  const orbit = useRef<Orbit>(homeOrbit(design))
  const playOrbit = useRef<Orbit>({ yaw: 0, pitch: 22, dist: 6.5, tx: 0, ty: 0, tz: 0 })
  const sentYaw = useRef<number | null>(null)
  const prev = useRef(new Map<string, Pose>())
  const pointer = useRef<{ id: number; x: number; y: number; moved: boolean; button: number } | null>(null)
  const hover = useRef<Hit3 | null>(null)
  const pressed = useRef(new Set<string>())

  // The view: made once per canvas. A browser without WebGL says so instead of a blank box.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let view: World3View
    try {
      view = new World3View(canvas)
    } catch {
      setWebgl(false)
      return
    }
    viewRef.current = view
    if (import.meta.env.DEV) (window as unknown as { __h3d?: unknown }).__h3d = { view, store }
    const wrap = wrapRef.current
    const ro = typeof ResizeObserver !== 'undefined' && wrap
      ? new ResizeObserver((entries) => {
        const r = entries[0]?.contentRect
        if (!r) return
        view.resize(Math.floor(r.width), Math.floor(r.height))
        // Resizing clears the canvas: draw again now rather than flash empty until the next frame.
        view.render()
      })
      : null
    if (wrap) {
      ro?.observe(wrap)
      view.resize(wrap.clientWidth, wrap.clientHeight)
    }
    // My projects' picture (StudioApp stagePicture) reads the canvas outside a frame: draw first, so it isn't black.
    const picture = () => view.render()
    canvas.addEventListener('stage:picture', picture)
    return () => {
      canvas.removeEventListener('stage:picture', picture)
      ro?.disconnect()
      view.dispose()
      viewRef.current = null
    }
  }, [])

  // Keys reach the game: in Play from anywhere but a text field; in Code only while the world has focus.
  useEffect(() => {
    if (!runtime || paused) return
    const editable = (el: EventTarget | null) => el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
    const mine = (el: EventTarget | null) => el instanceof Node && !!wrapRef.current?.contains(el)
    const onDown = (e: KeyboardEvent) => {
      if (editable(e.target) || (!playing && !mine(e.target))) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const key = browserKeyToScratchKey(e)
      if (!key) return
      e.preventDefault()
      if (pressed.current.has(key)) return
      pressed.current.add(key)
      runtime.pressKey(key)
    }
    const onUp = (e: KeyboardEvent) => {
      const key = browserKeyToScratchKey(e)
      if (!key || !pressed.current.has(key)) return
      pressed.current.delete(key)
      runtime.releaseKey(key)
    }
    const release = () => {
      for (const key of pressed.current) runtime.releaseKey(key)
      pressed.current.clear()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', release)
    if (playing) wrapRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', release)
      release()
    }
  }, [runtime, paused, playing])

  // Build's own keys: R turns the armed brick, Esc puts it down.
  useEffect(() => {
    if (!building) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target
      if (el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if (el instanceof Element && el.closest('.cl-code, [role="dialog"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.toLowerCase() === 'r' && build.armed?.kind === 'part') { e.preventDefault(); build.turn(); refreshGhost() }
      else if (e.key === 'Escape' && build.armed) { e.preventDefault(); build.arm(null); viewRef.current?.setGhost(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // A new game starts its camera behind the Hero (a Hero starts facing away from you, along −z: yaw 0).
  useEffect(() => {
    prev.current.clear()
    sentYaw.current = null
    const hero = runtime ? followed(runtime.world as World3, undefined) : undefined
    playOrbit.current = { ...playOrbit.current, yaw: 0, ...(hero ? { tx: hero.x, ty: hero.y + 0.7, tz: hero.z } : {}) }
  }, [runtime])

  // The draw loop.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const accumulator = new FixedStepAccumulator()
    let raf = 0
    const onVis = () => (document.hidden ? accumulator.pause() : accumulator.resume())
    document.addEventListener('visibilitychange', onVis)
    let lastBubbles = ''
    let lastFrame = 0
    const shownY = new Map<string, number>()
    const frame = (now: number) => {
      const dt = lastFrame ? (now - lastFrame) / 1000 : 0
      lastFrame = now
      const s = store.getState()
      const d = s.project.design as LevelDesign3
      const rt = s.runtime
      view.setScenery(d.scenery3d ?? [], partsOf(d), plateOf(d), STOCK)
      let list: Draw3[]
      let heroId: string | null = null
      let alpha = 1
      if (rt && rt.world.design) {
        const world = rt.world as World3
        if (!s.previewPaused) {
          // The camera's yaw is the keys' frame: tell the game when it turns (whole degrees, like a room event).
          const yaw = Math.round(((playing ? playOrbit.current.yaw : orbit.current.yaw) % 360 + 360) % 360)
          if (yaw !== sentYaw.current) { lookPlayer3d(rt, undefined, yaw); sentYaw.current = yaw }
          const step = accumulator.advance(now)
          alpha = step.alpha
          for (let i = 0; i < step.ticks; i++) {
            const p = prev.current
            p.clear()
            for (const t of world.targets) if (isTarget3(t)) p.set(t.id, poseOf(t))
            rt.step()
            rt.notes.length = 0
          }
        } else accumulator.reset()
        list = drawTargets(world, prev.current, alpha)
        easeSteps(list, shownY, dt)
        const hero = followed(world, s.room?.me)
        heroId = hero?.id ?? null
        if (playing && hero) {
          const h = list.find((t) => t.id === hero.id)!
          const o = playOrbit.current
          // Ease the camera after the Hero, so a step up or a bounce doesn't jolt it.
          o.tx = lerp(o.tx, h.x, 0.25); o.ty = lerp(o.ty, h.y + 0.7, 0.2); o.tz = lerp(o.tz, h.z, 0.25)
        }
      } else {
        accumulator.reset()
        list = drawCopies(d)
      }
      view.drawTargets(list, heroId)
      view.setSelected(s.mode === 'build' && !codeView ? s.selectedCopyId : null)
      placeCamera(view.camera, playing ? playOrbit.current : orbit.current)
      view.render()
      // Speech bubbles over whoever is saying something.
      const said = list.filter((t) => t.bubble && t.visible).map((t) => {
        const p = view.toScreen(t.x, t.y + t.h + 0.15, t.z)
        return p ? { id: t.id, text: t.bubble!, x: Math.round(p.x), y: Math.round(p.y) } : null
      }).filter((b): b is { id: string; text: string; x: number; y: number } => !!b)
      const key = JSON.stringify(said)
      if (key !== lastBubbles) { lastBubbles = key; setBubbles(said) }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [store, playing, codeView, webgl])

  // Leaving Build puts the ghost away.
  useEffect(() => { if (!building) viewRef.current?.setGhost(null) }, [building])

  const surfaceOf = (hit: Hit3): Surface => ({ x: hit.point.x, y: hit.point.y, z: hit.point.z, nx: hit.normal.x, ny: hit.normal.y, nz: hit.normal.z })

  function refreshGhost() {
    const view = viewRef.current
    const hit = hover.current
    const armed = build.armed
    const d = store.getState().project.design as LevelDesign3
    if (!view || !building || !armed || !hit || erasing) { view?.setGhost(null); return }
    if (armed.kind === 'part') {
      const b = partPlacement(d, surfaceOf(hit), armed.partId, armed.rotation, armed.color)
      view.setGhost(b ? partBox(d, b) : null, !!b)
    } else {
      const shape = armed.kind === 'code' && armed.key === 'hero' ? HERO_SIZE : DEFAULT_SHAPE3
      const at = codePlacement(d, surfaceOf(hit), shape)
      view.setGhost(at ? { ...at, w: shape.w, h: shape.h, d: shape.d } : null, !!at)
    }
  }

  const local = (e: React.PointerEvent | React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    wrapRef.current?.focus({ preventScroll: true })
    canvasRef.current?.setPointerCapture(e.pointerId)
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, button: e.button }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointer.current
    const view = viewRef.current
    if (p && p.id === e.pointerId) {
      const dx = e.clientX - p.x
      const dy = e.clientY - p.y
      if (!p.moved && Math.hypot(dx, dy) < DRAG_PX) return
      p.moved = true
      p.x = e.clientX
      p.y = e.clientY
      const o = playing ? playOrbit.current : orbit.current
      if (!playing && (p.button === 2 || e.shiftKey)) {
        // Right-drag (or Shift-drag) slides the view along the plate.
        const yaw = (o.yaw * Math.PI) / 180
        const k = o.dist * 0.0022
        // Right is (cos, −sin) and forward (−sin, −cos) on the plate: the plate follows the pointer.
        o.tx += (-Math.cos(yaw) * dx - Math.sin(yaw) * dy) * k
        o.tz += (Math.sin(yaw) * dx - Math.cos(yaw) * dy) * k
        return
      }
      o.yaw -= dx * 0.4
      o.pitch = Math.max(playing ? 5 : 12, Math.min(80, o.pitch + dy * 0.3))
      return
    }
    if (!view || !building) return
    const at = local(e)
    hover.current = view.pick(at.x, at.y)
    refreshGhost()
  }

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = pointer.current
    pointer.current = null
    if (!p || p.moved || p.button !== 0) return
    const view = viewRef.current
    if (!view || !building) return
    const at = local(e)
    const hit = view.pick(at.x, at.y)
    hover.current = hit
    click(hit)
    refreshGhost()
  }

  function click(hit: Hit3 | null) {
    const armed = build.armed
    if (erasing) {
      if (hit?.kind === 'scenery' && hit.index !== undefined) removeScenery(store, history, hit.index)
      else if (hit?.kind === 'target' && hit.id) removeCode(store, history, hit.id)
      return
    }
    if (armed && hit) {
      const d = store.getState().project.design as LevelDesign3
      if (armed.kind === 'part') {
        const b = partPlacement(d, surfaceOf(hit), armed.partId, armed.rotation, armed.color)
        if (b) addScenery(store, history, b)
      } else {
        const placed = placeCode(store, history, armed, surfaceOf(hit))
        if (placed.length > 0 && armed.kind === 'code' && armed.key === 'hero') build.arm(null)
      }
      return
    }
    if (hit?.kind === 'target' && hit.id) store.selectCopy(hit.id)
    else store.selectCopy(null)
  }

  const onWheel = (e: React.WheelEvent) => {
    const o = playing ? playOrbit.current : orbit.current
    o.dist = Math.max(playing ? 2.5 : 3, Math.min(playing ? 16 : 90, o.dist * Math.exp(e.deltaY * 0.001)))
  }

  const bricks = design.scenery3d?.length ?? 0
  const codeCount = design.copies.length
  const isSelected = !!selectedCopyId

  return (
    <div ref={wrapRef} className="h3d-stage" tabIndex={0} aria-label={playing ? 'Your world, playing' : 'Your world'} data-mode={playing ? 'play' : codeView ? 'code' : 'build'}>
      <canvas
        ref={canvasRef}
        className="h3d-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { pointer.current = null }}
        onPointerLeave={() => { if (!pointer.current) { hover.current = null; viewRef.current?.setGhost(null) } }}
        onWheel={onWheel}
        onDoubleClick={() => { if (building && !build.armed && !erasing && isSelected) onOpenCode?.() }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {!webgl && <p className="h3d-nogl" role="alert">This browser can’t draw 3D worlds (WebGL is off). Try Chrome, Edge or Safari.</p>}
      {building && (
        <div className="h3d-chips" aria-live="polite">
          <span className="h3d-chip">{bricks} {bricks === 1 ? 'brick' : 'bricks'}{codeCount > 0 ? ` · ${codeCount} with code` : ''}</span>
          <span className="h3d-chip h3d-chip-quiet">Drag to look around · scroll to zoom</span>
        </div>
      )}
      {playing && <span className="h3d-chip h3d-chip-quiet h3d-play-tip">Drag to turn the camera</span>}
      {bubbles.map((b) => (
        <div key={b.id} className="h3d-bubble" style={{ left: b.x, top: b.y }} role="status">{b.text}</div>
      ))}
    </div>
  )
}

/** The Hero target of a running 3D game (for the HUD). */
export function heroTarget(runtime: Runtime | null): Target | undefined {
  if (!runtime) return undefined
  return followed(runtime.world as World3, undefined)
}
