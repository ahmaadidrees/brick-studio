/**
 * Code Lab core scheduler: threads, execution loop, control flow, events, and procedures.
 *
 * Implements the Scratch 3 sweep/redraw scheduling model (F01–F16), hat trigger policies (H01–H10),
 * and custom block execution with parameter frames, warp, and recursion (P01–P07).
 * Op-count budgeting replaces Scratch's wall-clock time limit for determinism and replayability.
 */

import {
  CLONE_LIMIT,
  DEFAULT_TICK_OP_BUDGET,
  TICK_MS,
  TICKS_PER_SECOND,
  WARP_OP_LIMIT,
  YIELD,
  YIELD_TICK,
  zeroEffects,
} from './contracts'
import type {
  BrickDef,
  ExecutionFrame,
  SerializedThread,
  ThreadStatus,
  Expr,
  Fields,
  HatOpcode,
  Inputs,
  Primitive,
  PrimitiveCtx,
  PrimitiveResult,
  PrimitiveTable,
  Procedure,
  RuntimeApi,
  RuntimeNote,
  Script,
  Stmt,
  Target,
  ThreadHandle,
  Value,
  World,
} from './contracts'
import { toBoolean, toNumber, toString } from './values'
import { nextFloat } from './rng'

export { YIELD_TICK }
export { toNumber, toBoolean, toString }

/** Upper bound on sweeps in one tick; normally the op budget or a redraw ends the tick long before. */
const MAX_SWEEPS_PER_TICK = 10_000

export interface RuntimeLifecycle {
  greenFlag: ((runtime: RuntimeApi) => void)[]
  stopAll: ((runtime: RuntimeApi) => void)[]
  /** Runs once at the end of every tick, after all script sweeps and before world.tick advances (Platformer physics). */
  afterTick: ((runtime: RuntimeApi) => void)[]
  /** After the green flag's own hats have started (so their threads run first in the first tick). */
  afterGreenFlag?: ((runtime: RuntimeApi) => void)[]
}

export type { ThreadStatus, ExecutionFrame, SerializedThread } from './contracts'

/** Blockly ids executed in one tick, grouped by runtime target (painted copy or clone). */
export type ExecutedBlocks = ReadonlyMap<string, ReadonlySet<string>>

export class Thread implements ThreadHandle {
  readonly id: number
  readonly target: Target
  readonly script?: Script
  done = false
  status: ThreadStatus = 'running'
  stack: ExecutionFrame[] = []
  warpOpCount = 0
  isStackClick = false

  constructor(id: number, target: Target, script?: Script, isStackClick = false) {
    this.id = id
    this.target = target
    this.script = script
    this.isStackClick = isStackClick
    if (script && script.body.length > 0) {
      this.stack.push({
        statements: script.body,
        pc: 0,
      })
    }
  }

  isWarp(): boolean {
    return this.stack.some((f) => f.warp)
  }
}

export class Runtime implements RuntimeApi {
  readonly world: World
  primitives: PrimitiveTable
  readonly notes: RuntimeNote[] = []
  turbo = false
  opBudget: number = DEFAULT_TICK_OP_BUDGET

  private _threads: Thread[] = []
  private _nextThreadId = 1
  private _redrawRequested = false
  private _tickOps = 0
  private executedBlocks = new Map<string, Set<string>>()
  private executionTargets = new Map<string, { brickId: string; copyId?: string }>()
  private executedBlockListeners = new Set<(snapshot: ExecutedBlocks) => void>()
  private startedTraceThreads = new WeakSet<Thread>()

  /** Lane cleanup that must run on green flag / stop (looks bubbles, sound effects, ask queue). */
  readonly lifecycle: RuntimeLifecycle

  constructor(world: World, primitives: PrimitiveTable = {}, lifecycle: Partial<RuntimeLifecycle> = {}) {
    this.world = world
    this.primitives = primitives
    this.lifecycle = { greenFlag: lifecycle.greenFlag ?? [], stopAll: lifecycle.stopAll ?? [], afterTick: lifecycle.afterTick ?? [], afterGreenFlag: lifecycle.afterGreenFlag ?? [] }
    if (this.world.threads && this.world.threads.length > 0) {
      this.restoreThreadsFromWorld()
    } else {
      this.syncThreadsToWorld()
    }
  }

