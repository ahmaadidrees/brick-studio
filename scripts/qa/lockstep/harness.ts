/**
 * Lockstep sync test, the part that runs inside each JavaScript engine (docs/qa/hackable-rooms/LOCKSTEP-SPIKE.md).
 *
 * A Hackable room would keep every player's game the same by giving every browser the same project, the same key
 * presses and the same code edits, each stamped with the tick it applies on. This file plays one such timeline and
 * fingerprints the whole game every tick, so run.mjs can compare Node, Chrome and Safari's engine (WebKit) tick by tick.
 *
 * It also checks the late-joiner path: at one tick the game is turned into JSON (as a room would send it), loaded into
 * a fresh runtime, and played on. That copy should match the one that never stopped.
 *
 * Nothing here changes the product: it only uses the core and the save format as the studio does.
 */
import type { LevelDesign, Stmt, Value, World } from '../../../src/platformer/lab/core/contracts'
import { worldFingerprint, worldFromJson, worldToJson } from '../../../src/platformer/lab/core/snapshot'
import { createRuntime, type Runtime } from '../../../src/platformer/lab/core'
import { exportProjectJson, importProjectJson } from '../../../src/platformer/lab/studio/persist/projectIo'
import { createStarterProject } from '../../../src/platformer/lab/studio/starter'
import { createRaceStarterProject } from '../../../src/platformer/lab/studio/race/raceProject'

export type Kit = 'platformer' | 'race'

/** One thing a room puts in order: a key going down or up, or a code or knob edit, applied before tick `tick` runs. */
export type RoomEvent =
  | { tick: number; kind: 'down' | 'up'; key: string }
  /** "Play again": the room restarts everyone's game from the project as edited so far, as the studio's Play does. */
  | { tick: number; kind: 'flag' }
  | { tick: number; kind: 'edit-program'; what: string }
  | { tick: number; kind: 'edit-knob'; what: string }

export interface ScenarioOptions {
  /** The saved project text (exportProjectJson), so every engine starts from the same bytes. */
  projectText: string
  kit: Kit
  ticks: number
  events: RoomEvent[]
  /** Turn the game into JSON at this tick and carry on in a fresh runtime (the late-joiner path). */
  rejoinAt?: number
  /** Return the full fingerprint text at these ticks, to explain a mismatch. */
  dumpAt?: number[]
}

export interface ScenarioResult {
  engine: string
  kit: Kit
  /** One fingerprint per tick, after that tick ran: the full-text one, then core/snapshot's cheap one a room would use. */
  hashes: string[]
  fingerprints: number[]
  dumps: Record<number, string>
  /** Events that changed something, and ones that found nothing to change. */
  applied: string[]
  skipped: string[]
  /** Bytes of the late-joiner snapshot, when rejoinAt was set. */
  snapshotBytes?: number
  /** Milliseconds for all the steps (fingerprinting excluded). */
  stepMs: number
  final: { coins?: Value; players: { name: string; x: number; y: number }[] }
}

// ------------------------------------------------------------------------------------------------ starters

/** The project a new Hackable game starts from, as saved text. */
export function starterText(kit: Kit): string {
  return exportProjectJson(kit === 'race' ? createRaceStarterProject() : createStarterProject())
}

function designOf(projectText: string, kit: Kit): LevelDesign {
  const result = importProjectJson(projectText, kit)
  if (!result.ok) throw new Error(`The project did not open: ${result.error}`)
  return result.project.design
}

// ------------------------------------------------------------------------------------------------ fingerprint

/**
 * Text for any value where two runs that agree to the last bit give the same string, and only then: numbers go
 * through String(), which is exact to the bit (shortest round trip), plus -0, which JSON would hide.
 */
