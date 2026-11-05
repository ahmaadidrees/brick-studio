/**
 * Lockstep sync test for Hackable 3D (docs/qa/hackable-3d/SPIKE.md), the part that runs inside each JavaScript engine.
 * The 3D twin of harness.ts: one room timeline (joins, keys, camera turns, Play again, a code edit, a Build edit, a
 * leave) played on the spike's 3D kit, with the whole game fingerprinted every tick so run3d.mjs can compare Node,
 * Chrome and WebKit, plus the late-joiner path (JSON halfway, carried on in a fresh runtime) and the cost numbers.
 */
import type { Stmt, World } from '../../../src/platformer/lab/core/contracts'
import { copyWorld, worldFingerprint, worldFromJson, worldToJson } from '../../../src/platformer/lab/core/snapshot'
import type { Runtime } from '../../../src/platformer/lab/core/runtime'
import type { LevelDesign3, World3 } from '../../../src/platformer/lab/kit3d/contracts3d'
import { addPlayer3d, heroSpawn, HERO3D, lookPlayer3d, removePlayer3d } from '../../../src/platformer/lab/kit3d/engine3d'
import { createRuntime3d } from '../../../src/platformer/lab/kit3d/run3d'
import { sampleDesign3d } from '../../../src/platformer/lab/kit3d/sample3d'
import { STUD, type CopyPlacement3 } from '../../../src/platformer/lab/kit3d/contracts3d'
import { CODE_BRICKS_3D } from '../../../src/platformer/lab/studio/three/bricks3d'

/**
 * D1: the sample plus one of each of the six code bricks around the start, so the room also runs a Mover carrying
 * Heroes, a Spinner's turned bar sending them home, a Button raising its Door (carrying whoever stands on it) and a
 * Goal, alongside the spike's Bounce pad and Coins.
 */
export function d1Design(opts: { bricks: number; sceneryAsTargets?: boolean }): LevelDesign3 {
  const design = sampleDesign3d(opts)
  const at: Record<string, [number, number, number]> = {
    brick3d_pad: [-3, 0, 6], brick3d_mover: [0, 0, 2], brick3d_spinner: [-5, 0, 2], brick3d_coin: [0, 0.5, 2.5],
    brick3d_goal: [-3, 0, -4], brick3d_button: [3, 0, -3], brick3d_door: [3, 0, -5.5],
  }
  const copies: CopyPlacement3[] = []
  for (const entry of CODE_BRICKS_3D) for (const part of entry.parts) {
    const made = part.make(part.id)
    design.bricks.push(made.brick)
    const [x, y, z] = at[part.id]
    copies.push({ id: `d1_${part.id}`, brickId: part.id, x: x * STUD, y: y * STUD, z: z * STUD })
  }
  design.copies.push(...copies)
  design.stage.program.variables.push({ id: 'coins', name: 'coins', value: 0 })
  return design
}

export type Event3 =
  | { tick: number; kind: 'down' | 'up'; key: string; player: number }
  | { tick: number; kind: 'look'; yaw: number; player: number }
  | { tick: number; kind: 'join'; player: number; name: string }
  | { tick: number; kind: 'leave'; player: number }
  | { tick: number; kind: 'flag' }
  /** The Bounce pad's launch 15 → 20 studs a second (a Hacker's code edit, live). */
  | { tick: number; kind: 'edit-program' }
  /** A Builder drops a 2 × 4 brick in front of the start (the build replaced, live). */
  | { tick: number; kind: 'edit-level' }

export interface Options3 {
  bricks: number
  sceneryAsTargets?: boolean
  ticks: number
  events: Event3[]
  rejoinAt?: number
  dumpAt?: number[]
}

// ------------------------------------------------------------------------------------------------ fingerprint text

