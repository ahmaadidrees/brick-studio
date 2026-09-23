import type { TickSnapshot } from '../run/types'
import { IR_LIMITS, SENSOR_MAX_RANGE_STUDS, type BlockDiagnostic, type DiagnosticCode, type Expr } from '../program/types'

/**
 * Bounded expression evaluation. Every node costs one op from the fiber's budget; running
 * out throws a `budget` fault. Values are finite numbers or booleans. A non-finite result
 * is a fault, never a silent Infinity; dividing by zero gives 0 with an info note.
 */
export type RuntimeValue = number | boolean

export type FaultKind = 'budget' | 'non-finite' | 'variables' | 'controller-waits'

export class RuntimeFault extends Error {
  constructor(readonly kind: FaultKind, readonly code: DiagnosticCode, message: string, readonly blockId: string | undefined) {
    super(message)
    this.name = 'RuntimeFault'
  }
}

export type EvalContext = {
  snapshot: TickSnapshot
  variables: Map<string, RuntimeValue>
  /** Ops left for this fiber this tick. */
  budget: { remaining: number }
  /** The block being evaluated, so a fault points at it. */
  blockId?: string
  /** Notes raised while evaluating (the runtime de-duplicates them). */
  notes: BlockDiagnostic[]
  scriptId: string
}

export function spend(ctx: EvalContext, blockId?: string) {
  if (blockId) ctx.blockId = blockId
  ctx.budget.remaining -= 1
  if (ctx.budget.remaining < 0) throw new RuntimeFault('budget', 'runtime.budget-exceeded', 'This script does too much in one instant. Add a wait, or make it smaller.', ctx.blockId)
}

export const toNumber = (value: RuntimeValue): number => (typeof value === 'boolean' ? (value ? 1 : 0) : value)
export const toBoolean = (value: RuntimeValue): boolean => (typeof value === 'boolean' ? value : value !== 0)

export function finite(value: number, ctx: EvalContext): number {
  if (!Number.isFinite(value)) throw new RuntimeFault('non-finite', 'runtime.non-finite', 'This math made a number too big to use. Check the numbers in it.', ctx.blockId)
  return value
}

const reading = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const evalNumber = (expr: Expr, ctx: EvalContext): number => toNumber(evalExpr(expr, ctx))
export const evalBoolean = (expr: Expr, ctx: EvalContext): boolean => toBoolean(evalExpr(expr, ctx))

/** True when the sensor has a hit closer than `studs`. A sensor with no reading sees nothing. */
export function sensorSees(snapshot: TickSnapshot, deviceId: string, studs: number): boolean {
  const sample = snapshot.sensors[deviceId]
  return Boolean(sample?.hit) && reading(sample?.distanceStuds, SENSOR_MAX_RANGE_STUDS) < studs
}

export function evalExpr(expr: Expr, ctx: EvalContext): RuntimeValue {
  spend(ctx, expr.blockId)
  const { snapshot } = ctx
  switch (expr.kind) {
    case 'number': return finite(expr.value, ctx)
    case 'boolean': return expr.value
    case 'not': return !evalBoolean(expr.operand, ctx)
    case 'binary': {
      if (expr.op === 'and') return evalBoolean(expr.left, ctx) && evalBoolean(expr.right, ctx)
      if (expr.op === 'or') return evalBoolean(expr.left, ctx) || evalBoolean(expr.right, ctx)
      const left = evalExpr(expr.left, ctx)
      const right = evalExpr(expr.right, ctx)
      if (expr.op === '==' || expr.op === '!=') {
        const equal = typeof left === 'boolean' && typeof right === 'boolean' ? left === right : toNumber(left) === toNumber(right)
        return expr.op === '==' ? equal : !equal
      }
      const a = toNumber(left)
      const b = toNumber(right)
      ctx.blockId = expr.blockId ?? ctx.blockId
      switch (expr.op) {
        case '+': return finite(a + b, ctx)
        case '-': return finite(a - b, ctx)
        case '*': return finite(a * b, ctx)
        case '/':
          if (b === 0) {
            ctx.notes.push({ code: 'runtime.non-finite', severity: 'info', message: 'Dividing by zero counts as 0 here.', blockId: expr.blockId ?? ctx.blockId ?? null, scriptId: ctx.scriptId })
            return 0
          }
          return finite(a / b, ctx)
        case '<': return a < b
        case '<=': return a <= b
        case '>': return a > b
        case '>=': return a >= b
        case 'min': return Math.min(a, b)
        case 'max': return Math.max(a, b)
      }
      return 0
    }
    case 'sensorDistance': return reading(snapshot.sensors[expr.deviceId]?.distanceStuds, SENSOR_MAX_RANGE_STUDS)
    case 'sensorSees': {
      const within = evalNumber(expr.withinStuds, ctx)
      return sensorSees(snapshot, expr.deviceId, within)
    }
    case 'motorPosition': return reading(snapshot.motors[expr.deviceId]?.positionDegrees, 0)
    case 'motorSpeed': return reading(snapshot.motors[expr.deviceId]?.speedPercent, 0)
    case 'buttonPressed': return snapshot.buttons[expr.deviceId] === true
    case 'joystick': return clamp(reading(snapshot.input.joystick[expr.axis], 0), -100, 100)
    case 'keyHeld': return snapshot.input.held[expr.key] === true
    case 'timer': return reading(snapshot.timeSeconds, 0)
    case 'variable': return ctx.variables.get(expr.name) ?? 0
  }
}

/** Variables are shared by every script of a run, at most `IR_LIMITS.maxVariables` names. */
export function setVariable(ctx: EvalContext, name: string, value: RuntimeValue) {
  if (!ctx.variables.has(name) && ctx.variables.size >= IR_LIMITS.maxVariables) {
    throw new RuntimeFault('variables', 'runtime.budget-exceeded', `A program can use ${IR_LIMITS.maxVariables} variables. Reuse some.`, ctx.blockId)
  }
  ctx.variables.set(name, typeof value === 'boolean' ? value : finite(value, ctx))
}
