/**
 * Saving a running game (docs/qa/hackable-rooms M0): a copy for rewinding, JSON for a room's keyframe, and a cheap
 * fingerprint for checking that every player's game still agrees.
 *
 * Everything that decides what happens next lives in `World` (targets, RNG, clock, keys, running scripts, and the
 * kit state kept on targets and the world), so these only have to copy the world. Bricks are not copied: a running
 * game never changes a brick in place (an edit replaces it), so a copy shares them, and JSON leaves them out because
 * every player already has the project.
 */
import type { ExecutionFrame, SerializedThread, Target, World } from './contracts'

// ------------------------------------------------------------------------------------------------ copy (rewind)

function copyFrame(f: ExecutionFrame): ExecutionFrame {
  // Statements are the scripts' own blocks: shared, never changed while running.
  return {
    ...f,
    ...(f.params ? { params: { ...f.params } } : {}),
    ...(f.stmtMemory ? { stmtMemory: structuredClone(f.stmtMemory) } : {}),
  }
}

function copyThread(t: SerializedThread): SerializedThread {
  return { ...t, stack: t.stack.map(copyFrame) }
}

/**
 * A copy of the game to come back to (a rewind), sharing the bricks and the scripts' blocks. Call it between ticks,
 * after `step()` (the world's `threads` are only written then).
 */
export function copyWorld(world: World): World {
  const { bricks, targets, stage, threads, keysDown, tiles, ...rest } = world
  return {
    ...structuredClone(rest),
    bricks,
    tiles,
    keysDown: new Set(keysDown),
    stage: structuredClone(stage),
    targets: structuredClone(targets),
    ...(threads ? { threads: threads.map(copyThread) } : {}),
  }
}

// ------------------------------------------------------------------------------------------------ JSON (keyframes)

/** JSON turns Infinity, -Infinity and NaN into null and -0 into 0; Scratch maths makes all of them (1 / 0, 0 * -1). */
const NUMBER_TAG = '$num'

function replacer(_key: string, value: unknown): unknown {
  if (typeof value === 'number' && (!Number.isFinite(value) || Object.is(value, -0))) return { [NUMBER_TAG]: Object.is(value, -0) ? '-0' : String(value) }
  return value
}

function reviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>
    const tag = o[NUMBER_TAG]
    if (typeof tag === 'string' && Object.keys(o).length === 1) return tag === '-0' ? -0 : Number(tag)
  }
  return value
}

/** The game as JSON text, without its bricks: what a room sends someone joining late. */
export function worldToJson(world: World): string {
  const { bricks: _bricks, keysDown, ...rest } = world
  return JSON.stringify({ ...rest, keysDown: [...keysDown] }, replacer)
}

/** The game back from worldToJson, with the project's bricks (the project as edited up to that tick). */
export function worldFromJson(text: string, bricks: World['bricks']): World {
  const parsed = JSON.parse(text, reviver) as Omit<World, 'bricks' | 'keysDown'> & { keysDown: string[] }
  return { ...parsed, bricks, keysDown: new Set(parsed.keysDown) }
}

// ------------------------------------------------------------------------------------------------ fingerprint

/**
 * A 32-bit fingerprint of everything that decides what happens next. Two games that agree to the last bit of every
 * number get the same fingerprint; a game that drifted almost surely does not. Numbers are hashed by their bits, keys
 * in sorted order, and scripts by where they are in their blocks (not the blocks themselves).
 */
export function worldFingerprint(world: World): number {
  const h = new Hasher()
  h.num(world.tick); h.num(world.timerStartTick); h.num(world.rngState); h.num(world.cloneCount); h.num(world.nextTargetId)
  h.str(world.answer)
  h.value([...world.keysDown].sort())
  h.value(world.everyTick ?? false)
  h.value(world.toldBumps ?? null)
  h.value(world.askQueue)
  h.target(world.stage)
  h.num(world.targets.length)
  for (const t of world.targets) h.target(t)
  const threads = world.threads ?? []
  h.num(threads.length)
  for (const t of threads) {
    h.num(t.id); h.str(t.targetId); h.str(t.scriptId ?? ''); h.str(t.status); h.value(t.done); h.num(t.warpOpCount)
    h.num(t.stack.length)
    for (const f of t.stack) {
      h.num(f.pc); h.num(f.statements.length); h.str(f.proccode ?? ''); h.value(f.params ?? null); h.value(f.warp ?? false)
      h.str(f.loopType ?? ''); h.num(f.loopTimesRemaining ?? -1); h.value(f.stmtMemory ?? null)
    }
  }
  h.num(world.nextThreadId ?? 0)
  return h.done()
}

class Hasher {
  private h = 0x811c9dc5
  private readonly f64 = new Float64Array(1)
  private readonly u32 = new Uint32Array(this.f64.buffer)

  private mix(n: number): void {
    this.h = Math.imul(this.h ^ (n >>> 0), 0x01000193)
  }

  num(n: number): void {
    this.mix(1)
    // Engines may keep different NaN bit patterns; every NaN is the same value to a script.
    if (Number.isNaN(n)) return this.mix(0x7ff80000)
    this.f64[0] = n
    this.mix(this.u32[0])
    this.mix(this.u32[1])
  }

  str(s: string): void {
    this.mix(2)
    this.mix(s.length)
    for (let i = 0; i < s.length; i++) this.mix(s.charCodeAt(i))
  }

  value(v: unknown): void {
    if (v === null || v === undefined) return this.mix(3)
    if (typeof v === 'number') return this.num(v)
    if (typeof v === 'string') return this.str(v)
    if (typeof v === 'boolean') return this.mix(v ? 5 : 4)
    if (Array.isArray(v)) {
      this.mix(6); this.mix(v.length)
      for (const x of v) this.value(x)
      return
    }
    if (typeof v === 'object') {
      const o = v as Record<string, unknown>
      const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort()
      this.mix(7); this.mix(keys.length)
      for (const k of keys) { this.str(k); this.value(o[k]) }
      return
    }
    this.str(String(v))
  }

  target(t: Target): void {
    // Every field but the id is plain data, so hash the target as a whole (keys sorted, undefined skipped).
    this.value(t)
  }

  done(): number {
    return this.h >>> 0
  }
}
