import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FEEL } from '@brick-studio/platformer-core/engine/feel'
import { codeLabRunner, designForScenario, tickKeys, KEYS, TICK_MS } from './adapter'
import { createJumperStandInOptions } from './jumperStandIn'
import {
  FRAME_MS,
  METRICS,
  coyoteScript,
  bufferScript,
  compare,
  jumpScript,
  measureAll,
  plateaus,
  type FrameInput,
  type MetricSet,
  type Trajectory,
} from './metrics'
import { levelRows, oldEngineRunner } from './oldEngine'
import { expectedFromFeel, renderFeelMarkdown, simulateJump } from './report'
import { heroTarget } from './target'

const OLD: MetricSet = measureAll(oldEngineRunner())
const near = (actual: number | null, expected: number, tol: number, label: string) => {
  expect(actual, label).not.toBeNull()
  expect(Math.abs(actual! - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tol)
}

// =====================================================================================================================
// 1. The old engine's numbers, checked against feel.ts
// =====================================================================================================================

describe('old engine metrics vs feel.ts (DEFAULT_FEEL)', () => {
  const want = expectedFromFeel(DEFAULT_FEEL)

  it('walk, run and P top speeds are walkMax, runMax and pMax times 60 (px/frame to px/s)', () => {
    near(OLD.walkTop, DEFAULT_FEEL.walkMax * 60, 0.01, 'walk') // 1.5 * 60 = 90
    near(OLD.runTop, DEFAULT_FEEL.runMax * 60, 0.01, 'run') // 2.5 * 60 = 150
    near(OLD.pTop, DEFAULT_FEEL.pMax * 60, 0.01, 'P') // 3.5 * 60 = 210
  })

  it('times to top speed follow from the acceleration: ceil(max / accel) frames', () => {
    // walk: 384 sub / 14 per frame = 27.4 -> 28 frames; run: 640 / 16 = 40 frames;
    // P: run meter full after the speed passes runMax - 1/16 (step 39) + 7 segments x 8 frames, then 16 more frames of runAccel to pMax.
    near(OLD.tWalkTop, want.tWalkTop!, 0.01, 'walk time')
    near(OLD.tRunTop, want.tRunTop!, 0.01, 'run time')
    near(OLD.tPTop, want.tPTop!, 0.01, 'P time')
    expect(OLD.tWalkTop).toBeCloseTo(28 * FRAME_MS, 3)
    expect(OLD.tRunTop).toBeCloseTo(40 * FRAME_MS, 3)
    expect(OLD.tPTop).toBeCloseTo(110 * FRAME_MS, 3)
  })

  it('stopping and skid distances match summing the per-frame deceleration', () => {
    // After release speed drops by releaseDecel (skidDecel when the opposite key is held) each frame, and the Hero moves each frame.
    for (const id of ['stopWalk', 'stopRun', 'stopP', 'skid']) near(OLD[id]!, want[id]!, 0.01, id)
  })

  it('jump apexes and airtimes match stepping jump0..3 with hold / fall gravity', () => {
    for (const id of ['apexTap', 'apexStand', 'apexWalk', 'apexRun', 'apexP']) near(OLD[id]!, want[id]!, 0.01, id)
    for (const id of ['airTap', 'airStand', 'airWalk', 'airRun', 'airP']) near(OLD[id]!, want[id]!, 0.01, id)
    // Known shape: higher with speed, and a tap is much lower than a hold.
    expect(OLD.apexTap!).toBeLessThan(OLD.apexStand! / 2)
    expect(OLD.apexStand!).toBeLessThan(OLD.apexWalk!)
    expect(OLD.apexWalk!).toBeLessThan(OLD.apexRun!)
    expect(OLD.apexRun!).toBeLessThan(OLD.apexP!)
  })

  it('jump distance is the takeoff speed times the airtime in frames', () => {
    near(OLD.distRun, want.distRun!, 0.01, 'run jump') // 2.5 px/frame * 59 frames
    near(OLD.distP, want.distP!, 0.01, 'P jump') // 3.5 px/frame * 63 frames
  })

  it('max fall speed is maxFall times 60', () => {
    near(OLD.maxFall, DEFAULT_FEEL.maxFall * 60, 0.01, 'max fall') // 4.25 * 60 = 255
  })

  it('coyote and buffer windows are coyoteFrames and bufferFrames', () => {
    near(OLD.coyote, DEFAULT_FEEL.coyoteFrames * FRAME_MS, 0.01, 'coyote') // 4 frames
    near(OLD.buffer, DEFAULT_FEEL.bufferFrames * FRAME_MS, 0.01, 'buffer') // 5 frames
  })

  it('wall slide is wallSlideMax times 60, and a wall jump rises like a standing hold jump with wallJumpY', () => {
    near(OLD.wallSlide, DEFAULT_FEEL.wallSlideMax * 60, 0.5, 'wall slide')
    near(OLD.wallJump, want.wallJump!, 0.01, 'wall jump')
  })

  it('is deterministic: two measurements agree exactly', () => {
    expect(measureAll(oldEngineRunner())).toEqual(OLD)
  })

  it('has a value for every metric', () => {
    for (const m of METRICS) expect(OLD[m.id], m.id).not.toBeNull()
  })

  it('reacts to feel changes (a heavier fall gravity shortens the jump)', () => {
    const heavy = measureAll(oldEngineRunner({ ...DEFAULT_FEEL, fallGravity: 0.5 }))
    expect(heavy.airStand!).toBeLessThan(OLD.airStand!)
    expect(heavy.maxFall).toBeCloseTo(OLD.maxFall!, 6)
  })

  it('the test levels are well formed', () => {
    for (const s of ['flat', 'ledge', 'drop', 'wall'] as const) {
      const rows = levelRows(s)
      expect(new Set(rows.map((r) => r.length)).size, s).toBe(1)
      expect(rows.join('').split('@').length - 1, `${s} has one start`).toBe(1)
    }
  })

  it('simulateJump agrees with a hand calculation', () => {
    // jump0 = 4 px/frame (1024 sub), holdSlow = 0.125 (32 sub): rising 21 frames... apex is 62 px, as measured.
    expect(simulateJump(1024, 32, 96, 1088, Infinity).apexPx).toBeCloseTo(62, 6)
  })
})

// =====================================================================================================================
// 2. Plumbing
// =====================================================================================================================

describe('adapter plumbing', () => {
  it('ORs two 60 Hz frames into one tick and maps keys to Scratch names', () => {
    const frames: FrameInput[] = [{ right: true }, { jump: true, jumpPressed: true }, { run: true }, {}, {}, {}]
    const ticks = tickKeys(frames)
    expect(ticks).toHaveLength(3)
    expect([...ticks[0]!].sort()).toEqual([KEYS.jump, KEYS.right].sort())
    expect([...ticks[1]!]).toEqual([KEYS.run])
    expect(ticks[2]!.size).toBe(0)
  })

  it('pads an odd frame count to a whole tick', () => {
    expect(tickKeys([{ left: true }])).toHaveLength(1)
  })

  it('samples once per tick, 33.3 ms apart, ending at the end of each tick', () => {
    const run = codeLabRunner(createJumperStandInOptions())
    const traj = run(Array.from({ length: 40 }, () => ({})), 'flat')!
    expect(traj).toHaveLength(20)
    expect(traj[0]!.t_ms).toBeCloseTo(TICK_MS, 6)
    expect(traj[19]!.t_ms).toBeCloseTo(20 * TICK_MS, 6)
  })

  it('moves the Hero right with the right arrow and not otherwise', () => {
    const run = codeLabRunner(createJumperStandInOptions())
    const still = run(Array.from({ length: 60 }, () => ({})), 'flat')!
    const right = run(Array.from({ length: 60 }, () => ({ right: true })), 'flat')!
    expect(still[29]!.x).toBe(still[0]!.x)
    expect(right[29]!.x).toBeGreaterThan(right[0]!.x)
  })

  it('builds drop and ledge levels from the flat one, and has no wall level by default', () => {
    const o = createJumperStandInOptions()
    const hero = o.design.copies.find((c) => c.id === 'copy_jumper')!
    const drop = designForScenario(o, 'drop')!
    expect(drop.copies.find((c) => c.id === 'copy_jumper')!.y).toBe(hero.y + 200)
    expect(designForScenario(o, 'ledge')!.copies.length).toBeLessThan(o.design.copies.length)
    expect(designForScenario(o, 'wall')).toBeNull()
    expect(codeLabRunner(o)([{}], 'wall')).toBeNull()
  })

  it('finds the Hero by brick name when no copy id is given', () => {
    const o = createJumperStandInOptions()
    expect(() => codeLabRunner({ design: o.design })).toThrow(/no Hero copy/)
    expect(() => codeLabRunner({ design: o.design, heroBrickName: 'Jumper' })).not.toThrow()
  })

  it('never edits the design it is given', () => {
    const o = createJumperStandInOptions()
    const before = JSON.stringify(o.design.copies)
    codeLabRunner(o)(jumpScript('stand').frames, 'flat')
    codeLabRunner(o)(jumpScript('stand').frames, 'drop')
    expect(JSON.stringify(o.design.copies)).toBe(before)
  })

  it('probe scripts press exactly where asked', () => {
    const c = coyoteScript(100, 3)
    expect(c.frames.filter((f) => f.jumpPressed)).toHaveLength(1)
    expect(c.frames[103]!.jumpPressed).toBe(true)
    const b = bufferScript(200, 4)
    expect(b.frames[196]!.jumpPressed).toBe(true)
  })

  it('finds plateaus and ignores acceleration', () => {
    const traj: Trajectory = []
    let x = 0
    for (let i = 1; i <= 120; i++) {
      x += Math.min(i * 0.1, 2)
      traj.push({ t_ms: i * FRAME_MS, x, y: 0, onGround: true })
    }
    const p = plateaus(traj, 0)
    expect(p).toHaveLength(1)
    expect(p[0]!.speed).toBeCloseTo(120, 6)
    expect(p[0]!.reachedMs).toBeCloseTo(20 * FRAME_MS, 6)
  })
})

describe('compare', () => {
  it('judges by relative, absolute and report tolerances', () => {
    const old: MetricSet = { walkTop: 100, apexStand: 60, wallSlide: 60, coyote: 66 }
    const rows = compare(old, { walkTop: 102.9, apexStand: 62.5, wallSlide: 10, coyote: null })
    const by = Object.fromEntries(rows.map((r) => [r.def.id, r.pass]))
    expect(by.walkTop).toBe(true) // within 3%
    expect(by.apexStand).toBe(false) // 2.5 px > 2 px
    expect(by.wallSlide).toBeNull() // report only
    expect(by.coyote).toBe(false) // old measured, new missing
    expect(by.skid).toBeNull() // neither measured
  })
})

// =====================================================================================================================
// 3. The Jumper stand-in. It is not meant to feel like the old game: every judged metric misses its tolerance.
// =====================================================================================================================

describe('Jumper stand-in vs old engine', () => {
  const NEW = measureAll(codeLabRunner(createJumperStandInOptions()))
  const rows = compare(OLD, NEW)
  for (const r of rows) {
    if (r.def.tolerance.kind === 'report') continue
    // The Jumper sets x speed straight to 4/tick or 0 and jumps at a fixed 12/tick: no momentum, no run, no variable
    // jump height, no coyote or buffer. It is expected to MISS every tolerance (it.fails). If one starts passing, this
    // fails loudly so the list gets looked at.
    it.fails(`${r.def.label} (${r.def.id}) is within tolerance`, () => {
      expect(r.pass, `old ${r.old} new ${r.neu}`).toBe(true)
    })
  }

  it('measures what the Jumper really does (so the plumbing is right, not just failing)', () => {
    near(NEW.walkTop, 120, 0.5, 'walk') // 4 steps per tick * 30 ticks per second
    near(NEW.stopWalk, 0, 1e-6, 'stops at once')
    near(NEW.maxFall, 480, 1, 'fall') // DEFAULT_PHYSICS maxFall 16 per tick * 30
    expect(NEW.apexStand).toBeCloseTo(NEW.apexP!, 6) // one jump height
    expect(NEW.wallSlide).toBeNull() // no wall level in the stand-in
    expect(NEW.pTop).toBeNull() // never reaches a second plateau
  })
})

// =====================================================================================================================
// 4. The Hero acceptance tests. Active only when target.ts returns the Hero (the integrator's one-line swap).
// =====================================================================================================================

const hero = heroTarget()
describe.skipIf(!hero)('Hero acceptance (open-block Hero vs old engine, STEP5.md tolerances)', () => {
  const NEW = hero ? measureAll(codeLabRunner(hero.options)) : {}
  for (const r of compare(OLD, NEW)) {
    if (r.def.tolerance.kind === 'report') continue
    it(`${r.def.label} (${r.def.id}) is within tolerance`, () => {
      expect(r.pass, `old ${r.old} new ${r.neu}`).toBe(true)
    })
  }
})

// =====================================================================================================================
// 5. FEEL.md
// =====================================================================================================================

describe('FEEL.md', () => {
  it('writes the old-vs-new comparison', () => {
    const target = hero ?? { name: 'Jumper stand-in (the starter\'s Jumper, not the Hero)', options: createJumperStandInOptions() }
    const neu = measureAll(codeLabRunner(target.options))
    const md = renderFeelMarkdown({
      newName: target.name,
      newNote: hero
        ? 'The open-block Hero from `createHeroTestDesign()`, run through `play()` at 30 ticks/s.'
        : 'It exists only to prove the plumbing: it has no momentum, run, variable jump height, coyote time or buffer, so it is expected to fail the tolerances. Plug the Hero in through `feel/target.ts`.',
      old: OLD,
      neu,
    })
    const path = resolve(process.cwd(), 'docs/qa/code-lab-core/FEEL.md') // vitest runs from the repo root
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, md)
    expect(md).toContain('| Walk top speed (px/s) | 90.0 |')
    expect(md).toContain('## Known gaps')
  })
})
