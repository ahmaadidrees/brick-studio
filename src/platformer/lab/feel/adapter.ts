/**
 * Runs a Code Lab design with a Hero brick through `play()` at 30 ticks per second and returns a trajectory, so it can be
 * compared with the old engine's 60 Hz numbers (STEP5.md, decision 3).
 *
 * Input mapping (per tick = two 60 Hz frames): a key is down for the tick if it was down in EITHER frame
 * (`jumpPressed` is not needed: it is the first tick space is down, which `pressKey` already makes an edge).
 * Keys use Scratch names. `pressKey`/`releaseKey` are called only when a key changes, so `when key pressed` hats fire once
 * per press, like in the real game.
 */
import { play } from '../core/index'
import type { CopyPlacement, LevelDesign, Target } from '../core/contracts'
import { DROP_PX, FRAME_MS, type FrameInput, type HeroRunner, type Sample, type Scenario, type Trajectory } from './metrics'

export const TICK_MS = 1000 / 30

/** The Scratch key behind each input. Controls: arrows, space = jump, x = run (STEP5.md). */
export const KEYS = {
  left: 'left arrow',
  right: 'right arrow',
  jump: 'space',
  run: 'x',
  down: 'down arrow',
} as const satisfies Record<string, string>

/** Keys held during one tick: the OR of its two 60 Hz frames. Frame list length is padded to a whole tick. */
export function tickKeys(frames: FrameInput[]): Set<string>[] {
  const ticks: Set<string>[] = []
  for (let i = 0; i < frames.length; i += 2) {
    const keys = new Set<string>()
    for (const f of [frames[i], frames[i + 1]]) {
      if (!f) continue
      if (f.left) keys.add(KEYS.left)
      if (f.right) keys.add(KEYS.right)
      if (f.jump || f.jumpPressed) keys.add(KEYS.jump)
      if (f.run) keys.add(KEYS.run)
      if (f.down) keys.add(KEYS.down)
    }
    ticks.push(keys)
  }
  return ticks
}

export interface CodeLabHeroOptions {
  /** A flat test level that contains the Hero standing (or about to land) on a floor. */
  design: LevelDesign
  /** The Hero's painted copy id. Default: the first copy of a brick named `heroBrickName`. */
  heroCopyId?: string
  /** Default `Hero`. */
  heroBrickName?: string
  /**
   * Levels for the other scenarios (`ledge`, `wall`). Return `null` if the level can't do it; the metric is then
   * reported as not measurable. `flat` is always `design`, `drop` is `design` with the Hero lifted `DROP_PX` steps.
   */
  designFor?: (scenario: Scenario) => LevelDesign | null
  /** When `designFor` doesn't give a `ledge`, build one: drop every other copy whose centre x is more than this many steps right of the Hero. Default 150. */
  ledgeOffset?: number
}

export function findHeroCopy(options: CodeLabHeroOptions): CopyPlacement {
  const { design } = options
  let copy: CopyPlacement | undefined
  if (options.heroCopyId) copy = design.copies.find((c) => c.id === options.heroCopyId)
  else {
    const name = options.heroBrickName ?? 'Hero'
    const brick = design.bricks.find((b) => b.name === name)
    copy = brick ? design.copies.find((c) => c.brickId === brick.id) : undefined
  }
  if (!copy) throw new Error(`feel adapter: no Hero copy found (${options.heroCopyId ?? options.heroBrickName ?? 'Hero'})`)
  return copy
}

/** The level for a scenario, or null when it can't be built. */
export function designForScenario(options: CodeLabHeroOptions, scenario: Scenario): LevelDesign | null {
  const hero = findHeroCopy(options)
  const custom = options.designFor?.(scenario)
  if (custom) return custom
  switch (scenario) {
    case 'flat':
      return options.design
    case 'drop':
      return { ...options.design, copies: options.design.copies.map((c) => (c.id === hero.id ? { ...c, y: c.y + DROP_PX } : c)) }
    case 'ledge': {
      const edge = hero.x + (options.ledgeOffset ?? 150)
      return { ...options.design, copies: options.design.copies.filter((c) => c.id === hero.id || c.x <= edge) }
    }
    default:
      return null
  }
}

/** A HeroRunner for a Code Lab design. See `CodeLabHeroOptions`. */
export function codeLabRunner(options: CodeLabHeroOptions): HeroRunner {
  const hero = findHeroCopy(options)
  return (frames, scenario) => {
    const design = designForScenario(options, scenario)
    if (!design) return null
    const runtime = play(design)
    const find = (): Target | undefined => runtime.world.targets.find((t) => t.copyId === hero.id && !t.isClone)
    const out: Trajectory = []
    const held = new Set<string>()
    tickKeys(frames).forEach((want, k) => {
      for (const key of want) {
        if (held.has(key)) continue
        held.add(key)
        runtime.pressKey(key)
      }
      for (const key of [...held]) {
        if (want.has(key)) continue
        held.delete(key)
        runtime.releaseKey(key)
      }
      runtime.step()
      const t = find()
      if (!t) throw new Error('feel adapter: the Hero copy is gone')
      // y is the costume centre; only differences are ever used, so the offset from the floor doesn't matter.
      const s: Sample = { t_ms: (k + 1) * 2 * FRAME_MS, x: t.x, y: t.y, onGround: t.body?.onGround ?? false }
      out.push(s)
    })
    return out
  }
}