function stable(value: unknown): string {
  if (value === null || value === undefined) return String(value)
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value instanceof Set) return stable([...value].map(String).sort())
  if (value instanceof Uint8Array) return `u8:${value.length}`
  if (typeof value === 'object') {
    const o = value as Record<string, unknown>
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(',')}}`
  }
  return JSON.stringify(String(value))
}

/**
 * Everything that decides what happens next, as text to compare and diff: every target whole, the RNG, the clock, the
 * keys, the kit state kept in the world, and every running script's place in its blocks.
 */
export function worldState(world: World): string {
  return stable({
    tick: world.tick, timerStartTick: world.timerStartTick, rngState: world.rngState, cloneCount: world.cloneCount,
    nextTargetId: world.nextTargetId, answer: world.answer, keysDown: world.keysDown, askQueue: world.askQueue,
    everyTick: world.everyTick, toldBumps: world.toldBumps, nextThreadId: world.nextThreadId,
    stage: world.stage, targets: world.targets,
    threads: (world.threads ?? []).map((th) => ({
      id: th.id, targetId: th.targetId, scriptId: th.scriptId, status: th.status, done: th.done,
      stack: th.stack.map((f) => ({ pc: f.pc, n: f.statements.length, proccode: f.proccode, params: f.params, warp: f.warp, loopType: f.loopType, left: f.loopTimesRemaining, mem: f.stmtMemory })),
    })),
  })
}

/** 64-bit FNV-1a over the fingerprint text, as hex. */
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

/**
 * "Coin now worth 5": the first "change … by 1" on the Stage becomes "by 5". A room would send the edited brick; this
 * edits the running world's brick the same way, so scripts started from then on run the new blocks.
 */
function editProgram(world: World, design: LevelDesign): string | null {
  const stage = world.bricks[world.stage.brickId]
  const visit = (stmts: Stmt[]): Stmt | null => {
    for (const s of stmts) {
      const v = s.inputs.VALUE
      if (s.opcode === 'data_changevariableby' && v?.kind === 'lit' && Number(v.value) === 1) return s
      for (const b of s.branches ?? []) { const hit = visit(b); if (hit) return hit }
    }
    return null
  }
  for (const script of stage.program.scripts) {
    const hit = visit(script.body)
    if (!hit) continue
    const edited = structuredClone(stage.program)
    const s = edited.scripts.find((x) => x.id === script.id)!
    const target = visit(s.body)!
    target.inputs = { ...target.inputs, VALUE: { kind: 'lit', value: 5 } }
    // An edit replaces world.bricks (never changes it in place), so caches keyed by the bricks start again.
    world.bricks = { ...world.bricks, [world.stage.brickId]: { ...stage, program: edited } }
    design.stage = world.bricks[world.stage.brickId]
    return `Stage: "change ${target.fields.VARIABLE ?? 'a variable'} by 1" is now "by 5" (script ${script.id})`
  }
  return null
}

/**
 * A Build knob turned while everyone plays: the player's jump power or top speed, times 1.3, on every live copy and
 * in the project, so "Play again" keeps it.
 */
function editKnob(world: World, design: LevelDesign, playerBrickId: string): string | null {
  const brick = world.bricks[playerBrickId]
  const decl = brick?.program.variables.find((v) => /jump power|top speed/.test(v.name)) ?? brick?.program.variables.find((v) => typeof v.value === 'number')
  if (!decl) return null
  const designDecl = design.bricks.find((b) => b.id === playerBrickId)?.program.variables.find((v) => v.id === decl.id)
  if (designDecl) designDecl.value = Number(designDecl.value) * 1.3
  if (decl !== designDecl) decl.value = Number(decl.value) * 1.3
  let n = 0
  for (const t of world.targets) {
    if (t.brickId !== playerBrickId || !(decl.id in t.variables)) continue
    t.variables[decl.id] = Number(t.variables[decl.id]) * 1.3
    n++
  }
  return n ? `${brick.name}: "${decl.name}" x 1.3 on ${n} cop${n === 1 ? 'y' : 'ies'}` : null
}

// ------------------------------------------------------------------------------------------------ late joiner

/** What a room sends a late joiner (core/snapshot.ts), loaded into a fresh runtime with the project as edited. */
function rejoin(snapshot: string, design: LevelDesign): Runtime {
  const fresh = createRuntime(design)
  fresh.restoreWorld(worldFromJson(snapshot, fresh.world.bricks))
  return fresh
}

// ------------------------------------------------------------------------------------------------ run

const PLAYER_BRICK: Record<Kit, string> = { platformer: 'brick_hero', race: 'brick_car' }

export function runScenario(engine: string, opts: ScenarioOptions): ScenarioResult {
  const design = designOf(opts.projectText, opts.kit)
  let runtime = createRuntime(design)
  runtime.greenFlag()
  const byTick = new Map<number, RoomEvent[]>()
  for (const e of opts.events) byTick.set(e.tick, [...(byTick.get(e.tick) ?? []), e])
  const result: ScenarioResult = { engine, kit: opts.kit, hashes: [], fingerprints: [], dumps: {}, applied: [], skipped: [], stepMs: 0, final: { players: [] } }
  const dumpAt = new Set(opts.dumpAt ?? [])
  const clock = typeof performance !== 'undefined' ? () => performance.now() : () => Date.now()

  for (let tick = 0; tick < opts.ticks; tick++) {
    if (opts.rejoinAt === tick) {
      const text = worldToJson(runtime.world)
      result.snapshotBytes = text.length
      runtime = rejoin(text, design)
    }
    for (const e of byTick.get(tick) ?? []) {
      if (e.kind === 'down') runtime.pressKey(e.key)
      else if (e.kind === 'up') runtime.releaseKey(e.key)
      else if (e.kind === 'flag') { runtime = createRuntime(design); runtime.greenFlag() }
      else if (e.kind === 'edit-program' || e.kind === 'edit-knob') {
        const did = e.kind === 'edit-program' ? editProgram(runtime.world, design) : editKnob(runtime.world, design, PLAYER_BRICK[opts.kit])
        ;(did ? result.applied : result.skipped).push(`tick ${tick}: ${did ?? e.what}`)
      }
    }
    const t0 = clock()
    runtime.step()
    result.stepMs += clock() - t0
    const text = worldState(runtime.world)
    result.hashes.push(hash(text))
    result.fingerprints.push(worldFingerprint(runtime.world))
    if (dumpAt.has(tick)) result.dumps[tick] = text
  }

  const world = runtime.world
  const coins = world.bricks[world.stage.brickId].program.variables.find((v) => v.name === 'coins')
  result.final = {
    coins: coins ? world.stage.variables[coins.id] : undefined,
    players: world.targets.filter((t) => t.body?.selfMove || t.brickId === PLAYER_BRICK[opts.kit]).map((t) => ({ name: world.bricks[t.brickId].name, x: t.x, y: t.y })),
  }
  return result
}

// ------------------------------------------------------------------------------------------------ the timeline

/** A kid's key presses for `ticks` ticks, from a seed: mostly forward, some turning back, jumps or steering. */
export function kidInput(kit: Kit, ticks: number, seed: number): RoomEvent[] {
  let s = seed >>> 0
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32 }
  const events: RoomEvent[] = []
  const held = new Set<string>()
  const set = (tick: number, key: string, down: boolean) => {
    if (down === held.has(key)) return
    if (down) held.add(key); else held.delete(key)
    events.push({ tick, kind: down ? 'down' : 'up', key })
  }
  const forward = kit === 'race' ? 'up arrow' : 'right arrow'
  const back = kit === 'race' ? 'down arrow' : 'left arrow'
  const extras = kit === 'race' ? ['left arrow', 'right arrow'] : ['space', 'x']
  for (let tick = 0; tick < ticks; tick += 1 + Math.floor(rand() * 6)) {
    const r = rand()
    set(tick, forward, r < 0.8)
    set(tick, back, r >= 0.92)
    for (const key of extras) set(tick, key, rand() < (kit === 'race' ? 0.3 : 0.25))
  }
  return events
}
