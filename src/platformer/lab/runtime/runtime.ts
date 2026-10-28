import { SUB, sub } from '@brick-studio/platformer-core/engine/constants'
import { listKey, type CompiledProgram } from '../program/compile'
import { LAB_LIMITS, PHRASE_TEXT, isSafeIdentifier, type DiagnosticCode, type DiagnosticSeverity, type Stmt, type Who } from '../program/types'
import { matchesTarget, sideMatches } from '../sim/contacts'
import { heroLaunched } from '../sim/physics'
import { COSTUME_BOX, boxHitsTiles, boxOf, findThing, newFiber, reshape, resolveWho, spawnThing, spotNear } from '../sim/things'
import { FIBER_READY, FIBER_SLEEPING, FIBER_WAITING, SOLID_ALL, SOLID_NONE, SOLID_TOP, type Fiber, type Frame, type LabHost, type LabWorld, type Thing, type Trace } from '../sim/types'
import { RuntimeFault, boundedVariable, evalBoolean, evalExpr, evalNumber, finite, memoryOf, spend, toNumber, variablesOf, type EvalContext } from './evaluate'

/*
 * The block runtime (after src/robotics/runtime/runtime.ts): each thing's scripts run as fibers, one fixed step at a
 * time, synchronous and deterministic (time is the frame count, never a clock).
 *
 * - `when I appear` starts on a thing's first turn; event hats (a key, a touch, a stomp, landing, getting hurt,
 *   every N seconds) start their script when it is not already running (a trigger that comes while it runs is
 *   ignored, so "wait" at the end of a key script is a cooldown).
 * - `wait` sleeps whole frames, `wait until` re-checks once a frame, `forever` goes round once a frame, `repeat`
 *   does not stop between passes.
 * - Budgets: a thing spends at most `opsPerThing` a frame, split between its running scripts, and the level at most
 *   `opsPerTick`. A script that spends its share after finishing a statement pauses and goes on next frame; one that
 *   cannot finish a single statement stops with a message.
 * - The state is data on the thing (fibers are frame lists of statement-list keys and positions). `swapProgram`
 *   moves running scripts onto an edited program: loop bodies change in place, a change to what a script already did
 *   starts it again, and a new or changed `when I appear` script runs.
 */

const HURT_GRACE = 60

const ticksFor = (seconds: number) => (!Number.isFinite(seconds) || seconds <= 0 ? 1 : Math.max(1, Math.round(seconds * 60)))
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const MAX_SPEED = sub(LAB_LIMITS.maxSpeed)

interface Turn extends EvalContext {
  prog: CompiledProgram
  trace: Set<string> | null
}

function note(ctx: Pick<Turn, 'notes' | 'fiber'>, severity: DiagnosticSeverity, code: DiagnosticCode, message: string, blockId: string | undefined) {
  ctx.notes.push({ code, severity, message, blockId: blockId ?? null, scriptId: ctx.fiber.script })
}

const WHO_WORDS: Record<Who, string> = { me: 'me', it: '“it”', them: '“them”', player: 'the player', rider: 'my rider' }

function target(ctx: Turn, who: Who, blockId: string): Thing | undefined {
  const t = resolveWho(ctx.world, ctx.me, ctx.fiber, who)
  if (!t) note(ctx, 'info', 'runtime.nobody', `${WHO_WORDS[who][0].toUpperCase()}${WHO_WORDS[who].slice(1)} is nobody right now, so this block did nothing.`, blockId)
  return t
}

function setIndex(frame: Frame, list: readonly Stmt[], i: number) {
  frame.index = i
  frame.at = list[i]?.blockId ?? ''
}

/** After an edit, find the statement this frame was about to run. */
function realign(frame: Frame, list: readonly Stmt[]) {
  if (frame.at && list[frame.index]?.blockId !== frame.at) {
    const i = list.findIndex((s) => s.blockId === frame.at)
    if (i >= 0) frame.index = i
  }
  if (frame.index > list.length) frame.index = list.length
}

// ---------------------------------------------------------------------------------------------------------------
// What statements do

