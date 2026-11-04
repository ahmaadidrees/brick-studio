/**
 * Hackable 3D: how the Hero feels against the classic 3D builder's character (docs/qa/hackable-3d/feel/FEEL.md).
 *
 * Both characters get the same input timeline on the same build:
 * - Classic: src/brick/characterController.ts driven by Rapier's KinematicCharacterController the way
 *   src/brick/BrickStudioScene.tsx ExplorerAvatar does it (capsule 0.18 + 0.18, controller offset 0.025, one 60 Hz
 *   fixed step per 1/60 s frame accumulated into one Rapier query, then world.step()), on colliders made by
 *   brickPhysicalShapes like BrickCollider/PhysicalCollider (cuboids, round cuboids, convex hulls) plus the build plate.
 *   Sampled at 60 Hz.
 * - Hackable: createRuntime(design) with the starter project's Hero and the same bricks as `scenery3d`, keys through
 *   runtime.pressKey, camera yaw 0. 30 ticks/s, each two 60 Hz substeps. Sampled at 30 Hz.
 * Keys: Up arrow walks (−z for both), Up + Right walks diagonally, Space jumps. Run is Shift on the classic and X on
 * the Hackable (physics3d.ts reads only `x`; Shift does nothing there).
 *
 * Tick k of the Hackable game is classic frames 2k and 2k + 1. The assertions are the things a kid would see the
 * same (climbs or not, blocked or not, lands on top or not, gap made or not, flat-ground positions within 1e-3); the
 * rest is recorded. `FEEL_JSON=1 npx vitest run src/platformer/lab/kit3d/feel3d.test.ts` writes the raw numbers to
 * docs/qa/hackable-3d/feel/feel.json; `FEEL_LOG=1` prints a summary.
 */
import RAPIER from '@dimforge/rapier3d-compat'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { brickPhysicalShapes, EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS, GRID_SIZE, STUD as CLASSIC_STUD } from '../../../../packages/brick-core/src/parts'
import type { BrickInstance } from '../../../../packages/brick-core/src/types'
import {
  CHARACTER_CONTROLLER_OFFSET,
  accumulateCharacterTranslation,
  applyKinematicCharacterStep,
  bufferCharacterJump,
  configureKinematicCharacterController,
  consumeCharacterFixedSteps,
  createCharacterMotionState,
  createCharacterStepResult,
  createFixedStepClock,
  resetCharacterFrameTranslation,
  stepCharacterMotion,
} from '../../../brick/characterController'
import { cameraRelativeMove, combineMoveAxes, readKeyboardMove } from '../../../brick/characterInput'
import { EXPLORE_SPAWN_FLOOR_GAP } from '../../../brick/scenePhysics'
import { createRuntime, type Runtime } from '../core'
import { createStarter3dProject } from '../studio/three/project3d'
import { PLATE, STUD, type LevelDesign3, type SceneryBrick, type Target3, type World3 } from './contracts3d'
import { HERO3D, lookPlayer3d } from './engine3d'

// tsconfig.app.json keeps @types/node out (src/platformer/lab/feel/node-shim.d.ts declares only cwd).
declare const process: { cwd(): string; env: Record<string, string | undefined> }

// ------------------------------------------------------------------------------------------------ the input timeline

/** What the kid holds during one 30 Hz tick. `jump` is the space key being down (a jump starts on its down edge). */
interface Held { fwd?: boolean; right?: boolean; run?: boolean; jump?: boolean }
type Timeline = (tick: number) => Held

interface Sample { t: number; x: number; y: number; z: number; g: boolean }

/** Ticks before any key: both characters spawn a little apart from where they stand and settle. */
const SETTLE = 10
const FRAME = 1 / 60
const TICK = 1 / 30
/** Capsule centre above its bottom. */
const CAPSULE_FOOT = EXPLORER_CAPSULE_HALF_HEIGHT + EXPLORER_CAPSULE_RADIUS
/** The classic's colliders are inset: a part is this much lower than its plate multiple (PART_HEIGHT_INSET). */
const CLASSIC_HEIGHT_INSET = 0.015

const world = (stud: number) => (stud - GRID_SIZE / 2) * STUD

// ------------------------------------------------------------------------------------------------ the classic character

/** Where the classic capsule's bottom rests above flat ground (the controller offset, as Rapier settles it). */
let classicRestGap = 0

