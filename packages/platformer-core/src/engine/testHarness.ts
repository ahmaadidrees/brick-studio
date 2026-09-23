import { levelFromAscii } from '../levels/ascii'
import type { WorldEvent } from './events'
import { DEFAULT_FEEL, feelToSub, type Feel } from './feel'
import type { LevelDesign } from './level'
import {
  NO_INPUT,
  createPlayer,
  grantEffect,
  respawn,
  stepPlayer,
  type PlayerContext,
  type PlayerInput,
  type PlayerSound,
} from './player'
import { advanceWorld, createWorld } from './world'

/** A single-player world stepped exactly like the game does it, for tests and tools. */
export function harness(level: string[] | LevelDesign, feel: Feel = DEFAULT_FEEL) {
  const design = Array.isArray(level) ? levelFromAscii(level) : level
  const world = createWorld(design)
  const p = createPlayer(1)
  const pending: WorldEvent[] = []
  const emitted: WorldEvent[] = []
  const sounds: PlayerSound[] = []
  const ctx: PlayerContext = {
    world,
    feel: feelToSub(feel),
    tick: 0,
    emit: (ev) => {
      pending.push(ev)
      emitted.push(ev)
    },
    sound: (s) => sounds.push(s),
    others: [],
  }
  respawn(p, ctx, true)
  function step(input: Partial<PlayerInput> = {}) {
    const events = pending.splice(0).map((ev) => ({ ev, by: p.num }))
    advanceWorld(world, events)
    for (const e of world.effects) grantEffect(p, e, ctx)
    ctx.tick = world.tick
    stepPlayer(p, { ...NO_INPUT, ...input }, ctx)
  }
  function run(frames: number, input: Partial<PlayerInput> = {}) {
    for (let i = 0; i < frames; i++) step(input)
  }
  return { world, p, ctx, step, run, sounds, emitted }
}
