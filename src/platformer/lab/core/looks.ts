/**
 * Looks primitives (Scratch opcodes `looks_*`).
 *
 * Costumes, size, effects, layers, and say/think bubbles. Backdrop switches emit a
 * `backdrop` note and start `event_whenbackdropswitchesto`. Timed say/think yields
 * until `runtime.nowMs()` passes the deadline. No drawing happens here.
 */
import { costumeOf } from './geometry'
import { EFFECT_NAMES, YIELD } from './contracts'
import type {
  Costume,
  EffectName,
  PrimitiveCtx,
  PrimitiveTable,
  RuntimeApi,
  Target,
  ThreadHandle,
  World,
} from './contracts'

const BUBBLE_LIMIT = 330

const bubbleIds = new WeakMap<Target, number>()

function asNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : value
  const n = Number(value)
  return Number.isNaN(n) ? 0 : n
}

function read(ctx: PrimitiveCtx, name: string): unknown {
  const value = ctx.arg(name)
  return value !== '' ? value : ctx.field(name)
}

function isWhiteSpace(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length === 0
}

function costumesOf(world: World, target: Target): Costume[] {
  return world.bricks[target.brickId]?.costumes ?? []
}

function redraw(runtime: RuntimeApi, target: Target): void {
  if (target.visible) runtime.requestRedraw()
}

/** 0-based costume index wrapped into the costume list. Non-finite indexes become 0. */
export function wrapCostumeIndex(index: number, length: number): number {
  if (!(length > 0)) return 0
  const rounded = Math.round(index)
  if (!Number.isFinite(rounded)) return 0
  return rounded - Math.floor(rounded / length) * length
}

function indexByName(costumes: Costume[], name: string): number {
  for (let i = 0; i < costumes.length; i++) {
    if (costumes[i].name === name) return i
  }
  return -1
}

function setCostumeIndex(runtime: RuntimeApi, target: Target, index: number): void {
  const costumes = costumesOf(runtime.world, target)
  if (costumes.length === 0) return
  target.costumeIndex = wrapCostumeIndex(index, costumes.length)
  redraw(runtime, target)
}

function pickRandomExcept(runtime: RuntimeApi, count: number, excluded: number): number {
  if (count <= 1) return 0
  const pick = Math.floor(runtime.random() * (count - 1))
  return pick >= excluded ? pick + 1 : pick
}

interface RelativeOptions {
  next?: string
  previous?: string
  random?: string
}

/**
 * Resolve and apply a costume or backdrop change request according to L01 semantics:
 * 1. Numbers are 1-based indexes (or 0-based relative deltas when zeroIndex is true).
 * 2. String inputs try:
 *    a. Exact case-sensitive costume name
 *    b. Relative keywords (next / previous / random)
 *    c. Non-whitespace numeric string conversion (1-based)
 * Returns true if a valid costume was identified and applied.
 */
function resolveCostume(
  runtime: RuntimeApi,
  target: Target,
  requested: unknown,
  relative: RelativeOptions,
  zeroIndex: boolean,
): boolean {
  const costumes = costumesOf(runtime.world, target)
  if (costumes.length === 0) return false

  if (typeof requested === 'number') {
    setCostumeIndex(runtime, target, zeroIndex ? requested : requested - 1)
    return true
  }

  const name = String(requested)

  // 1. Exact match by name
  const exactIndex = indexByName(costumes, name)
  if (exactIndex !== -1) {
    setCostumeIndex(runtime, target, exactIndex)
    return true
  }

  // 2. Relative keywords
  if (relative.next && name === relative.next) {
    setCostumeIndex(runtime, target, target.costumeIndex + 1)
    return true
  }
  if (relative.previous && name === relative.previous) {
    setCostumeIndex(runtime, target, target.costumeIndex - 1)
    return true
  }
  if (relative.random && name === relative.random) {
    setCostumeIndex(runtime, target, pickRandomExcept(runtime, costumes.length, target.costumeIndex))
    return true
  }

  // 3. Numeric string
  if (!isWhiteSpace(name)) {
    const parsed = Number(name)
    if (!Number.isNaN(parsed)) {
      setCostumeIndex(runtime, target, zeroIndex ? parsed : parsed - 1)
      return true
    }
  }

  return false
}

/** Switch the stage backdrop and start matching hats if the backdrop changed/matched. */
function switchBackdrop(ctx: PrimitiveCtx, requested: unknown, zeroIndex = false): ThreadHandle[] {
  const runtime = ctx.runtime
  const stage = runtime.world.stage
  const costumes = costumesOf(runtime.world, stage)
  if (costumes.length === 0) return []

  const matched = resolveCostume(
    runtime,
    stage,
    requested,
    { next: 'next backdrop', previous: 'previous backdrop', random: 'random backdrop' },
    zeroIndex,
  )
  if (!matched) return []

  const name = costumes[stage.costumeIndex]?.name ?? ''
  runtime.emit({ kind: 'backdrop', name })
  return runtime.startHats('event_whenbackdropswitchesto', { fields: { BACKDROP: name } })
}

