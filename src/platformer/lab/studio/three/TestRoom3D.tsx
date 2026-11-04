/**
 * Code's "Just this brick" in 3D: the open brick on an empty build plate with a Hero (and, for a Button, its Door),
 * running on its own so a kid can try one brick's code without the rest of the world. It restarts when the brick's
 * code or sliders change (debounced) or on Restart.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createRuntime } from '../../core/index'
import type { LevelDesign } from '../../core/contracts'
import { STUD, type BrickDef3, type CopyPlacement3, type LevelDesign3, type World3 } from '../../kit3d/contracts3d'
import { DEFAULT_SHAPE3, HERO3D, isHero3dBrick, lookPlayer3d } from '../../kit3d/engine3d'
import { HERO_SIZE } from '../../kit3d/physics3d'
import { partsOf } from '../../kit3d/parts3d'
import { FixedStepAccumulator } from '../stage/accumulator'
import { browserKeyToScratchKey } from '../stage/keys'
import { useStudio, type StudioStore } from '../store'
import { RESTART_DEBOUNCE_MS } from '../workshop/TestRoom'
import { createHero3d } from './bricks3d'
import { World3View, lookOf, placeCamera, type Draw3 } from './render3d'

const STOCK = partsOf(undefined)

/** The room: the plate, a Hero 4 studs toward you, and the brick in the middle (a Door goes with a Button). */
export function testRoom3d(design: LevelDesign3, brickId: string): LevelDesign3 {
  const brick = design.bricks.find((b) => b.id === brickId) as BrickDef3 | undefined
  const heroBrick = (design.bricks.find((b) => isHero3dBrick(b)) as BrickDef3 | undefined) ?? createHero3d().brick
  const bricks: BrickDef3[] = [heroBrick]
  const copies: CopyPlacement3[] = [{ id: 'room_hero', brickId: heroBrick.id, x: 0, y: 0, z: 4 * STUD }]
  if (brick && !isHero3dBrick(brick)) {
    bricks.push(brick)
    const original = design.copies.find((c) => c.brickId === brick.id)
    copies.push({ id: 'room_brick', brickId: brick.id, x: 0, y: original && original.y > 0.4 ? 0.5 * STUD : 0, z: 0 })
    // A brick that talks to a partner (the Button's Door) brings it along.
    if (brick.id === 'brick3d_button' || brick.remixOf === 'brick3d_button') {
      const door = design.bricks.find((b) => b.id === 'brick3d_door' || b.remixOf === 'brick3d_door')
      if (door) { bricks.push(door); copies.push({ id: 'room_door', brickId: door.id, x: 0, y: 0, z: -3 * STUD }) }
    }
  }
  return { ...design, bricks, copies, scenery3d: [], plate3d: undefined, customParts3d: undefined }
}

export function TestRoom3D({ store, brickId, restartKey = 0 }: { store: StudioStore; brickId: string; bare?: boolean; restartKey?: number }) {
  const design = useStudio(store, (s) => s.project.design) as LevelDesign3
  const [settled, setSettled] = useState({ design, restartKey })
  useEffect(() => {
    const id = setTimeout(() => setSettled({ design, restartKey }), RESTART_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [design, restartKey])
  const runtime = useMemo(() => {
    const rt = createRuntime(testRoom3d(settled.design, brickId) as LevelDesign)
    rt.greenFlag()
    return rt
  }, [settled, brickId])
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    let view: World3View
    try { view = new World3View(canvas) } catch { return }
    view.resize(wrap.clientWidth, wrap.clientHeight)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => view.resize(wrap.clientWidth, wrap.clientHeight)) : null
    ro?.observe(wrap)
    const acc = new FixedStepAccumulator()
    lookPlayer3d(runtime, undefined, 0)
    let raf = 0
    const keys = new Set<string>()
    const onDown = (e: KeyboardEvent) => {
      if (!wrap.contains(e.target as Node)) return
      const k = browserKeyToScratchKey(e)
      if (!k) return
      e.preventDefault()
      if (!keys.has(k)) { keys.add(k); runtime.pressKey(k) }
    }
    const onUp = (e: KeyboardEvent) => {
      const k = browserKeyToScratchKey(e)
      if (k && keys.delete(k)) runtime.releaseKey(k)
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    const loop = (now: number) => {
      const { ticks } = acc.advance(now)
      for (let i = 0; i < ticks; i++) { runtime.step(); runtime.notes.length = 0 }
      const world = runtime.world as World3
      view.setScenery([], STOCK, 64, STOCK)
      const list: Draw3[] = []
      for (const t of world.targets) {
        const tt = t as World3['targets'][number]
        if (!tt.body3) continue
        const look = lookOf((world.bricks[t.brickId] as BrickDef3 | undefined)?.shape3d, DEFAULT_SHAPE3)
        list.push({ id: t.id, brickId: t.brickId, x: t.x, y: t.y, z: tt.z, direction: t.direction, facing: tt.body3.character?.facing, visible: t.visible, w: tt.body3.w, h: tt.body3.h, d: tt.body3.d, color: look.color, model: tt.body3.character ? 'hero' : look.model })
      }
      view.drawTargets(list, list.find((t) => t.model === 'hero')?.id ?? null)
      placeCamera(view.camera, { yaw: 0, pitch: 38, dist: 9, tx: 0, ty: 0.4, tz: 0.6 })
      view.render()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      for (const k of keys) runtime.releaseKey(k)
      ro?.disconnect()
      view.dispose()
    }
  }, [runtime])

  return (
    <div ref={wrapRef} className="h3d-room" tabIndex={0} aria-label="Just this brick, with a Hero to try it">
      <canvas ref={canvasRef} className="h3d-canvas" onPointerDown={() => wrapRef.current?.focus()} />
      <span className="h3d-chip h3d-chip-quiet h3d-room-tip">Click here, then use the arrows and Space</span>
    </div>
  )
}

export { HERO3D, HERO_SIZE }