  syncThreadsToWorld(): void {
    this.world.threads = this._threads.map((t) => ({
      id: t.id,
      targetId: t.target.id,
      scriptId: t.script?.id,
      done: t.done,
      status: t.status,
      stack: t.stack.map((frame) => ({
        statements: [...frame.statements],
        pc: frame.pc,
        isProcedure: frame.isProcedure,
        proccode: frame.proccode,
        params: frame.params ? { ...frame.params } : undefined,
        warp: frame.warp,
        isLoop: frame.isLoop,
        loopType: frame.loopType,
        loopTimesRemaining: frame.loopTimesRemaining,
        loopCondition: frame.loopCondition,
        stmtMemory: frame.stmtMemory ? { ...frame.stmtMemory } : undefined,
      })),
      warpOpCount: t.warpOpCount,
      isStackClick: t.isStackClick,
    }))
  }

  restoreThreadsFromWorld(): void {
    if (!this.world.threads) return
    const allTargets = [this.world.stage, ...this.world.targets]
    const targetMap = new Map<string, Target>(allTargets.map((t) => [t.id, t]))
    this._threads = []
    let maxId = 0
    for (const st of this.world.threads) {
      if (st.id > maxId) maxId = st.id
      const target = targetMap.get(st.targetId)
      if (!target) continue
      const brick = this.world.bricks[target.brickId]
      const script = brick?.program.scripts.find((s) => s.id === st.scriptId)
      const thread = new Thread(st.id, target, script, st.isStackClick)
      thread.done = st.done
      thread.status = st.status
      thread.stack = st.stack.map((frame) => ({
        statements: [...frame.statements],
        pc: frame.pc,
        isProcedure: frame.isProcedure,
        proccode: frame.proccode,
        params: frame.params ? { ...frame.params } : undefined,
        warp: frame.warp,
        isLoop: frame.isLoop,
        loopType: frame.loopType,
        loopTimesRemaining: frame.loopTimesRemaining,
        loopCondition: frame.loopCondition,
        stmtMemory: frame.stmtMemory ? { ...frame.stmtMemory } : undefined,
      }))
      thread.warpOpCount = st.warpOpCount
      this._threads.push(thread)
    }
    this._nextThreadId = Math.max(this._nextThreadId, maxId + 1)
  }

  restoreWorld(world: World): void {
    (this as { world: World }).world = world
    this.restoreThreadsFromWorld()
    this.clearExecutedBlocks()
  }

  nowMs(): number {
    return this.world.tick * TICK_MS
  }

  requestRedraw(): void {
    this._redrawRequested = true
  }

  random(): number {
    return nextFloat(this.world)
  }

  threads(): readonly ThreadHandle[] {
    return this._threads
  }

  emit(note: RuntimeNote): void {
    this.notes.push(note)
  }

  findOriginal(brickName: string): Target | undefined {
    const brick = Object.values(this.world.bricks).find((b) => b.name === brickName)
    return brick ? this.world.targets.find((t) => t.brickId === brick.id && !t.isClone) : undefined
  }

  addClone(clone: Target, source: Target): boolean {
    if (this.world.cloneCount >= CLONE_LIMIT) return false
    const i = this.world.targets.indexOf(source)
    this.world.targets.splice(i < 0 ? 0 : i, 0, clone)
    this.world.cloneCount++
    clone.isClone = true
    this.startHats('control_start_as_clone', { target: clone })
    return true
  }

  removeClone(target: Target): void {
    if (!target.isClone) return
    this.stopTarget(target)
    const i = this.world.targets.indexOf(target)
    if (i >= 0) {
      this.world.targets.splice(i, 1)
      this.world.cloneCount--
    }
  }

  stopTarget(target: Target, except?: ThreadHandle): void {
    for (const thread of this._threads) {
      if (thread.target === target && thread !== except) {
        thread.done = true
        thread.status = 'done'
      }
    }
    this.syncThreadsToWorld()
  }

  stopAll(): void {
    for (const thread of this._threads) {
      thread.done = true
      thread.status = 'done'
    }
    this._threads = []
    this.world.targets = this.world.targets.filter((t) => !t.isClone)
    this.world.cloneCount = 0
    for (const target of [this.world.stage, ...this.world.targets]) {
      target.effects = zeroEffects()
    }
    this.emit({ kind: 'stopSounds' })
    for (const hook of this.lifecycle.stopAll) hook(this)
    this.syncThreadsToWorld()
    this.clearExecutedBlocks()
  }