export function formatBubble(text: unknown): string {
  if (text === '') return ''
  let shown: string
  if (typeof text === 'number') {
    shown = Number.isFinite(text) ? String(parseFloat(text.toFixed(2))) : String(text)
  } else {
    shown = String(text)
  }
  return shown.slice(0, BUBBLE_LIMIT)
}

function nextBubbleId(target: Target): number {
  const id = (bubbleIds.get(target) ?? 0) + 1
  bubbleIds.set(target, id)
  return id
}

function showBubble(runtime: RuntimeApi, target: Target, kind: 'say' | 'think', text: unknown): number {
  if (target.isStage) return 0
  const id = nextBubbleId(target)
  const shown = formatBubble(text)
  target.bubble = shown === '' ? null : { kind, text: shown }
  redraw(runtime, target)
  return id
}

function clearBubble(runtime: RuntimeApi, target: Target): void {
  nextBubbleId(target)
  if (!target.bubble) return
  target.bubble = null
  redraw(runtime, target)
}

function sayFor(ctx: PrimitiveCtx, kind: 'say' | 'think') {
  if (ctx.target.isStage) return
  if (ctx.frame.bubbleId === undefined) {
    const raw = Number(read(ctx, 'SECS'))
    const ms = Number.isFinite(raw) && raw > 0 ? raw * 1000 : 0
    ctx.frame.bubbleId = showBubble(ctx.runtime, ctx.target, kind, read(ctx, 'MESSAGE'))
    ctx.frame.endMs = ctx.runtime.nowMs() + ms
    return YIELD
  }
  if (ctx.runtime.nowMs() < (ctx.frame.endMs as number)) return YIELD
  if (bubbleIds.get(ctx.target) === ctx.frame.bubbleId) clearBubble(ctx.runtime, ctx.target)
}

/** Percent size clamped from the costume and the level, the way a 480×360 stage clamps to 5..540 on a 100×100 costume. */
export function clampSize(world: World, target: Target, percent: number): number {
  const costume = costumeOf(world, target)
  const w = costume?.width ?? 0
  const h = costume?.height ?? 0
  if (!(w > 0 && h > 0)) return percent
  const stageW = world.bounds.right - world.bounds.left
  const stageH = world.bounds.top - world.bounds.bottom
  const minScale = Math.min(1, Math.max(5 / w, 5 / h))
  const maxScale = Math.min((1.5 * stageW) / w, (1.5 * stageH) / h)
  const minPercent = minScale * 100
  const maxPercent = maxScale * 100
  return Math.min(Math.max(percent, minPercent), maxPercent)
}

function setSize(runtime: RuntimeApi, target: Target, percent: number): void {
  if (target.isStage) return
  target.size = clampSize(runtime.world, target, percent)
  redraw(runtime, target)
}

const EFFECT_LIMITS: Partial<Record<EffectName, { min: number; max: number }>> = {
  ghost: { min: 0, max: 100 },
  brightness: { min: -100, max: 100 },
}

function isEffect(name: string): name is EffectName {
  return (EFFECT_NAMES as readonly string[]).includes(name)
}

function clampEffect(name: EffectName, value: number): number {
  const limit = EFFECT_LIMITS[name]
  if (!limit) return value
  return Math.min(limit.max, Math.max(limit.min, value))
}

export function clearGraphicEffects(target: Target): void {
  for (const name of EFFECT_NAMES) target.effects[name] = 0
}

/** Green flag clears graphic effects only. Bubbles are cleared if the scheduler invokes onStopAllLooks prior to onGreenFlagLooks. */
export function onGreenFlagLooks(runtime: RuntimeApi): void {
  for (const target of [runtime.world.stage, ...runtime.world.targets]) {
    clearGraphicEffects(target)
    redraw(runtime, target)
  }
}

/** Stop-all clears graphic effects and bubbles. */
export function onStopAllLooks(runtime: RuntimeApi): void {
  onGreenFlagLooks(runtime)
  for (const target of [runtime.world.stage, ...runtime.world.targets]) clearBubble(runtime, target)
}

/**
 * Move `target` within the back-to-front list. Positive delta moves toward the front
 * (the end of the array). The index is truncated the way `Array.splice` truncates.
 * Layer changes do not request a redraw; the host paints the list every tick.
 */
export function shiftLayer(targets: Target[], target: Target, delta: number): void {
  const oldIndex = targets.indexOf(target)
  if (oldIndex < 0) return
  targets.splice(oldIndex, 1)
  let newIndex = oldIndex + delta
  if (newIndex > targets.length) newIndex = targets.length
  if (!(newIndex > 0)) newIndex = 0
  const at = Number.isFinite(newIndex) ? Math.trunc(newIndex) : targets.length
  targets.splice(Math.max(0, Math.min(targets.length, at)), 0, target)
}

