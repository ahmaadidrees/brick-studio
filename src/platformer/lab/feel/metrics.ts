/**
 * Feel metrics for the Hero (step 5). Engine-agnostic: input scripts are written per 60 Hz frame, and every metric is
 * computed from a trajectory of `{ t_ms, x, y, onGround }` samples, whatever engine or tick rate produced it.
 *
 * Conventions (the same for both engines, so the numbers compare 1:1):
 * - x is pixels to the right; y is pixels UP from the level floor line (y-up). Only differences are used, so the
 *   engines may measure from a different reference point (box centre, costume centre).
 * - A sample is taken AFTER a step. Its `t_ms` is the end of that step: `(stepIndex + 1) * stepMs`.
 * - A script "mark" is a 60 Hz frame number. The mark's time is `frame * FRAME_MS`, the START of that frame. Marks
 *   the 30 tick/s runner must hit exactly are even (a tick is two frames).
 * - "Left the ground", "landed" and "jumped" are judged from y alone (not `onGround`), so a Hero that reports
 *   `onGround` differently is not misjudged.
 */

export const FRAME_MS = 1000 / 60
/** Frames of no input at the start of floor scripts so every engine settles on the floor first. */
export const LEAD = 60
/** y differences smaller than this (px) count as "still on the floor". */
export const Y_EPS = 0.05

export interface FrameInput {
  left?: boolean
  right?: boolean
  jump?: boolean
  /** The first frame jump is down. The 30 tick/s runner ORs this across the tick's two frames. */
  jumpPressed?: boolean
  run?: boolean
  down?: boolean
}

export interface Sample {
  t_ms: number
  x: number
  y: number
  onGround: boolean
}
export type Trajectory = Sample[]

/** Which test level a script needs. `flat` is a plain floor; the others are variants of it. */
export type Scenario = 'flat' | 'ledge' | 'drop' | 'wall'

export interface InputScript {
  name: string
  scenario: Scenario
  frames: FrameInput[]
  /** Named frame numbers (see the header). */
  marks: Record<string, number>
}

/** What a runner does: play these 60 Hz inputs in this scenario and return the samples. `null` = can't do this scenario. */
export type HeroRunner = (frames: FrameInput[], scenario: Scenario) => Trajectory | null

// ------------------------------------------------------------------------------------------------ script building

const idle = (n: number): FrameInput[] => Array.from({ length: n }, () => ({}))
const hold = (n: number, input: FrameInput): FrameInput[] => Array.from({ length: n }, () => ({ ...input }))
/** Jump held for n frames; the first frame is the press. */
const jumpHold = (n: number, extra: FrameInput = {}): FrameInput[] =>
  Array.from({ length: n }, (_, i) => ({ ...extra, jump: true, jumpPressed: i === 0 }))

const R: FrameInput = { right: true }
const RR: FrameInput = { right: true, run: true }

/** Frames the Hero holds right (and run) before a "from speed" jump or release. Chosen to be past top speed but before P-speed fills for `run`. */
export const HOLD_WALK = 60
export const HOLD_RUN = 72
export const HOLD_P = 210

/** Hold length for each takeoff kind. */
const TAKEOFF: Record<'stand' | 'walk' | 'run' | 'p', { input: FrameInput; frames: number }> = {
  stand: { input: {}, frames: 0 },
  walk: { input: R, frames: HOLD_WALK },
  run: { input: RR, frames: HOLD_RUN },
  p: { input: RR, frames: HOLD_P },
}

export type TakeoffKind = keyof typeof TAKEOFF
export const TAKEOFF_KINDS: TakeoffKind[] = ['stand', 'walk', 'run', 'p']

function floorScript(name: string, lead: FrameInput[], rest: FrameInput[], marks: Record<string, number>, scenario: Scenario = 'flat'): InputScript {
  return { name, scenario, frames: [...lead, ...rest], marks: { start: lead.length, ...marks } }
}

/** Steady speeds: hold right (walk) for 3 s, hold right+run for 4 s (so P-speed has time to fill). */
export const walkScript = (): InputScript => floorScript('walk 3 s', idle(LEAD), hold(180, R), {})
export const runScript = (): InputScript => floorScript('run 4 s', idle(LEAD), hold(240, RR), {})

