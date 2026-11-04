/**
 * A Hackable room for screen tests (no network): the screens see one object for the whole room, as with
 * rooms/session.ts's facade, while `rebuild` swaps the game underneath the way the host's Play again does.
 */
import { designKit, type LevelDesign } from '../core/contracts'
import { createRuntime, type Runtime } from '../core/index'
import { addPlayer } from '../core/players'
import type { BroadcastListener } from '../core/runtime'
import { spawnOf } from '../rooms/game'
import type { StudioRoom } from './store'

/** A game of `design` at `tick` with these players' Heroes, green flag fired (rooms/game.ts freshGame and join). */
export function roomGame(design: LevelDesign, players: string[], tick = 0): Runtime {
  const runtime = createRuntime(design)
  runtime.world.tick = tick
  runtime.world.design = design
  const spawn = spawnOf(design)!
  players.forEach((name, i) => addPlayer(runtime, { num: i + 1, name }, spawn, designKit(design)))
  runtime.greenFlag()
  return runtime
}

export class TestRoom implements StudioRoom {
  host = true
  game: Runtime
  playStart: number | null
  readonly runtime: Runtime
  private readonly heard = new Set<BroadcastListener>()
  private unwatch: () => void = () => {}

  constructor(game: Runtime, readonly me = 1, playStart: number | null = game.world.tick) {
    this.game = game
    this.playStart = playStart
    this.watch()
    this.runtime = new Proxy({} as Runtime, {
      get: (_target, prop) => {
        if (prop === 'onBroadcast') return (l: BroadcastListener) => { this.heard.add(l); return () => this.heard.delete(l) }
        const value = Reflect.get(this.game, prop, this.game) as unknown
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(this.game) : value
      },
    })
  }

  private watch() {
    this.unwatch()
    this.unwatch = this.game.onBroadcast((m, from) => { for (const l of [...this.heard]) l(m, from) })
  }

  /** The host's Play again: a new game, starting at its own tick. */
  rebuild(next: Runtime) {
    this.game = next
    this.playStart = next.world.tick
    this.watch()
  }

  playAgain() {}

  frame() {
    return { ticks: 0, fraction: 1 }
  }
}
