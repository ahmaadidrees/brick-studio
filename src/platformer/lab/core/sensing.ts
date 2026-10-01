/**
 * Sensing primitives. Touching sprites, the level edge, and the mouse pointer go through `touching.ts`.
 * Touching-color opcodes exist and return false; color sampling is not in this wave.
 *
 * Ask handshake (S12–S13): `sensing_askandwait` enqueues a question and yields. The host calls
 * `submitAnswer(runtime, text)`, which sets `world.answer` and resolves the oldest waiting question.
 * Writing `world.answer` alone does not unblock the thread — an empty string is both the initial
 * answer and a legal reply. The next queued question is emitted as an `ask` note at submit time.
 * `resetAnswer` clears the shared answer (green flag). `clearQuestions` / `clearTargetQuestions`
 * drop queued asks (stop all / stop this target) and do not change `world.answer`.
 *
 * `sensing_current` reads `setHostClock`. The clock is already in Scratch units (month 1–12,
 * day of week 1=Sunday … 7=Saturday). With no clock, or an unknown menu, the reporter is 0.
 * Loudness is 0. Username is ''. There is no `Date` and no microphone in core.
 */
import { TICKS_PER_SECOND, TICK_MS, YIELD } from './contracts'
import type { BrickDef, Primitive, PrimitiveCtx, PrimitiveTable, RuntimeApi, Target, Value, World } from './contracts'
import { costumeOf } from './geometry'
import { targetsTouch, touchingEdge, touchingPoint } from './touching'

/** Target.dragging: dragged sprites are not touching candidates; they can still sense others (S02). */
export function setDragged(target: Target, dragging: boolean): void {
  target.dragging = dragging
}

export function isDragged(target: Target): boolean {
  return target.dragging === true
}

export interface HostClock {
  year: number
  month: number
  date: number
  /** 1 = Sunday … 7 = Saturday. */
  dayOfWeek: number
  hour: number
  minute: number
  second: number
}

const clocks = new WeakMap<World, HostClock>()

export function setHostClock(world: World, clock: HostClock | null): void {
  if (clock) clocks.set(world, clock)
  else clocks.delete(world)
}

export interface AskPrompt {
  targetId: string
  question: string
  /** Visibility of the asker when the question was enqueued, not when it is shown. */
  visible: boolean
  isStage: boolean
}

interface QueuedAsk extends AskPrompt {
  id: number
  state: 'waiting' | 'answered'
}

const askIdCounters = new WeakMap<World, number>()

function getNextAskId(world: World): number {
  const current = askIdCounters.get(world) ?? 1
  askIdCounters.set(world, current + 1)
  return current
}

const questions = new WeakMap<World, QueuedAsk[]>()

function asks(world: World): QueuedAsk[] {
  let queue = questions.get(world)
  if (!queue) {
    queue = []
    questions.set(world, queue)
  }
  return queue
}

function asText(value: Value): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return value ? 'true' : 'false'
}

/** Reporter/menu value. A non-empty input wins; otherwise the dropdown field. */
function menuString(ctx: PrimitiveCtx, name: string): string {
  const arg = ctx.arg(name)
  if (arg !== '') return asText(arg)
  return ctx.field(name)
}

function keyOption(ctx: PrimitiveCtx): Value {
  const arg = ctx.arg('KEY_OPTION')
  if (arg !== '') return arg
  return ctx.field('KEY_OPTION')
}

const SPECIAL_KEYS = new Set(['space', 'left arrow', 'right arrow', 'up arrow', 'down arrow', 'enter'])

/** Block argument → contract key name. Letters are lowercase to match `world.keysDown`. */
function toScratchKey(arg: Value): string {
  if (typeof arg === 'number' && Number.isFinite(arg)) {
    if (arg >= 48 && arg <= 90) return String.fromCharCode(arg).toLowerCase()
    if (arg === 32) return 'space'
    if (arg === 37) return 'left arrow'
    if (arg === 38) return 'up arrow'
    if (arg === 39) return 'right arrow'
    if (arg === 40) return 'down arrow'
  }
  let text = asText(arg)
  if (SPECIAL_KEYS.has(text)) return text
  if (text.length > 1) text = text[0] ?? ''
  if (text === ' ') return 'space'
  return text.toLowerCase()
}

function keyPressed(ctx: PrimitiveCtx): boolean {
  const option = keyOption(ctx)
  if (option === 'any') return ctx.runtime.world.keysDown.size > 0
  const key = toScratchKey(option)
  if (key === '') return false
  const down = ctx.runtime.world.keysDown
  if (down.has(key)) return true
  // Hosts that stored Scratch's uppercase letter still match.
  return key.length === 1 && down.has(key.toUpperCase())
}

