/**
 * The Hero in open blocks (step 5), written the way a kid would check it by watching: "it walks when I hold right",
 * "it jumps higher when I keep holding space". Then the numbers: every feel metric of docs/qa/code-lab-core/STEP5.md,
 * measured on the open-block Hero and compared with today's Hero.
 *
 * Today's Hero is the real engine (`packages/platformer-core` player.ts + feel.ts, used read-only through its test
 * `harness`). Its numbers are the targets. Where a target has a closed form in feel.ts we also derive it here, so the
 * engine and the arithmetic must agree before the open-block Hero is compared with either.
 *
 * Both Heroes are driven the same way: an input held for N milliseconds. The old engine steps at 60 frames per second,
 * Code Lab at 30 ticks per second, so one tick is two frames. A key held for a tick is held for both of its frames.
 */
import * as Blockly from 'blockly/core'
import 'blockly/blocks'
import { describe, expect, it } from 'vitest'
import { harness } from '@brick-studio/platformer-core/engine/testHarness'
import { DEFAULT_FEEL, P_SEGMENTS } from '@brick-studio/platformer-core/engine/feel'
import { TICKS_PER_SECOND, TICK_MS } from '../../core/contracts'
import { targetBounds } from '../../core/geometry'
import { play } from '../../core/index'
import { validateDesign } from '../../core/project'
import { compileWorkspace } from '../../core/editor/compile'
import { isHatOpcode, registerEditorBlocks } from '../../core/editor/definitions'
import {
  createHeroBrick, createHeroCostume, createHeroWorkspace, HERO_BOX, HERO_BUILD_KNOB_IDS, HERO_KNOB_GROUPS, HERO_KNOBS, HERO_MORE_TUNING_COUNT, heroVariables,
} from './heroBrick'
import { createHeroTestDesign, FLOOR_TOP, HERO_START_X, HERO_STAND_Y, type HeroTestOptions } from './heroLevel'

// =============================================================================================
// Two engines behind one interface
// =============================================================================================

interface Input {
  left?: boolean
  right?: boolean
  jump?: boolean
  run?: boolean
}

interface Sample {
  /** Left edge of the Hero's box, px, y up from the floor top is `height`. */
  x: number
  /** Bottom of the box above the floor, px. */
  height: number
  onGround: boolean
}

interface Engine {
  /** Milliseconds per step: 1000/60 for the old engine, 1000/30 for the open-block Hero. */
  dt: number
  step(input: Input): Sample
}

/** The old engine: a 120 x 25 tile level (1920 x 400 px), a floor on the bottom row. `.` rows above. */
function oldEngine(opts: { startRow?: number; startCol?: number; floorCols?: number; wallCol?: number } = {}): Engine {
  const cols = 120
  const rows = 25
  const floorCols = opts.floorCols ?? cols
  const grid = Array.from({ length: rows }, () => '.'.repeat(cols).split(''))
  for (let c = 0; c < floorCols; c++) grid[rows - 1][c] = '#'
  if (opts.wallCol !== undefined) for (let r = 10; r < rows; r++) grid[r][opts.wallCol] = '#'
  grid[opts.startRow ?? rows - 2][opts.startCol ?? 2] = '@'
  const h = harness(grid.map((r) => r.join('')))
  const floorTopSub = (rows - 1) * 16 * 256
  let jumpWas = false
  return {
    dt: 1000 / 60,
    step(input) {
      const jump = !!input.jump
      h.step({ left: !!input.left, right: !!input.right, jump, jumpPressed: jump && !jumpWas, run: !!input.run })
      jumpWas = jump
      return { x: h.p.x / 256, height: (floorTopSub - (h.p.y + h.p.h)) / 256, onGround: h.p.onGround }
    },
  }
}

/** The open-block Hero, through the real runtime. Keys go in as Scratch key names. */
function newEngine(options: HeroTestOptions = {}): Engine {
  const rt = play(createHeroTestDesign(options))
  const hero = rt.world.targets.find((t) => t.copyId === 'copy_hero')!
  const keys: Record<keyof Input, string> = { left: 'left arrow', right: 'right arrow', jump: 'space', run: 'x' }
  const held = new Set<string>()
  return {
    dt: TICK_MS,
    step(input) {
      for (const k of Object.keys(keys) as (keyof Input)[]) {
        const want = !!input[k]
        if (want && !held.has(keys[k])) rt.pressKey(keys[k])
        if (!want && held.has(keys[k])) rt.releaseKey(keys[k])
        if (want) held.add(keys[k])
        else held.delete(keys[k])
      }
      rt.step()
      const box = targetBounds(rt.world, hero)!
      return { x: box.left, height: box.bottom - FLOOR_TOP, onGround: !!hero.body?.onGround }
    },
  }
}