function classicWorld(scenery: SceneryBrick[]) {
  const w = new RAPIER.World({ x: 0, y: -9.81, z: 0 })
  w.timestep = FRAME
  // ExploreScene: the build plate.
  const gridWorldSize = GRID_SIZE * CLASSIC_STUD
  const plate = w.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  w.createCollider(RAPIER.ColliderDesc.cuboid(gridWorldSize / 2, 0.09, gridWorldSize / 2).setTranslation(0, -0.09, 0), plate)
  // BrickCollider + PhysicalCollider, friction 0.5.
  scenery.forEach((brick, i) => {
    const body = w.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const instance: BrickInstance = { id: `b${i}`, ...brick }
    for (const shape of brickPhysicalShapes(instance, GRID_SIZE)) {
      let desc: RAPIER.ColliderDesc | null
      if (shape.shape === 'convexHull') desc = RAPIER.ColliderDesc.convexHull(new Float32Array(shape.vertices.flat()))
      else if (shape.shape === 'roundCuboid') {
        const r = shape.borderRadius
        desc = RAPIER.ColliderDesc.roundCuboid(shape.halfExtents[0] - r, shape.halfExtents[1] - r, shape.halfExtents[2] - r, r)
          .setTranslation(...shape.center)
      } else desc = RAPIER.ColliderDesc.cuboid(...shape.halfExtents).setTranslation(...shape.center)
      if (!desc) throw new Error(`no collider for ${brick.partId}`)
      w.createCollider(desc.setFriction(0.5), body)
    }
  })
  return w
}

/**
 * ExplorerAvatar's loop at a steady 60 frames a second. `start.y` is the standing surface in the Hackable's units;
 * the capsule spawns EXPLORE_SPAWN_FLOOR_GAP above it (plus the inset) and settles like a fresh spawn.
 */
function runClassic(scenery: SceneryBrick[], start: { x: number; y: number; z: number }, ticks: number, input: Timeline): Sample[] {
  const w = classicWorld(scenery)
  const body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y + CAPSULE_FOOT + EXPLORE_SPAWN_FLOOR_GAP, start.z))
  const collider = w.createCollider(RAPIER.ColliderDesc.capsule(EXPLORER_CAPSULE_HALF_HEIGHT, EXPLORER_CAPSULE_RADIUS).setFriction(0.2), body)
  w.step()
  const controller = configureKinematicCharacterController(w.createCharacterController(CHARACTER_CONTROLLER_OFFSET))
  const character = createCharacterMotionState(false)
  const stepResult = createCharacterStepResult()
  const clock = createFixedStepClock()
  const frameTranslation = { x: 0, y: 0, z: 0 }
  const nextPosition = { x: 0, y: 0, z: 0 }
  const keyboard = { x: 0, z: 0 }
  const combined = { x: 0, z: 0 }
  const worldMove = { x: 0, z: 0 }
  const motionInput = { worldX: 0, worldZ: 0, running: false }
  let observedGrounded = false
  let jumpWasDown = false
  const samples: Sample[] = []
  const advance = (delta: number) => {
    const result = stepCharacterMotion(character, motionInput, observedGrounded, delta, stepResult)
    accumulateCharacterTranslation(frameTranslation, result)
  }
  for (let tick = 0; tick < ticks; tick++) {
    const held = input(tick)
    const keys = new Set<string>()
    if (held.fwd) keys.add('arrowup')
    if (held.right) keys.add('arrowright')
    if (held.run) keys.add('shift')
    for (let sub = 0; sub < 2; sub++) {
      // keydown (!repeat) on Space buffers the jump before the next frame.
      if (sub === 0 && held.jump && !jumpWasDown) bufferCharacterJump(character)
      readKeyboardMove(keys, keyboard)
      combineMoveAxes(keyboard, { x: 0, z: 0 }, combined)
      // Camera yaw π: forward is world −z, screen right is +x (the Hackable's yaw 0).
      cameraRelativeMove(combined.x, combined.z, Math.PI, worldMove)
      motionInput.worldX = worldMove.x
      motionInput.worldZ = worldMove.z
      motionInput.running = keys.has('shift')
      resetCharacterFrameTranslation(frameTranslation)
      const steps = consumeCharacterFixedSteps(clock, FRAME, advance)
      if (steps > 0) observedGrounded = applyKinematicCharacterStep(controller, collider, body, frameTranslation, nextPosition)
      w.step()
      const p = body.translation()
      samples.push({ t: (tick * 2 + sub + 1) * FRAME, x: p.x, y: p.y - CAPSULE_FOOT - classicRestGap, z: p.z, g: observedGrounded })
    }
    jumpWasDown = !!held.jump
  }
  w.free()
  return samples
}

// ------------------------------------------------------------------------------------------------ the Hackable Hero

function runHackable(scenery: SceneryBrick[], start: { x: number; y: number; z: number }, ticks: number, input: Timeline): Sample[] {
  const design = createStarter3dProject().design as LevelDesign3
  design.copies = [{ id: 'copy_hero', brickId: HERO3D, x: start.x, y: start.y, z: start.z }]
  design.scenery3d = scenery
  const r: Runtime = createRuntime(design)
  r.greenFlag()
  lookPlayer3d(r, undefined, 0)
  const hero = (r.world as World3).targets.find((t) => t.brickId === HERO3D) as Target3
  const down = new Set<string>()
  const set = (key: string, on: boolean | undefined) => {
    if (on && !down.has(key)) { r.pressKey(key); down.add(key) }
    if (!on && down.has(key)) { r.releaseKey(key); down.delete(key) }
  }
  const samples: Sample[] = []
  for (let tick = 0; tick < ticks; tick++) {
    const held = input(tick)
    set('up arrow', held.fwd)
    set('right arrow', held.right)
    set('x', held.run)
    set('space', held.jump)
    r.step()
    samples.push({ t: (tick + 1) * TICK, x: hero.x, y: hero.y, z: hero.z, g: hero.body3!.onGround })
  }
  return samples
}