export function activeQuestion(world: World): AskPrompt | null {
  const head = asks(world).find((item) => item.state === 'waiting')
  if (!head) return null
  return { targetId: head.targetId, question: head.question, visible: head.visible, isStage: head.isStage }
}

function emitAsk(runtime: RuntimeApi, item: AskPrompt): void {
  runtime.emit({ kind: 'ask', targetId: item.targetId, question: item.question })
}

/**
 * Host delivers an answer. Sets the shared `world.answer`, resolves the oldest waiting question,
 * and emits an `ask` note for the next one if the queue still has a waiter.
 */
export function submitAnswer(runtime: RuntimeApi, answer: string): void {
  const world = runtime.world
  world.answer = answer
  const head = asks(world).find((item) => item.state === 'waiting')
  if (!head) return
  head.state = 'answered'
  const next = asks(world).find((item) => item.state === 'waiting')
  if (next) emitAsk(runtime, next)
}

/** Green-flag answer reset. Does not drop the question queue (stop-all does that). */
export function resetAnswer(world: World): void {
  world.answer = ''
}

/** Stop-all: drop every queued question. Does not change `world.answer`. */
export function clearQuestions(runtime: RuntimeApi): void {
  questions.set(runtime.world, [])
}

/**
 * Stop-this-target: drop that target's queued questions. If the displayed question was one of them,
 * emit an `ask` note for the new head.
 */
export function clearTargetQuestions(runtime: RuntimeApi, target: Target): void {
  const world = runtime.world
  const queue = asks(world)
  const displayed = queue.find((item) => item.state === 'waiting')
  const removedDisplayed = displayed?.targetId === target.id
  const kept = queue.filter((item) => item.targetId !== target.id)
  questions.set(world, kept)
  if (!removedDisplayed) return
  const next = kept.find((item) => item.state === 'waiting')
  if (next) emitAsk(runtime, next)
}

function brickNamed(world: World, name: string): BrickDef | undefined {
  for (const brick of Object.values(world.bricks)) {
    if (!brick.isStage && brick.name === name) return brick
  }
  return undefined
}

const touchingObject: Primitive = (ctx) => {
  const menu = menuString(ctx, 'TOUCHINGOBJECTMENU')
  const world = ctx.runtime.world
  if (menu === '_mouse_') return touchingPoint(world, ctx.target, world.mouse.x, world.mouse.y)
  if (menu === '_edge_') return touchingEdge(world, ctx.target)
  if (!ctx.target.visible) return false
  const brick = brickNamed(world, menu)
  if (!brick) return false
  for (const other of world.targets) {
    if (other.brickId !== brick.id || other === ctx.target) continue
    if (!other.visible || isDragged(other)) continue
    if (targetsTouch(world, ctx.target, other)) return true
  }
  return false
}

const distanceTo: Primitive = (ctx) => {
  if (ctx.target.isStage) return 10000
  const menu = menuString(ctx, 'DISTANCETOMENU')
  let x: number
  let y: number
  if (menu === '_mouse_') {
    x = ctx.runtime.world.mouse.x
    y = ctx.runtime.world.mouse.y
  } else {
    const other = ctx.runtime.findOriginal(menu)
    if (!other || other.isStage) return 10000
    x = other.x
    y = other.y
  }
  const dx = ctx.target.x - x
  const dy = ctx.target.y - y
  return Math.sqrt(dx * dx + dy * dy)
}

function costumeNumber(world: World, target: Target): number {
  const brick = world.bricks[target.brickId]
  if (!brick || brick.costumes.length === 0) return 0
  return target.costumeIndex + 1
}

function costumeName(world: World, target: Target): Value {
  const costume = costumeOf(world, target)
  return costume ? costume.name : 0
}

/** Scalar variable on this target only. Stage globals are visible when the object is the stage. */
function lookupScalar(world: World, target: Target, name: string): Value | undefined {
  if (name === '') return undefined
  const brick = world.bricks[target.brickId]
  const decl = brick?.program.variables.find((variable) => variable.name === name)
  if (!decl) return undefined
  if (!Object.hasOwn(target.variables, decl.id)) return undefined
  return target.variables[decl.id]
}