/** Runs an input for `ms` milliseconds (rounded to whole steps) and returns every sample. */
function hold(e: Engine, ms: number, input: Input): Sample[] {
  const n = Math.round(ms / e.dt)
  const out: Sample[] = []
  for (let i = 0; i < n; i++) out.push(e.step(input))
  return out
}

/** Let the Hero come to rest on the floor first, so "height" starts at 0. */
function settled<E extends Engine>(e: E): E {
  hold(e, 100, {})
  return e
}

// =============================================================================================
// Metrics. Each takes a fresh Engine and returns a number (or an object of numbers).
// =============================================================================================

const lastSpeed = (s: Sample[], dt: number): number => ((s[s.length - 1].x - s[s.length - 2].x) / dt) * 1000

/** px/s of every step, from positions. `from` is the x before the first sample. */
function speeds(s: Sample[], from: number, dt: number): number[] {
  return s.map((p, i) => (((p.x - (i === 0 ? from : s[i - 1].x)) / dt) * 1000))
}

/** Time (ms) at which a held input first reaches `target` px/s (within 0.01 px/s). */
function timeToSpeed(e: Engine, input: Input, target: number): number {
  const from = e.step({}).x
  const run = hold(e, 4000, input)
  const sp = speeds(run, from, e.dt)
  const i = sp.findIndex((v) => v >= target - 0.01)
  return i < 0 ? Infinity : (i + 1) * e.dt
}

/** Steady speed after holding for `ms`. */
function steadySpeed(e: Engine, input: Input, ms: number): number {
  return lastSpeed(hold(e, ms, input), e.dt)
}

/** Distance (px) the Hero keeps moving after all keys are released at the end of `ms` of `input`. */
function stoppingDistance(e: Engine, input: Input, ms: number): number {
  hold(e, ms, input)
  const x0 = e.step({ ...input }).x // one more step of the same input, so the release is a clean edge
  const after = hold(e, 3000, {})
  return after[after.length - 1].x - x0
}

/** Distance to reverse: at run speed, hold the other way until the Hero stops moving forward. */
function skidDistance(e: Engine): number {
  hold(e, 1000, { right: true, run: true })
  let x = e.step({ right: true, run: true }).x
  const x0 = x
  for (let i = 0; i < 400; i++) {
    const next = e.step({ left: true, run: true }).x
    if (next <= x) return x - x0
    x = next
  }
  return Infinity
}

interface JumpResult {
  apex: number
  airtimeMs: number
  distance: number
}

/**
 * One jump: lead in with `lead` for `leadMs`, then press space (kept held for `holdMs`; `lead` stays held too, as a
 * player keeps running through a jump) and let go of everything. Reports the apex above the floor, how long the Hero
 * was off the floor, and how far it travelled from takeoff to landing.
 */
function jumpFrom(e: Engine, lead: Input, leadMs: number, holdMs: number): JumpResult {
  hold(e, leadMs, lead)
  const before = e.step(lead)
  const air: Sample[] = [e.step({ ...lead, jump: true })]
  air.push(...hold(e, holdMs - e.dt, { ...lead, jump: true }))
  for (let i = 0; i < 400 && (air.length === 0 || !air[air.length - 1].onGround); i++) air.push(e.step({ ...lead }))
  const airborne = air.filter((s) => s.height > 0.001)
  return {
    apex: Math.max(...air.map((s) => s.height)),
    airtimeMs: airborne.length * e.dt,
    distance: air[air.length - 1].x - before.x,
  }
}

/** Biggest fall speed, px/s, dropping from high up. */
function maxFallSpeed(e: Engine): number {
  let top = 0
  let prev = e.step({}).height
  for (let i = 0; i < 400; i++) {
    const s = e.step({})
    top = Math.max(top, ((prev - s.height) / e.dt) * 1000)
    prev = s.height
    if (s.onGround) break
  }
  return top
}

/**
 * Coyote: walk off a ledge, then press space `d` steps after the first step with nothing under the Hero. The most
 * steps d that still jump, as milliseconds.
 */
function lateJumpMs(make: () => Engine): number {
  let best = 0
  // Only look within 100 ms of leaving the ledge: after that a Code Lab Hero lands on the level's own floor below it.
  for (let d = 1; ; d++) {
    const e = make()
    if (d * e.dt > 100) break
    hold(e, 100, {})
    let steps = 0
    while (e.step({ right: true }).onGround && steps++ < 600) {
      /* walking toward the ledge */
    }
    // That step left the ledge. Keep walking for d - 1 more steps, then press.
    hold(e, (d - 1) * e.dt, { right: true })
    const pressed = e.step({ right: true, jump: true })
    const rest = hold(e, 200, { right: true, jump: true })
    // It jumped if it rises above where the press found it, before it touches anything again (the Code Lab level has
    // its own floor a little below the ledge, and landing on that must not count).
    let rose = false
    for (const s of rest) {
      if (s.onGround) break
      if (s.height > pressed.height + 0.5) rose = true
    }
    if (rose) best = d * e.dt
    else break
  }
  return best
}