function stable(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value instanceof Set) return stable([...value].map(String).sort())
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`
  }
  return JSON.stringify(String(value))
}

/** Every field of the world as exact text (numbers to the bit), except the project (bricks, design) and script blocks. */
export function worldText(world: World): string {
  const { bricks: _b, design: _d, tiles: _t, threads, ...rest } = world
  return stable({
    ...rest,
    threads: (threads ?? []).map((th) => ({ id: th.id, targetId: th.targetId, scriptId: th.scriptId, status: th.status, done: th.done, stack: th.stack.map((f) => ({ pc: f.pc, n: f.statements.length, proccode: f.proccode, params: f.params, loop: f.loopType, left: f.loopTimesRemaining, mem: f.stmtMemory })) })),
  })
}

export function hash(text: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193)
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 15)
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0')
}

// ------------------------------------------------------------------------------------------------ edits

function editProgram(world: World, design: LevelDesign3): string | null {
  const pad = world.bricks.brick_pad3d
  const find = (stmts: Stmt[]): Stmt | undefined => stmts.find((s) => s.opcode === 'kit3d_launchlanders')
  const script = pad?.program.scripts.find((s) => find(s.body))
  if (!pad || !script) return null
  const program = structuredClone(pad.program)
  find(program.scripts.find((s) => s.id === script.id)!.body)!.inputs.SPEED = { kind: 'lit', value: 20 }
  const edited = { ...pad, program }
  world.bricks = { ...world.bricks, brick_pad3d: edited }
  design.bricks = design.bricks.map((b) => (b.id === 'brick_pad3d' ? { ...b, program: structuredClone(program) } : b))
  return 'Bounce pad: launch 15 → 20'
}

function editLevel(world: World, design: LevelDesign3): string {
  design.scenery3d = [...design.scenery3d, { partId: 'brick_2x4', x: 30, z: 26, y: 0, rotation: 1, color: '#ef8d32' }]
  world.design = design
  return `Build: a 2 × 4 brick dropped (${design.scenery3d.length} bricks)`
}

// ------------------------------------------------------------------------------------------------ run

/** Play again in a room: a fresh game from the project as edited, the same players in order, keys and cameras kept. */
function playAgain(old: Runtime, design: LevelDesign3): Runtime {
  const runtime = createRuntime3d(design)
  const players = (old.world as World3).players ?? []
  for (const p of players) addPlayer3d(runtime, p, heroSpawn(design))
  runtime.greenFlag()
  for (const p of players) for (const key of p.keys) runtime.pressKey(key, p.num)
  return runtime
}

export interface Result3 {
  engine: string
  hashes: string[]
  fingerprints: number[]
  dumps: Record<number, string>
  applied: string[]
  stepMs: number
  snapshotBytes?: number
  final: { coins: unknown; bounces: unknown; landings: unknown; heroes: { player?: number; x: number; y: number; z: number }[]; d1?: Record<string, unknown> }
  /** D1's code bricks over the run: ticks a Hero stood on the Mover, times a Hero was sent home, the Door opened. */
  d1: { riderTicks: number; sentHome: number; doorOpened: boolean; coinCollected: boolean }
  /** Across the whole run (restarts reset the game's own counts): bounces, coins and landings the code counted. */
  totals: { bounces: number; coins: number; landings: number }
}

export function runScenario3d(engine: string, opts: Options3): Result3 {
  // Each run edits its own copy of the project, as each browser would.
  let design = d1Design({ bricks: opts.bricks, sceneryAsTargets: opts.sceneryAsTargets })
  let runtime = createRuntime3d(design)
  runtime.greenFlag()
  const byTick = new Map<number, Event3[]>()
  for (const e of opts.events) byTick.set(e.tick, [...(byTick.get(e.tick) ?? []), e])
  const result: Result3 = { engine, hashes: [], fingerprints: [], dumps: {}, applied: [], stepMs: 0, final: { coins: 0, bounces: 0, landings: 0, heroes: [] }, totals: { bounces: 0, coins: 0, landings: 0 }, d1: { riderTicks: 0, sentHome: 0, doorOpened: false, coinCollected: false } }
  const counts = () => ({ bounces: Number(runtime.world.stage.variables.g_bounces), coins: Number(runtime.world.stage.variables.g_coins), landings: Number(runtime.world.stage.variables.g_landings) })
  const dumpAt = new Set(opts.dumpAt ?? [])
  const clock = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now()
  for (let tick = 0; tick < opts.ticks; tick++) {
    if (opts.rejoinAt === tick) {
      const text = worldToJson(runtime.world)
      result.snapshotBytes = text.length
      // A late joiner has the project as edited so far (the room sends it), then the keyframe.
      design = structuredClone(design)
      const fresh = createRuntime3d(design)
      fresh.restoreWorld(worldFromJson(text, fresh.world.bricks, design))
      runtime = fresh
    }
    for (const e of byTick.get(tick) ?? []) {
      if (e.kind === 'down') runtime.pressKey(e.key, e.player)
      else if (e.kind === 'up') runtime.releaseKey(e.key, e.player)
      else if (e.kind === 'look') lookPlayer3d(runtime, e.player, e.yaw)
      else if (e.kind === 'join') addPlayer3d(runtime, { num: e.player, name: e.name }, heroSpawn(design))
      else if (e.kind === 'leave') removePlayer3d(runtime, e.player)
      else if (e.kind === 'flag') runtime = playAgain(runtime, design)
      else if (e.kind === 'edit-program') { const did = editProgram(runtime.world, design); if (did) result.applied.push(`tick ${tick}: ${did}`) }
      else if (e.kind === 'edit-level') result.applied.push(`tick ${tick}: ${editLevel(runtime.world, design)}`)
    }
    const before = counts()
    const heroesBefore = new Map((runtime.world as World3).targets.filter((t) => t.body3?.character).map((t) => [t.id, [t.x, t.z]]))
    const t0 = clock()
    runtime.step()
    result.stepMs += clock() - t0
    const after = counts()
    {
      const w = runtime.world as World3
      for (const b of w.bumps3d ?? []) if (b.otherId === 'd1_brick3d_mover' && b.side === 'top') result.d1.riderTicks++
      const spawn = heroSpawn(design)
      for (const t of w.targets) {
        const was = heroesBefore.get(t.id)
        if (was && Math.hypot(t.x - was[0], t.z - was[1]) > 1 && Math.abs(t.z - spawn.z) < 1e-9) result.d1.sentHome++
      }
      if ((w.targets.find((t) => t.copyId === 'd1_brick3d_door')?.y ?? 0) > 0.5) result.d1.doorOpened = true
      if (w.targets.some((t) => t.copyId === 'd1_brick3d_coin' && !t.visible)) result.d1.coinCollected = true
    }
    for (const k of ['bounces', 'coins', 'landings'] as const) result.totals[k] += Math.max(0, after[k] - before[k])
    const text = worldText(runtime.world)
    result.hashes.push(hash(text))
    result.fingerprints.push(worldFingerprint(runtime.world))
    if (dumpAt.has(tick)) result.dumps[tick] = text
  }
  const world = runtime.world as World3
  const v = (id: string) => world.stage.variables[id]
  result.final = {
    coins: v('g_coins'), bounces: v('g_bounces'), landings: v('g_landings'),
    heroes: world.targets.filter((t) => t.brickId === HERO3D).map((t) => ({ player: t.player, x: t.x, y: t.y, z: t.z })),
    d1: Object.fromEntries(world.targets.filter((t) => t.copyId?.startsWith('d1_')).map((t) => [t.copyId!, { x: t.x, y: t.y, z: t.z, direction: t.direction, visible: t.visible }])),
  }
  return result
}

// ------------------------------------------------------------------------------------------------ the timeline

/** A kid's keys and camera for a stretch of ticks, from a seed: mostly forward, some turning, jumps, runs. */
function kidInput3d(seed: number, player: number, from: number, to: number): Event3[] {
  let s = seed >>> 0
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32 }
  const events: Event3[] = []
  const held = new Set<string>()
  const set = (tick: number, key: string, down: boolean) => {
    if (down === held.has(key)) return
    if (down) held.add(key); else held.delete(key)
    events.push({ tick, kind: down ? 'down' : 'up', key, player })
  }
  // Every kid first walks straight ahead (onto the Bounce pad), then does as they like.
  events.push({ tick: from, kind: 'look', yaw: 0, player })
  set(from, 'up arrow', true)
  let yaw = Math.floor(rand() * 360)
  events.push({ tick: from + 45, kind: 'look', yaw, player })
  for (let tick = from + 45; tick < to; tick += 1 + Math.floor(rand() * 6)) {
    const r = rand()
    set(tick, 'up arrow', r < 0.75)
    set(tick, 'down arrow', r >= 0.93)
    set(tick, rand() < 0.5 ? 'left arrow' : 'right arrow', rand() < 0.2)
    set(tick, 'space', rand() < 0.2)
    set(tick, 'x', rand() < 0.3)
    if (rand() < 0.15) { yaw = (yaw + Math.floor(rand() * 91) - 45 + 360) % 360; events.push({ tick, kind: 'look', yaw, player }) }
  }
  return events
}

/**
 * The room: Maya from the start, Sam joins at 100, Lee joins at 400 and leaves at 1000, Maya leaves at 1500. Play again
 * every 600 ticks; the pad's code edited at 300; a brick dropped into the build at 750.
 */
export function timeline3d(ticks: number): Event3[] {
  const players = [
    { num: 1, name: 'Maya', seed: 3, from: 0, to: Math.min(1500, ticks) },
    { num: 2, name: 'Sam', seed: 11, from: 100, to: ticks },
    { num: 3, name: 'Lee', seed: 17, from: 400, to: Math.min(1000, ticks) },
  ].filter((p) => p.from < ticks)
  const events: Event3[] = []
  for (const p of players) events.push({ tick: p.from, kind: 'join', player: p.num, name: p.name })
  for (const p of players) if (p.to < ticks) events.push({ tick: p.to, kind: 'leave', player: p.num })
  for (const p of players) events.push(...kidInput3d(p.seed, p.num, p.from, p.to))
  for (let tick = 600; tick < ticks; tick += 600) events.push({ tick, kind: 'flag' })
  if (ticks > 300) events.push({ tick: 300, kind: 'edit-program' })
  if (ticks > 750) events.push({ tick: 750, kind: 'edit-level' })
  return events.sort((a, b) => a.tick - b.tick)
}

// ------------------------------------------------------------------------------------------------ cost

export interface Bench3 {
  bricks: number
  mode: 'scenery' | 'targets'
  targets: number
  playMs: number
  tickAvgMs: number
  tickP95Ms: number
  copyAvgMs: number
  /** Rewind as rooms do it: restore a copy kept 10 ticks ago (copied again) and replay 10 ticks. */
  rewind10Ms: number
  fingerprintMs: number
  jsonMs: number
  jsonBytes: number
}

/** Two players running about for `ticks` ticks on a build of `bricks`, timing each piece. */
export function bench3d(bricks: number, sceneryAsTargets: boolean, ticks = 300): Bench3 {
  const clock = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now()
  const events = timeline3d(ticks).filter((e) => e.kind !== 'flag' && e.kind !== 'edit-level' && e.kind !== 'edit-program')
  const byTick = new Map<number, Event3[]>()
  for (const e of events) byTick.set(e.tick, [...(byTick.get(e.tick) ?? []), e])
  const design = d1Design({ bricks, sceneryAsTargets })
  const p0 = clock()
  const runtime = createRuntime3d(design)
  runtime.greenFlag()
  runtime.step()
  const playMs = clock() - p0
  const apply = (tick: number) => {
    for (const e of byTick.get(tick) ?? []) {
      if (e.kind === 'down') runtime.pressKey(e.key, e.player)
      else if (e.kind === 'up') runtime.releaseKey(e.key, e.player)
      else if (e.kind === 'look') lookPlayer3d(runtime, e.player, e.yaw)
      else if (e.kind === 'join') addPlayer3d(runtime, { num: e.player, name: e.name }, heroSpawn(design))
      else if (e.kind === 'leave') removePlayer3d(runtime, e.player)
    }
  }
  const steps: number[] = []
  const copies: number[] = []
  const rewinds: number[] = []
  const prints: number[] = []
  const saved = new Map<number, World>()
  for (let tick = 1; tick < ticks; tick++) {
    apply(tick)
    const t0 = clock()
    runtime.step()
    steps.push(clock() - t0)
    if (tick % 4 === 0) {
      const c0 = clock()
      saved.set(tick, copyWorld(runtime.world))
      copies.push(clock() - c0)
    }
    const f0 = clock()
    worldFingerprint(runtime.world)
    prints.push(clock() - f0)
    // Every 40 ticks, a late key: go back 10 ticks and play them again (then carry on from the replayed game).
    if (tick % 40 === 0 && saved.has(tick - 12)) {
      const r0 = clock()
      runtime.restoreWorld(copyWorld(saved.get(tick - 12)!))
      for (let t = tick - 11; t <= tick; t++) { apply(t); runtime.step() }
      rewinds.push(clock() - r0)
    }
  }
  const j0 = clock()
  const json = worldToJson(runtime.world)
  const jsonMs = clock() - j0
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
  const p95 = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length * 0.95)] ?? 0
  const r3 = (n: number) => Math.round(n * 1000) / 1000
  return {
    bricks, mode: sceneryAsTargets ? 'targets' : 'scenery', targets: runtime.world.targets.length,
    playMs: r3(playMs), tickAvgMs: r3(avg(steps)), tickP95Ms: r3(p95(steps)), copyAvgMs: r3(avg(copies)), rewind10Ms: r3(avg(rewinds)),
    fingerprintMs: r3(avg(prints)), jsonMs: r3(jsonMs), jsonBytes: json.length,
  }
}
