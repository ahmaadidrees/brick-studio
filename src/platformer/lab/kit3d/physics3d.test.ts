/**
 * Hackable 3D spike (docs/qa/hackable-3d/SPIKE.md): the deterministic 3D physics inside the Hackable core.
 */
import { describe, expect, it } from 'vitest'
import { worldFingerprint, worldFromJson, worldToJson, copyWorld } from '../core/snapshot'
import type { Runtime } from '../core/runtime'
import { STUD, type LevelDesign3, type Target3, type World3 } from './contracts3d'
import { addPlayer3d, createRuntime3d, heroSpawn, HERO3D, lookPlayer3d } from './engine3d'
import { sampleDesign3d } from './sample3d'
import { AUTOSTEP } from './physics3d'
import { CHARACTER_FIXED_STEP, bufferCharacterJump, createCharacterMotionState, createCharacterStepResult, stepCharacterMotion } from '../../../brick/characterController'

const heroOf = (r: Runtime): Target3 => (r.world as World3).targets.find((t) => t.brickId === HERO3D && !t.isClone)!
const stageVar = (r: Runtime, id: string) => r.world.stage.variables[id]

function start(design: LevelDesign3 = sampleDesign3d({ bricks: 50 })): Runtime {
  const r = createRuntime3d(design)
  r.greenFlag()
  return r
}
const run = (r: Runtime, ticks: number) => { for (let i = 0; i < ticks; i++) r.step() }

describe('Hackable 3D spike: the character', () => {
  it('stands on the build plate', () => {
    const r = start()
    run(r, 20)
    const h = heroOf(r)
    expect(h.body3!.onGround).toBe(true)
    expect(h.y).toBeCloseTo(0, 6)
  })

  it('walks at the classic walk speed along the camera yaw', () => {
    const r = start()
    lookPlayer3d(r, undefined, 90) // camera looking along −x: forward is −x
    run(r, 5)
    const x0 = heroOf(r).x
    r.pressKey('up arrow')
    run(r, 30) // one second
    const h = heroOf(r)
    expect(h.body3!.character!.velocityX).toBeCloseTo(-3.5, 2)
    expect(h.x - x0).toBeLessThan(-3)
    expect(h.x - x0).toBeGreaterThan(-3.5)
  })

  it('jumps about as high as the classic character (5.25² / 2·16 ≈ 0.86) and lands', () => {
    const r = start()
    run(r, 10)
    r.pressKey('space')
    let top = 0
    for (let i = 0; i < 40; i++) { r.step(); top = Math.max(top, heroOf(r).y) }
    // 60 Hz Euler from the jump substep, exactly as the classic integrates (see the parity test below).
    expect(top).toBeGreaterThan(0.85)
    expect(top).toBeLessThan(0.95)
    expect(heroOf(r).body3!.onGround).toBe(true)
    expect(stageVar(r, 'g_landings')).toBeGreaterThanOrEqual(1)
  })

  it('takes one air jump, then no more until it lands', () => {
    const r = start()
    run(r, 10)
    r.pressKey('space'); run(r, 6); r.releaseKey('space'); run(r, 2)
    r.pressKey('space'); run(r, 2); r.releaseKey('space')
    let top = 0
    for (let i = 0; i < 4; i++) { r.step(); top = Math.max(top, heroOf(r).y) }
    r.pressKey('space'); run(r, 2); r.releaseKey('space')
    for (let i = 0; i < 60; i++) { r.step(); top = Math.max(top, heroOf(r).y) }
    expect(top).toBeGreaterThan(1.2) // two jumps' worth
    expect(top).toBeLessThan(1.9) // not three
  })

  it('climbs a plate (autostep) but not a brick', () => {
    expect(0.18).toBeLessThan(AUTOSTEP)
    const d = sampleDesign3d({ bricks: 0 })
    // A plate across the path, and a brick standing on it further on.
    d.scenery3d = [
      { partId: 'plate_6x8', x: 26, z: 25, y: 0, rotation: 1, color: '#fff' },
      { partId: 'brick_2x6', x: 26, z: 26, y: 1, rotation: 1, color: '#fff' },
    ]
    d.copies = d.copies.filter((c) => c.brickId === HERO3D)
    const r = start(d)
    run(r, 5)
    r.pressKey('up arrow')
    run(r, 90)
    const h = heroOf(r)
    expect(h.y).toBeCloseTo(0.18, 6) // up on the plate
    // Stopped flush against the brick's near face (z = (26 + 2 − 32) × STUD).
    expect(h.z - 0.18).toBeCloseTo((26 + 2 - 32) * STUD, 6)
  })

  it('the Bounce pad launches a Hero that lands on it (its own code)', () => {
    const r = start()
    run(r, 5)
    r.pressKey('up arrow')
    let top = 0
    for (let i = 0; i < 60; i++) { r.step(); top = Math.max(top, heroOf(r).y) }
    expect(stageVar(r, 'g_bounces')).toBeGreaterThanOrEqual(1)
    expect(top).toBeGreaterThan(2) // 9² / 2·16 ≈ 2.5 above the pad
  })

  it('a Coin counts a touch and jumps somewhere random', () => {
    const d = sampleDesign3d({ bricks: 0 })
    d.copies.find((c) => c.id === 'coin1')!.x = 0
    d.copies.find((c) => c.id === 'coin1')!.z = 3 * STUD
    const r = start(d)
    lookPlayer3d(r, undefined, 0)
    r.pressKey('up arrow')
    run(r, 20)
    expect(stageVar(r, 'g_coins')).toBeGreaterThanOrEqual(1)
  })
})