/**
 * Jump buffer: fall onto the floor with space pressed `k` steps before the step that lands. The most steps k that
 * still produce a jump on landing, as milliseconds.
 */
function earlyJumpMs(make: () => Engine): number {
  // First find on which step this engine lands, with no input.
  const probe = make()
  let landing = 0
  for (let i = 1; i < 600; i++) {
    if (probe.step({}).onGround) {
      landing = i
      break
    }
  }
  let best = 0
  for (let k = 0; k <= 12; k++) {
    const e = make()
    for (let i = 0; i < landing - 1 - k; i++) e.step({})
    // Tap space k steps before the landing step, then let go.
    const series = [e.step({ jump: true }), ...hold(e, 600, {})]
    // It jumped if, after touching down, the Hero climbs again.
    const down = series.findIndex((s) => s.onGround)
    const jumped = down >= 0 && series.slice(down + 1).some((s) => s.height > 1)
    if (!jumped) break
    best = k * e.dt
  }
  return best
}

/** The old engine starts the Hero standing on tile row `row` (a drop from there); the same drop in Code Lab: copy y. */
const dropY = (row: number): number => HERO_STAND_Y + (24 - (row + 1)) * 16

// ---- tolerances (docs/qa/code-lab-core/STEP5.md)

const TICK = TICK_MS
const SPEED_PCT = 0.03
const TIME_MS = TICK
const STOP_PX = 2
const SKID_PX = 3
const APEX_PX = 2
const AIRTIME_MS = TICK
const DISTANCE_PX = 4
const LATE_EARLY_MS = TICK

// =============================================================================================
// The Hero is built from open blocks and fits in a design
// =============================================================================================