  stop(): void {
    this.stopAll()
  }

  greenFlag(): void {
    this.stopAll()
    this.world.answer = ''
    this.world.timerStartTick = this.world.tick
    for (const target of [this.world.stage, ...this.world.targets]) {
      target.edgeHatState = {}
      target.effects = zeroEffects()
    }
    for (const hook of this.lifecycle.greenFlag) hook(this)
    this.startHats('event_whenflagclicked')
    for (const hook of this.lifecycle.afterGreenFlag ?? []) hook(this)
  }

  pressKey(key: string): void {
    this.world.keysDown.add(key)
    this.startHats('event_whenkeypressed', { fields: { KEY_OPTION: key } })
  }

  releaseKey(key: string): void {
    this.world.keysDown.delete(key)
    this.world.keysDown.delete(key.toLowerCase())
  }

  clickTarget(target: Target): void {
    if (target.isStage) {
      this.startHats('event_whenstageclicked', { target })
    } else {
      this.startHats('event_whenthisspriteclicked', { target })
    }
  }

  private broadcastListeners = new Set<(message: string) => void>()

  /**
   * Watch broadcasts without changing anything: the Studio uses it to show "You made it!" when the Goal broadcasts
   * `course clear`. A listener only observes; it never touches the world, so runs stay deterministic. Returns an unsubscribe.
   */
  onBroadcast(listener: (message: string) => void): () => void {
    this.broadcastListeners.add(listener)
    return () => this.broadcastListeners.delete(listener)
  }

  /**
   * Observe execution after each tick, including threads/clones that finished during it. This display-only trace
   * never enters the saved world, scheduler order or operation budget. Each listener owns a defensive copy, so even
   * a caller bypassing TypeScript's readonly types cannot mutate another listener's view or a later tick.
   * Stop/restart (and restoring a world) emit an empty snapshot to clear the editor's glow.
   */
  onExecutedBlocks(listener: (snapshot: ExecutedBlocks) => void): () => void {
    this.executedBlockListeners.add(listener)
    return () => { this.executedBlockListeners.delete(listener) }
  }

  /** Identity of a target in the most recent tick's trace, including clones deleted before the tick ended. */
  executionTarget(targetId: string): Readonly<{ brickId: string; copyId?: string }> | undefined {
    const identity = this.executionTargets.get(targetId)
    return identity ? { ...identity } : undefined
  }

  private traceBlock(target: Target, blockId: string | undefined): void {
    if (!blockId || this.executedBlockListeners.size === 0) return
    if (!this.executionTargets.has(target.id)) {
      this.executionTargets.set(target.id, { brickId: target.brickId, copyId: target.copyId })
    }
    let ids = this.executedBlocks.get(target.id)
    if (!ids) this.executedBlocks.set(target.id, ids = new Set())
    ids.add(blockId)
  }

  private emitExecutedBlocks(): void {
    for (const listener of [...this.executedBlockListeners]) {
      const snapshot = new Map([...this.executedBlocks].map(([id, blocks]) => [id, new Set(blocks)]))
      // A presentation error must not interrupt stepping or prevent other observers from receiving their trace.
      try { listener(snapshot) } catch { /* Observers are isolated from the simulation. */ }
    }
  }

  private clearExecutedBlocks(): void {
    this.executedBlocks.clear()
    this.executionTargets.clear()
    this.emitExecutedBlocks()
  }

  broadcast(message: string): ThreadHandle[] {
    for (const l of [...this.broadcastListeners]) l(message)
    return this.startHats('event_whenbroadcastreceived', {
      fields: { BROADCAST_OPTION: message },
    })
  }

  startStack(target: Target, script: Script): ThreadHandle {
    const thread = new Thread(this._nextThreadId++, target, script, true)
    this._threads.push(thread)
    this.syncThreadsToWorld()
    return thread
  }

