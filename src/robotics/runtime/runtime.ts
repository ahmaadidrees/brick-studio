import type { ActuatorIntent, ProgramRuntime, RuntimeTickResult, TickSnapshot } from '../run/types'
import { IR_LIMITS, PROGRAM_KEYS, SEES_SOMETHING_STUDS, isControllerTrigger, type BlockDiagnostic, type Expr, type ProgramIR, type ProgramKey, type Script, type Stmt } from '../program/types'
import { RuntimeFault, evalBoolean, evalExpr, evalNumber, finite, sensorSees, setVariable, spend, toNumber, type EvalContext, type RuntimeValue } from './evaluate'

/**
 * The program runtime (contract §8, CP2-PLAN §4): runs a compiled `ProgramIR` one fixed
 * step at a time. Synchronous and deterministic: time is the tick count, never a clock.
 *
 * - `when run` scripts start on the first tick. Event hats (`sensorSees` within
 *   `SEES_SOMETHING_STUDS`, `buttonPressed`, `keyPressed`) start their script on a rising
 *   edge; a trigger that arrives while that script is still running is ignored.
 * - Autonomous scripts run first, in script order. `wait s` sleeps `max(1, round(s / fixedStep))`
 *   ticks; `wait until` re-checks once per tick against the fresh snapshot; `forever`
 *   yields at its back edge (one pass per tick); `repeat` does not yield. They share a
 *   budget of `IR_LIMITS.maxOpsPerTick` per tick, split evenly: a script that spends its
 *   share is paused and resumes next tick, unless it finished no statement at all, which
 *   means it can never finish, so it stops with an error.
 * - Controller scripts (`joystickMoves`: every tick the joystick is off centre plus the
 *   tick it returns to centre; `controlsUpdate`: every tick) run after all the others,
 *   from the top, to completion, each with its own budget. One that would wait, loop
 *   forever or run out of budget is switched off for the rest of the run and its output
 *   for that tick is dropped.
 * - Actuator commands latch: an intent is emitted only when a statement executes, never
 *   re-sent. A script that ends leaves its motors as they are; a script that faults
 *   brakes the motors it commanded. `stop motors` stops every motor in the snapshot.
 * - Each diagnostic is reported once per run. After `stop()` a tick returns nothing.
 */
export type RuntimeOptions = { fixedStep: number }

type Frame =
  | { kind: 'block'; stmts: Stmt[]; index: number }
  | { kind: 'repeat'; stmts: Stmt[]; index: number; remaining: number; blockId?: string }
  | { kind: 'forever'; stmts: Stmt[]; index: number; blockId?: string }

type FiberState = 'ready' | 'sleeping' | 'waiting' | 'done' | 'errored'

type Fiber = {
  stack: Frame[]
  state: FiberState
  wakeTick: number
  until: Expr | null
  /** The block it is on: executing, waiting at, or last executed. */
  blockId: string
  /** Statements finished in the current turn (a paused fiber must have made progress). */
  completed: number
}

type Slot = {
  script: Script
  controller: boolean
  fiber: Fiber | null
  /** Last value of an edge-triggered hat. */
  edge: boolean
  /** `joystickMoves`: was the joystick off centre last tick. */
  offCentre: boolean
  /** A controller script that faulted stays off for the rest of the run. */
  off: boolean
  /** Motors this script has commanded, braked if it faults. */
  motors: Set<string>
}

type Emit = (intent: ActuatorIntent) => void

const alive = (fiber: Fiber | null): fiber is Fiber => fiber !== null && (fiber.state === 'ready' || fiber.state === 'sleeping' || fiber.state === 'waiting')
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function newFiber(script: Script): Fiber {
  return { stack: [{ kind: 'block', stmts: script.body, index: 0 }], state: 'ready', wakeTick: 0, until: null, blockId: script.hatBlockId, completed: 0 }
}

function controllerWaits(what: 'wait' | 'loop', blockId: string | undefined): RuntimeFault {
  return new RuntimeFault('controller-waits', 'program.controller-waits', what === 'wait'
    ? 'This script runs all at once, many times a second, so it can’t wait. Use “if” instead, or move this block under “when run”.'
    : 'This script already runs again and again, so it can’t loop forever. Take the blocks out of “forever”.', blockId)
}