describe('The Hero brick is built from open blocks', () => {
  it('compiles with no errors or warnings', () => {
    const { workspace, diagnostics } = createHeroBrick()
    expect(diagnostics).toEqual([])
    const again = compileWorkspace(workspace, { variables: heroVariables() })
    expect(again.diagnostics).toEqual([])
    expect(isHatOpcode('platformer_whenbump')).toBe(true)
  })

  it('opens in the real Blockly editor and saves back to the same program', () => {
    const { workspace, brick } = createHeroBrick()
    const variables = heroVariables()
    // `coins` is the Stage's global: the editor offers the Stage's variables in every brick's variable menu.
    registerEditorBlocks({ getVariables: () => [...variables, { id: 'coins', name: 'coins', value: 0 }], getBricks: () => ['Hero'] })
    const ws = new Blockly.Workspace()
    try {
      Blockly.serialization.workspaces.load(workspace as Record<string, unknown>, ws)
      // 1 flag script (feel), 7 My Blocks, 2 bump hats (left, right), 4 broadcast hats (boing, stomped, hero hurt, bounce).
      expect(ws.getTopBlocks(false)).toHaveLength(14)
      const saved = Blockly.serialization.workspaces.save(ws)
      const again = compileWorkspace(saved, { variables })
      expect(again.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
      expect(again.program.scripts.map((s) => s.hat.opcode).sort()).toEqual(brick.program.scripts.map((s) => s.hat.opcode).sort())
      // My Blocks keep their names, inputs and warp flag through a Blockly round trip (PROCEDURE_STATE_MUTATOR).
      const shape = (ps: typeof brick.program.procedures) => ps.map((p) => [p.proccode, p.argumentNames, p.warp]).sort()
      expect(shape(again.program.procedures)).toEqual(shape(brick.program.procedures))
      expect(again.program.procedures.every((p) => p.body.length > 0)).toBe(true)
    } finally {
      ws.dispose()
    }
  })

  it('validates in a design', () => {
    expect(validateDesign(createHeroTestDesign())).toEqual([])
    expect(validateDesign(createHeroTestDesign({ heroY: 200, floorEnd: 256, wall: { x: 160, height: 224 } }))).toEqual([])
  })

  it('uses only Scratch blocks and the existing Platformer blocks, and turns gravity off', () => {
    const { workspace } = createHeroBrick()
    const opcodes = new Set<string>()
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk)
      if (!node || typeof node !== 'object') return
      const rec = node as Record<string, unknown>
      if (typeof rec.type === 'string') opcodes.add(rec.type)
      Object.values(rec).forEach(walk)
    }
    walk(workspace)
    const known = new Set([
      'event_whenflagclicked', 'platformer_whenbump', 'platformer_setgravity', 'platformer_setspeed', 'platformer_changespeed',
      'platformer_speed', 'platformer_onground', 'motion_pointindirection', 'motion_setrotationstyle', 'control_forever',
      'control_if', 'control_if_else', 'procedures_definition', 'procedures_call', 'data_variable', 'data_setvariableto',
      'data_changevariableby', 'sensing_keypressed', 'operator_add', 'operator_subtract', 'operator_multiply',
      'operator_divide', 'operator_lt', 'operator_gt', 'operator_equals', 'operator_and', 'operator_or', 'operator_not',
      'operator_mathop', 'math_number',
      // step 6: the Hero answers boing, stomped, hero hurt and the spike tiles
      'event_whenbroadcastreceived', 'event_broadcast', 'motion_gotoxy', 'text',
    ])
    expect([...opcodes].filter((o) => !known.has(o))).toEqual([])
    expect(JSON.stringify(workspace)).toContain('"GRAVITY":"off"')
    expect(JSON.stringify(workspace)).not.toContain('"GRAVITY":"on"')
  })

  it('is split into My Blocks a kid can read: read keys, feel the wall, walk, run meter, jump, fall', () => {
    const { brick } = createHeroBrick()
    expect(brick.program.procedures.map((p) => p.proccode)).toEqual([
      'read keys', 'feel the wall', 'walk', 'run meter', 'jump', 'fall', 'hit a wall',
    ])
    const flag = brick.program.scripts.find((s) => s.hat.opcode === 'event_whenflagclicked')!
    const forever = flag.body.find((s) => s.opcode === 'control_forever')!
    expect(forever.branches![0].map((s) => s.call?.proccode)).toEqual(['read keys', 'feel the wall', 'walk', 'run meter', 'jump', 'fall'])
    expect(brick.program.scripts.filter((s) => s.hat.opcode === 'platformer_whenbump').map((s) => s.hat.fields.SIDE)).toEqual(['left', 'right'])
  })

  it('shows only four Hero knobs in Build; every other tuning number is a plain variable in the groups of "More tuning"', () => {
    const decls = heroVariables()
    for (const knob of HERO_KNOBS) {
      const decl = decls.find((d) => d.id === knob.id)!
      expect(decl.showInBuild === true, knob.name).toBe(HERO_BUILD_KNOB_IDS.includes(knob.id))
      expect(decl.value).toBe(knob.value)
      expect(knob.from.length).toBeGreaterThan(8)
    }
    expect(HERO_BUILD_KNOB_IDS.map((id) => HERO_KNOBS.find((k) => k.id === id)!.name)).toEqual(['walk top speed', 'run top speed', 'jump standing', 'fall gravity'])
    const shown = createHeroBrick().brick.program.variables.filter((v) => v.showInBuild)
    expect(shown.map((v) => v.id)).toEqual(['walk_top', 'run_top', 'jump_stand', 'fall_gravity'])
    // The working memory is not a knob either.
    expect(decls.filter((d) => !d.showInBuild).length).toBe(HERO_KNOBS.length - 4 + 23)
    // The groups hold every other tuning number exactly once, in Walking / Running / Jumping / Falling / Walls order.
    expect(HERO_KNOB_GROUPS.map((g) => g.label)).toEqual(['Walking', 'Running', 'Jumping', 'Falling', 'Walls'])
    const grouped = HERO_KNOB_GROUPS.flatMap((g) => g.knobIds)
    expect(new Set(grouped).size).toBe(grouped.length)
    expect(grouped.sort()).toEqual(HERO_KNOBS.filter((k) => !HERO_BUILD_KNOB_IDS.includes(k.id)).map((k) => k.id).sort())
    expect(HERO_MORE_TUNING_COUNT).toBe(HERO_KNOBS.length - 4)
  })

  it('is one per level (limit 1)', () => {
    expect(createHeroBrick().brick.limit).toBe(1)
  })

  it('has no lava, spikes or ? block code of its own any more (those bricks run their own code), and answers bounce: y speed 11 with jump held, else 6.5', () => {
    const { brick, workspace } = createHeroBrick()
    const text = JSON.stringify(workspace)
    expect(text).not.toContain('platformer_touchingtile')
    expect(text).not.toContain('tile:')
    expect(brick.program.scripts.some((s) => s.hat.opcode === 'platformer_whenbump' && String(s.hat.fields.BRICK).startsWith('tile:'))).toBe(false)
    expect(brick.program.scripts.filter((s) => s.hat.opcode === 'event_whenbroadcastreceived').map((s) => s.hat.fields.BROADCAST_OPTION)).toEqual(['boing', 'stomped', 'hero hurt', 'bounce'])
    const bounce = brick.program.scripts.find((s) => s.hat.fields.BROADCAST_OPTION === 'bounce')!
    const branch = bounce.body[0]!
    expect(branch.opcode).toBe('control_if_else')
    expect(JSON.stringify(branch)).toContain('"KEY_OPTION":"space"')
    expect(JSON.stringify(branch.branches)).toMatch(/11.*6\.5/)
  })

  it('on bounce the Hero is launched: y speed 11 with space held, 6.5 without (the old bounceHigh and bounceLow), read right after the launch', () => {
    const launch = (hold: boolean): number => {
      const rt = play(createHeroTestDesign())
      const hero = rt.world.targets.find((t) => t.copyId === 'copy_hero')!
      for (let i = 0; i < 10; i++) rt.step()
      if (hold) rt.pressKey('space')
      rt.broadcast('bounce')
      rt.step()
      return hero.body!.vy
    }
    expect([launch(true), launch(false)]).toEqual([11, 6.5])
  })

  it('has a 16 x 16 costume whose opaque box is the old player: 12 wide, 14 tall, standing on the floor', () => {
    const c = createHeroCostume()
    expect([c.width, c.height]).toEqual([16, 16])
    expect(c.opaque).toEqual({ left: 2, top: 2, right: 14, bottom: 16 })
    expect(c.opaque!.right - c.opaque!.left).toBe(HERO_BOX.width)
    expect(c.opaque!.bottom - c.opaque!.top).toBe(HERO_BOX.height)
    // The old player is PLAYER_W 12 x H_SMALL 14 (engine/player.ts).
    const rt = play(createHeroTestDesign())
    const hero = rt.world.targets.find((t) => t.copyId === 'copy_hero')!
    rt.step()
    expect(targetBounds(rt.world, hero)).toMatchObject({ bottom: FLOOR_TOP, top: FLOOR_TOP + 14, right: hero.x + 6, left: hero.x - 6 })
    expect(hero.y).toBe(HERO_STAND_Y)
  })
})