function applySpeed(ctx: Turn, t: Thing, dir: Extract<Stmt, { op: 'setSpeed' | 'changeSpeed' }>, v: number, add: boolean) {
  if (t.riding) return
  const s = Math.round(v * SUB)
  const face = ctx.me.facing
  const setX = (x: number) => (t.vx = clamp(add ? t.vx + x : x, -MAX_SPEED, MAX_SPEED))
  const setY = (y: number) => (t.vy = clamp(add ? t.vy + y : y, -MAX_SPEED, MAX_SPEED))
  switch (dir.dir) {
    case 'forward':
      setX(face * s)
      break
    case 'backward':
      setX(-face * s)
      break
    case 'right':
      setX(s)
      break
    case 'left':
      setX(-s)
      break
    case 'up':
      setY(-s)
      break
    case 'down':
      setY(s)
      break
  }
  if (dir.dir === 'up' || dir.dir === 'down') heroLaunched(t, ctx.host.feel)
}

function seat(vehicle: Thing, rider: Thing) {
  const depth = sub(COSTUME_BOX[vehicle.costume].seat ?? 0) * (vehicle.size / 100)
  rider.x = Math.round(vehicle.x + vehicle.w / 2 - rider.w / 2)
  rider.y = Math.round(vehicle.y + depth - rider.h)
  rider.facing = vehicle.facing
}

/** Put a rider back on its own feet, just above what it rode. */
export function unride(w: LabWorld, rider: Thing, hop: boolean) {
  const vehicle = findThing(w, rider.riding)
  rider.riding = 0
  if (!vehicle) return
  vehicle.rider = 0
  const y = vehicle.y - rider.h - 1
  if (!boxHitsTiles(w, rider.x, y, rider.w, rider.h)) rider.y = y
  rider.vx = vehicle.vx
  rider.vy = hop ? -sub(3) : 0
  rider.onGround = false
  rider.ground = 0
  rider.hs.jumping = false
  rider.ox = rider.x
  rider.oy = rider.y
}

function removeThing(w: LabWorld, t: Thing) {
  t.removed = true
  const rider = findThing(w, t.rider)
  if (rider) unride(w, rider, true)
  if (t.riding) {
    const vehicle = findThing(w, t.riding)
    if (vehicle) vehicle.rider = 0
    t.riding = 0
  }
  w.effects.push({ kind: 'poof', x: (t.x + t.w / 2) / SUB, y: (t.y + t.h / 2) / SUB })
}

export function moveThingTo(w: LabWorld, t: Thing, cx: number, bottom: number) {
  if (t.riding) unride(w, t, false)
  t.x = Math.round(cx - t.w / 2)
  t.y = bottom - t.h
  t.ox = t.x
  t.oy = t.y
  t.vx = 0
  t.vy = 0
  t.ground = 0
  t.onGround = false
  t.hs.jumping = false
  t.hs.buffer = 0
}

function countAlive(w: LabWorld): number {
  let n = 0
  for (const t of w.things) if (!t.removed && !t.system) n++
  return n
}