// ------------------------------------------------------------------------------------------------ measuring

interface Airborne { from: number; to: number | null; seconds: number | null; landX: number | null; landY: number | null; landZ: number | null }

const r4 = (n: number | null) => (n === null ? null : Math.round(n * 1e4) / 1e4)

/** Every spell off the ground after the keys start: when it began and ended, and where it landed. */
function airborne(s: Sample[], after = SETTLE * TICK): Airborne[] {
  const out: Airborne[] = []
  let open: Airborne | null = null
  let prev = s[0]
  for (const p of s) {
    if (p.t <= after) { prev = p; continue }
    if (!p.g && !open) { open = { from: prev.t, to: null, seconds: null, landX: null, landY: null, landZ: null }; out.push(open) }
    if (p.g && open) { open.to = p.t; open.seconds = p.t - open.from; open.landX = p.x; open.landY = p.y; open.landZ = p.z; open = null }
    prev = p
  }
  return out.map((a) => ({ ...a, from: r4(a.from)!, to: r4(a.to), seconds: r4(a.seconds), landX: r4(a.landX), landY: r4(a.landY), landZ: r4(a.landZ) }))
}

/** Samples at 30 Hz (a classic trace keeps every other frame, the ends of the Hackable's ticks). */
const at30 = (s: Sample[], classic: boolean) => (classic ? s.filter((_, i) => i % 2 === 1) : s)

/** Largest rise and drop of the feet in any 1/30 s, and the largest per-sample vertical speed. */
function vertical(s: Sample[], classic: boolean) {
  const s30 = at30(s, classic)
  let rise = 0, drop = 0, vy = 0
  for (let i = 1; i < s30.length; i++) {
    const d = s30[i].y - s30[i - 1].y
    rise = Math.max(rise, d)
    drop = Math.min(drop, d)
  }
  for (let i = 1; i < s.length; i++) vy = Math.max(vy, Math.abs(s[i].y - s[i - 1].y) / (s[i].t - s[i - 1].t))
  return { maxRisePer30Hz: r4(rise), maxDropPer30Hz: r4(drop), maxAbsVy: r4(vy) }
}

/** Horizontal speed over each 1/30 s (units/s) along the walk. */
function speeds(s: Sample[], classic: boolean): number[] {
  const s30 = at30(s, classic)
  const out: number[] = []
  for (let i = 1; i < s30.length; i++) out.push(Math.hypot(s30[i].x - s30[i - 1].x, s30[i].z - s30[i - 1].z) / TICK)
  return out
}

const firstTime = (s: Sample[], test: (p: Sample) => boolean): number | null => {
  const p = s.find((q) => q.t > SETTLE * TICK && test(q))
  return p ? r4(p.t - SETTLE * TICK) : null
}

const end = (s: Sample[]) => s[s.length - 1]
const pos = (p: Sample) => ({ x: r4(p.x)!, y: r4(p.y)!, z: r4(p.z)!, grounded: p.g })
const maxY = (s: Sample[]) => r4(Math.max(...s.filter((p) => p.t > SETTLE * TICK).map((p) => p.y)))
/** A downsampled trace for feel.json: t, x, y, z, grounded at 30 Hz, 4 decimals. */
const trace = (s: Sample[], classic: boolean) => at30(s, classic).map((p) => [r4(p.t), r4(p.x), r4(p.y), r4(p.z), p.g ? 1 : 0])

interface Pair { classic: Sample[]; hackable: Sample[] }

function both(scenery: SceneryBrick[], start: { x: number; y: number; z: number }, ticks: number, input: Timeline): Pair {
  return { classic: runClassic(scenery, start, ticks, input), hackable: runHackable(scenery, start, ticks, input) }
}

/** The first tick after which a Hackable Hero walking (or running) on flat ground has its centre at z ≤ zLine. */
function tickReaching(startZ: number, run: boolean, zLine: number): number {
  const s = runHackable([], { x: 0, y: 0, z: startZ }, 200, (t) => ({ fwd: t >= SETTLE, run: run && t >= SETTLE }))
  const i = s.findIndex((p) => p.z <= zLine)
  if (i < 0) throw new Error('never reached the line')
  return i + 1
}

// ------------------------------------------------------------------------------------------------ the builds

const brick = (partId: string, x: number, z: number, y = 0, rotation: 0 | 1 | 2 | 3 = 0): SceneryBrick => ({ partId, x, z, y, rotation, color: '#a9b7bd' })

const results: Record<string, unknown> = {}
const record = (name: string, value: unknown) => { results[name] = value }
const walkFrom = (from: number, until = Infinity, extra: Held = {}): Timeline => (t) => (t >= from && t < until ? { fwd: true, ...extra } : {})

