import type { WorldEvent } from '../engine/events'
import { advanceWorld, restoreWorld, snapshotWorld, type Effect, type World } from '../engine/world'

/**
 * The shared world over time. Holds a snapshot of every recent tick and every event that applies
 * at each tick. When an event turns up late (someone else's stomp that happened 80 ms ago), the
 * timeline rewinds to just before it and replays forward. The replay is cheap: only the world
 * (enemies, blocks, items) is re-simulated; each game's own player is not part of it.
 */

export interface EventRecord {
  /** The tick at which the event applies (before that tick's movement). */
  tick: number
  /** Server order. Unconfirmed local events have none yet. */
  seq: number | null
  /** Player number of the author. */
  by: number
  ev: WorldEvent
  /** Author's id for the event, used to match the server's confirmation. */
  cid: string
}

export type EffectSink = (effects: readonly Effect[], tick: number) => void

export class Timeline {
  world: World
  private snaps = new Map<number, World>()
  private byTick = new Map<number, EventRecord[]>()
  private applied = new Map<number, string>()
  private pending = new Map<string, EventRecord>()
  private dirtyFrom = Infinity
  /** Highest tick ever simulated, to tell replays from first runs. */
  private frontier: number
  rollbacks = 0
  replayedTicks = 0

  constructor(
    world: World,
    private readonly onEffects: EffectSink,
    readonly history = 300,
  ) {
    this.world = world
    this.frontier = world.tick
    this.snaps.set(world.tick, snapshotWorld(world))
  }

  get tick(): number {
    return this.world.tick
  }

  get oldestTick(): number {
    return this.world.tick - this.history
  }

  /** Replace everything with a fresh world (joining, resync). */
  reset(world: World) {
    this.world = world
    this.snaps.clear()
    this.byTick.clear()
    this.applied.clear()
    this.pending.clear()
    this.dirtyFrom = Infinity
    this.frontier = world.tick
    this.snaps.set(world.tick, snapshotWorld(world))
  }

  private bucket(tick: number): EventRecord[] {
    let list = this.byTick.get(tick)
    if (!list) {
      list = []
      this.byTick.set(tick, list)
    }
    return list
  }

  private touched(tick: number) {
    if (tick <= this.world.tick) this.dirtyFrom = Math.min(this.dirtyFrom, tick)
  }

  /** Our own event, applied straight away (speculatively) and later confirmed by the server. */
  addLocal(rec: EventRecord) {
    this.pending.set(rec.cid, rec)
    this.bucket(rec.tick).push(rec)
    this.touched(rec.tick)
  }

  isPending(cid: string): boolean {
    return this.pending.has(cid)
  }

  /** The server accepted one of our events, possibly at a different tick. */
  confirm(cid: string, tick: number, seq: number) {
    const rec = this.pending.get(cid)
    if (!rec) return
    this.pending.delete(cid)
    if (rec.tick !== tick) {
      this.remove(rec)
      rec.tick = tick
      this.bucket(tick).push(rec)
      this.touched(tick)
    }
    rec.seq = seq
    this.touched(rec.tick)
  }

  /** The server refused one of our events: undo it. */
  reject(cid: string) {
    const rec = this.pending.get(cid)
    if (!rec) return
    this.pending.delete(cid)
    this.remove(rec)
  }

  /** Someone else's event, already ordered by the server. */
  addRemote(rec: EventRecord): boolean {
    if (rec.tick <= this.oldestTick) return false
    this.bucket(rec.tick).push(rec)
    this.touched(rec.tick)
    return true
  }

  private remove(rec: EventRecord) {
    const list = this.byTick.get(rec.tick)
    if (!list) return
    const i = list.indexOf(rec)
    if (i >= 0) list.splice(i, 1)
    this.touched(rec.tick)
  }

  /** Events for a tick in application order: server order first, then our unconfirmed ones. */
  eventsAt(tick: number): EventRecord[] {
    const list = this.byTick.get(tick)
    if (!list || list.length === 0) return []
    return [...list].sort((a, b) => {
      if (a.seq !== null && b.seq !== null) return a.seq - b.seq
      if (a.seq !== null) return -1
      if (b.seq !== null) return 1
      return 0
    })
  }

  private signature(events: EventRecord[]): string {
    return events.map((e) => e.cid).join(',')
  }

  /** Bring the world to `target`, rewinding first if earlier ticks changed. */
  advanceTo(target: number): boolean {
    let ok = true
    if (this.dirtyFrom <= this.world.tick) ok = this.rewind()
    this.dirtyFrom = Infinity
    while (this.world.tick < target) this.stepOne()
    this.prune()
    return ok
  }

  private rewind(): boolean {
    const end = this.world.tick
    // Find the first tick whose event list really differs from what was simulated.
    let from = -1
    for (let t = Math.max(this.dirtyFrom, this.oldestTick + 1); t <= end; t++) {
      if (this.signature(this.eventsAt(t)) !== (this.applied.get(t) ?? '')) {
        from = t
        break
      }
    }
    if (from < 0) return true
    const snap = this.snaps.get(from - 1)
    if (!snap) return false
    this.rollbacks++
    this.world = restoreWorld(snap)
    while (this.world.tick < end) {
      this.replayedTicks++
      this.stepOne()
    }
    return true
  }

  private stepOne() {
    const t = this.world.tick + 1
    const events = this.eventsAt(t)
    advanceWorld(
      this.world,
      events.map((e) => ({ ev: e.ev, by: e.by })),
    )
    this.applied.set(t, this.signature(events))
    this.snaps.set(t, snapshotWorld(this.world))
    if (t > this.frontier) this.frontier = t
    this.onEffects(this.world.effects, t)
  }

  private prune() {
    const cutoff = this.oldestTick
    for (const t of this.snaps.keys()) if (t < cutoff) this.snaps.delete(t)
    for (const t of this.byTick.keys()) if (t < cutoff) this.byTick.delete(t)
    for (const t of this.applied.keys()) if (t < cutoff) this.applied.delete(t)
  }

  /** The world as it was at a past tick, if still remembered. */
  worldAt(tick: number): World | undefined {
    return this.snaps.get(tick)
  }
}