/** Run one statement. Returns 'next' to go on, 'yield' when the fiber stopped for this frame, 'push' after entering a block. */
function exec(ctx: Turn, frame: Frame, list: readonly Stmt[], stmt: Stmt): 'next' | 'yield' | 'push' {
  const { world: w, me, fiber, host } = ctx
  const advance = () => setIndex(frame, list, frame.index + 1)
  switch (stmt.op) {
    case 'setSpeed':
    case 'changeSpeed': {
      const v = evalNumber(stmt.op === 'setSpeed' ? stmt.value : stmt.by, ctx)
      advance()
      const t = target(ctx, stmt.who, stmt.blockId)
      if (t) applySpeed(ctx, t, stmt, finite(v, ctx), stmt.op === 'changeSpeed')
      return 'next'
    }
    case 'launch': {
      const angle = evalNumber(stmt.angle, ctx)
      const power = evalNumber(stmt.power, ctx)
      advance()
      const t = target(ctx, stmt.who, stmt.blockId)
      if (t && !t.riding) {
        const a = (angle * Math.PI) / 180
        t.vx = clamp(Math.round(Math.cos(a) * power * me.facing * SUB), -MAX_SPEED, MAX_SPEED)
        t.vy = clamp(-Math.round(Math.sin(a) * power * SUB), -MAX_SPEED, MAX_SPEED)
        if (Math.abs(t.vx) < 2) t.vx = 0
        heroLaunched(t, host.feel)
      }
      return 'next'
    }
    case 'stopMoving': {
      advance()
      const t = target(ctx, stmt.who, stmt.blockId)
      if (t) {
        t.vx = 0
        t.vy = 0
      }
      return 'next'
    }
    case 'turnAround':
      advance()
      me.facing = me.facing > 0 ? -1 : 1
      return 'next'
    case 'face': {
      advance()
      if (stmt.toward === 'left') me.facing = -1
      else if (stmt.toward === 'right') me.facing = 1
      else {
        const p = findThing(w, w.playerId)
        if (p && p !== me) {
          const d = p.x + p.w / 2 - (me.x + me.w / 2)
          if (d !== 0) me.facing = d > 0 ? 1 : -1
        }
      }
      return 'next'
    }
    case 'moveTo': {
      advance()
      const t = target(ctx, stmt.who, stmt.blockId)
      if (t) {
        const spot = spotNear(w, me, stmt.place, t.w, t.h)
        moveThingTo(w, t, spot.cx, spot.bottom)
      }
      return 'next'
    }
    case 'moveXY': {
      const x = boundedVariable(evalNumber(stmt.x, ctx), ctx)
      const y = boundedVariable(evalNumber(stmt.y, ctx), ctx)
      advance()
      const t = target(ctx, stmt.who, stmt.blockId)
      if (t && !t.system) moveThingTo(w, t, Math.round(x * SUB), Math.round(y * SUB))
      return 'next'
    }
    case 'hero':
      advance()
      me.hero = stmt.on
      if (!stmt.on) me.hs.jumping = false
      return 'next'
    case 'setControls': {
      advance()
      const t = target(ctx, stmt.who, stmt.blockId)
      if (t && !t.system) {
        t.controlsEnabled = stmt.enabled
        if (!stmt.enabled) {
          t.hs.jumping = false
          t.hs.buffer = 0
          t.vx = 0
          t.vy = 0
        }
      }
      return 'next'
    }
    case 'setPhysics': {
      advance()
      const t = target(ctx, stmt.who, stmt.blockId)
      if (t && !t.system) {
        t.physicsEnabled = stmt.enabled
        t.vx = 0
        t.vy = 0
        t.ground = 0
        t.onGround = false
        t.hs.jumping = false
        t.hs.buffer = 0
      }
      return 'next'
    }
    case 'setVisible': {
      advance()
      const t = target(ctx, stmt.who, stmt.blockId)
      if (t && !t.system) t.visible = stmt.visible
      return 'next'
    }
    case 'heroStat': {
      const p = clamp(evalNumber(stmt.percent, ctx), 0, 400)
      advance()
      if (stmt.stat === 'jump') me.jumpPct = p
      else me.speedPct = p
      return 'next'
    }
    case 'make': {
      advance()
      if (me.made >= LAB_LIMITS.makesPerThingPerTick || countAlive(w) >= LAB_LIMITS.maxThings) {
        note(ctx, 'warning', 'runtime.too-many-things', `The level is full (${LAB_LIMITS.maxThings} things). Remove some things before making more.`, stmt.blockId)
        return 'next'
      }
      const info = host.brick(stmt.brick)
      if (!info || stmt.brick === 'world') {
        note(ctx, 'warning', 'runtime.nobody', 'That brick is gone, so nothing was made. Pick another one.', stmt.blockId)
        return 'next'
      }
      const box = boxOf(info.costume, 100)
      const spot = spotNear(w, me, stmt.place, box.w, box.h)
      const made = spawnThing(w, host, stmt.brick, spot.cx, spot.bottom, me.facing, 0)
      me.it = made.id
      me.made++
      return 'next'
    }
    case 'makeXY': {
      const x = boundedVariable(evalNumber(stmt.x, ctx), ctx)
      const y = boundedVariable(evalNumber(stmt.y, ctx), ctx)
      advance()
      if (me.made >= LAB_LIMITS.makesPerThingPerTick || countAlive(w) >= LAB_LIMITS.maxThings) {
        note(ctx, 'warning', 'runtime.too-many-things', `The level is full (${LAB_LIMITS.maxThings} things). Remove some things before making more.`, stmt.blockId)
        return 'next'
      }
      const info = host.brick(stmt.brick)
      if (!info || stmt.brick === 'world') {
        note(ctx, 'warning', 'runtime.nobody', 'That brick is gone, so nothing was made. Pick another one.', stmt.blockId)
        return 'next'
      }
      const made = spawnThing(w, host, stmt.brick, Math.round(x * SUB), Math.round(y * SUB), me.facing, 0)
      me.it = made.id
      me.made++
      return 'next'
    }
    case 'remove': {
      advance()
      const t = target(ctx, stmt.who, stmt.blockId)
      if (!t || t.system) return 'next'
      if (t.id === w.playerId) {
        note(ctx, 'info', 'runtime.cannot-remove-player', 'The player stays in the level. Try “move the player to the start”.', stmt.blockId)
        return 'next'
      }
      removeThing(w, t)
      // Removing myself ends this script.
      if (t === me) {
        fiber.frames.length = 0
        return 'yield'
      }
      return 'next'
    }
    case 'hurt': {
      advance()
      const t = target(ctx, stmt.who, stmt.blockId)
      if (t && w.tick - t.hurtAt >= HURT_GRACE) {
        t.hurtAt = w.tick
        t.events.push({ kind: 'hurt', other: me.id })
      }
      return 'next'
    }
    case 'body': {
      const p = evalNumber(stmt.percent, ctx)
      advance()
      if (stmt.setting === 'gravity') me.gravity = clamp(p, -200, 400)
      else if (stmt.setting === 'bounce') me.bounce = clamp(p, 0, 100)
      else me.friction = clamp(p, 0, 100)
      return 'next'
    }
    case 'solid':
      advance()
      me.solid = stmt.mode === 'solid' ? SOLID_ALL : stmt.mode === 'platform' ? SOLID_TOP : SOLID_NONE
      return 'next'
    case 'letRide': {
      advance()
      const r = target(ctx, stmt.who, stmt.blockId)
      if (!r || me.system || r.system || r === me || r.riding || r.rider || me.riding || findThing(w, me.rider)) return 'next'
      me.rider = r.id
      r.riding = me.id
      r.vx = 0
      r.vy = 0
      r.onGround = false
      r.ground = 0
      r.hs.jumping = false
      r.hs.buffer = 0
      seat(me, r)
      return 'next'
    }
    case 'dropRider': {
      advance()
      const r = findThing(w, me.rider)
      me.rider = 0
      if (r) unride(w, r, true)
      return 'next'
    }
    case 'costume':
      advance()
      me.costume = stmt.costume
      me.useCustomCostume = false
      me.costumePlaying = false
      reshape(w, me)
      return 'next'
    case 'frame': {
      const frame = evalNumber(stmt.frame, ctx)
      advance()
      const count = host.brick(me.brick)?.appearance?.frames.length ?? 1
      me.useCustomCostume = true
      me.costumeFrame = clamp(Math.floor(Number.isFinite(frame) ? frame : 1), 1, Math.max(1, count))
      return 'next'
    }
    case 'nextFrame': {
      advance()
      const count = Math.max(1, host.brick(me.brick)?.appearance?.frames.length ?? 1)
      me.useCustomCostume = true
      me.costumeFrame = (me.costumeFrame % count) + 1
      return 'next'
    }
    case 'playFrames': {
      const fps = evalNumber(stmt.fps, ctx)
      advance()
      me.costumeFps = clamp(Number.isFinite(fps) ? fps : 8, 1, 60)
      me.useCustomCostume = true
      me.costumePlaying = true
      me.costumeFrameDue = w.tick + Math.max(1, Math.round(60 / me.costumeFps))
      return 'next'
    }
    case 'stopFrames':
      advance()
      me.costumePlaying = false
      return 'next'
    case 'color':
      advance()
      me.color = stmt.color
      return 'next'
    case 'size': {
      const p = evalNumber(stmt.percent, ctx)
      advance()
      me.size = clamp(p, 10, 400)
      reshape(w, me)
      return 'next'
    }
    case 'say': {
      const s = evalNumber(stmt.seconds, ctx)
      advance()
      me.say = PHRASE_TEXT[stmt.phrase]
      me.sayUntil = w.tick + ticksFor(s)
      return 'next'
    }
    case 'sayText': {
      const s = evalNumber(stmt.seconds, ctx)
      advance()
      me.say = stmt.text.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120)
      me.sayUntil = w.tick + ticksFor(s)
      return 'next'
    }
    case 'show': {
      advance()
      const key = `${stmt.scope}:${stmt.name}`
      if (!me.shown.includes(key)) {
        me.shown.push(key)
        if (me.shown.length > 3) me.shown.shift()
      }
      return 'next'
    }
    case 'sound':
      advance()
      w.effects.push({ kind: 'sound', sound: stmt.sound, x: (me.x + me.w / 2) / SUB, y: (me.y + me.h / 2) / SUB })
      return 'next'
    case 'setMemory': {
      const v = evalExpr(stmt.value, ctx)
      advance()
      const mem = memoryOf(ctx, stmt.scope)
      if (mem) mem[stmt.name] = typeof v === 'boolean' ? v : finite(v, ctx)
      return 'next'
    }
    case 'changeMemory': {
      const by = evalNumber(stmt.by, ctx)
      advance()
      const mem = memoryOf(ctx, stmt.scope)
      if (mem) mem[stmt.name] = finite(toNumber(mem[stmt.name] ?? 0) + by, ctx)
      return 'next'
    }
    case 'setVariable': {
      const value = boundedVariable(evalNumber(stmt.value, ctx), ctx)
      advance()
      if (!isSafeIdentifier(stmt.name)) return 'next'
      const vars = variablesOf(ctx, stmt.scope)
      if (vars) vars[stmt.name] = value
      return 'next'
    }
    case 'changeVariable': {
      const by = evalNumber(stmt.by, ctx)
      advance()
      if (!isSafeIdentifier(stmt.name)) return 'next'
      const vars = variablesOf(ctx, stmt.scope)
      if (vars) vars[stmt.name] = boundedVariable((Object.prototype.hasOwnProperty.call(vars, stmt.name) ? vars[stmt.name] : 0) + by, ctx)
      return 'next'
    }
    case 'call': {
      const procedure = ctx.prog.procedures.get(stmt.name)
      if (!procedure) {
        advance()
        note(ctx, 'error', 'program.unknown-procedure', 'This custom block is missing its definition.', stmt.blockId)
        return 'next'
      }
      if (fiber.frames.filter((f) => f.args).length >= LAB_LIMITS.maxCallDepth) {
        advance()
        note(ctx, 'error', 'runtime.call-depth', 'This custom block calls itself too many times. Add a stopping condition.', stmt.blockId)
        return 'next'
      }
      const values = stmt.args.map((arg) => boundedVariable(evalNumber(arg, ctx), ctx))
      advance()
      const args: Record<string, number> = {}
      procedure.params.forEach((name, i) => { if (isSafeIdentifier(name)) args[name] = values[i] ?? 0 })
      fiber.frames.push({ owner: procedure.blockId, arm: 'do', index: 0, at: procedure.body[0]?.blockId ?? '', loop: 0, left: 0, args })
      return 'push'
    }
    case 'broadcast':
      advance()
      w.messages ??= []
      if (w.messages.length < LAB_LIMITS.maxMessagesPerTick) w.messages.push({ name: stmt.message, deliverTick: w.tick + 1 })
      else note(ctx, 'warning', 'runtime.message-limit', 'Too many messages went out at once. Add a wait.', stmt.blockId)
      return 'next'
    case 'wait': {
      const s = evalNumber(stmt.seconds, ctx)
      advance()
      fiber.state = FIBER_SLEEPING
      fiber.wake = w.tick + ticksFor(s)
      fiber.on = stmt.blockId
      return 'yield'
    }
    case 'waitUntil': {
      const met = evalBoolean(stmt.condition, ctx)
      advance()
      if (met) return 'next'
      fiber.state = FIBER_WAITING
      fiber.until = stmt.blockId
      fiber.on = stmt.blockId
      return 'yield'
    }
    case 'repeat': {
      const n = clamp(Math.floor(evalNumber(stmt.count, ctx)), 0, LAB_LIMITS.maxRepeatCount)
      advance()
      if (n > 0 && stmt.body.length) fiber.frames.push({ owner: stmt.blockId, arm: 'do', index: 0, at: stmt.body[0].blockId, loop: 1, left: n })
      return 'push'
    }
    case 'forever':
      advance()
      fiber.frames.push({ owner: stmt.blockId, arm: 'do', index: 0, at: stmt.body[0]?.blockId ?? '', loop: 2, left: 0 })
      return 'push'
    case 'if': {
      const yes = evalBoolean(stmt.condition, ctx)
      advance()
      const arm = yes ? 'do' : 'else'
      const inner = ctx.prog.lists.get(listKey(stmt.blockId, arm))
      if (inner && inner.length) fiber.frames.push({ owner: stmt.blockId, arm, index: 0, at: inner[0].blockId, loop: 0, left: 0 })
      return 'push'
    }
    case 'stopScript':
      fiber.frames.length = 0
      return 'yield'
  }
}