  startHats(opcode: HatOpcode, opts?: { fields?: Fields; target?: Target }): ThreadHandle[] {
    const restartExisting = this.shouldRestartExistingThreads(opcode)
    const started: ThreadHandle[] = []

    // F13: reverse executableTargets order: [targets.reverse(), stage]
    const targetsToCheck: Target[] = opts?.target
      ? [opts.target]
      : [...this.world.targets].reverse().concat([this.world.stage])

    for (const target of targetsToCheck) {
      const brick = this.world.bricks[target.brickId]
      if (!brick) continue

      for (const script of brick.program.scripts) {
        if (script.hat.opcode !== opcode) continue

        if (!this.hatMatchesFields(opcode, script.hat.fields, opts?.fields)) {
          continue
        }

        // Scratch's startHats: a restarting hat reuses any thread of this script still in the list, even one that
        // finished earlier in this sweep and has not been cleaned out yet; a non-restarting hat only defers to a
        // running thread. Reusing the finished slot keeps cyclic broadcasts (a → b → a) from appending a new
        // thread forever inside one sweep: the restarted thread runs in a later sweep instead.
        const existingIndex = this._threads.findIndex(
          (t) => t.target === target && t.script === script && !t.isStackClick && (restartExisting || !t.done),
        )

        if (existingIndex >= 0) {
          if (restartExisting) {
            const existing = this._threads[existingIndex]
            existing.done = true
            existing.status = 'done'
            // H05/F14: the restarted thread takes the old thread's slot in the order.
            const replacement = new Thread(this._nextThreadId++, target, script, false)
            this._threads[existingIndex] = replacement
            started.push(replacement)
            continue
          } else {
            // H02, H07: do not restart existing running thread
            continue
          }
        }

        const thread = new Thread(this._nextThreadId++, target, script, false)
        this._threads.push(thread)
        started.push(thread)
      }
    }

    return started
  }

  step(): void {
    this.executedBlocks.clear()
    this.executionTargets.clear()
    this._redrawRequested = false

    // Reset threads from previous tick
    for (const thread of this._threads) {
      if (thread.status === 'yield' || thread.status === 'yield_tick') {
        thread.status = 'running'
      }
    }

    // Check edge-triggered hats (H08)
    this.checkEdgeHats()

    this._tickOps = 0
    let sweep = 0

    while (this.hasRunnableThreads() && this._tickOps < this.opBudget) {
      if (sweep > 0 && this._redrawRequested && !this.turbo) {
        break
      }
      // Safety net: never let one tick spin forever, whatever the scripts do.
      if (sweep >= MAX_SWEEPS_PER_TICK) break
      sweep++

      // F15: sequencer iterates the live threads array so newly appended threads get a turn
      const startedBeforeSweep = this._threads.length
      for (let i = 0; i < this._threads.length; i++) {
        // Threads started during this sweep (F15) get their turn only while the tick has budget left, so scripts
        // that keep starting scripts (a clone that replaces itself, a broadcast loop) cannot hold one sweep
        // forever. The rest keep their place and run first next tick.
        if (i >= startedBeforeSweep && this._tickOps >= this.opBudget) break
        const thread = this._threads[i]
        if (thread.done || thread.status !== 'running') continue

        this.stepThread(thread)
      }
      // For threads that were already there when the sweep began, the op budget is checked only here, between
      // sweeps (F02): each of them gets a turn in each sweep, so a heavy warp thread cannot starve its siblings.

      this.cleanDoneThreads()

      // Reset STATUS_YIELD to runnable for the next sweep in this tick (F04, F07)
      for (const thread of this._threads) {
        if (thread.status === 'yield') {
          thread.status = 'running'
        }
      }
    }

    this.cleanDoneThreads()
    for (const hook of this.lifecycle.afterTick) hook(this)
    this.world.tick++
    this.syncThreadsToWorld()
    this.emitExecutedBlocks()
  }

  private hasRunnableThreads(): boolean {
    return this._threads.some((t) => !t.done && t.status === 'running')
  }

  private cleanDoneThreads(): void {
    this._threads = this._threads.filter((t) => !t.done)
  }

  private chargeOp(thread: Thread): void {
    this._tickOps++
    if (thread.isWarp()) {
      thread.warpOpCount++
      if (thread.warpOpCount >= WARP_OP_LIMIT) {
        thread.warpOpCount = 0
        this.requestRedraw()
        thread.status = 'yield'
      }
    }
  }

  private shouldRestartExistingThreads(opcode: HatOpcode): boolean {
    switch (opcode) {
      case 'event_whenflagclicked':
        return true
      case 'event_whenkeypressed':
        return false // H02
      case 'event_whenthisspriteclicked':
      case 'event_whenstageclicked':
        return true // H03, H04
      case 'event_whenbroadcastreceived':
        return true // H05
      case 'control_start_as_clone':
        return false // H07
      case 'event_whengreaterthan':
        return false // H08
      case 'event_whenbackdropswitchesto':
        return true // H09
      default:
        return false
    }
  }

