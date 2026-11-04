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
import { addPlayer, removePlayer } from '../../../src/platformer/lab/core/players'
import { exportProjectJson, importProjectJson } from '../../../src/platformer/lab/studio/persist/projectIo'
import { createStarterProject } from '../../../src/platformer/lab/studio/starter'
import { createRaceStarterProject } from '../../../src/platformer/lab/studio/race/raceProject'
import { applyEdit, applyEditLive, type EditOp } from '../../../src/platformer/lab/rooms/edits'
import { brickToWire } from '../../../src/platformer/lab/core/save'
import { StudioStore } from '../../../src/platformer/lab/studio/store'
import { PLATFORMER_EXTRAS, RACE_EXTRAS } from '../../../src/platformer/lab/studio/builtins/extras'
import { CHECKPOINT_BRICK_ID } from '../../../src/platformer/lab/studio/builtins/checkpoint'
import { FLYER_BRICK_ID, SHELLBUG_BRICK_ID, SPIKY_BRICK_ID } from '../../../src/platformer/lab/studio/builtins/critters'
import { LIFT_BRICK_ID, PLATFORM_BRICK_ID } from '../../../src/platformer/lab/studio/builtins/platforms'
import { createBlankProject } from '../../../src/platformer/lab/studio/blank/blankProject'
import { BORROWABLE, borrowedBrick } from '../../../src/platformer/lab/studio/blank/borrow'
import { giveJob } from '../../../src/platformer/lab/studio/blank/jobs'
import { costumeFromImage, imageFromRows } from '../../../src/platformer/lab/studio/pixels'

/** The game: the Platformer, Racing, or a game from nothing (docs/qa/blank-2d). */
export type Kit = 'platformer' | 'race' | 'blank'
/**
 * Which project (wave 2 integration): the kit's starter, or the starter with every Parity B brick placed or painted
 * (docs/qa/parity-2026-11-03/B.md). A blank game is always its own (`blankText`).
 */
export type Variant = 'starter' | 'parity'

/** One thing a room puts in order: a key going down or up, or a code or knob edit, applied before tick `tick` runs. */
export type RoomEvent =
  /** `player`: whose key (rooms). Missing: the one keyboard of a game with no players. */
  | { tick: number; kind: 'down' | 'up'; key: string; player?: number }
  /** A player joins or leaves the room (core/players.ts). */
  | { tick: number; kind: 'join'; player: number; name: string }
  | { tick: number; kind: 'leave'; player: number }
  /** "Play again": the room restarts everyone's game from the project as edited so far, as the studio's Play does. */
  | { tick: number; kind: 'flag' }
  | { tick: number; kind: 'edit-program'; what: string }
  | { tick: number; kind: 'edit-knob'; what: string }
  /**
   * Building together (M2): a room `edit` event (rooms/edits.ts), as the room passes it on: a copy placed, cells
   * painted, a brick's code changed (its scripts restart), and that code change put back.
   */
  | { tick: number; kind: 'together'; what: 'place' | 'paint' | 'code' | 'undo-code' }
  /** A game from nothing (wave 2): the backdrop changed as a room `game` edit (building). */
  | { tick: number; kind: 'together'; what: 'backdrop' }