/** Run a fiber until it waits, finishes, or spends its share (a thrown budget fault). */
function runFiber(ctx: Turn, progress: { done: number }) {
  const { world: w, fiber, prog, trace } = ctx
  if (fiber.state === FIBER_SLEEPING) {
    if (w.tick < fiber.wake) {
      trace?.add(fiber.on)
      return
    }
    fiber.state = FIBER_READY
  }
  if (fiber.state === FIBER_WAITING) {
    const s = prog.stmts.get(fiber.until)
    if (s && s.op === 'waitUntil' && !evalBoolean(s.condition, ctx)) {
      trace?.add(fiber.on)
      return
    }
    fiber.state = FIBER_READY
    fiber.until = ''
  }
  fiber.on = ''
  for (;;) {
    const frame = fiber.frames[fiber.frames.length - 1]
    if (!frame) return
    const list = prog.lists.get(listKey(frame.owner, frame.arm))
    if (!list) {
      // The block this frame was inside is gone (an edit): carry on after it.
      fiber.frames.pop()
      continue
    }
    realign(frame, list)
    if (frame.index >= list.length) {
      if (frame.loop === 1) {
        spend(ctx, frame.owner)
        frame.left -= 1
        if (frame.left > 0) {
          setIndex(frame, list, 0)
          continue
        }
        fiber.frames.pop()
        continue
      }
      if (frame.loop === 2) {
        // Forever: one pass a frame.
        spend(ctx, frame.owner)
        trace?.add(frame.owner)
        setIndex(frame, list, 0)
        fiber.state = FIBER_SLEEPING
        fiber.wake = w.tick + 1
        fiber.on = frame.owner
        return
      }
      fiber.frames.pop()
      continue
    }
    const stmt = list[frame.index]
    spend(ctx, stmt.blockId)
    trace?.add(stmt.blockId)
    const r = exec(ctx, frame, list, stmt)
    progress.done += 1
    if (r === 'yield') return
  }
}

