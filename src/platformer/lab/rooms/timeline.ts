/**
 * A Hackable room's game over time (docs/qa/hackable-rooms M0), the Hackable twin of the classic rooms' Timeline
 * (packages/platformer-core/src/net/timeline.ts).
 *
 * Every event (a player's key, a join, an edit) applies just before a stamped tick runs. Our own events apply at once
 * and wait for the room to confirm them; everyone else's arrive already ordered, usually a few ticks late. When an
 * event lands on a tick already played, the timeline goes back to the copy it kept from before that tick and plays
 * forward again with the event in place. Every browser ends up with the same game, and our own Hero never waits.
 *
 * Copies are kept every `snapshotEvery` ticks (a Racing world takes about 3 ms to copy, so not every tick), and only
 * for `history` ticks; an event older than that can't be placed, and the caller asks the room for a fresh keyframe.
 * Sounds and other notes from ticks played again are dropped: they were heard the first time.
 */
import type { World } from '../core/contracts'
import type { Runtime } from '../core/runtime'
import { copyWorld, worldFingerprint } from '../core/snapshot'

export interface EventRecord<E> {
  /** The tick this event applies before. */
  tick: number
  /** The room's order. Our own events have none until the room confirms them. */
  seq: number | null
  /** Player number of the author; 0 for the room itself. */
  by: number
  /** The author's id for the event, to match the room's confirmation. */
  cid: string
  ev: E
}

/** Apply one event to the game. Return a runtime to carry on with instead (a restart builds a fresh game). */
export type ApplyEvent<E> = (runtime: Runtime, ev: E, by: number) => Runtime | void

export interface TimelineOptions {
  /** Ticks of the past to keep (classic rooms: 300, ten seconds). */
  history?: number
  /** Keep a copy of the game every this many ticks. */
  snapshotEvery?: number
}

/** The first copy: scripts a green flag just started are only written into the world by a step, so write them now. */
function startCopy(runtime: Runtime): World {
  runtime.syncThreadsToWorld()
  return copyWorld(runtime.world)
}

export class HackableTimeline<E> {
  runtime: Runtime
  readonly history: number
  readonly snapshotEvery: number
  /** snaps.get(t): the game as it was when tick t was about to run, before its events. */
  private snaps = new Map<number, World>()
  private byTick = new Map<number, EventRecord<E>[]>()
  /** The events each played tick was played with (their cids in order), to tell what really changed. */
  private applied = new Map<number, string>()
  private pending = new Map<string, EventRecord<E>>()
  private dirtyFrom = Infinity
  /** The furthest tick ever played, to tell ticks played again from first plays. */
  private frontier: number
  rewinds = 0
  replayedTicks = 0

  constructor(runtime: Runtime, private readonly apply: ApplyEvent<E>, opts: TimelineOptions = {}) {
    this.runtime = runtime
    this.history = opts.history ?? 300
    this.snapshotEvery = Math.max(1, opts.snapshotEvery ?? 4)
    this.frontier = runtime.world.tick
    this.snaps.set(runtime.world.tick, startCopy(runtime))
  }

  /** The next tick to run. */
  get tick(): number {
    return this.runtime.world.tick
  }

  get oldestTick(): number {
    return this.tick - this.history
  }

  /** Start again from a fresh game (joining late, or a resync from the room's keyframe). */
  reset(runtime: Runtime): void {
    this.runtime = runtime
    this.snaps.clear()
    this.byTick.clear()
    this.applied.clear()
    this.pending.clear()
    this.dirtyFrom = Infinity
    this.frontier = runtime.world.tick
    this.snaps.set(runtime.world.tick, startCopy(runtime))
  }

  private bucket(tick: number): EventRecord<E>[] {
    let list = this.byTick.get(tick)
    if (!list) this.byTick.set(tick, (list = []))
    return list
  }

  private touched(tick: number): void {
    if (tick < this.tick) this.dirtyFrom = Math.min(this.dirtyFrom, tick)
  }

  /** Our own event: applied straight away, until the room confirms or refuses it. */
  addLocal(rec: EventRecord<E>): void {
    this.pending.set(rec.cid, rec)
    this.bucket(rec.tick).push(rec)
    this.touched(rec.tick)
  }

  isPending(cid: string): boolean {
    return this.pending.has(cid)
  }

