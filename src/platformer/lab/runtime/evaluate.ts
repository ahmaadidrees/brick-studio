import { SUB, TS } from '@brick-studio/platformer-core/engine/constants'
import type { DiagnosticCode, Expr, LabDiagnostic, MemScope } from '../program/types'
import { isTouching } from '../sim/contacts'
import { probe } from '../sim/physics'
import { findThing, resolveWho } from '../sim/things'
import type { Fiber, LabHost, LabWorld, Thing } from '../sim/types'

/*
 * Bounded expression evaluation (after src/robotics/runtime/evaluate.ts). Every node costs one op from the script's
 * budget; running out throws a `budget` fault the runtime turns into a pause or a message. Values are finite numbers
 * or booleans: a non-finite result is a fault, never a silent Infinity, and dividing by zero gives 0.
 */

export type Value = number | boolean

export class RuntimeFault extends Error {
  constructor(
    readonly kind: 'budget' | 'non-finite',
    readonly code: DiagnosticCode,
    message: string,
    readonly blockId: string | undefined,
  ) {
    super(message)
    this.name = 'RuntimeFault'
  }
}

export interface EvalContext {
  world: LabWorld
  host: LabHost
  me: Thing
  fiber: Fiber
  budget: { left: number }
  blockId?: string
  notes: LabDiagnostic[]
}

export function spend(ctx: EvalContext, blockId?: string) {
  if (blockId) ctx.blockId = blockId
  ctx.budget.left -= 1
  if (ctx.budget.left < 0) throw new RuntimeFault('budget', 'runtime.budget', 'This script does too much at once. Add a “wait”, or make it smaller.', ctx.blockId)
}

export const toNumber = (v: Value): number => (typeof v === 'boolean' ? (v ? 1 : 0) : v)
export const toBoolean = (v: Value): boolean => (typeof v === 'boolean' ? v : v !== 0)

export function finite(v: number, ctx: EvalContext): number {
  if (!Number.isFinite(v)) throw new RuntimeFault('non-finite', 'runtime.non-finite', 'This math made a number too big to use. Check the numbers in it.', ctx.blockId)
  return v
}

export const evalNumber = (e: Expr, ctx: EvalContext): number => toNumber(evalExpr(e, ctx))
export const evalBoolean = (e: Expr, ctx: EvalContext): boolean => toBoolean(evalExpr(e, ctx))

/** Whose memory. The player's is shared by every brick. */
export function memoryOf(ctx: Pick<EvalContext, 'world' | 'me'>, scope: MemScope): Record<string, number | boolean> | null {
  if (scope === 'my') return ctx.me.mem
  return findThing(ctx.world, ctx.world.playerId)?.mem ?? null
}

/** The world's own dice: a small LCG in the world's state, so a replay rolls the same numbers. */
export function nextRandom(w: LabWorld): number {
  w.seed = (Math.imul(w.seed, 1664525) + 1013904223) >>> 0
  return w.seed / 4294967296
}

const round2 = (v: number) => Math.round(v * 100) / 100

export function evalExpr(e: Expr, ctx: EvalContext): Value {
  spend(ctx, e.blockId)
  const { world: w, me } = ctx
  switch (e.kind) {
    case 'number':
      return finite(e.value, ctx)
    case 'boolean':
      return e.value
    case 'not':
      return !evalBoolean(e.operand, ctx)
    case 'binary': {
      if (e.op === 'and') return evalBoolean(e.left, ctx) && evalBoolean(e.right, ctx)
      if (e.op === 'or') return evalBoolean(e.left, ctx) || evalBoolean(e.right, ctx)
      const left = evalExpr(e.left, ctx)
      const right = evalExpr(e.right, ctx)
      if (e.op === '==' || e.op === '!=') {
        const equal = typeof left === 'boolean' && typeof right === 'boolean' ? left === right : toNumber(left) === toNumber(right)
        return e.op === '==' ? equal : !equal
      }
      const a = toNumber(left)
      const b = toNumber(right)
      ctx.blockId = e.blockId ?? ctx.blockId
      switch (e.op) {
        case '+':
          return finite(a + b, ctx)
        case '-':
          return finite(a - b, ctx)
        case '*':
          return finite(a * b, ctx)
        case '/':
          return b === 0 ? 0 : finite(a / b, ctx)
        case '<':
          return a < b
        case '<=':
          return a <= b
        case '>':
          return a > b
        case '>=':
          return a >= b
      }
      return 0
    }
    case 'random': {
      const lo = Math.ceil(evalNumber(e.low, ctx))
      const hi = Math.floor(evalNumber(e.high, ctx))
      const [a, b] = lo <= hi ? [lo, hi] : [hi, lo]
      return a + Math.floor(nextRandom(w) * (b - a + 1))
    }
    case 'keyHeld':
      return w.input.held[e.key] === true
    case 'onGround':
      return me.onGround
    case 'touching':
      return isTouching(w, ctx.host, me, e.target)
    case 'probe':
      return probe(w, me, e.what, e.where)
    case 'speed': {
      const vx = me.vx / SUB
      const up = -me.vy / SUB
      switch (e.dir) {
        case 'forward':
          return round2(vx * me.facing)
        case 'backward':
          return round2(-vx * me.facing)
        case 'right':
          return round2(vx)
        case 'left':
          return round2(-vx)
        case 'up':
          return round2(up)
        case 'down':
          return round2(-up)
      }
      return 0
    }
    case 'hasRider':
      return !!findThing(w, me.rider)
    case 'isRiding':
      return !!findThing(w, me.riding)
    case 'age':
      return round2((w.tick - me.born) / 60)
    case 'distance': {
      const other = resolveWho(w, me, ctx.fiber, e.who)
      if (!other) return 999
      const dx = other.x + other.w / 2 - (me.x + me.w / 2)
      const dy = other.y + other.h / 2 - (me.y + me.h / 2)
      return round2(Math.hypot(dx, dy) / TS)
    }
    case 'memory': {
      const mem = memoryOf(ctx, e.scope)
      return mem?.[e.name] ?? 0
    }
  }
}