const attributeOf: Primitive = (ctx) => {
  const objectName = menuString(ctx, 'OBJECT')
  const property = menuString(ctx, 'PROPERTY')
  const world = ctx.runtime.world
  const target = objectName === '_stage_' ? world.stage : ctx.runtime.findOriginal(objectName)
  if (!target) return 0
  if (target.isStage) {
    if (property === 'background #' || property === 'backdrop #') return costumeNumber(world, target)
    if (property === 'backdrop name') return costumeName(world, target)
    if (property === 'volume') return target.volume
  } else {
    if (property === 'x position') return target.x
    if (property === 'y position') return target.y
    if (property === 'direction') return target.direction
    if (property === 'costume #') return costumeNumber(world, target)
    if (property === 'costume name') return costumeName(world, target)
    if (property === 'size') return target.size
    if (property === 'volume') return target.volume
  }
  const value = lookupScalar(world, target, property)
  return value === undefined ? 0 : value
}

const current: Primitive = (ctx) => {
  const clock = clocks.get(ctx.runtime.world)
  if (!clock) return 0
  switch (menuString(ctx, 'CURRENTMENU').toLowerCase()) {
    case 'year':
      return clock.year
    case 'month':
      return clock.month
    case 'date':
      return clock.date
    case 'dayofweek':
      return clock.dayOfWeek
    case 'hour':
      return clock.hour
    case 'minute':
      return clock.minute
    case 'second':
      return clock.second
    default:
      return 0
  }
}

const askAndWait: Primitive = (ctx) => {
  const world = ctx.runtime.world
  const frame = ctx.frame
  if (frame.askId === undefined) {
    const showNow = !asks(world).some((item) => item.state === 'waiting')
    const item: QueuedAsk = {
      id: getNextAskId(world),
      targetId: ctx.target.id,
      question: asText(ctx.arg('QUESTION')),
      visible: ctx.target.visible,
      isStage: ctx.target.isStage,
      state: 'waiting',
    }
    asks(world).push(item)
    frame.askId = item.id
    if (showNow) emitAsk(ctx.runtime, item)
    return YIELD
  }
  const id = frame.askId
  const item = typeof id === 'number' ? asks(world).find((entry) => entry.id === id) : undefined
  if (!item || item.state === 'answered') {
    if (item) {
      const queue = asks(world)
      const index = queue.findIndex((entry) => entry.id === item.id)
      if (index >= 0) queue.splice(index, 1)
    }
    return
  }
  return YIELD
}

const getTimer: Primitive = (ctx) => {
  const world = ctx.runtime.world
  return (world.tick - world.timerStartTick) / TICKS_PER_SECOND
}

const resetTimer: Primitive = (ctx) => {
  ctx.runtime.world.timerStartTick = ctx.runtime.world.tick
}

export const sensingPrimitives: PrimitiveTable = {
  sensing_touchingobject: touchingObject,
  sensing_touchingcolor: () => false,
  sensing_coloristouchingcolor: () => false,
  sensing_distanceto: distanceTo,
  sensing_askandwait: askAndWait,
  sensing_answer: (ctx) => ctx.runtime.world.answer,
  sensing_keypressed: keyPressed,
  sensing_mousedown: (ctx) => ctx.runtime.world.mouse.down,
  sensing_mousex: (ctx) => ctx.runtime.world.mouse.x,
  sensing_mousey: (ctx) => ctx.runtime.world.mouse.y,
  sensing_setdragmode: (ctx) => {
    if (ctx.target.isStage) return
    ctx.target.draggable = menuString(ctx, 'DRAG_MODE') === 'draggable'
  },
  sensing_loudness: () => 0,
  sensing_loud: () => false,
  sensing_timer: getTimer,
  sensing_resettimer: resetTimer,
  sensing_of: attributeOf,
  sensing_current: current,
  sensing_dayssince2000: () => 0,
  sensing_username: () => '',
  sensing_userid: () => '',
  sensing_touchingobjectmenu: (ctx) => ctx.field('TOUCHINGOBJECTMENU') || ctx.arg('TOUCHINGOBJECTMENU') || '',
  sensing_distancetomenu: (ctx) => ctx.field('DISTANCETOMENU') || ctx.arg('DISTANCETOMENU') || '',
  sensing_keyoptions: (ctx) => ctx.field('KEY_OPTION') || ctx.arg('KEY_OPTION') || '',
  sensing_of_object_menu: (ctx) => ctx.field('OBJECT') || ctx.arg('OBJECT') || '',
  sensing_currentmenu: (ctx) => ctx.field('CURRENTMENU') || ctx.arg('CURRENTMENU') || '',
}