/** Release all keys at top speed, then wait for the stop. */
export function stopScript(kind: 'walk' | 'run' | 'p'): InputScript {
  const t = TAKEOFF[kind === 'walk' ? 'walk' : kind]
  return floorScript(`release from ${kind}`, idle(LEAD), [...hold(t.frames, t.input), ...idle(200)], { release: LEAD + t.frames })
}

/** Run to run speed, then hold left (with run) to turn around. */
export const skidScript = (): InputScript =>
  floorScript('skid from run', idle(LEAD), [...hold(HOLD_RUN, RR), ...hold(90, { left: true, run: true })], { reverse: LEAD + HOLD_RUN })

/** A jump from each takeoff kind. `tap` releases jump after one frame; otherwise jump is held through the landing. */
export function jumpScript(kind: TakeoffKind, tap = false): InputScript {
  const t = TAKEOFF[kind]
  const air = tap ? [{ ...t.input, jump: true, jumpPressed: true }, ...hold(150, t.input)] : jumpHold(180, t.input)
  return floorScript(`${tap ? 'tap ' : 'hold '}jump from ${kind}`, idle(LEAD), [...hold(t.frames, t.input), ...air], { jump: LEAD + t.frames })
}

/** Drop from high up with no keys. The runner places the Hero 200 px above the floor. */
export const DROP_PX = 200
export const dropScript = (): InputScript => ({ name: 'drop 200 px', scenario: 'drop', frames: idle(150), marks: { start: 0 } })

/** Walk right off a ledge (the floor ends). The baseline for the coyote probe. */
export const ledgeWalkScript = (): InputScript => floorScript('walk off a ledge', idle(LEAD), hold(420, R), {}, 'ledge')

/** The same walk, with a one-frame jump press `after` frames after the Hero left the ledge (`leaveFrame` = frame of the first airborne step). */
export function coyoteScript(leaveFrame: number, after: number): InputScript {
  const frames = [...idle(LEAD), ...hold(420, R)]
  const at = leaveFrame + after
  if (at >= frames.length) throw new Error('coyote press is past the script')
  frames[at] = { ...frames[at], jump: true, jumpPressed: true }
  return { name: `coyote press +${after}`, scenario: 'ledge', frames, marks: { start: LEAD, press: at } }
}

/** A tap jump from standing, then a second one-frame press `before` frames before the landing step `landFrame`. */
export function bufferScript(landFrame: number | null, before: number | null): InputScript {
  const frames = [...idle(LEAD), { jump: true, jumpPressed: true }, ...idle(119)]
  const first = LEAD
  if (landFrame !== null && before !== null) {
    const at = landFrame - before
    if (at <= first + 1) throw new Error('buffer press is before the first jump ends')
    frames[at] = { jump: true, jumpPressed: true }
  }
  return { name: before === null ? 'tap jump' : `buffer press -${before}`, scenario: 'flat', frames, marks: { start: LEAD, jump: first } }
}

/** Fall against a wall holding right, then press jump (wall jump) at `jump`. The wall scenario starts the Hero 200 px up next to a tall wall. */
export const WALL_SLIDE_FROM = 40
export const WALL_JUMP_AT = 100
export const wallScript = (): InputScript => ({
  name: 'wall slide and wall jump',
  scenario: 'wall',
  frames: [...hold(WALL_JUMP_AT, R), ...jumpHold(40, R)],
  marks: { slideFrom: WALL_SLIDE_FROM, jump: WALL_JUMP_AT },
})

// ------------------------------------------------------------------------------------------------ trajectory helpers

/** Frame number (0-based step index) of the step that produced this sample, given the runner's step length. */
export const frameOfSample = (s: Sample): number => Math.round(s.t_ms / FRAME_MS) - 1

/** The last sample taken at or before `tMs` (that is: the state when the step at that time begins). */
export function sampleAt(traj: Trajectory, tMs: number): Sample | undefined {
  let found: Sample | undefined
  for (const s of traj) {
    if (s.t_ms <= tMs + 1e-6) found = s
    else break
  }
  return found
}

const markMs = (frame: number): number => frame * FRAME_MS

interface Speed {
  t: number
  v: number
}