/** Start the scripts this thing's events and the keys call for. */
function startScripts(w: LabWorld, host: LabHost, t: Thing, prog: CompiledProgram, trace: Set<string> | null) {
  const events = t.events
  t.events = []
  const age = w.tick - t.born
  for (const script of prog.ir.scripts) {
    if (t.fibers.some((f) => f.script === script.id)) continue
    const tr = script.trigger
    // Messages below start in send order. The other hats keep their existing workspace order.
    if (tr.kind === 'message') continue
    let fire = false
    let them = 0
    switch (tr.kind) {
      case 'appear':
        fire = events.some((e) => e.kind === 'appear')
        break
      case 'clicked':
        fire = events.some((e) => e.kind === 'clicked')
        break
      case 'key':
        fire = w.input.pressed.includes(tr.key)
        break
      case 'every': {
        const period = Math.max(1, Math.round(tr.seconds * 60))
        fire = age > 0 && age % period === 0
        break
      }
      case 'touch':
        for (const e of events) {
          if (e.kind !== 'touch' || !sideMatches(tr.side, e.side)) continue
          if (!matchesTarget(w, host, tr.target, findThing(w, e.other), e.tile)) continue
          fire = true
          them = e.other
          break
        }
        break
      case 'stomped':
      case 'hurt':
        for (const e of events) {
          if (e.kind !== tr.kind) continue
          fire = true
          them = e.other
          break
        }
        break
      case 'land':
        fire = events.some((e) => e.kind === 'land')
        break
    }
    if (fire) {
      t.fibers.push(newFiber(script.id, them))
      trace?.add(script.hatBlockId)
    }
  }
  // A queue can contain several different names in one tick. Start each matching receiver in that order,
  // with workspace order only as a tie-breaker for hats listening to the same message. A running hat skips
  // later matches, as it does for every other event.
  for (const event of events) {
    if (event.kind !== 'message') continue
    for (const script of prog.ir.scripts) {
      if (script.trigger.kind !== 'message' || script.trigger.message !== event.message) continue
      if (t.fibers.some((fiber) => fiber.script === script.id)) continue
      t.fibers.push(newFiber(script.id))
      trace?.add(script.hatBlockId)
    }
  }
}