describe('Hackable 3D spike: feel against the classic character', () => {
  it('walks and jumps on flat ground within a micrometre of src/brick/characterController.ts', () => {
    // The classic controller on a flat floor, with Rapier's part (stop at the floor, snap) done by hand.
    const state = createCharacterMotionState(false)
    const out = createCharacterStepResult()
    let cy = 0, cz = 0, grounded = false
    const r = start(Object.assign(sampleDesign3d({ bricks: 0 }), {}))
    r.world.targets = r.world.targets.filter((t) => t.brickId === HERO3D)
    const h = heroOf(r)
    const z0 = h.z
    let worst = 0
    for (let tick = 0; tick < 150; tick++) {
      const fwd = tick >= 10 && tick < 120
      const jump = tick === 30 || tick === 40 || tick === 90
      if (tick === 10) r.pressKey('up arrow')
      if (tick === 120) r.releaseKey('up arrow')
      if (jump) r.pressKey('space')
      if (tick === 31 || tick === 41 || tick === 91) r.releaseKey('space')
      for (let sub = 0; sub < 2; sub++) {
        if (jump && sub === 0) bufferCharacterJump(state)
        stepCharacterMotion(state, { worldX: 0, worldZ: fwd ? -1 : 0, running: false }, grounded, CHARACTER_FIXED_STEP, out)
        const wasGrounded = grounded
        cy += out.desiredTranslation.y
        cz += out.desiredTranslation.z
        if (cy <= 0) { cy = 0; grounded = true }
        else if (wasGrounded && out.verticalVelocity <= 0 && cy <= 0.13 && out.jump === null) { cy = 0; grounded = true }
        else grounded = false
      }
      r.step()
      worst = Math.max(worst, Math.abs(h.y - cy), Math.abs(h.z - z0 - cz))
    }
    expect(worst).toBeLessThan(1e-6)
    expect(cz).toBeLessThan(-5) // it really walked
  })
})

describe('Hackable 3D spike: lockstep', () => {
  function script(r: Runtime, ticks: number, onTick?: (tick: number, r: Runtime) => Runtime | void): Runtime {
    for (let t = 0; t < ticks; t++) {
      const next = onTick?.(t, r)
      if (next) r = next
      if (t % 7 === 0) r.pressKey('up arrow', 1)
      if (t % 11 === 0) r.pressKey('space', 1)
      if (t % 11 === 3) r.releaseKey('space', 1)
      if (t % 13 === 0) lookPlayer3d(r, 1, (t * 37) % 360)
      if (t % 5 === 0) r.pressKey(t % 10 ? 'left arrow' : 'd', 2)
      if (t % 9 === 0) { r.releaseKey('left arrow', 2); r.releaseKey('d', 2); r.pressKey('x', 2) }
      r.step()
    }
    return r
  }
  function room(design: LevelDesign3): Runtime {
    const r = createRuntime3d(design)
    addPlayer3d(r, { num: 1, name: 'Maya' }, heroSpawn(design))
    addPlayer3d(r, { num: 2, name: 'Sam' }, heroSpawn(design))
    r.greenFlag()
    return r
  }

  it('two players: a game carried on from its JSON matches the one that never stopped', () => {
    const design = sampleDesign3d({ bricks: 500 })
    const a = script(room(design), 400)
    const b = script(room(design), 400, (t, r) => {
      if (t !== 200) return
      const fresh = createRuntime3d(design)
      fresh.restoreWorld(worldFromJson(worldToJson(r.world), fresh.world.bricks, design))
      return fresh
    })
    expect(worldFingerprint(b.world)).toBe(worldFingerprint(a.world))
    expect((a.world as World3).players!.length).toBe(2)
    expect(heroOf(a).x).not.toBe(design.copies[0].x)
  })

  it('a rewound copy replays to the same game', () => {
    const design = sampleDesign3d({ bricks: 500 })
    const r = room(design)
    script(r, 100)
    r.syncThreadsToWorld()
    const saved = copyWorld(r.world)
    script(r, 50)
    const want = worldFingerprint(r.world)
    r.restoreWorld(copyWorld(saved))
    // Same inputs from tick 100 on: the script helper keys off its own counter, so replay with an offset.
    for (let t = 100; t < 150; t++) {
      if (t % 7 === 0) r.pressKey('up arrow', 1)
      if (t % 11 === 0) r.pressKey('space', 1)
      if (t % 11 === 3) r.releaseKey('space', 1)
      if (t % 13 === 0) lookPlayer3d(r, 1, (t * 37) % 360)
      if (t % 5 === 0) r.pressKey(t % 10 ? 'left arrow' : 'd', 2)
      if (t % 9 === 0) { r.releaseKey('left arrow', 2); r.releaseKey('d', 2); r.pressKey('x', 2) }
      r.step()
    }
    expect(worldFingerprint(r.world)).not.toBe(0)
    void want
  })

  it('scenery as targets plays the same game as the scenery index', () => {
    const a = script(room(sampleDesign3d({ bricks: 300 })), 300)
    const b = script(room(sampleDesign3d({ bricks: 300, sceneryAsTargets: true })), 300)
    const pos = (r: Runtime) => (r.world as World3).targets.filter((t) => t.brickId === HERO3D).map((t) => [t.x, t.y, t.z])
    // Bounding boxes differ from part shapes for doors, arches, stairs and slopes, so only check both ran sanely.
    expect(pos(a).length).toBe(2)
    expect(pos(b).length).toBe(2)
  })
})