  private hatMatchesFields(opcode: HatOpcode, hatFields: Fields, filterFields?: Fields): boolean {
    if (!filterFields) return true

    if (opcode === 'event_whenkeypressed') {
      const hatKey = (hatFields.KEY_OPTION ?? '').toLowerCase()
      const filterKey = (filterFields.KEY_OPTION ?? '').toLowerCase()
      if (hatKey === 'any' || filterKey === 'any') return true
      return hatKey === filterKey
    }

    if (opcode === 'event_whenbroadcastreceived') {
      const hatMsg = (hatFields.BROADCAST_OPTION ?? '').toLowerCase()
      const filterMsg = (filterFields.BROADCAST_OPTION ?? '').toLowerCase()
      return hatMsg === filterMsg
    }

    if (opcode === 'event_whenbackdropswitchesto') {
      const hatBackdrop = (hatFields.BACKDROP ?? '').toLowerCase()
      const filterBackdrop = (filterFields.BACKDROP ?? '').toLowerCase()
      return hatBackdrop === filterBackdrop
    }

    for (const [key, val] of Object.entries(filterFields)) {
      if (hatFields[key] !== val) return false
    }
    return true
  }

  private checkEdgeHats(): void {
    // Traverse executable targets in reverse order
    const targets = [...this.world.targets].reverse().concat([this.world.stage])
    for (const target of targets) {
      const brick = this.world.bricks[target.brickId]
      if (!brick) continue

      for (const script of brick.program.scripts) {
        if (script.hat.opcode !== 'event_whengreaterthan') continue

        // H08: Scratch does not evaluate an edge hat while its handler is still running, so
        // the stored edge state stays as it was when the handler started.
        if (this._threads.some((t) => t.target === target && t.script === script && !t.done)) continue

        const menu = script.hat.fields?.WHENGREATERTHANMENU ?? 'TIMER'
        let currentVal = 0
        if (menu === 'TIMER') {
          currentVal = (this.world.tick - this.world.timerStartTick) / TICKS_PER_SECOND
        } else if (menu === 'LOUDNESS') {
          currentVal = 0
        }

        const threshold = toNumber(this.evalExpr(script.hat.inputs?.VALUE, { target, thread: null, warp: false }))
        const isTrue = currentVal > threshold // strictly > (H08)
        const key = script.id
        const wasTrue = !!target.edgeHatState[key]
        target.edgeHatState[key] = isTrue

        if (!wasTrue && isTrue) {
          // Edge transition false -> true!
          const thread = new Thread(this._nextThreadId++, target, script, false)
          this._threads.push(thread)
        }
      }
    }
  }

  private findTopProcedureFrame(thread: Thread | null): ExecutionFrame | undefined {
    if (!thread) return undefined
    for (let i = thread.stack.length - 1; i >= 0; i--) {
      if (thread.stack[i].isProcedure) {
        return thread.stack[i]
      }
    }
    return undefined
  }

  evalExpr(expr: Expr | undefined, ctx: { target: Target; thread: Thread | null; warp: boolean }): Value {
    if (!expr) return ''

    if (expr.kind === 'lit') {
      return expr.value
    }

    if (expr.kind === 'param') {
      // P02, P03: nearest procedure parameter frame only; if absent in that frame, return 0
      const procFrame = this.findTopProcedureFrame(ctx.thread)
      if (procFrame && procFrame.params && expr.name in procFrame.params) {
        return procFrame.params[expr.name]
      }
      return 0
    }

    if (expr.kind === 'block') {
      this.traceBlock(ctx.target, expr.id)
      if (ctx.thread) {
        this.chargeOp(ctx.thread)
      } else {
        this._tickOps++
      }

      // F16: evaluate all inputs before calling primitive
      const evaluatedArgs: Record<string, Value> = {}
      if (expr.inputs) {
        for (const [name, inputExpr] of Object.entries(expr.inputs)) {
          evaluatedArgs[name] = this.evalExpr(inputExpr, ctx)
        }
      }

      const prim = this.primitives[expr.opcode]
      if (prim) {
        const dummyThread = ctx.thread ?? new Thread(0, ctx.target)
        const primCtx: PrimitiveCtx = {
          target: ctx.target,
          runtime: this,
          thread: dummyThread,
          arg: (name: string) => evaluatedArgs[name] ?? '',
          field: (name: string) => expr.fields?.[name] ?? '',
          frame: {},
          warp: ctx.warp,
        }
        const result = prim(primCtx)
        if (result === undefined || result === null || typeof result === 'symbol') {
          return ''
        }
        return result
      }
      return ''
    }

    return ''
  }