class Runtime implements ProgramRuntime {
  private readonly slots: Slot[]
  private readonly fixedStep: number
  private readonly variables = new Map<string, RuntimeValue>()
  private readonly reported = new Set<string>()
  private readonly heldBefore: Record<ProgramKey, boolean> = { up: false, down: false, left: false, right: false, space: false }
  private ticks = 0
  private stopped = false

  constructor(ir: ProgramIR, options: RuntimeOptions) {
    this.fixedStep = Number.isFinite(options.fixedStep) && options.fixedStep > 0 ? options.fixedStep : 1 / 60
    this.slots = ir.scripts.slice(0, IR_LIMITS.maxScripts).map((script) => ({ script, controller: isControllerTrigger(script.trigger), fiber: null, edge: false, offCentre: false, off: false, motors: new Set() }))
  }

  stop() {
    this.stopped = true
    for (const slot of this.slots) slot.fiber = null
  }

  tick(snapshot: TickSnapshot): RuntimeTickResult {
    if (this.stopped) return { intents: [], activeBlockIds: [], diagnostics: [], variables: Object.fromEntries(this.variables), idle: true }
    const tick = this.ticks
    this.ticks += 1
    const intents: ActuatorIntent[] = []
    const notes: BlockDiagnostic[] = []
    const active: string[] = []

    this.startScripts(snapshot, tick)

    const live = this.slots.filter((slot) => !slot.controller && alive(slot.fiber))
    const share = live.length ? Math.max(1, Math.floor(IR_LIMITS.maxOpsPerTick / live.length)) : 0
    for (const slot of live) this.runAutonomous(slot, snapshot, tick, share, intents, notes)
    for (const slot of this.slots) if (!slot.controller && alive(slot.fiber)) active.push(slot.fiber.blockId)

    for (const slot of this.slots) {
      if (!slot.controller || slot.off || !this.controllerDue(slot, snapshot)) continue
      if (this.runController(slot, snapshot, tick, intents, notes)) active.push(slot.script.hatBlockId)
    }

    return {
      intents,
      activeBlockIds: [...new Set(active)],
      diagnostics: this.fresh(notes),
      variables: Object.fromEntries(this.variables),
      idle: this.slots.every((slot) => slot.script.trigger.kind === 'run' ? !alive(slot.fiber) : slot.controller && slot.off),
    }
  }

  /** `when run` on the first tick; event hats on a rising edge, unless their script is still running. */
  private startScripts(snapshot: TickSnapshot, tick: number) {
    const pressed = new Set(Array.isArray(snapshot.input?.pressed) ? snapshot.input.pressed : [])
    const held = snapshot.input?.held ?? this.heldBefore
    for (const slot of this.slots) {
      if (slot.controller) continue
      const trigger = slot.script.trigger
      let fire = false
      switch (trigger.kind) {
        case 'run':
          fire = tick === 0
          break
        case 'keyPressed':
          // `pressed` is already an edge; a key that went down between samples shows only as held.
          fire = pressed.has(trigger.key) || (held[trigger.key] === true && !this.heldBefore[trigger.key])
          break
        case 'sensorSees':
        case 'buttonPressed': {
          const value = trigger.kind === 'sensorSees' ? sensorSees(snapshot, trigger.deviceId, SEES_SOMETHING_STUDS) : snapshot.buttons?.[trigger.deviceId] === true
          fire = value && !slot.edge
          slot.edge = value
          break
        }
        default:
          break
      }
      if (fire && !alive(slot.fiber)) slot.fiber = newFiber(slot.script)
    }
    for (const key of PROGRAM_KEYS) this.heldBefore[key] = held[key] === true
  }