beforeAll(async () => {
  await RAPIER.init()
  // The capsule's resting gap over flat ground, so classic heights read from the surface like the Hackable's.
  const rest = runClassic([], { x: 0, y: 0, z: 0 }, SETTLE, () => ({}))
  classicRestGap = end(rest).y
})

afterAll(() => {
  results.meta = {
    classicRestGap: r4(classicRestGap),
    note: 'Classic y is the capsule bottom minus its resting gap over flat ground (the controller offset). Classic parts are 0.015 lower than their plate multiple and 0.035 narrower (collider inset); Hackable parts are exact multiples. Classic sampled at 60 Hz (traces keep every other frame), Hackable at 30 Hz. Air times and landing spots are compared at 30 Hz on both (the classic 60 Hz spells are kept as airborne60Hz). Times are seconds since the keys started (tick 10). Trace rows: [t, x, y, z, grounded].',
  }
  if (process.env.FEEL_LOG) console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k, v]) => [k, stripTraces(v)])), null, 1))
  if (process.env.FEEL_JSON) {
    const file = resolve(process.cwd(), 'docs/qa/hackable-3d/feel/feel.json')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(results, (_, v) => v, 1).replace(/\[\n\s+([^[\]{}]*?)\n\s+\]/g, (_, inner: string) => `[${inner.replace(/\n\s+/g, ' ')}]`)}\n`)
  }
})

function stripTraces(v: unknown): unknown {
  if (Array.isArray(v)) return v
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'trace').map(([k, w]) => [k, stripTraces(w)]))
  return v
}

// ------------------------------------------------------------------------------------------------ the scenarios

describe('Hackable 3D Hero vs the classic character (Rapier)', () => {
  it('1. flat walk and three jumps: walk and jump arcs within 1e-3 of the classic; the whole run within 3 cm', () => {
    // The parity timeline from physics3d.test.ts: walk from tick 10 to 120, Space on ticks 30, 40 (an air jump), 90.
    const jumps = [30, 40, 90]
    const input: Timeline = (t) => ({ fwd: t >= 10 && t < 120, jump: jumps.includes(t) })
    const { classic, hackable } = both([], { x: 0, y: 0, z: 0 }, 150, input)
    // Tick k of the Hackable game ends where classic frame 2k + 1 ends.
    const pairs = hackable.map((h, k) => ({ k, h, c: classic[2 * k + 1] }))
    const firstLanding = pairs.findIndex(({ k, h }) => k > jumps[0] && h.g)
    // Horizontal, from the first key to the first landing (walking, a jump and an air jump).
    const walkWorst = Math.max(...pairs.slice(0, firstLanding).map(({ c, h }) => Math.max(Math.abs(c.x - h.x), Math.abs(c.z - h.z))))
    // Each jump arc measured from its take-off height (the classic stands a few millimetres into its controller offset).
    let arcWorst = 0
    for (const [from, to] of [[jumps[0], firstLanding], [jumps[2], pairs.findIndex(({ k, h }) => k > jumps[2] && h.g)]]) {
      const c0 = pairs[from - 1].c.y
      for (const { c, h } of pairs.slice(from, to)) if (!c.g) arcWorst = Math.max(arcWorst, Math.abs(c.y - c0 - h.y))
    }
    let worstY = 0, worstZ = 0
    for (const { c, h } of pairs) {
      worstY = Math.max(worstY, Math.abs(c.y - h.y))
      worstZ = Math.max(worstZ, Math.abs(c.z - h.z))
    }
    // The classic's small hops on flat ground after a landing (Rapier's skin: up to ~1.4 cm, each costing ~3 mm of walk).
    const blips = classic.filter((p, i) => i > 0 && p.t > (jumps[0] + 1) * TICK && p.g && p.y - classic[i - 1].y > 0.005).length
    // The frame each first says it has landed (classic 60 Hz; the Hackable at the end of its tick).
    const classicLand = classic.findIndex((p) => p.t > (jumps[2] + 1) * TICK && p.g)
    const hackLand = hackable.findIndex((p, k) => k > jumps[2] && p.g)
    const s = {
      walkAndAirJumpWorstHorizontal: walkWorst,
      jumpArcWorstFromTakeoff: arcWorst,
      wholeRunWorstDy: worstY,
      wholeRunWorstDz: worstZ,
      classicFlatGroundHops: blips,
      thirdJumpLanding: {
        classicSaysLandedAt: r4(classic[classicLand].t), classicFeetThen: r4(classic[classicLand].y),
        hackableSaysLandedAt: r4(hackable[hackLand].t), hackableFeetOneTickBefore: r4(hackable[hackLand - 1].y),
      },
      jumpHeight: { classic: r4(Math.max(...classic.slice(2 * jumps[2], 2 * jumps[2] + 40).map((p) => p.y)) - pairs[jumps[2] - 1].c.y), hackable: r4(Math.max(...hackable.slice(jumps[2], jumps[2] + 20).map((p) => p.y))) },
      classic: { end: pos(end(classic)), maxY: maxY(classic), airborne: airborne(classic), trace: trace(classic, true) },
      hackable: { end: pos(end(hackable)), maxY: maxY(hackable), airborne: airborne(hackable), trace: trace(hackable, false) },
    }
    record('1_flat_walk_three_jumps', s)
    expect(firstLanding).toBeGreaterThan(jumps[1])
    expect(walkWorst).toBeLessThan(1e-3)
    expect(arcWorst).toBeLessThan(1e-3)
    expect(worstZ).toBeLessThan(0.03)
    expect(worstY).toBeLessThan(0.03)
    expect(end(classic).z).toBeLessThan(-5)
  })

  it('2. walks up a 1-plate ledge (plate_6x8): both climb it', () => {
    // A 6 × 8 plate across the path: its near edge at z = −2.48; the Hero walks −z from z = 0 for three seconds.
    const scenery = [brick('plate_6x8', 29, 20)]
    const input = walkFrom(SETTLE, SETTLE + 60)
    const ledge = both(scenery, { x: 0, y: 0, z: 0 }, SETTLE + 70, input)
    const flat = both([], { x: 0, y: 0, z: 0 }, SETTLE + 70, input)
    const line = -4
    const one = (s: Sample[], f: Sample[], classic: boolean, top: number) => {
      const sp = speeds(s, classic)
      const steady = speeds(f, classic)
      // The climb happens near the ledge: speed between z = −1.6 and −3.2 (the face is at −2.48).
      const s30 = at30(s, classic)
      const window = sp.filter((_, i) => s30[i + 1].z < -1.6 && s30[i + 1].z > -3.2)
      const tLedge = firstTime(s, (p) => p.z <= line)!
      const tFlat = firstTime(f, (p) => p.z <= line)!
      return {
        climbed: Math.abs(end(s).y - top) < 0.03,
        end: pos(end(s)),
        timeToZMinus4: tLedge,
        timeToZMinus4Flat: tFlat,
        timeLost: r4(tLedge - tFlat),
        distanceBehindFlatAt2s: r4(s30[SETTLE + 60 - 1].z - at30(f, classic)[SETTLE + 60 - 1].z),
        minSpeedAtLedge: r4(Math.min(...window)),
        steadySpeed: r4(steady[SETTLE + 40]),
        speedLostPct: r4((1 - Math.min(...window) / steady[SETTLE + 40]) * 100),
        timeToTop: firstTime(s, (p) => p.y >= top - 0.02),
        airborne: airborne(s),
        ...vertical(s, classic),
        trace: trace(s, classic),
      }
    }
    const s = { classic: one(ledge.classic, flat.classic, true, PLATE - CLASSIC_HEIGHT_INSET), hackable: one(ledge.hackable, flat.hackable, false, PLATE) }
    record('2_step_up_plate', s)
    expect(s.classic.climbed).toBe(true)
    expect(s.hackable.climbed).toBe(true)
  })

  it('3. blocked by a brick (3 plates): both stop at its face', () => {
    // brick_2x6 turned across the path; its near face at z = −4.96.
    const scenery = [brick('brick_2x6', 29, 22, 0, 1)]
    const { classic, hackable } = both(scenery, { x: 0, y: 0, z: 0 }, SETTLE + 75, walkFrom(SETTLE))
    const face = world(24)
    const one = (s: Sample[], classic: boolean) => ({
      blocked: end(s).z > face && end(s).y < 0.05,
      end: pos(end(s)),
      gapToFace: r4(end(s).z - face),
      timeToStop: firstTime(s, (p) => p.z <= end(s).z + 1e-4),
      ...vertical(s, classic),
    })
    const s = { classic: one(classic, true), hackable: one(hackable, false), stopDifference: r4(end(classic).z - end(hackable).z) }
    record('3_blocked_by_brick', s)
    expect(s.classic.blocked).toBe(true)
    expect(s.hackable.blocked).toBe(true)
    expect(Math.abs(s.stopDifference!)).toBeLessThan(0.06)
  })

  it('4. walks off a 1-plate ledge and a 1-brick ledge: both end on the floor', () => {
    const cases = {
      plate: { scenery: [brick('plate_6x8', 29, 26)], top: 1, edge: world(26) },
      brick: { scenery: [brick('brick_4x4', 30, 28)], top: 3, edge: world(28) },
    }
    const out: Record<string, unknown> = {}
    for (const [name, c] of Object.entries(cases)) {
      const startZ = c.edge + 1.5
      const p = both(c.scenery, { x: 0, y: c.top * PLATE, z: startZ }, SETTLE + 45, walkFrom(SETTLE))
      const one = (s: Sample[], classic: boolean) => {
        const air = airborne(at30(s, classic))
        return {
          endsOnFloor: Math.abs(end(s).y) < 0.02,
          leftGround: air.length > 0,
          airborneSeconds: r4(air.reduce((a, b) => a + (b.seconds ?? 0), 0)),
          airborne: air,
          ...(classic ? { airborne60Hz: airborne(s) } : {}),
          // When the feet first reach the floor, and where.
          firstFloorTime: firstTime(s, (q) => q.y < 0.005),
          firstFloorZ: r4(s.find((q) => q.t > SETTLE * TICK && q.y < 0.005)?.z ?? null),
          zWhenFeetLeftTop: r4(s.find((q) => q.t > SETTLE * TICK && q.y < c.top * PLATE - CLASSIC_HEIGHT_INSET - 0.005)?.z ?? null),
          ...vertical(s, classic),
          trace: trace(s, classic),
        }
      }
      out[name] = { edgeZ: r4(c.edge), classic: one(p.classic, true), hackable: one(p.hackable, false) }
    }
    record('4_walk_off_ledges', out)
    for (const name of Object.keys(cases)) {
      const o = out[name] as { classic: { endsOnFloor: boolean }; hackable: { endsOnFloor: boolean } }
      expect(o.classic.endsOnFloor).toBe(true)
      expect(o.hackable.endsOnFloor).toBe(true)
    }
    const brickCase = out.brick as { classic: { leftGround: boolean }; hackable: { leftGround: boolean } }
    expect(brickCase.classic.leftGround).toBe(true)
    expect(brickCase.hackable.leftGround).toBe(true)
  })

  it('5. climbs a slope, a stair and two stacked slopes onto a deck: both reach the top', () => {
    // Everything faces the Hero walking −z from z = 1.24 (high ends towards −z), with a deck eight studs deep behind.
    const deck = (z: number, y = 0) => [brick('brick_4x4', 30, z, y), brick('brick_4x4', 30, z - 4, y)]
    const cases = {
      slope: { scenery: [brick('slope_2x2', 31, 28, 0, 2), ...deck(24)], top: 3, foot: world(30) },
      stair: { scenery: [brick('stair_2x3', 31, 27, 0, 2), ...deck(23)], top: 3, foot: world(30) },
      // slope (0 → 3 plates), a 2 × 2 brick under a second slope (3 → 6 plates), then a two-brick-high deck.
      stackedSlopes: {
        scenery: [brick('slope_2x2', 31, 28, 0, 2), brick('brick_2x2', 31, 26), brick('slope_2x2', 31, 26, 3, 2), ...deck(22), ...deck(22, 3)],
        top: 6,
        foot: world(30),
      },
    }
    const out: Record<string, unknown> = {}
    for (const [name, c] of Object.entries(cases)) {
      const p = both(c.scenery, { x: 0, y: 0, z: world(34) }, SETTLE + 60, walkFrom(SETTLE))
      const one = (s: Sample[], classic: boolean) => {
        const top = c.top * PLATE - (classic ? CLASSIC_HEIGHT_INSET : 0)
        const s30 = at30(s, classic)
        const t0 = firstTime(s, (q) => q.z <= c.foot)
        const tTop = firstTime(s, (q) => q.y >= top - 0.02)
        const onTheWayUp = (q: Sample) => t0 !== null && tTop !== null && q.t - SETTLE * TICK >= t0 && q.t - SETTLE * TICK <= tTop
        // Speed (30 Hz) while climbing; samples off the ground; 1/30 s windows rising a plate-ish (≥ 0.1) in one go.
        const sp = speeds(s, classic)
        const climbing = sp.filter((_, i) => onTheWayUp(s30[i + 1]))
        const rises = s30.slice(1).map((q, i) => q.y - s30[i].y)
        return {
          reachedTop: Math.abs(end(s).y - top) < 0.03 && end(s).g,
          end: pos(end(s)),
          timeAtFoot: t0,
          timeToTop: tTop,
          climbSeconds: t0 !== null && tTop !== null ? r4(tTop - t0) : null,
          minClimbSpeed: climbing.length ? r4(Math.min(...climbing)) : null,
          meanClimbSpeed: climbing.length ? r4(climbing.reduce((a, b) => a + b, 0) / climbing.length) : null,
          ungroundedSamplesOnTheWayUp: s.filter((q) => onTheWayUp(q) && !q.g).length,
          popsOf0_1OrMorePer30Hz: rises.filter((d) => d >= 0.1).length,
          ...vertical(s, classic),
          // Height against z at 30 Hz from the foot of the climb to just past the top.
          heightProfile: s30.filter((q) => q.z < c.foot + 0.4 && (tTop === null || q.t - SETTLE * TICK <= tTop + 0.1)).map((q) => [r4(q.z), r4(q.y)]),
        }
      }
      out[name] = { classic: one(p.classic, true), hackable: one(p.hackable, false) }
    }
    // And down again: from a brick-high deck (z 30..38) down a slope or a stair (high ends towards +z).
    const down = {
      downSlope: [brick('slope_2x2', 31, 28), ...deck(34)],
      downStair: [brick('stair_2x3', 31, 27), ...deck(34)],
    }
    for (const [name, scenery] of Object.entries(down)) {
      const p = both(scenery, { x: 0, y: 3 * PLATE, z: world(35) }, SETTLE + 65, walkFrom(SETTLE, SETTLE + 50))
      const one = (s: Sample[], classic: boolean) => {
        const air = airborne(at30(s, classic))
        const s30 = at30(s, classic)
        return {
          reachedBottom: Math.abs(end(s).y) < 0.02 && end(s).g,
          end: pos(end(s)),
          timeToBottom: firstTime(s, (q) => q.y < 0.005),
          airborneSpells: air.length,
          airborneSeconds: r4(air.reduce((a, b) => a + (b.seconds ?? 0), 0)),
          ...vertical(s, classic),
          heightProfile: s30.filter((q) => q.t > SETTLE * TICK && q.z < world(31) && q.z > world(26)).map((q) => [r4(q.z), r4(q.y), q.g ? 1 : 0]),
        }
      }
      out[name] = { classic: one(p.classic, true), hackable: one(p.hackable, false) }
    }
    record('5_slopes_and_stairs', out)
    for (const name of Object.keys(cases)) {
      const o = out[name] as { classic: { reachedTop: boolean }; hackable: { reachedTop: boolean } }
      expect(o.classic.reachedTop, name).toBe(true)
      expect(o.hackable.reachedTop, name).toBe(true)
    }
    for (const name of Object.keys(down)) {
      const o = out[name] as { classic: { reachedBottom: boolean }; hackable: { reachedBottom: boolean } }
      expect(o.classic.reachedBottom, name).toBe(true)
      expect(o.hackable.reachedBottom, name).toBe(true)
    }
  })

  it('6. jumps onto a brick and across gaps: the same outcome on both', () => {
    const out: Record<string, unknown> = {}
    // A brick-high deck (two brick_4x4s) with its near face at z = −2.48.
    const deck = [brick('brick_4x4', 30, 24), brick('brick_4x4', 30, 20)]
    const face = world(28)
    const onto = (s: Sample[], classic: boolean) => {
      const top = 3 * PLATE - (classic ? CLASSIC_HEIGHT_INSET : 0)
      // Landing spot and air time compared at 30 Hz on both (the classic's 60 Hz spells kept beside them).
      const air = airborne(at30(s, classic))
      return {
        landedOnTop: Math.abs(end(s).y - top) < 0.03,
        end: pos(end(s)),
        maxY: maxY(s),
        airborne: air,
        ...(classic ? { airborne60Hz: airborne(s) } : {}),
        landZ: air[0]?.landZ ?? null,
        airSeconds: air[0]?.seconds ?? null,
        trace: trace(s, classic),
      }
    }
    {
      // Standing 0.12 from the face: Up and Space together.
      const p = both(deck, { x: 0, y: 0, z: face + 0.18 + 0.12 }, SETTLE + 40, (t) => ({ fwd: t >= SETTLE && t < SETTLE + 25, jump: t === SETTLE }))
      out.ontoBrickStanding = { classic: onto(p.classic, true), hackable: onto(p.hackable, false) }
    }
    for (const run of [false, true]) {
      // From two units back, walking or running, Space when the centre is 1.0 from the face.
      const startZ = face + 3
      const k = tickReaching(startZ, run, face + 1.0)
      const p = both(deck, { x: 0, y: 0, z: startZ }, k + 40, (t) => ({ fwd: t >= SETTLE && t < k + 25, run: run && t >= SETTLE && t < k + 25, jump: t === k }))
      out[run ? 'ontoBrickRunning' : 'ontoBrickWalking'] = { jumpTick: k, classic: onto(p.classic, true), hackable: onto(p.hackable, false) }
    }
    // Gaps between two brick-high decks of stacked plate_6x8s; Space when the centre is 0.1 short of deck A's edge.
    const edgeA = world(28)
    // 2 and 3 studs walking and running must match; the rest find where each one stops making it (recorded only):
    // the jump pressed 1–2 ticks earlier than the edge, and wider gaps running.
    const gapCases: { gap: number; run: boolean; early: number }[] = [
      ...[2, 3, 4].flatMap((gap) => [false, true].map((run) => ({ gap, run, early: 0 }))),
      { gap: 4, run: false, early: 1 }, { gap: 4, run: false, early: 2 },
      { gap: 5, run: true, early: 0 }, { gap: 6, run: true, early: 0 }, { gap: 5, run: true, early: 1 }, { gap: 5, run: true, early: 2 },
    ]
    for (const { gap, run, early } of gapCases) {
      {
        const zB = 28 - gap - 8
        const scenery = [0, 1, 2].flatMap((y) => [brick('plate_6x8', 29, 28, y), brick('plate_6x8', 29, zB, y)])
        const startZ = world(35)
        const k = tickReaching(startZ, run, edgeA + 0.1)
        const p = both(scenery, { x: 0, y: 3 * PLATE, z: startZ }, k + 40, (t) => ({ fwd: t >= SETTLE && t < k + 25, run: run && t >= SETTLE && t < k + 25, jump: t === k - early }))
        const faceB = world(28 - gap)
        const one = (s: Sample[], classic: boolean) => {
          const top = 3 * PLATE - (classic ? CLASSIC_HEIGHT_INSET : 0)
          const air = airborne(at30(s, classic))
          return {
            made: Math.abs(end(s).y - top) < 0.03 && end(s).z < faceB,
            end: pos(end(s)),
            landZ: air[0]?.landZ ?? null,
            landY: air[0]?.landY ?? null,
            landPastFaceB: air[0]?.landZ != null ? r4(faceB - air[0].landZ) : null,
            // Where the centre was when Space went down: how far short of deck A's edge.
            jumpedShortOfEdge: r4(at30(s, classic)[k - early - 1].z - edgeA),
            airSeconds: air[0]?.seconds ?? null,
            ...(classic ? { airborne60Hz: airborne(s) } : {}),
            maxY: maxY(s),
            trace: trace(s, classic),
          }
        }
        out[`gap${gap}${run ? 'Running' : 'Walking'}${early ? `Early${early}` : ''}`] = { jumpTick: k - early, faceB: r4(faceB), classic: one(p.classic, true), hackable: one(p.hackable, false) }
      }
    }
    record('6_jumps', out)
    const o = out as Record<string, { classic: { landedOnTop?: boolean; made?: boolean }; hackable: { landedOnTop?: boolean; made?: boolean } }>
    for (const name of ['ontoBrickStanding', 'ontoBrickWalking', 'ontoBrickRunning']) {
      expect(o[name].classic.landedOnTop).toBe(true)
      expect(o[name].hackable.landedOnTop).toBe(true)
    }
    for (const name of ['gap2Walking', 'gap2Running', 'gap3Walking', 'gap3Running']) {
      expect(o[name].hackable.made, name).toBe(o[name].classic.made)
      expect(o[name].classic.made, name).toBe(true)
    }
  })

  it('7. walks diagonally into a corner and slides along a wall: same stop, same slide', () => {
    const out: Record<string, unknown> = {}
    {
      // An inside corner: a wall across the path (near face z = −3.72) and one on the right (near face x = 1.24).
      const scenery = [brick('brick_2x6', 30, 24, 0, 1), brick('brick_2x6', 34, 26)]
      const p = both(scenery, { x: 0, y: 0, z: world(30) }, SETTLE + 75, (t) => (t >= SETTLE ? { fwd: true, right: true } : {}))
      const one = (s: Sample[]) => {
        const last = s.slice(-15)
        return {
          inCorner: Math.abs(end(s).x - (world(34) - 0.18)) < 0.06 && Math.abs(end(s).z - (world(26) + 0.18)) < 0.06,
          end: pos(end(s)),
          gapToRightWall: r4(world(34) - end(s).x),
          gapToFrontWall: r4(end(s).z - world(26)),
          jitterLastHalfSecond: r4(Math.max(...last.map((q) => Math.hypot(q.x - end(s).x, q.z - end(s).z)))),
          timeToStop: firstTime(s, (q) => Math.hypot(q.x - end(s).x, q.z - end(s).z) < 1e-4),
        }
      }
      out.corner = { classic: one(p.classic), hackable: one(p.hackable) }
    }
    {
      // A wall on the right (two brick_2x6 end to end, near face x = 1.24): up + right slides along it.
      const scenery = [brick('brick_2x6', 34, 26), brick('brick_2x6', 34, 20)]
      const p = both(scenery, { x: world(33), y: 0, z: 0 }, SETTLE + 45, (t) => (t >= SETTLE ? { fwd: true, right: true } : {}))
      const one = (s: Sample[], classic: boolean) => {
        const s30 = at30(s, classic)
        const a = s30[SETTLE + 20], b = s30[SETTLE + 44]
        return {
          end: pos(end(s)),
          gapToWall: r4(world(34) - end(s).x),
          slideSpeedAlongWall: r4((a.z - b.z) / ((b.t - a.t))),
          driftAwayFromWall: r4(Math.max(...s30.slice(SETTLE + 20).map((q) => q.x)) - Math.min(...s30.slice(SETTLE + 20).map((q) => q.x))),
          stayedGrounded: s.every((q) => q.t <= SETTLE * TICK || q.g),
        }
      }
      out.wallSlide = { expectedSlideSpeed: r4(3.5 / Math.SQRT2), classic: one(p.classic, true), hackable: one(p.hackable, false) }
    }
    record('7_corner_and_wall', out)
    const o = out as { corner: { classic: { inCorner: boolean }; hackable: { inCorner: boolean } }; wallSlide: { classic: { slideSpeedAlongWall: number }; hackable: { slideSpeedAlongWall: number } } }
    expect(o.corner.classic.inCorner).toBe(true)
    expect(o.corner.hackable.inCorner).toBe(true)
    expect(Math.abs(o.wallSlide.classic.slideSpeedAlongWall - o.wallSlide.hackable.slideSpeedAlongWall)).toBeLessThan(0.05 * 3.5 / Math.SQRT2)
  })
})