/** Horizontal speed (px/s, signed) between consecutive samples after `fromMs`. */
function speeds(traj: Trajectory, fromMs: number): Speed[] {
  const base = sampleAt(traj, fromMs)
  const rest = traj.filter((s) => s.t_ms > fromMs + 1e-6)
  const out: Speed[] = []
  let prev = base
  for (const s of rest) {
    if (prev) out.push({ t: s.t_ms - fromMs, v: ((s.x - prev.x) / (s.t_ms - prev.t_ms)) * 1000 })
    prev = s
  }
  return out
}

export interface Plateau {
  /** px/s */
  speed: number
  /** ms from the start mark until the speed first got within 0.5% of the plateau */
  reachedMs: number
  /** how long it stayed there */
  lastedMs: number
}

/** Stretches where the speed stays within 0.5% for at least 0.25 s. Accelerating or decelerating stretches are never plateaus. */
export function plateaus(traj: Trajectory, fromMs: number, minMs = 250): Plateau[] {
  const sp = speeds(traj, fromMs)
  const out: Plateau[] = []
  let i = 0
  while (i < sp.length) {
    const v0 = sp[i]!.v
    let j = i
    while (v0 > 0 && j + 1 < sp.length && Math.abs(sp[j + 1]!.v - v0) <= 0.005 * v0) j++
    const lasted = sp[j]!.t - (i > 0 ? sp[i - 1]!.t : 0)
    if (v0 > 0 && lasted >= minMs) {
      const mean = sp.slice(i, j + 1).reduce((a, b) => a + b.v, 0) / (j - i + 1)
      out.push({ speed: mean, reachedMs: sp[i]!.t, lastedMs: lasted })
    }
    i = j + 1
  }
  return out
}

// ------------------------------------------------------------------------------------------------ metric functions

const nan = Number.NaN
const ok = (n: number): number | null => (Number.isFinite(n) ? n : null)

export interface SpeedMetrics {
  walkTop: number | null
  tWalkTop: number | null
  runTop: number | null
  tRunTop: number | null
  pTop: number | null
  tPTop: number | null
}

/** From the walk script and the run script. Run top = the first plateau of the run script; P-speed = the last (needs a higher speed than the first). */
export function speedMetrics(walk: Trajectory, run: Trajectory): SpeedMetrics {
  const w = plateaus(walk, markMs(LEAD))
  const r = plateaus(run, markMs(LEAD))
  const walkP = w[w.length - 1]
  const runP = r[0]
  const pP = r.length > 1 && r[r.length - 1]!.speed > r[0]!.speed * 1.02 ? r[r.length - 1] : undefined
  return {
    walkTop: walkP ? walkP.speed : null,
    tWalkTop: walkP ? walkP.reachedMs : null,
    runTop: runP ? runP.speed : null,
    tRunTop: runP ? runP.reachedMs : null,
    pTop: pP ? pP.speed : null,
    tPTop: pP ? pP.reachedMs : null,
  }
}

/** Distance from the release mark to where the Hero stops for good. null if it never stopped. */
export function stopDistance(traj: Trajectory, releaseFrame: number): number | null {
  const at = sampleAt(traj, markMs(releaseFrame))
  const last = traj[traj.length - 1]
  const before = traj[traj.length - 4]
  if (!at || !last || !before || Math.abs(last.x - before.x) > 1e-6) return null
  return ok(last.x - at.x)
}

/** Distance the Hero keeps travelling in its old direction after the opposite key goes down (until it reverses). */
export function skidDistance(traj: Trajectory, reverseFrame: number): number | null {
  const at = sampleAt(traj, markMs(reverseFrame))
  if (!at) return null
  let max = at.x
  let reversed = false
  for (const s of traj) {
    if (s.t_ms <= at.t_ms) continue
    if (s.x > max) max = s.x
    else if (s.x < max - 1e-6) {
      reversed = true
      break
    }
  }
  return reversed ? ok(max - at.x) : null
}

export interface JumpMetrics {
  apex: number
  /** ms from the jump mark (start of the press frame) to the first sample back on the floor line */
  airtime: number
  /** px travelled from the press to the landing */
  distance: number
}