  private stepThread(thread: Thread): void {
    if (!this.startedTraceThreads.has(thread)) {
      this.startedTraceThreads.add(thread)
      this.traceBlock(thread.target, thread.script?.id)
    }
    while (thread.stack.length > 0 && thread.status === 'running') {
      const frame = thread.stack[thread.stack.length - 1]

      if (frame.pc >= frame.statements.length) {
        if (frame.isLoop) {
          // Jumping back to the top of a loop costs one op, like a block. Without it an empty `forever` re-ran in
          // the same tick for free and the tick never ended (step 6b smoke test).
          this._tickOps++
          if (thread.isWarp()) thread.warpOpCount++
          if (frame.loopType === 'repeat') {
            frame.loopTimesRemaining!--
            if (frame.loopTimesRemaining! > 0) {
              frame.pc = 0
              if (!thread.isWarp()) {
                thread.status = 'yield'
                return
              }
              if (thread.warpOpCount >= WARP_OP_LIMIT) {
                thread.warpOpCount = 0
                this.requestRedraw()
                thread.status = 'yield'
                return
              }
              continue
            }
            thread.stack.pop()
            continue
          } else if (frame.loopType === 'forever') {
            frame.pc = 0
            if (!thread.isWarp()) {
              thread.status = 'yield'
              return
            }
            if (thread.warpOpCount >= WARP_OP_LIMIT) {
              thread.warpOpCount = 0
              this.requestRedraw()
              thread.status = 'yield'
              return
            }
            continue
          } else if (frame.loopType === 'repeat_until') {
            const cond = toBoolean(
              this.evalExpr(frame.loopCondition, {
                target: thread.target,
                thread,
                warp: thread.isWarp(),
              }),
            )
            if (cond) {
              thread.stack.pop()
              continue
            }
            frame.pc = 0
            if (!thread.isWarp()) {
              thread.status = 'yield'
              return
            }
            if (thread.warpOpCount >= WARP_OP_LIMIT) {
              thread.warpOpCount = 0
              this.requestRedraw()
              thread.status = 'yield'
              return
            }
            continue
          } else if (frame.loopType === 'while') {
            const cond = toBoolean(
              this.evalExpr(frame.loopCondition, {
                target: thread.target,
                thread,
                warp: thread.isWarp(),
              }),
            )
            if (!cond) {
              thread.stack.pop()
              continue
            }
            frame.pc = 0
            if (!thread.isWarp()) {
              thread.status = 'yield'
              return
            }
            if (thread.warpOpCount >= WARP_OP_LIMIT) {
              thread.warpOpCount = 0
              this.requestRedraw()
              thread.status = 'yield'
              return
            }
            continue
          }
        }

        // Frame finished
        thread.stack.pop()
        continue
      }

      const stmt = frame.statements[frame.pc]
      this.chargeOp(thread)
      if (thread.status !== 'running') {
        return
      }
      this.traceBlock(thread.target, stmt.id)

      // Control flow owned by scheduler
      if (stmt.opcode === 'control_if') {
        const cond = toBoolean(
          this.evalExpr(stmt.inputs?.CONDITION, {
            target: thread.target,
            thread,
            warp: thread.isWarp(),
          }),
        )
        frame.pc++
        if (cond && stmt.branches?.[0]?.length) {
          thread.stack.push({
            statements: stmt.branches[0],
            pc: 0,
          })
        }
        continue
      }

      if (stmt.opcode === 'control_if_else') {
        const cond = toBoolean(
          this.evalExpr(stmt.inputs?.CONDITION, {
            target: thread.target,
            thread,
            warp: thread.isWarp(),
          }),
        )
        frame.pc++
        const branch = cond ? stmt.branches?.[0] : stmt.branches?.[1]
        if (branch && branch.length > 0) {
          thread.stack.push({
            statements: branch,
            pc: 0,
          })
        }
        continue
      }

      if (stmt.opcode === 'control_repeat') {
        const times = Math.round(
          toNumber(
            this.evalExpr(stmt.inputs?.TIMES, {
              target: thread.target,
              thread,
              warp: thread.isWarp(),
            }),
          ),
        )
        frame.pc++
        if (times > 0) {
          thread.stack.push({
            statements: stmt.branches?.[0] ?? [],
            pc: 0,
            isLoop: true,
            loopType: 'repeat',
            loopTimesRemaining: times,
          })
        }
        continue
      }

      if (stmt.opcode === 'control_forever') {
        frame.pc++
        if (stmt.branches?.[0]?.length) {
          thread.stack.push({
            statements: stmt.branches[0],
            pc: 0,
            isLoop: true,
            loopType: 'forever',
          })
        } else {
          // Empty forever loop still yields each iteration
          thread.stack.push({
            statements: [],
            pc: 0,
            isLoop: true,
            loopType: 'forever',
          })
        }
        continue
      }

      if (stmt.opcode === 'control_repeat_until') {
        frame.pc++
        const cond = toBoolean(
          this.evalExpr(stmt.inputs?.CONDITION, {
            target: thread.target,
            thread,
            warp: thread.isWarp(),
          }),
        )
        // An empty body still loops: `repeat until <x>` with nothing inside waits until x (Scratch).
        if (!cond) {
          thread.stack.push({
            statements: stmt.branches?.[0] ?? [],
            pc: 0,
            isLoop: true,
            loopType: 'repeat_until',
            loopCondition: stmt.inputs?.CONDITION,
          })
        }
        continue
      }

      if (stmt.opcode === 'control_while') {
        frame.pc++
        const cond = toBoolean(
          this.evalExpr(stmt.inputs?.CONDITION, {
            target: thread.target,
            thread,
            warp: thread.isWarp(),
          }),
        )
        if (cond) {
          thread.stack.push({
            statements: stmt.branches?.[0] ?? [],
            pc: 0,
            isLoop: true,
            loopType: 'while',
            loopCondition: stmt.inputs?.CONDITION,
          })
        }
        continue
      }

      if (stmt.opcode === 'control_wait') {
        frame.stmtMemory = frame.stmtMemory ?? {}
        if (frame.stmtMemory.targetTime === undefined) {
          const duration = Math.max(
            0,
            toNumber(
              this.evalExpr(stmt.inputs?.DURATION, {
                target: thread.target,
                thread,
                warp: thread.isWarp(),
              }),
            ),
          )
          frame.stmtMemory.targetTime = this.nowMs() + duration * 1000
          this.requestRedraw()
          // F08/F11: in warp, Scratch revisits an ordinary yield at once, so a wait whose
          // time is already up (wait 0) continues in the same turn. The sim clock is frozen
          // inside a tick, so a positive wait still has to yield to the next tick.
          if (!(thread.isWarp() && this.nowMs() >= (frame.stmtMemory.targetTime as number))) {
            thread.status = 'yield'
            return
          }
        }

        if (this.nowMs() >= (frame.stmtMemory.targetTime as number)) {
          frame.stmtMemory = {}
          frame.pc++
          continue
        } else {
          this.requestRedraw()
          thread.status = 'yield'
          return
        }
      }

      if (stmt.opcode === 'control_wait_until') {
        const cond = toBoolean(
          this.evalExpr(stmt.inputs?.CONDITION, {
            target: thread.target,
            thread,
            warp: thread.isWarp(),
          }),
        )
        if (cond) {
          frame.pc++
          continue
        } else {
          thread.status = 'yield'
          return
        }
      }

      if (stmt.opcode === 'control_stop') {
        const opt = stmt.fields?.STOP_OPTION ?? 'this script'
        if (opt === 'all') {
          this.stopAll()
          return
        }
        if (opt === 'other scripts in sprite') {
          this.stopTarget(thread.target, thread)
          frame.pc++
          continue
        }
        if (opt === 'this script') {
          // P06: unwind up to the nearest procedures_call
          let procIdx = -1
          for (let i = thread.stack.length - 1; i >= 0; i--) {
            if (thread.stack[i].isProcedure) {
              procIdx = i
              break
            }
          }
          if (procIdx >= 0) {
            thread.stack.length = procIdx
            if (thread.stack.length === 0) {
              thread.done = true
              thread.status = 'done'
              return
            }
            continue
          } else {
            // P07: top level
            thread.stack = []
            thread.done = true
            thread.status = 'done'
            return
          }
        }
      }

      if (stmt.opcode === 'procedures_call') {
        const brick = this.world.bricks[thread.target.brickId]
        const proc = brick?.program.procedures.find((p) => p.proccode === stmt.call?.proccode)
        if (!proc) {
          // P03: missing procedure definition is a no-op
          frame.pc++
          continue
        }

        const evaluatedParams: Record<string, Value> = {}
        for (const argName of proc.argumentNames) {
          if (stmt.inputs && argName in stmt.inputs) {
            evaluatedParams[argName] = this.evalExpr(stmt.inputs[argName], {
              target: thread.target,
              thread,
              warp: thread.isWarp(),
            })
          } else {
            evaluatedParams[argName] = ''
          }
        }

        const isWarp = thread.isWarp() || proc.warp
        const isRecursive = thread.stack.some((f) => f.proccode === proc.proccode)

        frame.pc++
        const procFrame: ExecutionFrame = {
          statements: proc.body,
          pc: 0,
          isProcedure: true,
          proccode: proc.proccode,
          params: evaluatedParams,
          warp: isWarp,
        }
        thread.stack.push(procFrame)

        if (!isWarp && isRecursive) {
          // P04: normal-mode detected recursive calls yield and request redraw
          this.requestRedraw()
          thread.status = 'yield'
          return
        }
        continue
      }

      if (stmt.opcode === 'event_broadcast') {
        let msg = ''
        if (stmt.inputs?.BROADCAST_INPUT) {
          msg = toString(
            this.evalExpr(stmt.inputs.BROADCAST_INPUT, {
              target: thread.target,
              thread,
              warp: thread.isWarp(),
            }),
          )
        } else if (stmt.fields?.BROADCAST_OPTION) {
          msg = stmt.fields.BROADCAST_OPTION
        }
        this.broadcast(msg)
        frame.pc++
        continue
      }

      if (stmt.opcode === 'event_broadcastandwait') {
        frame.stmtMemory = frame.stmtMemory ?? {}
        if (!frame.stmtMemory.waitingThreadIds && !frame.stmtMemory.waitingThreads) {
          let msg = ''
          if (stmt.inputs?.BROADCAST_INPUT) {
            msg = toString(
              this.evalExpr(stmt.inputs.BROADCAST_INPUT, {
                target: thread.target,
                thread,
                warp: thread.isWarp(),
              }),
            )
          } else if (stmt.fields?.BROADCAST_OPTION) {
            msg = stmt.fields.BROADCAST_OPTION
          }
          const receivers = this.broadcast(msg)
          if (receivers.length === 0) {
            frame.pc++
            continue
          }
          frame.stmtMemory.waitingThreadIds = receivers.map((r) => r.id)
          thread.status = 'yield'
          return
        }

        const waitingIds = (frame.stmtMemory.waitingThreadIds ??
          (frame.stmtMemory.waitingThreads as ThreadHandle[] | undefined)?.map((t) => t.id) ??
          []) as number[]
        const stillActive = this._threads.some((t) => waitingIds.includes(t.id) && !t.done)
        if (stillActive) {
          thread.status = 'yield'
          return
        }
        frame.stmtMemory = {}
        frame.pc++
        continue
      }

      // External / Primitive blocks
      const evaluatedArgs: Record<string, Value> = {}
      if (stmt.inputs) {
        for (const [name, inputExpr] of Object.entries(stmt.inputs)) {
          evaluatedArgs[name] = this.evalExpr(inputExpr, {
            target: thread.target,
            thread,
            warp: thread.isWarp(),
          })
        }
      }

      const prim = this.primitives[stmt.opcode]
      if (prim) {
        frame.stmtMemory = frame.stmtMemory ?? {}
        const primCtx: PrimitiveCtx = {
          target: thread.target,
          runtime: this,
          thread,
          arg: (name: string) => evaluatedArgs[name] ?? '',
          field: (name: string) => stmt.fields?.[name] ?? '',
          frame: frame.stmtMemory,
          warp: thread.isWarp(),
        }
        const result = prim(primCtx)
        if (result === YIELD) {
          thread.status = 'yield'
          return
        }
        if ((result as unknown) === YIELD_TICK) {
          thread.status = 'yield_tick'
          return
        }
      }

      frame.stmtMemory = {}
      frame.pc++
    }

    if (thread.stack.length === 0) {
      thread.done = true
      thread.status = 'done'
    }
  }
}