export interface ScenarioOptions {
  /** The saved project text (exportProjectJson), so every engine starts from the same bytes. */
  projectText: string
  kit: Kit
  /** The project's variant: live edits go to its own bricks first (Parity B's, the borrowed ones). */
  variant?: Variant
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

/** The project a new Hackable game starts from, as saved text; with `parity`, plus every Parity B brick. */
export function starterText(kit: Kit, variant: Variant = 'starter'): string {
  if (kit === 'blank') return blankText()
  if (variant === 'parity') return exportProjectJson(kit === 'race' ? raceParity() : platformerParity())
  return exportProjectJson(kit === 'race' ? createRaceStarterProject() : createStarterProject())
}

/**
 * The starter level with Parity B's Platformer bricks along the Hero's way: a Checkpoint near the start, the critters
 * on the ground ahead, a moving and an up-down platform, and the level 40 tiles longer (the Length chip's step x 2).
 */
function platformerParity() {
  const store = new StudioStore(createStarterProject())
  const place = (id: string, x: number, y: number) => { const brick = store.addCatalogBrick(id); if (brick) store.addCopy(brick, x, y) }
  place(CHECKPOINT_BRICK_ID, 200, 32)
  place(SPIKY_BRICK_ID, 420, 40)
  place(FLYER_BRICK_ID, 520, 90)
  place(SHELLBUG_BRICK_ID, 640, 40)
  place(PLATFORM_BRICK_ID, 360, 120)
  place(LIFT_BRICK_ID, 760, 80)
  if (PLATFORMER_EXTRAS.length !== 6) throw new Error('Parity B gained a brick: place it here too.')
  return store.getState().project
}

/** The beginner track with Parity B's track bricks: tire stacks and a bumper among the barriers, scenery off the road. */
function raceParity() {
  const store = new StudioStore(createRaceStarterProject())
  const chars = RACE_EXTRAS.map((x) => {
    const id = store.addCatalogBrick(x.id)
    return id ? store.getState().project.design.bricks.find((b) => b.id === id)!.grid!.char : null
  })
  const tiles = store.getState().project.design.tiles!
  const barriers: [number, number][] = []
  const empty: [number, number][] = []
  for (let r = 0; r < tiles.rows; r++) for (let c = 0; c < tiles.cols; c++) {
    const ch = tiles.data[r]![c]
    if (ch === 'X') barriers.push([c, r])
    else if (ch === '.') empty.push([c, r])
  }
  // Tires and the bumper replace every 5th and 7th barrier cell; tree, grandstand and flowers go in empty cells.
  barriers.forEach(([c, r], i) => { const ch = i % 5 === 0 ? chars[0] : i % 7 === 0 ? chars[1] : null; if (ch) store.setTile(c, r, ch) })
  empty.forEach(([c, r], i) => { const ch = i % 23 === 0 ? chars[2] : i % 29 === 0 ? chars[3] : i % 17 === 0 ? chars[4] : null; if (ch) store.setTile(c, r, ch) })
  return store.getState().project
}

/**
 * A game from nothing: Zip (Player · walks around), Wall tiles, a Star to collect, a Spike that hurts, a Flag goal,
 * and borrowed Platformer bricks aimed at "the player": a Walker, a Coin, a Checkpoint and a Spiky.
 */
export function blankText(): string {
  const square = (colour: string) => costumeFromImage('c', imageFromRows(Array.from({ length: 16 }, () => '#'.repeat(16)), { '#': colour }))
  const store = new StudioStore(createBlankProject())
  const zip = store.addBrick('Zip', square('#34c77b'))
  const wall = store.addBrick('Wall', square('#c9743a'))
  const star = store.addBrick('Star', square('#f5b301'))
  const spike = store.addBrick('Spike', square('#5b6676'))
  const flag = store.addBrick('Flag', square('#e5484d'))
  store.setGridChar(wall, 'W')
  const borrow = (id: string) => {
    const made = borrowedBrick(store.getState().project.design, BORROWABLE.find((b) => b.id === id)!)
    return store.addBrickFrom(made.brick, made.workspace)
  }
  const walker = borrow('walker')
  const coin = borrow('coin')
  const checkpoint = borrow('checkpoint')
  const spiky = borrow('spiky')
  store.setBrush(null)
  store.addCopy(zip, 40, 40)
  for (let row = 4; row < 18; row++) store.setTile(14, row, 'W')
  for (let col = 2; col < 12; col++) store.setTile(col, 12, 'W')
  for (const [x, y] of [[120, 60], [200, 120], [300, 260]]) store.addCopy(star, x, y)
  store.addCopy(spike, 260, 60)
  store.addCopy(flag, 440, 300)
  store.addCopy(walker, 160, 280)
  store.addCopy(coin, 100, 160)
  store.addCopy(checkpoint, 380, 40)
  store.addCopy(spiky, 340, 200)
  giveJob(store, zip, 'player', 'walk')
  giveJob(store, star, 'collect')
  giveJob(store, spike, 'hurts')
  giveJob(store, flag, 'goal')
  giveJob(store, wall, 'wall')
  return exportProjectJson(store.getState().project)
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
    nextTargetId: world.nextTargetId, answer: world.answer, keysDown: world.keysDown, askQueue: world.askQueue, players: world.players,
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

/** The operations of a building-together edit on the project as it is now, or null when there is nothing to edit. */
function togetherOps(what: 'place' | 'paint' | 'code' | 'backdrop', design: LevelDesign, kit: Kit, variant: Variant = 'starter'): { ops: EditOp[]; said: string } | null {
  const isPlayer = (id: string) => id === playerBrickOf(design, kit)
  if (what === 'backdrop') return kit === 'blank' ? { ops: [{ op: 'game', backdrop: design.backdrop === 'night' ? 'sky' : 'night' }], said: 'the backdrop changed' } : null
  // Wave 2: a Parity B project and a game from nothing place and recode their own new bricks first.
  const rank = (names: string[]) => (id: string) => { const i = names.indexOf(design.bricks.find((b) => b.id === id)?.name ?? ''); return i < 0 ? names.length : i }
  const placeFirst = rank(variant === 'parity' || kit === 'blank' ? ['Shellbug', 'Spiky', 'Walker', 'Flyer'] : [])
  const codeFirst = rank(variant === 'parity' || kit === 'blank' ? ['Moving platform', 'Checkpoint', 'Walker'] : [])
  if (what === 'place') {
    const copy = design.copies
      .filter((c) => !isPlayer(c.brickId) && design.bricks.find((b) => b.id === c.brickId)?.limit === undefined)
      .sort((a, b) => placeFirst(a.brickId) - placeFirst(b.brickId))[0]
    if (!copy) return null
    return { ops: [{ op: 'copy', copy: { ...copy, id: `together_${copy.id}`, x: copy.x + 64 } }], said: `placed another ${copy.brickId} at x ${copy.x + 64}` }
  }
  if (what === 'paint') {
    const tiles = design.tiles
    const grid = design.bricks.find((b) => b.grid && !b.grid.finish)
    if (!tiles || !grid) return null
    const cells: [number, number, string][] = []
    for (let r = 2; r < tiles.rows && cells.length < 3; r++) for (let c = 4; c < tiles.cols && cells.length < 3; c += 2) if (tiles.data[r]![c] === '.') cells.push([c, r, grid.grid!.char])
    return cells.length ? { ops: [{ op: 'cells', cells }], said: `painted ${cells.length} ${grid.name} cells` } : null
  }
  // Code: a brick that is neither the player nor a grid brick, its first number one bigger.
  const brick = design.bricks
    .filter((b) => !isPlayer(b.id) && !b.grid && design.copies.some((c) => c.brickId === b.id) && /"value":-?\d/.test(JSON.stringify(b.program)))
    .sort((a, b) => codeFirst(a.id) - codeFirst(b.id))[0]
  if (!brick) return null
  const text = JSON.stringify(brick.program).replace(/"value":(-?\d+(?:\.\d+)?)/, (_m, n: string) => `"value":${Number(n) + 1}`)
  return { ops: [{ op: 'brick', brick: brickToWire({ ...brick, program: JSON.parse(text) }) }], said: `${brick.name}'s code changed (its scripts restart)` }
}

// ------------------------------------------------------------------------------------------------ late joiner

/** What a room sends a late joiner (core/snapshot.ts), loaded into a fresh runtime with the project as edited. */
function rejoin(snapshot: string, design: LevelDesign): Runtime {
  const fresh = createRuntime(design)
  fresh.restoreWorld(worldFromJson(snapshot, fresh.world.bricks))
  return fresh
}

// ------------------------------------------------------------------------------------------------ run

const PLAYER_BRICK: Record<Exclude<Kit, 'blank'>, string> = { platformer: 'brick_hero', race: 'brick_car' }
/** The player brick: the kit's own, or the one a game from nothing chose (LevelDesign.player). */
const playerBrickOf = (design: LevelDesign, kit: Kit): string => (kit === 'blank' ? design.player ?? '' : PLAYER_BRICK[kit])

/** Where every player's Hero (or Car, or player brick) starts: the painted one in the project. */
function spawnOf(design: LevelDesign, kit: Kit) {
  const spawn = design.copies.find((c) => c.brickId === playerBrickOf(design, kit))
  if (!spawn) throw new Error(`The project has no ${playerBrickOf(design, kit) || 'player'}`)
  return spawn
}

/**
 * "Play again" in a room: a fresh game from the project as edited so far, the same players in the same order (before
 * the green flag, so it starts every Hero), still holding the keys they held.
 */
function playAgain(old: Runtime, design: LevelDesign, kit: Kit): Runtime {
  const runtime = createRuntime(design)
  const players = old.world.players ?? []
  for (const p of players) addPlayer(runtime, p, spawnOf(design, kit), kit)
  runtime.greenFlag()
  for (const p of players) for (const key of p.keys) runtime.pressKey(key, p.num)
  return runtime
}

export function runScenario(engine: string, opts: ScenarioOptions): ScenarioResult {
  let design = designOf(opts.projectText, opts.kit)
  let undoCode: EditOp[] | null = null
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
      if (e.kind === 'down') runtime.pressKey(e.key, e.player)
      else if (e.kind === 'up') runtime.releaseKey(e.key, e.player)
      else if (e.kind === 'join') addPlayer(runtime, { num: e.player, name: e.name }, spawnOf(design, opts.kit), opts.kit)
      else if (e.kind === 'leave') removePlayer(runtime, e.player)
      else if (e.kind === 'flag') runtime = playAgain(runtime, design, opts.kit)
      else if (e.kind === 'edit-program' || e.kind === 'edit-knob') {
        const did = e.kind === 'edit-program' ? editProgram(runtime.world, design) : editKnob(runtime.world, design, playerBrickOf(design, opts.kit))
        ;(did ? result.applied : result.skipped).push(`tick ${tick}: ${did ?? e.what}`)
      } else if (e.kind === 'together') {
        const edit = e.what === 'undo-code' ? (undoCode ? { ops: undoCode, said: 'the code change put back' } : null) : togetherOps(e.what, design, opts.kit, opts.variant)
        if (!edit) {
          result.skipped.push(`tick ${tick}: together ${e.what}`)
          continue
        }
        const applied = applyEdit(design, edit.ops)
        applyEditLive(runtime, edit.ops, applied)
        design = applied.design
        if (e.what === 'code') undoCode = applied.undo
        result.applied.push(`tick ${tick}: ${edit.said}${applied.restarted.length ? ` [restarted ${applied.restarted.join(', ')}]` : ''}`)
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
    players: world.targets.filter((t) => t.body?.selfMove || t.brickId === playerBrickOf(design, opts.kit)).map((t) => ({ name: world.bricks[t.brickId].name, x: t.x, y: t.y })),
  }
  return result
}

// ------------------------------------------------------------------------------------------------ the timeline

/** A kid's key presses for `ticks` ticks, from a seed: mostly forward, some turning back, jumps or steering. */
export function kidInput(kit: Kit, ticks: number, seed: number, player?: number, from = 0, to = ticks): RoomEvent[] {
  let s = seed >>> 0
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32 }
  const events: RoomEvent[] = []
  const held = new Set<string>()
  const set = (tick: number, key: string, down: boolean) => {
    if (down === held.has(key)) return
    if (down) held.add(key); else held.delete(key)
    events.push({ tick, kind: down ? 'down' : 'up', key, ...(player !== undefined ? { player } : {}) })
  }
  const forward = kit === 'race' ? 'up arrow' : 'right arrow'
  const back = kit === 'race' ? 'down arrow' : 'left arrow'
  // A game from nothing's player walks four ways (Player · walks around).
  const extras = kit === 'race' ? ['left arrow', 'right arrow'] : kit === 'blank' ? ['up arrow', 'down arrow'] : ['space', 'x']
  for (let tick = from; tick < to; tick += 1 + Math.floor(rand() * 6)) {
    const r = rand()
    set(tick, forward, r < 0.8)
    set(tick, back, r >= 0.92)
    for (const key of extras) set(tick, key, rand() < (kit === 'race' ? 0.3 : 0.25))
  }
  return events
}