export function jumpMetrics(traj: Trajectory, jumpFrame: number): JumpMetrics | null {
  const at = sampleAt(traj, markMs(jumpFrame))
  if (!at) return null
  const rest = traj.filter((s) => s.t_ms > at.t_ms + 1e-6)
  const rise = rest.findIndex((s) => s.y > at.y + Y_EPS)
  if (rise < 0) return null
  let apex = at.y
  for (let i = rise; i < rest.length; i++) {
    const s = rest[i]!
    if (s.y > apex) apex = s.y
    if (i > rise && s.y <= at.y + Y_EPS) {
      return { apex: apex - at.y, airtime: s.t_ms - markMs(jumpFrame), distance: s.x - at.x }
    }
  }
  return null
}

/** Fastest downward speed, px/s. */
export function maxFallSpeed(traj: Trajectory): number | null {
  let best = nan
  for (let i = 1; i < traj.length; i++) {
    const v = ((traj[i - 1]!.y - traj[i]!.y) / (traj[i]!.t_ms - traj[i - 1]!.t_ms)) * 1000
    if (!(v <= best)) best = v
  }
  return ok(best)
}

/** Frame of the first step that ends airborne after the lead, or null. */
export function firstAirborneFrame(traj: Trajectory, afterFrame: number): number | null {
  const at = sampleAt(traj, markMs(afterFrame))
  if (!at) return null
  const s = traj.find((q) => q.t_ms > at.t_ms + 1e-6 && q.y < at.y - Y_EPS)
  return s ? frameOfSample(s) : null
}

/** Frame of the step that ends back on the floor line after a jump taken at `jumpFrame`. */
export function landingFrame(traj: Trajectory, jumpFrame: number): number | null {
  const at = sampleAt(traj, markMs(jumpFrame))
  if (!at) return null
  const rest = traj.filter((s) => s.t_ms > at.t_ms + 1e-6)
  const rise = rest.findIndex((s) => s.y > at.y + Y_EPS)
  if (rise < 0) return null
  const land = rest.slice(rise + 1).find((s) => s.y <= at.y + Y_EPS)
  return land ? frameOfSample(land) : null
}

/** After a press at `pressFrame` did the Hero go up (a jump), judged over the next 8 frames? */
export function jumpedAfter(traj: Trajectory, pressFrame: number): boolean {
  const at = sampleAt(traj, markMs(pressFrame))
  if (!at) return false
  const end = markMs(pressFrame) + 8 * FRAME_MS
  return traj.some((s) => s.t_ms > at.t_ms + 1e-6 && s.t_ms <= end + 1e-6 && s.y > at.y + 0.5)
}

/** Mean descent speed (px/s) between two marks. */
export function meanFallSpeed(traj: Trajectory, fromFrame: number, toFrame: number): number | null {
  const a = sampleAt(traj, markMs(fromFrame))
  const b = sampleAt(traj, markMs(toFrame))
  if (!a || !b || b.t_ms <= a.t_ms) return null
  return ok(((a.y - b.y) / (b.t_ms - a.t_ms)) * 1000)
}

/** Apex height gained after the mark. */
export function apexAfter(traj: Trajectory, frame: number): number | null {
  const at = sampleAt(traj, markMs(frame))
  if (!at) return null
  let apex = at.y
  for (const s of traj) if (s.t_ms > at.t_ms && s.y > apex) apex = s.y
  return apex - at.y
}

// ------------------------------------------------------------------------------------------------ the whole set

export interface MetricDef {
  id: string
  group: string
  label: string
  unit: 'px/s' | 'ms' | 'px'
  /** How to judge new vs old. `report` means no pass/fail. */
  tolerance: { kind: 'rel'; frac: number } | { kind: 'abs'; amount: number } | { kind: 'report' }
  note?: string
}

const T3: MetricDef['tolerance'] = { kind: 'rel', frac: 0.03 }
const TICK = { kind: 'abs', amount: 1000 / 30 } as const
const px = (n: number) => ({ kind: 'abs', amount: n }) as const