describe('Every knob equals today\'s feel, converted to ticks', () => {
  const sub = (px: number) => Math.round(px * 256) / 256
  const k = (id: string) => HERO_KNOBS.find((x) => x.id === id)!.value
  const f = DEFAULT_FEEL
  it('speeds are px/frame x 2, accelerations are x 4 (on the engine\'s own 1/256 rounding), frame counts are / 2', () => {
    expect(k('walk_top')).toBe(f.walkMax * 2)
    expect(k('run_top')).toBe(f.runMax * 2)
    expect(k('p_top')).toBe(f.pMax * 2)
    expect(k('walk_push')).toBe(sub(f.walkAccel) * 4)
    expect(k('run_push')).toBe(sub(f.runAccel) * 4)
    expect(k('air_push')).toBe(sub(f.airAccel) * 4)
    expect(k('friction')).toBe(sub(f.releaseDecel) * 4)
    expect(k('skid')).toBe(sub(f.skidDecel) * 4)
    expect(k('air_turn')).toBe(sub(f.airTurn) * 4)
    expect(k('meter_fill')).toBe(f.pFillFrames / 2)
    expect(k('meter_drain')).toBe(f.pDrainFrames / 2)
    expect(k('meter_full')).toBe(P_SEGMENTS)
    // Jump speeds are px/frame x 2 plus a quarter of the float gravity in use (the tick correction, see heroBrick.ts).
    const slow = (sub(f.holdSlow) * 4) / 4
    const fast = (sub(f.holdFast) * 4) / 4
    expect([k('jump_stand'), k('jump_walk'), k('jump_run'), k('jump_p')]).toEqual([f.jump0 * 2 + slow, f.jump1 * 2 + slow, f.jump2 * 2 + fast, f.jump3 * 2 + fast])
    expect(k('hold_slow')).toBe(sub(f.holdSlow) * 4)
    expect(k('hold_fast')).toBe(sub(f.holdFast) * 4)
    expect(k('fall_gravity')).toBe(sub(f.fallGravity) * 4)
    expect(k('max_fall')).toBe(f.maxFall * 2)
    expect(k('wall_slide')).toBe(f.wallSlideMax * 2)
    expect(k('wall_push')).toBe(f.wallJumpX * 2)
    expect(k('wall_up')).toBe(f.wallJumpY * 2)
    expect(TICKS_PER_SECOND).toBe(30)
  })
})

// =============================================================================================
// Kid-visible: you can see it walk, run and jump
// =============================================================================================

