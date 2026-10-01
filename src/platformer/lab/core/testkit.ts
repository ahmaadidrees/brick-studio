/**
 * Test helpers for lanes that write primitives before the real scheduler exists. The fake runtime records what
 * primitives ask for; `callPrimitive` re-runs a primitive on YIELD and advances one tick each time.
 * The real runtime (scheduler lane) replaces this in integration fixtures.
 */
import { EFFECT_NAMES, YIELD } from './contracts'
import type {
  BrickDef,
  EffectName,
  Fields,
  HatOpcode,
  Primitive,
  PrimitiveResult,
  RuntimeApi,
  RuntimeNote,
  StageBounds,
  Target,
  ThreadHandle,
  Value,
  World,
} from './contracts'
import { TICK_MS } from './contracts'
import { nextFloat, seedState } from './rng'

export const zeroEffects = (): Record<EffectName, number> =>
  Object.fromEntries(EFFECT_NAMES.map((n) => [n, 0])) as Record<EffectName, number>

export function makeTarget(over: Partial<Target> = {}): Target {
  return {
    id: 't1',
    brickId: 'b1',
    isStage: false,
    isClone: false,
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    draggable: false,
    costumeIndex: 0,
    rotationStyle: 'all around',
    effects: zeroEffects(),
    volume: 100,
    soundEffects: { pitch: 0, pan: 0 },
    variables: {},
    lists: {},
    bubble: null,
    edgeHatState: {},
    ...over,
  }
}

/** A brick with one solid rectangular costume centered on its rotation center. */
export function boxBrick(id: string, name: string, w = 20, h = 20, extra: Partial<BrickDef> = {}): BrickDef {
  return {
    id,
    name,
    costumes: [{ name: 'costume1', width: w, height: h, rotationCenterX: w / 2, rotationCenterY: h / 2 }],
    sounds: [],
    program: { scripts: [], procedures: [], variables: [], lists: [] },
    ...extra,
  }
}

export function makeWorld(opts: { bounds?: StageBounds; bricks?: BrickDef[]; targets?: Target[]; seed?: number } = {}): World {
  const bricks = opts.bricks ?? [boxBrick('b1', 'Brick')]
  const stageBrick: BrickDef = { id: 'stage', name: 'Stage', isStage: true, costumes: [], sounds: [], program: { scripts: [], procedures: [], variables: [], lists: [] } }
  return {
    tick: 0,
    timerStartTick: 0,
    bounds: opts.bounds ?? { left: 0, right: 480, bottom: 0, top: 360 },
    stage: makeTarget({ id: 'stage', brickId: 'stage', isStage: true }),
    targets: opts.targets ?? [makeTarget()],
    bricks: Object.fromEntries([stageBrick, ...bricks].map((b) => [b.id, b])),
    keysDown: new Set(),
    mouse: { x: 0, y: 0, down: false },
    answer: '',
    rngState: seedState(opts.seed ?? 1),
    cloneCount: 0,
    nextTargetId: 100,
  }
}

export interface FakeRuntime extends RuntimeApi {
  notes: RuntimeNote[]
  redraws: number
  hatsStarted: { opcode: HatOpcode; fields?: Fields; target?: Target }[]
  broadcasts: string[]
  stopped: { all: number; targets: Target[] }
}

export function fakeRuntime(world: World): FakeRuntime {
  let threadId = 0
  const rt: FakeRuntime = {
    world,
    notes: [],
    redraws: 0,
    hatsStarted: [],
    broadcasts: [],
    stopped: { all: 0, targets: [] },
    nowMs: () => world.tick * TICK_MS,
    requestRedraw: () => {
      rt.redraws++
    },
    random: () => nextFloat(world),
    startHats(opcode, opts) {
      rt.hatsStarted.push({ opcode, ...opts })
      return []
    },
    broadcast(message) {
      rt.broadcasts.push(message)
      return []
    },
    stopAll() {
      rt.stopped.all++
    },
    stopTarget(target) {
      rt.stopped.targets.push(target)
    },
    addClone(clone, source) {
      if (world.cloneCount >= 300) return false
      const i = world.targets.indexOf(source)
      world.targets.splice(i < 0 ? 0 : i, 0, clone)
      world.cloneCount++
      rt.startHats('control_start_as_clone', { target: clone })
      return true
    },
    removeClone(target) {
      if (!target.isClone) return
      const i = world.targets.indexOf(target)
      if (i >= 0) {
        world.targets.splice(i, 1)
        world.cloneCount--
      }
    },
    findOriginal(name) {
      const brick = Object.values(world.bricks).find((b) => b.name === name)
      return brick ? world.targets.find((t) => t.brickId === brick.id && !t.isClone) : undefined
    },
    emit(note) {
      rt.notes.push(note)
    },
  }
  void threadId
  return rt
}

export interface CallResult {
  result: PrimitiveResult
  /** Ticks spent yielding before the primitive finished. */
  ticks: number
  frame: Record<string, unknown>
}

/**
 * Call a primitive the way the scheduler would: on YIELD, advance world.tick by one and call again with the same
 * frame, up to `maxTicks`. Use this for unit tests of timed blocks (wait, glide, say for secs).
 */
export function callPrimitive(
  prim: Primitive,
  opts: { runtime: RuntimeApi; target?: Target; args?: Record<string, Value>; fields?: Record<string, string>; warp?: boolean; maxTicks?: number },
): CallResult {
  const target = opts.target ?? opts.runtime.world.targets[0]
  const frame: Record<string, unknown> = {}
  const thread: ThreadHandle = { id: 1, target, done: false }
  const ctx = {
    target,
    runtime: opts.runtime,
    thread,
    arg: (n: string) => opts.args?.[n] ?? '',
    field: (n: string) => opts.fields?.[n] ?? '',
    frame,
    warp: opts.warp ?? false,
  }
  const max = opts.maxTicks ?? 1000
  let ticks = 0
  for (;;) {
    const result = prim(ctx)
    if (result !== YIELD) return { result, ticks, frame }
    if (ticks >= max) return { result, ticks, frame }
    ticks++
    opts.runtime.world.tick++
  }
}
