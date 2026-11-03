/**
 * The studio's side of a Hackable room (docs/qa/hackable-rooms M1): what the store and the Stage need from a session.
 *
 * The host's project goes to the room: a moment after each change the bricks change live for everyone, and the host's
 * Play (or Play again) starts everyone again from the project as it is. Anyone else's studio just shows the room's game.
 */
import type { LevelDesign } from '../core/contracts'
import { designText } from '../core/save'
import type { StudioRoom, StudioStore } from '../studio/store'
import type { RoomSession } from './session'

/** How long after the host's last change the project goes out live. */
export const LIVE_EDIT_DELAY_MS = 800

export class StudioRoomLink implements StudioRoom {
  /** The project text the room last started from, and the one it last got. */
  private restartedWith: string
  private sentLast: string
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(readonly session: RoomSession, startedWith: string) {
    this.restartedWith = this.sentLast = startedWith
  }

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

  frame(now: number) {
    const ticks = this.session.frame(now)
    const tick = this.session.link.serverTick(now)
    return { ticks, fraction: tick === null ? 1 : tick - Math.floor(tick) }
  }

  playAgain(design: LevelDesign, always: boolean) {
    if (!this.session.view.host) return
    clearTimeout(this.timer)
    const text = designText(design)
    if (!always && text === this.restartedWith) {
      // Nothing new to start from; a change not sent yet still goes out live.
      this.sendLive(text)
      return
    }
    if (this.session.sendProject(text, true)) this.restartedWith = this.sentLast = text
  }

  private sendLive(text: string) {
    if (text === this.sentLast) return
    if (this.session.sendProject(text, false)) this.sentLast = text
  }

  /** The host's changes go out live a moment after they stop. Returns the way to stop watching. */
  watch(store: StudioStore): () => void {
    let design = store.getState().project.design
    const unsubscribe = store.subscribe(() => {
      const next = store.getState().project.design
      if (next === design || !this.session.view.host) return
      design = next
      clearTimeout(this.timer)
      this.timer = setTimeout(() => this.sendLive(designText(design)), LIVE_EDIT_DELAY_MS)
    })
    return () => {
      clearTimeout(this.timer)
      unsubscribe()
    }
  }
}