describe('Watching the Hero on a flat floor', () => {
  it('stands still on the floor with nothing pressed', () => {
    const e = newEngine()
    const s = hold(e, 1000, {})
    expect(s.every((p) => p.onGround && p.height === 0)).toBe(true)
    expect(s[s.length - 1].x).toBeCloseTo(HERO_START_X - 6, 6)
  })

  it('walks right when you hold the right arrow and left when you hold the left arrow', () => {
    const e = settled(newEngine())
    const start = e.step({}).x
    expect(hold(e, 1000, { right: true }).pop()!.x).toBeGreaterThan(start + 60)
    const right = hold(e, 1000, {}).pop()!.x // coast to a stop first
    expect(hold(e, 1000, { left: true }).pop()!.x).toBeLessThan(right - 60)
  })

  it('turns to face the way it walks without changing its box', () => {
    const rt = play(createHeroTestDesign())
    const hero = rt.world.targets.find((t) => t.copyId === 'copy_hero')!
    rt.pressKey('left arrow')
    for (let i = 0; i < 10; i++) rt.step()
    expect(hero.direction).toBe(-90)
    const box = targetBounds(rt.world, hero)!
    expect([box.right - box.left, box.top - box.bottom]).toEqual([HERO_BOX.width, HERO_BOX.height])
    rt.releaseKey('left arrow')
    rt.pressKey('right arrow')
    for (let i = 0; i < 10; i++) rt.step()
    expect(hero.direction).toBe(90)
  })

  it('runs faster than it walks when you hold x', () => {
    const walked = steadySpeed(settled(newEngine()), { right: true }, 1000)
    const ran = steadySpeed(settled(newEngine()), { right: true, run: true }, 1000)
    expect(ran).toBeGreaterThan(walked * 1.5)
  })

  it('jumps when you press space, and comes down on the floor', () => {
    const e = settled(newEngine())
    const air = hold(e, 1500, { jump: true })
    expect(Math.max(...air.map((s) => s.height))).toBeGreaterThan(20)
    expect(air[air.length - 1].onGround).toBe(true)
    expect(air[air.length - 1].height).toBe(0)
  })

  it('jumps higher when you keep holding space than when you only tap it', () => {
    const tap = jumpFrom(settled(newEngine()), {}, 0, TICK)
    const held = jumpFrom(settled(newEngine()), {}, 0, 600)
    expect(held.apex).toBeGreaterThan(tap.apex + 20)
  })

  it('jumps higher and farther when it is running, and lands back on the floor at the same height', () => {
    const standing = jumpFrom(settled(newEngine()), {}, 0, 600)
    const running = jumpFrom(settled(newEngine()), { right: true, run: true }, 1000, 600)
    expect(running.apex).toBeGreaterThan(standing.apex)
    expect(running.distance).toBeGreaterThan(80)
  })

  it('does not jump again while space stays held after landing', () => {
    const e = settled(newEngine())
    const s = hold(e, 3000, { jump: true })
    const landed = s.findIndex((p, i) => i > 3 && p.onGround)
    expect(s.slice(landed).every((p) => p.height === 0)).toBe(true)
  })

  it('gets a late jump just after walking off a ledge, and an early jump just before landing', () => {
    const ledge = () => settled(newEngine({ floorEnd: 256 }))
    expect(lateJumpMs(ledge)).toBeGreaterThan(0)
    const drop = () => newEngine({ heroY: dropY(10) })
    expect(earlyJumpMs(drop)).toBeGreaterThan(0)
  })

  it('keeps the Hero inside the old player\'s box: it stops against a wall and does not tunnel the floor', () => {
    const e = settled(newEngine({ wall: { x: 160, height: 224 } }))
    const s = hold(e, 3000, { right: true, run: true })
    expect(s[s.length - 1].x + HERO_BOX.width).toBeCloseTo(160, 6)
    expect(Math.min(...s.map((p) => p.height))).toBe(0)
  })
})

// =============================================================================================
// The numbers: open-block Hero vs today's Hero, within the STEP5 tolerances
// =============================================================================================

function check(name: string, target: number, measured: number, tolerance: number, unit: string, relative = false): void {
  const allowed = relative ? Math.abs(target) * tolerance : tolerance
  expect(measured, `${name}: target ${target} ${unit}, tolerance ${allowed.toFixed(3)}`).toBeGreaterThanOrEqual(target - allowed)
  expect(measured, `${name}: target ${target} ${unit}, tolerance ${allowed.toFixed(3)}`).toBeLessThanOrEqual(target + allowed)
}