/**
 * One thing's turn this frame: start the scripts its events call for, then run its scripts within its share of the
 * frame's budget. Problems go to `w.notes`.
 */
export function runThing(w: LabWorld, host: LabHost, t: Thing, prog: CompiledProgram, budget: { left: number }, trace: Trace | null) {
  const glow = trace && trace.thing === t.id ? trace.blocks : null
  t.made = 0
  startScripts(w, host, t, prog, glow)
  if (!t.fibers.length) return
  if (budget.left < LAB_LIMITS.opsPerThing) {
    // The level has spent this frame's budget: these scripts wait for the next frame.
    if (!w.notes.some((n) => n.diagnostic.code === 'runtime.level-busy')) {
      w.notes.push({
        thing: t.id,
        brick: t.brick,
        diagnostic: { code: 'runtime.level-busy', severity: 'info', message: 'The level is very busy, so some things waited a moment. Add a “wait” to big loops.', blockId: null },
      })
    }
    return
  }
  const share = Math.max(1, Math.floor(LAB_LIMITS.opsPerThing / t.fibers.length))
  for (const fiber of t.fibers.slice()) {
    if (t.removed) break
    const turn: Turn = { world: w, host, me: t, fiber, budget: { left: share }, notes: [], prog, trace: glow }
    const progress = { done: 0 }
    try {
      runFiber(turn, progress)
    } catch (error) {
      const fault = error instanceof RuntimeFault ? error : new RuntimeFault('non-finite', 'runtime.non-finite', 'This script hit a problem and stopped.', turn.blockId)
      // Out of budget after some progress: go on next frame from here.
      if (!(fault.kind === 'budget' && progress.done > 0)) {
        fiber.frames.length = 0
        turn.notes.push({ code: fault.code, severity: 'error', message: fault.message, blockId: fault.blockId ?? turn.blockId ?? null, scriptId: fiber.script })
      }
    }
    budget.left -= share - Math.max(0, turn.budget.left)
    for (const d of turn.notes) w.notes.push({ thing: t.id, brick: t.brick, diagnostic: d })
  }
  t.fibers = t.fibers.filter((f) => f.frames.length > 0)
}

