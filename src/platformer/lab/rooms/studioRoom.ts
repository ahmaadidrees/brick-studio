/**
 * The studio's side of a Hackable room (docs/qa/hackable-rooms M1, M2): what the store and the Stage need from a
 * session.
 *
 * Since M2 the project's changes go out as they happen, from everyone allowed to make them (rooms/building.ts), so
 * Play changes nothing for anyone; the host's Restart (and Play again) starts everyone again from the project as it is.
 */
import { designKit, type LevelDesign } from '../core/contracts'
import type { StudioRoom } from '../studio/store'
import type { RoomSession } from './session'

/** What a Hackable 3D project's room says, until its rooms come (D3, docs/qa/hackable-3d/SPIKE.md). */
export const ROOMS_3D_SOON = 'Playing Hackable 3D together is coming soon.'

/** Why this project cannot be played together in a room yet, in the kid's words, or null when it can. */
export function roomRefusal(design: Pick<LevelDesign, 'kit'>): string | null {
  return designKit(design) === '3d' ? ROOMS_3D_SOON : null
}

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
