/**
 * The studio's side of a Hackable room (docs/qa/hackable-rooms M1, M2): what the store and the Stage need from a
 * session.
 *
 * Since M2 the project's changes go out as they happen, from everyone allowed to make them (rooms/building.ts), so
 * Play changes nothing for anyone; the host's Restart (and Play again) starts everyone again from the project as it is.
 */
import type { LevelDesign } from '../core/contracts'
import type { StudioRoom } from '../studio/store'
import type { RoomSession } from './session'

export class StudioRoomLink implements StudioRoom {
  constructor(readonly session: RoomSession) {}

  get runtime() {
    return this.session.facade
  }

  get host() {
    return this.session.view.host
  }

  get me() {
    return this.session.view.me
  }

  get game() {
    return this.session.runtime
  }

  get playStart() {
    return this.session.playStart
  }

  playerName(num: number) {
    return this.session.view.players.find((p) => p.num === num)?.name
  }

  frame(now: number) {
    const ticks = this.session.frame(now)
    const tick = this.session.link.serverTick(now)
    return { ticks, fraction: tick === null ? 1 : tick - Math.floor(tick) }
  }

  /** Play: nothing to do (changes are live). Restart (`always`): the host starts everyone again. */
  playAgain(_design: LevelDesign, always: boolean) {
    if (always && this.session.view.host) this.session.restart()
  }
}