  /** The room accepted one of our events, maybe at another tick. */
  confirm(cid: string, tick: number, seq: number): void {
    const rec = this.pending.get(cid)
    if (!rec) return
    this.pending.delete(cid)
    if (rec.tick !== tick) {
      this.remove(rec)
      rec.tick = tick
      this.bucket(tick).push(rec)
    }
    rec.seq = seq
    this.touched(rec.tick)
  }

  /** The room refused one of our events: as if it never happened. */
  reject(cid: string): void {
    const rec = this.pending.get(cid)
    if (!rec) return
    this.pending.delete(cid)
    this.remove(rec)
  }

  /** Someone else's event, already ordered by the room. False when it is too old to place: ask for a keyframe. */
  addRemote(rec: EventRecord<E>): boolean {
    if (rec.tick <= this.oldestTick) return false
    this.bucket(rec.tick).push(rec)
    this.touched(rec.tick)
    return true
  }

  private remove(rec: EventRecord<E>): void {
    const list = this.byTick.get(rec.tick)
    const i = list ? list.indexOf(rec) : -1
    if (i >= 0) list!.splice(i, 1)
    this.touched(rec.tick)
  }

  /** A tick's events in the order they apply: the room's order first, then our own unconfirmed ones as sent. */
  eventsAt(tick: number): EventRecord<E>[] {
    const list = this.byTick.get(tick)
    if (!list || list.length === 0) return []
    return [...list].sort((a, b) => {
      if (a.seq !== null && b.seq !== null) return a.seq - b.seq
      if (a.seq !== null) return -1
      if (b.seq !== null) return 1
      return 0
    })
  }

  private signature(events: EventRecord<E>[]): string {
    return events.map((e) => e.cid).join(',')
  }

  /** Play up to (not including) tick `target`, going back first if an earlier tick's events changed. */
  advanceTo(target: number): boolean {
    let ok = true
    if (this.dirtyFrom < this.tick) ok = this.rewind()
    this.dirtyFrom = Infinity
    while (this.tick < target) this.stepOne()
    this.prune()
    return ok
  }

  /** False when the copy to go back to is gone (the event was too old): ask the room for a keyframe. */
  private rewind(): boolean {
    const end = this.tick
    let from = -1
    for (let t = Math.max(this.dirtyFrom, this.oldestTick + 1); t < end; t++) {
      if (this.signature(this.eventsAt(t)) !== (this.applied.get(t) ?? '')) {
        from = t
        break
      }
    }
    if (from < 0) return true
    // The newest copy at or before the first changed tick.
    let at = from
    while (at >= 0 && !this.snaps.has(at)) at--
    const snap = this.snaps.get(at)
    if (!snap) return false
    this.rewinds++
    this.runtime.restoreWorld(copyWorld(snap))
    while (this.tick < end) {
      this.replayedTicks++
      this.stepOne()
    }
    return true
  }

  private stepOne(): void {
    const t = this.tick
    const events = this.eventsAt(t)
    const replay = t < this.frontier
    const notesBefore = this.runtime.notes.length
    for (const e of events) {
      const next = this.apply(this.runtime, e.ev, e.by)
      if (next) this.runtime = next
    }
    this.applied.set(t, this.signature(events))
    this.runtime.step()
    // A tick played again already made its sounds the first time.
    if (replay) this.runtime.notes.length = Math.min(this.runtime.notes.length, notesBefore)
    const now = this.tick
    if (now > this.frontier) this.frontier = now
    if (now % this.snapshotEvery === 0) this.snaps.set(now, copyWorld(this.runtime.world))
  }

  private prune(): void {
    const cutoff = this.oldestTick
    // Keep the newest copy at or before the cutoff, so every tick still in history has one to go back to.
    let keep = -1
    for (const t of this.snaps.keys()) if (t <= cutoff && t > keep) keep = t
    for (const t of [...this.snaps.keys()]) if (t < cutoff && t !== keep) this.snaps.delete(t)
    for (const t of [...this.byTick.keys()]) if (t < cutoff) this.byTick.delete(t)
    for (const t of [...this.applied.keys()]) if (t < cutoff) this.applied.delete(t)
  }

  /** The game's fingerprint now (the room compares them every so often; see core/snapshot.ts). */
  fingerprint(): number {
    return worldFingerprint(this.runtime.world)
  }
}