describe('Targets derived from feel.ts (the arithmetic and the real engine agree)', () => {
  const f = DEFAULT_FEEL
  it('walk, run and P top speeds are walkMax, runMax and pMax times 60', () => {
    expect(steadySpeed(settled(oldEngine()), { right: true }, 3000)).toBeCloseTo(f.walkMax * 60, 1)
    expect(steadySpeed(settled(oldEngine()), { right: true, run: true }, 1000)).toBeCloseTo(f.runMax * 60, 1)
    expect(steadySpeed(settled(oldEngine()), { right: true, run: true }, 3000)).toBeCloseTo(f.pMax * 60, 1)
  })
  it('max fall is maxFall times 60', () => {
    expect(maxFallSpeed(oldEngine({ startRow: 6 }))).toBeCloseTo(f.maxFall * 60, 1)
  })
})

describe('Speeds: hold right for 3 seconds', () => {
  it('walk top speed', () => {
    const target = steadySpeed(settled(oldEngine()), { right: true }, 3000)
    check('walk top speed (px/s)', target, steadySpeed(settled(newEngine()), { right: true }, 3000), SPEED_PCT, 'px/s', true)
  })
  it('run top speed (the plateau after 1 s, before the run meter fills)', () => {
    const target = steadySpeed(settled(oldEngine()), { right: true, run: true }, 1000)
    check('run top speed (px/s)', target, steadySpeed(settled(newEngine()), { right: true, run: true }, 1000), SPEED_PCT, 'px/s', true)
  })
  it('P-speed (run held for 3 s)', () => {
    const target = steadySpeed(settled(oldEngine()), { right: true, run: true }, 3000)
    check('P-speed (px/s)', target, steadySpeed(settled(newEngine()), { right: true, run: true }, 3000), SPEED_PCT, 'px/s', true)
  })
})

describe('Time to top speed, from standing', () => {
  const f = DEFAULT_FEEL
  const old = (input: Input, speed: number) => timeToSpeed(settled(oldEngine()), input, speed)
  it('walk top speed', () => {
    const target = old({ right: true }, f.walkMax * 60)
    check('time to walk top speed (ms)', target, timeToSpeed(settled(newEngine()), { right: true }, f.walkMax * 60), TIME_MS, 'ms')
  })
  it('run top speed', () => {
    const target = old({ right: true, run: true }, f.runMax * 60)
    check('time to run top speed (ms)', target, timeToSpeed(settled(newEngine()), { right: true, run: true }, f.runMax * 60), TIME_MS, 'ms')
  })
  it('P-speed', () => {
    const target = old({ right: true, run: true }, f.pMax * 60)
    check('time to P-speed (ms)', target, timeToSpeed(settled(newEngine()), { right: true, run: true }, f.pMax * 60), TIME_MS, 'ms')
  })
})

describe('Stopping distance: let go of every key at top speed', () => {
  it('from walk speed', () => {
    const target = stoppingDistance(settled(oldEngine()), { right: true }, 1500)
    check('stopping distance from walk (px)', target, stoppingDistance(settled(newEngine()), { right: true }, 1500), STOP_PX, 'px')
  })
  it('from run speed', () => {
    const target = stoppingDistance(settled(oldEngine()), { right: true, run: true }, 1000)
    check('stopping distance from run (px)', target, stoppingDistance(settled(newEngine()), { right: true, run: true }, 1000), STOP_PX, 'px')
  })
  it('from P-speed', () => {
    const target = stoppingDistance(settled(oldEngine()), { right: true, run: true }, 3000)
    check('stopping distance from P-speed (px)', target, stoppingDistance(settled(newEngine()), { right: true, run: true }, 3000), STOP_PX, 'px')
  })
})

describe('Skid', () => {
  it('distance to reverse from run speed, holding the opposite direction', () => {
    const target = skidDistance(settled(oldEngine()))
    check('skid distance from run (px)', target, skidDistance(settled(newEngine())), SKID_PX, 'px')
  })
})

