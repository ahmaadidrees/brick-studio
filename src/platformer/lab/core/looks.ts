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
function wrapCostumeIndex(index: number, length: number): number {
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

/**
 * Resolve a costume or backdrop request.
 * Numbers are 1-based indexes unless `zeroIndex` is set (next/previous blocks).
 * Strings try an exact name, then the words in `relative`, then a numeric index.
 * Returns false when the request does not name a costume.
 */
function resolveCostume(
  runtime: RuntimeApi,
  target: Target,
  requested: unknown,
  relative: { next: string; previous: string },
  zeroIndex: boolean,
): boolean {
  const costumes = costumesOf(runtime.world, target)
  if (costumes.length === 0) return false
  if (typeof requested === 'number') {
    setCostumeIndex(runtime, target, zeroIndex ? requested : requested - 1)
    return true
  }
  const name = String(requested)
  const named = indexByName(costumes, name)
  if (named !== -1) {
    setCostumeIndex(runtime, target, named)
    return true
  }
  if (name === relative.next) {
    setCostumeIndex(runtime, target, target.costumeIndex + 1)
    return true
  }
  if (name === relative.previous) {
    setCostumeIndex(runtime, target, target.costumeIndex - 1)
    return true
  }
  if (!(Number.isNaN(Number(name)) || isWhiteSpace(name))) {
    const n = Number(name)
    setCostumeIndex(runtime, target, zeroIndex ? n : n - 1)
    return true
  }
  return false
}

function randomExcept(runtime: RuntimeApi, upper: number, excluded: number): number {
  const pick = Math.floor(runtime.random() * upper)
  return pick >= excluded ? pick + 1 : pick
}

/** Switch the stage backdrop and start the matching hats. Returns the hat threads. */
function switchBackdrop(ctx: PrimitiveCtx, requested: unknown, zeroIndex = false): ThreadHandle[] {
  const runtime = ctx.runtime
  const stage = runtime.world.stage
  const costumes = costumesOf(runtime.world, stage)
  if (costumes.length === 0) return []
  if (requested === 'random backdrop' && costumes.length > 1) {
    setCostumeIndex(runtime, stage, randomExcept(runtime, costumes.length - 1, stage.costumeIndex))
  } else if (requested !== 'random backdrop') {
    resolveCostume(runtime, stage, requested, { next: 'next backdrop', previous: 'previous backdrop' }, zeroIndex)
  }
  const name = costumes[stage.costumeIndex]?.name ?? ''
  runtime.emit({ kind: 'backdrop', name })
  return runtime.startHats('event_whenbackdropswitchesto', { fields: { BACKDROP: name } })
}

function formatBubble(text: unknown): string {
  if (text === '') return ''
  const shown =
    typeof text === 'number' && Math.abs(text) >= 0.01 && text % 1 !== 0 ? text.toFixed(2) : String(text)
  return shown.slice(0, BUBBLE_LIMIT)
}

function nextBubbleId(target: Target): number {
  const id = (bubbleIds.get(target) ?? 0) + 1
  bubbleIds.set(target, id)
  return id
}

function showBubble(runtime: RuntimeApi, target: Target, kind: 'say' | 'think', text: unknown): number {
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
  const stageW = world.bounds.right - world.bounds.left
  const stageH = world.bounds.top - world.bounds.bottom
  const minScale = Math.min(1, Math.max(5 / w, 5 / h))
  const maxScale = Math.min((1.5 * stageW) / w, (1.5 * stageH) / h)
  return Math.min(Math.max(percent / 100, minScale), maxScale) * 100
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

/** Green flag clears graphic effects only. Bubbles, size, costume, and position stay. */
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
    resolveCostume(ctx.runtime, ctx.target, read(ctx, 'COSTUME'), { next: 'next costume', previous: 'previous costume' }, false)
  },

  looks_nextcostume(ctx) {
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
    return costumeLabel(ctx.runtime.world, ctx.target, read(ctx, 'NUMBER_NAME'))
  },

  looks_backdropnumbername(ctx) {
    return costumeLabel(ctx.runtime.world, ctx.runtime.world.stage, read(ctx, 'NUMBER_NAME'))
  },

  looks_size(ctx) {
    return Math.round(ctx.target.size)
  },
}