export const METRICS: MetricDef[] = [
  { id: 'walkTop', group: 'Speed', label: 'Walk top speed', unit: 'px/s', tolerance: T3 },
  { id: 'runTop', group: 'Speed', label: 'Run top speed', unit: 'px/s', tolerance: T3 },
  { id: 'pTop', group: 'Speed', label: 'P-speed', unit: 'px/s', tolerance: T3 },
  { id: 'tWalkTop', group: 'Speed', label: 'Time to walk top speed', unit: 'ms', tolerance: TICK },
  { id: 'tRunTop', group: 'Speed', label: 'Time to run top speed', unit: 'ms', tolerance: TICK },
  { id: 'tPTop', group: 'Speed', label: 'Time to P-speed', unit: 'ms', tolerance: TICK },
  { id: 'stopWalk', group: 'Stopping', label: 'Stopping distance from walk', unit: 'px', tolerance: px(2) },
  { id: 'stopRun', group: 'Stopping', label: 'Stopping distance from run', unit: 'px', tolerance: px(2) },
  { id: 'stopP', group: 'Stopping', label: 'Stopping distance from P-speed', unit: 'px', tolerance: px(2) },
  { id: 'skid', group: 'Stopping', label: 'Skid: distance to reverse from run', unit: 'px', tolerance: px(3) },
  { id: 'apexTap', group: 'Jump apex', label: 'Tap jump, standing', unit: 'px', tolerance: px(2) },
  { id: 'apexStand', group: 'Jump apex', label: 'Hold jump, standing', unit: 'px', tolerance: px(2) },
  { id: 'apexWalk', group: 'Jump apex', label: 'Hold jump, walking', unit: 'px', tolerance: px(2) },
  { id: 'apexRun', group: 'Jump apex', label: 'Hold jump, running', unit: 'px', tolerance: px(2) },
  { id: 'apexP', group: 'Jump apex', label: 'Hold jump, P-speed', unit: 'px', tolerance: px(2) },
  { id: 'airTap', group: 'Airtime', label: 'Tap jump, standing', unit: 'ms', tolerance: TICK },
  { id: 'airStand', group: 'Airtime', label: 'Hold jump, standing', unit: 'ms', tolerance: TICK },
  { id: 'airWalk', group: 'Airtime', label: 'Hold jump, walking', unit: 'ms', tolerance: TICK },
  { id: 'airRun', group: 'Airtime', label: 'Hold jump, running', unit: 'ms', tolerance: TICK },
  { id: 'airP', group: 'Airtime', label: 'Hold jump, P-speed', unit: 'ms', tolerance: TICK },
  { id: 'distRun', group: 'Jump distance', label: 'Running jump, takeoff to landing', unit: 'px', tolerance: px(4) },
  { id: 'distP', group: 'Jump distance', label: 'P-speed jump, takeoff to landing', unit: 'px', tolerance: px(4) },
  { id: 'maxFall', group: 'Falling', label: 'Max fall speed', unit: 'px/s', tolerance: T3 },
  { id: 'coyote', group: 'Grace windows', label: 'Coyote time', unit: 'ms', tolerance: TICK, note: 'window = steps after leaving the ledge in which a press still jumps, +1' },
  { id: 'buffer', group: 'Grace windows', label: 'Jump buffer', unit: 'ms', tolerance: TICK, note: 'window = steps before landing in which a press still jumps, +1' },
  { id: 'wallSlide', group: 'Walls', label: 'Wall slide speed', unit: 'px/s', tolerance: { kind: 'report' } },
  { id: 'wallJump', group: 'Walls', label: 'Wall jump apex', unit: 'px', tolerance: { kind: 'report' } },
]

export type MetricSet = Record<string, number | null>

/** Largest `after`/`before` (in frames) probed for the coyote and buffer windows. */
const PROBE_MAX = 14