// ---------------------------------------------------------------------------------------------------------------
// Live edits

/** Did the edit change something this fiber already ran (outside loops, which run again anyway)? */
function changedBehind(f: Fiber, old: CompiledProgram, next: CompiledProgram): boolean {
  for (let k = 0; k < f.frames.length; k++) {
    const frame = f.frames[k]
    if (frame.args) {
      // The caller is parked just after its call while this procedure runs. If a live edit changes the
      // call's input expressions, rerun it so these bound values reflect the new blocks.
      const caller = f.frames[k - 1]
      const call = caller && old.lists.get(listKey(caller.owner, caller.arm))?.[caller.index - 1]
      if (!call || call.op !== 'call' || old.keys.get(call.blockId) !== next.keys.get(call.blockId)) return true
      const before = [...old.procedures.values()].find((procedure) => procedure.blockId === frame.owner)
      const after = [...next.procedures.values()].find((procedure) => procedure.blockId === frame.owner)
      if (!before || !after || before.name !== after.name || before.params.length !== after.params.length || before.params.some((name, index) => name !== after.params[index])) return true
    }
    if (frame.loop !== 0) continue
    const key = listKey(frame.owner, frame.arm)
    const before = old.lists.get(key)
    const after = next.lists.get(key)
    if (!before) continue
    if (!after) return true
    // Outer frames stand just past the block they are inside; only what came before that block is done.
    const done = k === f.frames.length - 1 ? frame.index : frame.index - 1
    for (let i = 0; i < done && i < before.length; i++) {
      const id = before[i].blockId
      if (after[i]?.blockId !== id || next.keys.get(id) !== old.keys.get(id)) return true
    }
  }
  return false
}

/** Move a thing's running scripts from `old` to `next` (the same brick's program, just edited). */
export function swapProgram(t: Thing, old: CompiledProgram | null, next: CompiledProgram) {
  const keep: Fiber[] = []
  for (const f of t.fibers) {
    if (!next.scripts.has(f.script)) continue
    if (old && changedBehind(f, old, next)) {
      const fresh = newFiber(f.script, f.them)
      keep.push(fresh)
      continue
    }
    keep.push(f)
  }
  t.fibers = keep
  // A new "when I appear" script, or one whose blocks changed after it finished, runs now.
  for (const s of next.ir.scripts) {
    if (s.trigger.kind !== 'appear' || t.fibers.some((f) => f.script === s.id)) continue
    const before = old?.scriptKeys.get(s.id)
    if (before === undefined || before !== next.scriptKeys.get(s.id)) t.fibers.push(newFiber(s.id))
  }
}

export { seat }