describe('Jumps', () => {
  const cases: { name: string; lead: Input; leadMs: number; holdMs: number }[] = [
    { name: 'tap, standing', lead: {}, leadMs: 0, holdMs: TICK },
    { name: 'hold, standing', lead: {}, leadMs: 0, holdMs: 800 },
    { name: 'hold, walking', lead: { right: true }, leadMs: 1000, holdMs: 800 },
    { name: 'hold, running', lead: { right: true, run: true }, leadMs: 1000, holdMs: 800 },
    { name: 'hold, P-speed', lead: { right: true, run: true }, leadMs: 3000, holdMs: 800 },
  ]
  for (const c of cases) {
    it(`apex and airtime: ${c.name}`, () => {
      const target = jumpFrom(settled(oldEngine()), c.lead, c.leadMs, c.holdMs)
      const got = jumpFrom(settled(newEngine()), c.lead, c.leadMs, c.holdMs)
      check(`jump apex, ${c.name} (px)`, target.apex, got.apex, APEX_PX, 'px')
      check(`airtime, ${c.name} (ms)`, target.airtimeMs, got.airtimeMs, AIRTIME_MS, 'ms')
    })
  }
  it('a one-frame tap on the old engine (half a tick) still lands within the apex tolerance', () => {
    // A 30-tick-per-second Hero cannot see a press shorter than a tick, so a tap counts as a whole tick.
    const e = settled(oldEngine())
    const air = [e.step({ jump: true })]
    while (!air[air.length - 1].onGround) air.push(e.step({}))
    const oneFrame = Math.max(...air.map((s) => s.height))
    const got = jumpFrom(settled(newEngine()), {}, 0, TICK)
    check('jump apex, one-frame tap vs one-tick tap (px)', oneFrame, got.apex, APEX_PX, 'px')
  })
  for (const c of cases.filter((x) => x.lead.run)) {
    it(`horizontal distance: ${c.name}`, () => {
      const target = jumpFrom(settled(oldEngine()), c.lead, c.leadMs, c.holdMs)
      const got = jumpFrom(settled(newEngine()), c.lead, c.leadMs, c.holdMs)
      check(`jump distance, ${c.name} (px)`, target.distance, got.distance, DISTANCE_PX, 'px')
    })
  }
})

describe('Falling, late jumps and early jumps', () => {
  it('max fall speed', () => {
    const target = maxFallSpeed(oldEngine({ startRow: 6 }))
    check('max fall speed (px/s)', target, maxFallSpeed(newEngine({ heroY: dropY(6) })), SPEED_PCT, 'px/s', true)
  })
  it('coyote time: a late jump after walking off a ledge', () => {
    const target = lateJumpMs(() => settled(oldEngine({ floorCols: 16 })))
    check('coyote time (ms)', target, lateJumpMs(() => settled(newEngine({ floorEnd: 256 }))), LATE_EARLY_MS, 'ms')
  })
  it('jump buffer: an early press before landing', () => {
    const target = earlyJumpMs(() => oldEngine({ startRow: 10 }))
    check('jump buffer (ms)', target, earlyJumpMs(() => newEngine({ heroY: dropY(10) })), LATE_EARLY_MS, 'ms')
  })
})

// =============================================================================================
// Walls: slide and jump (expressed with the bump hats)
// =============================================================================================

/** Walk into a wall, jump up it holding toward it, and report the steady slide speed (px/s). */
function wallSlideSpeed(e: Engine): number {
  hold(e, 4000, { right: true })
  const rise = hold(e, 700, { right: true, jump: true })
  void rise
  const fallen = hold(e, 500, { right: true })
  return -(((fallen[fallen.length - 1].height - fallen[fallen.length - 2].height) / e.dt) * 1000)
}

/** Same, then press space again while sliding: how high the wall jump goes and how fast it pushes away. */
function wallJump(e: Engine): { apex: number; pushSpeed: number } {
  hold(e, 4000, { right: true })
  hold(e, 700, { right: true, jump: true })
  hold(e, 400, { right: true })
  const before = e.step({ right: true })
  const first = e.step({ right: true, jump: true })
  const later = hold(e, 100, { right: true, jump: true })
  const air = [first, ...later]
  const push = ((air[2].x - air[1].x) / e.dt) * 1000
  const rest = hold(e, 800, { right: true })
  return { apex: Math.max(...air.map((s) => s.height), ...rest.map((s) => s.height)) - before.height, pushSpeed: push }
}

describe('Walls', () => {
  const wallPx = 160
  const oldWall = () => oldEngine({ wallCol: wallPx / 16 })
  const newWall = () => newEngine({ wall: { x: wallPx, height: 224 } })
  it('slides down a wall at the wall slide speed while you push into it', () => {
    const target = wallSlideSpeed(settled(oldWall()))
    expect(target).toBeCloseTo(DEFAULT_FEEL.wallSlideMax * 60, 1)
    check('wall slide speed (px/s)', target, wallSlideSpeed(settled(newWall())), SPEED_PCT, 'px/s', true)
  })
  it('pushes off the wall when you jump while sliding', () => {
    const target = wallJump(settled(oldWall()))
    const got = wallJump(settled(newWall()))
    check('wall jump apex above the press (px)', target.apex, got.apex, APEX_PX, 'px')
    check('wall jump push-off speed (px/s)', Math.abs(target.pushSpeed), Math.abs(got.pushSpeed), SPEED_PCT, 'px/s', true)
    expect(got.pushSpeed).toBeLessThan(0)
  })
})