  private controllerDue(slot: Slot, snapshot: TickSnapshot): boolean {
    if (slot.script.trigger.kind === 'controlsUpdate') return true
    const axis = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)
    const offCentre = axis(snapshot.input?.joystick?.up) !== 0 || axis(snapshot.input?.joystick?.right) !== 0
    const due = offCentre || slot.offCentre
    slot.offCentre = offCentre
    return due
  }

  private context(slot: Slot, snapshot: TickSnapshot, budget: number, notes: BlockDiagnostic[], blockId: string): EvalContext {
    return { snapshot, variables: this.variables, budget: { remaining: budget }, blockId, notes, scriptId: slot.script.id }
  }

  private emitter(slot: Slot, sink: (intent: ActuatorIntent) => void): Emit {
    return (intent) => {
      if (intent.kind !== 'light') slot.motors.add(intent.deviceId)
      sink(intent)
    }
  }

  private runAutonomous(slot: Slot, snapshot: TickSnapshot, tick: number, share: number, intents: ActuatorIntent[], notes: BlockDiagnostic[]) {
    const fiber = slot.fiber!
    const ctx = this.context(slot, snapshot, share, notes, fiber.blockId)
    const emit = this.emitter(slot, (intent) => intents.push(intent))
    fiber.completed = 0
    try {
      if (fiber.state === 'sleeping' && tick >= fiber.wakeTick) fiber.state = 'ready'
      if (fiber.state === 'waiting' && fiber.until && evalBoolean(fiber.until, ctx)) {
        fiber.state = 'ready'
        fiber.until = null
      }
      if (fiber.state === 'ready') this.step(slot, fiber, ctx, snapshot, tick, emit)
    } catch (error) {
      // Out of budget after some progress: paused, resumes next tick where it stopped.
      if (error instanceof RuntimeFault && error.kind === 'budget' && fiber.completed > 0 && fiber.state === 'ready') return
      this.fault(slot, fiber, error, notes, emit)
    }
  }

  /** Runs a controller script from the top to completion; its output counts only if it finishes. */
  private runController(slot: Slot, snapshot: TickSnapshot, tick: number, intents: ActuatorIntent[], notes: BlockDiagnostic[]): boolean {
    const fiber = newFiber(slot.script)
    const staged: ActuatorIntent[] = []
    const ctx = this.context(slot, snapshot, IR_LIMITS.maxOpsPerTick, notes, fiber.blockId)
    try {
      this.step(slot, fiber, ctx, snapshot, tick, this.emitter(slot, (intent) => staged.push(intent)))
      if (fiber.state !== 'done') throw controllerWaits('wait', fiber.blockId)
    } catch (error) {
      slot.off = true
      this.fault(slot, fiber, error, notes, this.emitter(slot, (intent) => intents.push(intent)))
      return false
    }
    intents.push(...staged)
    return true
  }

  private fault(slot: Slot, fiber: Fiber, error: unknown, notes: BlockDiagnostic[], emit: Emit) {
    const fault = error instanceof RuntimeFault ? error : new RuntimeFault('non-finite', 'runtime.non-finite', 'This script hit a problem and stopped.', fiber.blockId)
    fiber.state = 'errored'
    fiber.until = null
    const blockId = fault.blockId ?? fiber.blockId
    notes.push({ code: fault.code, severity: 'error', message: fault.message, blockId, scriptId: slot.script.id })
    // A script that stops on a fault brakes what it was driving.
    for (const deviceId of slot.motors) emit({ kind: 'motorStop', deviceId, source: { scriptId: slot.script.id, blockId, controller: slot.controller } })
  }

  private ticksFor(seconds: number): number {
    if (!Number.isFinite(seconds) || seconds <= 0) return 1
    return Math.max(1, Math.round(seconds / this.fixedStep))
  }

  /** Runs `fiber` until it yields, finishes or runs out of budget (a thrown `budget` fault). */
  private step(slot: Slot, fiber: Fiber, ctx: EvalContext, snapshot: TickSnapshot, tick: number, emit: Emit) {
    const controller = slot.controller
    const source = (blockId: string | undefined) => ({ scriptId: slot.script.id, ...(blockId ? { blockId } : {}), controller })
    for (;;) {
      const frame = fiber.stack[fiber.stack.length - 1]
      if (!frame) {
        fiber.state = 'done'
        return
      }
      if (frame.index >= frame.stmts.length) {
        if (frame.kind === 'block') {
          fiber.stack.pop()
          continue
        }
        spend(ctx, frame.blockId)
        if (frame.kind === 'repeat') {
          frame.remaining -= 1
          if (frame.remaining > 0) frame.index = 0
          else fiber.stack.pop()
          continue
        }
        // forever: back-edge yield, one pass per tick.
        if (controller) throw controllerWaits('loop', frame.blockId)
        frame.index = 0
        fiber.state = 'sleeping'
        fiber.wakeTick = tick + 1
        return
      }
      const stmt = frame.stmts[frame.index]
      spend(ctx, stmt.blockId)
      if (stmt.blockId) fiber.blockId = stmt.blockId
      switch (stmt.op) {
        case 'runMotor': {
          const percent = clamp(evalNumber(stmt.percent, ctx), -100, 100)
          emit({ kind: 'motorPower', deviceId: stmt.deviceId, percent, source: source(stmt.blockId) })
          break
        }
        case 'turnMotorTo': {
          const degrees = finite(evalNumber(stmt.degrees, ctx), ctx)
          emit({ kind: 'motorTarget', deviceId: stmt.deviceId, degrees, source: source(stmt.blockId) })
          break
        }
        case 'stopMotor':
          emit({ kind: 'motorStop', deviceId: stmt.deviceId, source: source(stmt.blockId) })
          break
        case 'stopAllMotors':
          for (const deviceId of Object.keys(snapshot.motors ?? {})) emit({ kind: 'motorStop', deviceId, source: source(stmt.blockId) })
          break
        case 'setLight':
          emit({ kind: 'light', deviceId: stmt.deviceId, color: stmt.color, source: source(stmt.blockId) })
          break
        case 'setVariable':
          setVariable(ctx, stmt.name, evalExpr(stmt.value, ctx))
          break
        case 'changeVariable': {
          const by = evalNumber(stmt.by, ctx)
          setVariable(ctx, stmt.name, toNumber(this.variables.get(stmt.name) ?? 0) + by)
          break
        }
        case 'if': {
          const branch = evalBoolean(stmt.condition, ctx) ? stmt.then : stmt.else ?? []
          frame.index += 1
          fiber.completed += 1
          fiber.stack.push({ kind: 'block', stmts: branch, index: 0 })
          continue
        }
        case 'repeat': {
          const count = clamp(Math.floor(evalNumber(stmt.count, ctx)), 0, IR_LIMITS.maxRepeatCount)
          frame.index += 1
          fiber.completed += 1
          if (count > 0 && stmt.body.length > 0) fiber.stack.push({ kind: 'repeat', stmts: stmt.body, index: 0, remaining: count, blockId: stmt.blockId })
          continue
        }
        case 'forever':
          if (controller) throw controllerWaits('loop', stmt.blockId)
          frame.index += 1
          fiber.completed += 1
          fiber.stack.push({ kind: 'forever', stmts: stmt.body, index: 0, blockId: stmt.blockId })
          continue
        case 'wait': {
          if (controller) throw controllerWaits('wait', stmt.blockId)
          const seconds = evalNumber(stmt.seconds, ctx)
          frame.index += 1
          fiber.completed += 1
          fiber.state = 'sleeping'
          fiber.wakeTick = tick + this.ticksFor(seconds)
          return
        }
        case 'waitUntil': {
          if (controller) throw controllerWaits('wait', stmt.blockId)
          const met = evalBoolean(stmt.condition, ctx)
          frame.index += 1
          fiber.completed += 1
          if (met) continue
          fiber.state = 'waiting'
          fiber.until = stmt.condition
          return
        }
        case 'stopScript':
          frame.index += 1
          fiber.completed += 1
          fiber.stack.length = 0
          fiber.state = 'done'
          return
      }
      frame.index += 1
      fiber.completed += 1
    }
  }

  /** Diagnostics not reported earlier in this run. */
  private fresh(notes: BlockDiagnostic[]): BlockDiagnostic[] {
    return notes.filter((note) => {
      const key = `${note.code}|${note.severity}|${note.blockId ?? ''}|${note.scriptId ?? ''}|${note.deviceId ?? ''}`
      if (this.reported.has(key)) return false
      this.reported.add(key)
      return true
    })
  }
}

export function createProgramRuntime(ir: ProgramIR, options: RuntimeOptions): ProgramRuntime {
  return new Runtime(ir, options)
}
