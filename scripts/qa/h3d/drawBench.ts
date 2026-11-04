/**
 * Hackable 3D draw cost (docs/qa/hackable-3d/D1.md): the studio's own three.js view (studio/three/render3d.ts) drawing a
 * running game on a build of n classic bricks with all six code bricks and two Heroes, as Play draws it.
 *
 * Bundled by run-draw.mjs and run in Chrome (optionally at 6× CPU slowdown). Times, per frame:
 *  - tick: the game's 30-a-second step (one every other 60 Hz frame);
 *  - draw: building the draw list and drawing (the JS the frame costs);
 *  - finish: the same plus gl.finish(), so the GPU's work is counted too;
 * and once: building the build's meshes (what a Build edit costs: the whole build is rebuilt).
 */
import { createRuntime } from '../../../src/platformer/lab/core'
import type { LevelDesign } from '../../../src/platformer/lab/core/contracts'
import { STUD, type BrickDef3, type CopyPlacement3, type LevelDesign3, type World3 } from '../../../src/platformer/lab/kit3d/contracts3d'
import { DEFAULT_SHAPE3, HERO3D, addPlayer3d, heroSpawn, lookPlayer3d } from '../../../src/platformer/lab/kit3d/engine3d'
import { partsOf } from '../../../src/platformer/lab/kit3d/parts3d'
import { sampleScenery } from '../../../src/platformer/lab/kit3d/sample3d'
import { CODE_BRICKS_3D } from '../../../src/platformer/lab/studio/three/bricks3d'
import { createStarter3dProject } from '../../../src/platformer/lab/studio/three/project3d'
import { World3View, lookOf, placeCamera, type Draw3 } from '../../../src/platformer/lab/studio/three/render3d'

/** The starter's Hero and Stage, a build of n bricks, and one of each code brick near the start. */
export function benchDesign(bricks: number): LevelDesign3 {
  const base = createStarter3dProject().design as LevelDesign3
  const hero = base.bricks.find((b) => b.id === HERO3D)!
  const made = CODE_BRICKS_3D.flatMap((e) => e.parts.map((p) => ({ ...p.make(p.id), offset: p.offset })))
  const copies: CopyPlacement3[] = [{ id: 'hero', brickId: HERO3D, x: 0, y: 0, z: 4 * STUD }]
  made.forEach((m, i) => copies.push({ id: `c${i}`, brickId: m.brick.id, x: (i - 3) * 3 * STUD + m.offset.x, y: m.offset.y, z: -2 * STUD + m.offset.z }))
  return { ...base, bricks: [hero, ...made.map((m) => m.brick)], copies, scenery3d: sampleScenery(bricks) }
}

export interface DrawBench { bricks: number; meshesMs: number; tickMs: number; drawMs: number; drawP95Ms: number; finishMs: number; finishP95Ms: number; calls: number; triangles: number; renderer: string }

export function benchDraw(bricks: number, frames = 240): DrawBench {
  const clock = () => performance.now()
  const canvas = document.createElement('canvas')
  canvas.width = 1280
  canvas.height = 720
  document.body.appendChild(canvas)
  const view = new World3View(canvas)
  view.resize(1280, 720)
  const design = benchDesign(bricks)
  const rt = createRuntime(design as LevelDesign)
  rt.greenFlag()
  addPlayer3d(rt, { num: 1, name: 'A', yaw: 0 }, heroSpawn(design))
  addPlayer3d(rt, { num: 2, name: 'B', yaw: 90 }, heroSpawn(design))
  const parts = partsOf(design)
  const m0 = clock()
  view.setScenery(design.scenery3d, parts, 64, parts)
  const meshesMs = clock() - m0
  const gl = view.renderer.getContext()
  const ticks: number[] = []
  const draws: number[] = []
  const finishes: number[] = []
  rt.pressKey('up arrow', 1)
  rt.pressKey('up arrow', 2)
  for (let f = 0; f < frames; f++) {
    if (f % 2 === 0) {
      if (f % 40 === 0) { lookPlayer3d(rt, 1, (f * 7) % 360); rt.pressKey('space', 2) }
      if (f % 40 === 10) rt.releaseKey('space', 2)
      const t0 = clock()
      rt.step()
      ticks.push(clock() - t0)
    }
    const d0 = clock()
    const world = rt.world as World3
    const list: Draw3[] = []
    for (const t of world.targets) {
      if (!t.body3) continue
      const look = lookOf((world.bricks[t.brickId] as BrickDef3 | undefined)?.shape3d, DEFAULT_SHAPE3)
      list.push({ id: t.id, brickId: t.brickId, x: t.x, y: t.y, z: t.z, direction: t.direction, facing: t.body3.character?.facing, visible: t.visible, w: t.body3.w, h: t.body3.h, d: t.body3.d, color: look.color, model: t.body3.character ? 'hero' : look.model, player: t.player })
    }
    const hero = list.find((t) => t.model === 'hero')!
    view.drawTargets(list, hero.id)
    placeCamera(view.camera, { yaw: (f * 0.5) % 360, pitch: 30, dist: 9, tx: hero.x, ty: hero.y + 0.7, tz: hero.z })
    view.render()
    draws.push(clock() - d0)
    gl.finish()
    finishes.push(clock() - d0)
  }
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
  const p95 = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)] ?? 0
  const r = (n: number) => Math.round(n * 100) / 100
  const info = view.renderer.info.render
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'unknown'
  view.dispose()
  canvas.remove()
  // Skip the first 20 frames (shader compiles, JIT) for the per-frame numbers.
  return { bricks, meshesMs: r(meshesMs), tickMs: r(avg(ticks.slice(10))), drawMs: r(avg(draws.slice(20))), drawP95Ms: r(p95(draws.slice(20))), finishMs: r(avg(finishes.slice(20))), finishP95Ms: r(p95(finishes.slice(20))), calls: info.calls, triangles: info.triangles, renderer }
}