/** Run every script through `runner` and compute every metric. A metric is `null` when the runner can't produce it or the Hero didn't behave (no jump, never stopped). */
export function measureAll(runner: HeroRunner): MetricSet {
  const out: MetricSet = Object.fromEntries(METRICS.map((m) => [m.id, null]))
  const run = (s: InputScript) => runner(s.frames, s.scenario)

  const walk = run(walkScript())
  const runT = run(runScript())
  if (walk && runT) Object.assign(out, speedMetrics(walk, runT))

  for (const [id, kind] of [['stopWalk', 'walk'], ['stopRun', 'run'], ['stopP', 'p']] as const) {
    const s = stopScript(kind)
    const t = run(s)
    if (t) out[id] = stopDistance(t, s.marks.release!)
  }
  {
    const s = skidScript()
    const t = run(s)
    if (t) out.skid = skidDistance(t, s.marks.reverse!)
  }

  const jumps: [string, string, TakeoffKind, boolean, boolean][] = [
    ['apexTap', 'airTap', 'stand', true, false],
    ['apexStand', 'airStand', 'stand', false, false],
    ['apexWalk', 'airWalk', 'walk', false, false],
    ['apexRun', 'airRun', 'run', false, true],
    ['apexP', 'airP', 'p', false, true],
  ]
  for (const [apexId, airId, kind, tap, wantDist] of jumps) {
    const s = jumpScript(kind, tap)
    const t = run(s)
    const m = t ? jumpMetrics(t, s.marks.jump!) : null
    if (!m) continue
    out[apexId] = m.apex
    out[airId] = m.airtime
    if (wantDist) out[kind === 'run' ? 'distRun' : 'distP'] = m.distance
  }

  const drop = dropScript()
  const dt = run(drop)
  if (dt) out.maxFall = maxFallSpeed(dt)

  // Coyote: find the frame the Hero leaves the ledge, then press `after` frames later, for increasing `after`.
  const ledgeBase = ledgeWalkScript()
  const lt = run(ledgeBase)
  const leave = lt ? firstAirborneFrame(lt, ledgeBase.marks.start!) : null
  if (leave !== null) {
    let last = -1
    for (let after = 0; after <= PROBE_MAX; after++) {
      const s = coyoteScript(leave, after)
      const t = run(s)
      if (t && jumpedAfter(t, s.marks.press!)) last = after
      else break
    }
    out.coyote = last < 0 ? 0 : (last + 1) * FRAME_MS
  }

  // Buffer: tap jump, find the landing frame, then press `before` frames before it, for increasing `before`.
  const jb = bufferScript(null, null)
  const bt = run(jb)
  const land = bt ? landingFrame(bt, jb.marks.jump!) : null
  if (land !== null) {
    let last = -1
    for (let before = 0; before <= PROBE_MAX; before++) {
      const s = bufferScript(land, before)
      const t = run(s)
      // The second press only counts if the Hero jumps again AFTER landing: look for a rise after the landing frame.
      if (t && jumpedAfterLanding(t, land)) last = before
      else break
    }
    out.buffer = last < 0 ? 0 : (last + 1) * FRAME_MS
  }

  const wall = wallScript()
  const wt = run(wall)
  if (wt) {
    out.wallSlide = meanFallSpeed(wt, wall.marks.slideFrom!, wall.marks.jump!)
    out.wallJump = apexAfter(wt, wall.marks.jump!)
  }
  return out
}

/** After landing at `landFrame`, did the Hero rise off the floor again within 10 frames? */
function jumpedAfterLanding(traj: Trajectory, landFrame: number): boolean {
  const landed = traj.find((s) => frameOfSample(s) >= landFrame)
  if (!landed) return false
  const end = landed.t_ms + 10 * FRAME_MS
  return traj.some((s) => s.t_ms > landed.t_ms && s.t_ms <= end + 1e-6 && s.y > landed.y + 0.5)
}

// ------------------------------------------------------------------------------------------------ comparing

export interface MetricRow {
  def: MetricDef
  old: number | null
  neu: number | null
  diff: number | null
  /** true / false, or null when there is nothing to judge (a report-only metric, or a value is missing). */
  pass: boolean | null
}

export function toleranceText(t: MetricDef['tolerance'], unit: MetricDef['unit']): string {
  if (t.kind === 'rel') return `±${(t.frac * 100).toFixed(0)}%`
  if (t.kind === 'abs') return `±${unit === 'ms' ? `${t.amount.toFixed(1)} ms (1 tick)` : `${t.amount} ${unit}`}`
  return 'report'
}

export function compare(old: MetricSet, neu: MetricSet): MetricRow[] {
  return METRICS.map((def) => {
    const o = old[def.id] ?? null
    const n = neu[def.id] ?? null
    const diff = o !== null && n !== null ? n - o : null
    let pass: boolean | null = null
    if (diff !== null && def.tolerance.kind !== 'report') {
      const limit = def.tolerance.kind === 'rel' ? Math.abs(o!) * def.tolerance.frac : def.tolerance.amount
      pass = Math.abs(diff) <= limit + 1e-9
    }
    if (diff === null && def.tolerance.kind !== 'report' && o !== null) pass = false
    return { def, old: o, neu: n, diff, pass }
  })
}
