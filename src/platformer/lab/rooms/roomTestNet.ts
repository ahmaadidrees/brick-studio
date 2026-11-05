/**
 * Test harness for building together (docs/qa/hackable-rooms M2): a room core and players' sessions in one process,
 * every message delivered `lag` ms late, on a clock the test runs forward. Used by together.test.ts and
 * togetherWave2.test.ts; never by the app.
 */
import { worldFingerprint } from '../core/snapshot'
import type { LinkSocket } from './link'
import type { HackableRoomCore, RoomSocket } from './roomCore'
import { RoomSession } from './session'

let now = 0
/** The harness clock (set it in beforeEach). */
export const clock = () => now
export const setNow = (t: number) => { now = t }

export class Net {
  room: HackableRoomCore
  lag: number
  queue: { at: number; fn: () => void }[] = []
  constructor(room: HackableRoomCore, lag = 60) {
    this.room = room
    this.lag = lag
  }
  later(fn: () => void, lag = this.lag) {
    this.queue.push({ at: now + lag, fn })
  }
  /** A socket for a session: open at once, every message delayed both ways. */
  socket = (): LinkSocket => {
    const net = this
    const server: RoomSocket = {
      send: (data) => net.later(() => client.onmessage?.({ data })),
      close: () => net.later(() => { client.readyState = 3; client.onclose?.() }),
    }
    const client = {
      readyState: 1,
      onopen: null as (() => void) | null,
      onmessage: null as ((e: { data: unknown }) => void) | null,
      onclose: null as (() => void) | null,
      send: (data: string) => net.later(() => net.room.message(server, data)),
      close: () => {
        client.readyState = 3
        net.later(() => net.room.disconnect(server), 0)
      },
    }
    this.room.connect(server)
    queueMicrotask(() => client.onopen?.())
    return client
  }
  /** Run time forward in `step` ms steps (1 by default), delivering messages and playing every session's frames. */
  async run(ms: number, sessions: RoomSession[], step = 1) {
    const end = now + ms
    while (now < end) {
      now += step
      await Promise.resolve()
      const due = this.queue.filter((m) => m.at <= now)
      this.queue = this.queue.filter((m) => m.at > now)
      for (const m of due) m.fn()
      if (now % 16 < step) for (const s of sessions) s.frame(now)
    }
  }
}

export function join(net: Net, name: string, host = false, key?: string) {
  const s = new RoomSession({ name, url: 'test://room', socket: net.socket, now: clock, ...(host ? { hostKey: 'HOST' } : {}), ...(key ? { key } : {}) })
  s.connect()
  return s
}

/** Each session's fingerprint of the game a little behind the slowest one (every game has played that far). */
export const agree = (all: RoomSession[]) => {
  const t = Math.min(...all.map((s) => s.timeline!.tick)) - 30
  const at = Math.floor(t / 4) * 4
  return all.map((s) => { const snap = s.timeline!.snapshotAt(at); return snap ? worldFingerprint(snap) : null })
}
