/**
 * Fixed-step 30 ticks/s accumulator (Decision 3).
 * Steps the core runtime at exactly 30 TPS while rendering can happen at any display rate (60 Hz, 120 Hz, etc.)
 * with linear interpolation between tick poses.
 *
 * Guarantees:
 * 1. Exactly 30 ticks across 1000 ms of simulation time.
 * 2. Capped catch-up delta to prevent the "spiral of death" on lag spikes.
 * 3. Pause / tab-hidden protection so resuming from a long pause executes no burst of catch-up ticks.
 */
import { TICKS_PER_SECOND, TICK_MS } from '../../core/contracts'

export { TICKS_PER_SECOND, TICK_MS }

const EPSILON = 1e-6

export interface AccumulatorOptions {
  /** Duration of one simulation tick in ms. Defaults to 1000 / 30. */
  tickMs?: number
  /** Maximum elapsed time (ms) counted in a single frame. Defaults to 3 ticks (100 ms). */
  maxDeltaMs?: number
}

export interface StepResult {
  /** Number of simulation ticks that must be executed this frame. */
  ticks: number
  /** Interpolation fraction in [0, 1) between previous tick state and current tick state. */
  alpha: number
}

export class FixedStepAccumulator {
  readonly tickMs: number
  readonly maxDeltaMs: number
  private accumulator = 0
  private lastTime: number | null = null
  private paused = false

  constructor(opts?: AccumulatorOptions) {
    this.tickMs = opts?.tickMs ?? TICK_MS
    this.maxDeltaMs = opts?.maxDeltaMs ?? this.tickMs * 3
  }

  /** Pause the accumulator (e.g. when document.hidden is true). */
  pause(): void {
    this.paused = true
    this.accumulator = 0
    this.lastTime = null
  }

  /** Resume the accumulator after a pause or tab-unhide. */
  resume(): void {
    this.paused = false
    this.accumulator = 0
    this.lastTime = null
  }

  /** Reset all timing state. */
  reset(): void {
    this.accumulator = 0
    this.lastTime = null
    this.paused = false
  }

  isPaused(): boolean {
    return this.paused
  }

  /**
   * Advance the accumulator to timestamp `nowMs`.
   * Returns `{ ticks, alpha }`:
   * - `ticks`: number of times `runtime.step()` should be called this frame.
   * - `alpha`: interpolation weight in [0, 1) for drawing.
   */
  advance(nowMs: number): StepResult {
    if (this.paused) {
      return { ticks: 0, alpha: 0 }
    }

    if (this.lastTime === null) {
      this.lastTime = nowMs
      return { ticks: 0, alpha: 0 }
    }

    let delta = nowMs - this.lastTime
    this.lastTime = nowMs

    if (delta < 0) {
      delta = 0
    } else if (delta > this.maxDeltaMs) {
      // Clamp burst / lag spikes to maxDeltaMs
      delta = this.maxDeltaMs
    }

    this.accumulator += delta

    let ticks = 0
    while (this.accumulator >= this.tickMs - EPSILON) {
      ticks++
      this.accumulator -= this.tickMs
    }
    if (this.accumulator < 0) {
      this.accumulator = 0
    }

    const alpha = Math.min(0.999999, Math.max(0, this.accumulator / this.tickMs))
    return { ticks, alpha }
  }

  /** Get remaining accumulator time in ms. */
  getRemainingMs(): number {
    return this.accumulator
  }
}