function costumeLabel(world: World, target: Target, which: unknown): number | string {
  const costumes = costumesOf(world, target)
  if (costumes.length === 0) return which === 'number' ? 0 : ''
  if (which === 'number') return target.costumeIndex + 1
  return costumes[target.costumeIndex]?.name ?? ''
}

export const looksPrimitives: PrimitiveTable = {
  looks_say(ctx) {
    showBubble(ctx.runtime, ctx.target, 'say', read(ctx, 'MESSAGE'))
  },

  looks_think(ctx) {
    showBubble(ctx.runtime, ctx.target, 'think', read(ctx, 'MESSAGE'))
  },

  looks_sayforsecs(ctx) {
    return sayFor(ctx, 'say')
  },

  looks_thinkforsecs(ctx) {
    return sayFor(ctx, 'think')
  },

  looks_switchcostumeto(ctx) {
    if (ctx.target.isStage) return
    resolveCostume(ctx.runtime, ctx.target, read(ctx, 'COSTUME'), { next: 'next costume', previous: 'previous costume' }, false)
  },

  looks_nextcostume(ctx) {
    if (ctx.target.isStage) return
    resolveCostume(ctx.runtime, ctx.target, ctx.target.costumeIndex + 1, { next: 'next costume', previous: 'previous costume' }, true)
  },

  looks_switchbackdropto(ctx) {
    switchBackdrop(ctx, read(ctx, 'BACKDROP'))
  },

  looks_switchbackdroptoandwait(ctx) {
    if (ctx.frame.armed !== true) {
      ctx.frame.threads = switchBackdrop(ctx, read(ctx, 'BACKDROP'))
      ctx.frame.armed = true
      if ((ctx.frame.threads as ThreadHandle[]).length === 0) return
    }
    const threads = ctx.frame.threads as ThreadHandle[]
    if (threads.some((thread) => !thread.done)) return YIELD
  },

  looks_nextbackdrop(ctx) {
    const stage = ctx.runtime.world.stage
    switchBackdrop(ctx, stage.costumeIndex + 1, true)
  },

  looks_changesizeby(ctx) {
    setSize(ctx.runtime, ctx.target, ctx.target.size + asNumber(read(ctx, 'CHANGE')))
  },

  looks_setsizeto(ctx) {
    setSize(ctx.runtime, ctx.target, asNumber(read(ctx, 'SIZE')))
  },

  looks_changeeffectby(ctx) {
    const name = String(read(ctx, 'EFFECT')).toLowerCase()
    if (!isEffect(name)) return
    const next = clampEffect(name, ctx.target.effects[name] + asNumber(read(ctx, 'CHANGE')))
    ctx.target.effects[name] = next
    redraw(ctx.runtime, ctx.target)
  },

  looks_seteffectto(ctx) {
    const name = String(read(ctx, 'EFFECT')).toLowerCase()
    if (!isEffect(name)) return
    ctx.target.effects[name] = clampEffect(name, asNumber(read(ctx, 'VALUE')))
    redraw(ctx.runtime, ctx.target)
  },

  looks_cleargraphiceffects(ctx) {
    clearGraphicEffects(ctx.target)
    redraw(ctx.runtime, ctx.target)
  },

  looks_show(ctx) {
    if (ctx.target.isStage) return
    ctx.target.visible = true
    ctx.runtime.requestRedraw()
  },

  looks_hide(ctx) {
    if (ctx.target.isStage) return
    ctx.target.visible = false
  },

  looks_gotofrontback(ctx) {
    if (ctx.target.isStage) return
    const front = String(read(ctx, 'FRONT_BACK')) === 'front'
    shiftLayer(ctx.runtime.world.targets, ctx.target, front ? Infinity : -Infinity)
  },

  looks_goforwardbackwardlayers(ctx) {
    if (ctx.target.isStage) return
    const layers = asNumber(read(ctx, 'NUM'))
    const forward = String(read(ctx, 'FORWARD_BACKWARD')) === 'forward'
    shiftLayer(ctx.runtime.world.targets, ctx.target, forward ? layers : -layers)
  },

  looks_costumenumbername(ctx) {
    if (ctx.target.isStage) return read(ctx, 'NUMBER_NAME') === 'number' ? 0 : ''
    return costumeLabel(ctx.runtime.world, ctx.target, read(ctx, 'NUMBER_NAME'))
  },

  looks_backdropnumbername(ctx) {
    return costumeLabel(ctx.runtime.world, ctx.runtime.world.stage, read(ctx, 'NUMBER_NAME'))
  },

  looks_size(ctx) {
    return Math.round(ctx.target.size)
  },
}
