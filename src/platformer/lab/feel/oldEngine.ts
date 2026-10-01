/**
 * The old engine (platformer-core, `DEFAULT_FEEL`) driven through its own test harness on small flat levels built in
 * code. Read-only use: nothing here edits platformer-core. This is the "old value" column of FEEL.md.
 *
 * The one place the y-down engine meets the y-up trajectory is `toSample`.
 */
import { SUB, TILE } from '@brick-studio/platformer-core/engine/constants'
import { DEFAULT_FEEL, type Feel } from '@brick-studio/platformer-core/engine/feel'
import { NO_INPUT, type Player, type PlayerInput } from '@brick-studio/platformer-core/engine/player'
import { harness } from '@brick-studio/platformer-core/engine/testHarness'
import { levelFromAscii } from '@brick-studio/platformer-core/levels/ascii'
import { DROP_PX, FRAME_MS, type FrameInput, type HeroRunner, type Sample, type Scenario, type Trajectory } from './metrics'

const WIDTH = 140
const HEIGHT = 24

/** Level rows for each scenario, top to bottom. `fromBottom` 0 is the floor row. */
export function levelRows(scenario: Scenario): string[] {
  const cell = (col: number, fromBottom: number): string => {
    if (scenario === 'ledge') {
      // Floor 3 tiles high up to column 12, then a drop to a 1 tile high floor.
      if (fromBottom === 0) return '#'
      if (fromBottom <= 2 && col < 12) return '#'
      if (fromBottom === 3 && col === 2) return '@'
      return '.'
    }
    if (scenario === 'wall') {
      // A tall hard-block wall at column 10, the start just left of it.
      if (fromBottom === 0) return '#'
      if (col === 10) return 'X'
      if (fromBottom === 1 && col === 8) return '@'
      return '.'
    }
    if (fromBottom === 0) return '#'
    return fromBottom === 1 && col === 2 ? '@' : '.'
  }
  return Array.from({ length: HEIGHT }, (_, r) =>
    Array.from({ length: WIDTH }, (_, c) => cell(c, HEIGHT - 1 - r)).join(''),
  )
}

const toPlayerInput = (f: FrameInput, prev: FrameInput | undefined): PlayerInput => ({
  ...NO_INPUT,
  left: !!f.left,
  right: !!f.right,
  down: !!f.down,
  jump: !!f.jump,
  jumpPressed: !!f.jumpPressed,
  run: !!f.run,
  runPressed: !!f.run && !prev?.run,
})

/** The only y-down to y-up conversion: y is the box bottom, in pixels above the level bottom. x is the box centre. */
function toSample(p: Player, stepIndex: number): Sample {
  const heightPx = (HEIGHT * TILE * SUB - (p.y + p.h)) / SUB
  return { t_ms: (stepIndex + 1) * FRAME_MS, x: (p.x + p.w / 2) / SUB, y: heightPx, onGround: p.onGround }
}

/** A HeroRunner for the old engine. `feel` defaults to the shipped DEFAULT_FEEL. */
export function oldEngineRunner(feel: Feel = DEFAULT_FEEL): HeroRunner {
  return (frames, scenario) => {
    const h = harness(levelFromAscii(levelRows(scenario)), feel)
    // `drop` and `wall` start the Hero high up. This teleport is the only state we touch.
    if (scenario === 'drop' || scenario === 'wall') h.p.y -= DROP_PX * SUB
    const out: Trajectory = []
    let prev: FrameInput | undefined
    frames.forEach((f, i) => {
      h.step(toPlayerInput(f, prev))
      out.push(toSample(h.p, i))
      prev = f
    })
    return out
  }
}
