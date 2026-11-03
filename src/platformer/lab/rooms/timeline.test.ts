import { describe, expect, it } from 'vitest'
import type { CopyPlacement, LevelDesign } from '../core/contracts'
import { createRuntime, type Runtime } from '../core'
import { addPlayer } from '../core/players'
import { createStarterProject } from '../studio/starter'
import { HackableTimeline, type EventRecord } from './timeline'

type Ev = { kind: 'join'; name: string } | { kind: 'down' | 'up'; key: string } | { kind: 'beep' }

function setup(snapshotEvery = 4) {
  const design: LevelDesign = createStarterProject().design
  const spawn: CopyPlacement = design.copies.find((c) => c.brickId === 'brick_hero')!
  const rt = createRuntime(design)
  rt.greenFlag()
  const apply = (runtime: Runtime, ev: Ev, by: number) => {
    if (ev.kind === 'join') addPlayer(runtime, { num: by, name: ev.name }, spawn)
    else if (ev.kind === 'beep') runtime.emit({ kind: 'sound', targetId: 'stage', sound: 'beep', volume: 100, pitch: 0, pan: 0 })
    else if (ev.kind === 'down') runtime.pressKey(ev.key, by)
    else runtime.releaseKey(ev.key, by)
  }
  return new HackableTimeline<Ev>(rt, apply, { history: 120, snapshotEvery })
}

let seq = 0
const rec = (tick: number, by: number, ev: Ev, confirmed = true): EventRecord<Ev> => ({ tick, by, ev, cid: `${by}-${tick}-${++seq}`, seq: confirmed ? seq : null })

/** Two players' events: Maya runs right and jumps, Sam joins and runs left. */
function events(): EventRecord<Ev>[] {
  return [
    rec(0, 1, { kind: 'join', name: 'Maya' }),
    rec(3, 2, { kind: 'join', name: 'Sam' }),
    rec(5, 1, { kind: 'down', key: 'right arrow' }),
    rec(9, 2, { kind: 'down', key: 'left arrow' }),
    rec(20, 1, { kind: 'down', key: 'space' }),
    rec(26, 1, { kind: 'up', key: 'space' }),
    rec(31, 2, { kind: 'up', key: 'left arrow' }),
    rec(33, 2, { kind: 'down', key: 'space' }),
    rec(40, 2, { kind: 'up', key: 'space' }),
  ]
}

describe('a Hackable room timeline (docs/qa/hackable-rooms M0)', () => {
  it('events that arrive late give the same game as events that arrived on time', () => {
    const onTime = setup()
    const late = setup()
    const evs = events()
    for (const e of evs) onTime.addRemote({ ...e })
    onTime.advanceTo(60)

    // The late copy hears each event 4 to 7 ticks after its tick, the way a real room would deliver it.
    for (let tick = 0; tick < 60; tick++) {
      for (const e of evs) if (e.tick + 4 + (e.tick % 4) === tick) late.addRemote({ ...e })
      late.advanceTo(tick + 1)
    }
    for (const e of evs) if (e.tick + 4 + (e.tick % 4) >= 60) late.addRemote({ ...e })
    late.advanceTo(60)

    expect(late.rewinds).toBeGreaterThan(0)
    expect(late.fingerprint()).toBe(onTime.fingerprint())
    const heroes = (t: HackableTimeline<Ev>) => t.runtime.world.targets.filter((x) => x.player !== undefined).map((x) => [x.player, x.x, x.y])
    expect(heroes(late)).toEqual(heroes(onTime))
  })

  it('works with a copy every tick as well as every few ticks', () => {
    const a = setup(1)
    const b = setup(5)
    for (const t of [a, b]) {
      for (const e of events()) if (e.tick < 20) t.addRemote({ ...e })
      t.advanceTo(30)
      for (const e of events()) if (e.tick >= 20) t.addRemote({ ...e })
      t.advanceTo(50)
    }
    expect(a.fingerprint()).toBe(b.fingerprint())
  })

  it('our own key applies at once, and moves if the room puts it at another tick', () => {
    const mine = setup()
    const reference = setup()
    for (const t of [mine, reference]) t.addRemote(rec(0, 1, { kind: 'join', name: 'Maya' }))

    const key = rec(10, 1, { kind: 'down', key: 'right arrow' }, false)
    mine.addLocal(key)
    mine.advanceTo(12)
    expect(mine.isPending(key.cid)).toBe(true)
    expect(mine.runtime.world.players?.[0].keys).toEqual(['right arrow'])

    // The room put it at tick 11 instead.
    mine.confirm(key.cid, 11, 500)
    mine.advanceTo(40)
    reference.addRemote({ ...key, tick: 11, seq: 500 })
    reference.advanceTo(40)
    expect(mine.isPending(key.cid)).toBe(false)
    expect(mine.fingerprint()).toBe(reference.fingerprint())
  })

  it('a refused event is undone', () => {
    const mine = setup()
    const reference = setup()
    for (const t of [mine, reference]) t.addRemote(rec(0, 1, { kind: 'join', name: 'Maya' }))
    const key = rec(5, 1, { kind: 'down', key: 'right arrow' }, false)
    mine.addLocal(key)
    mine.advanceTo(20)
    mine.reject(key.cid)
    mine.advanceTo(30)
    reference.advanceTo(30)
    expect(mine.fingerprint()).toBe(reference.fingerprint())
  })

  it('an event older than the history is refused, so the caller asks for a keyframe', () => {
    const t = setup()
    t.advanceTo(200)
    expect(t.addRemote(rec(50, 1, { kind: 'join', name: 'Maya' }))).toBe(false)
    expect(t.addRemote(rec(150, 1, { kind: 'join', name: 'Maya' }))).toBe(true)
    expect(t.advanceTo(201)).toBe(true)
  })

  it('a tick played again does not make its sounds again', () => {
    const t = setup()
    t.addRemote(rec(12, 0, { kind: 'beep' }))
    t.advanceTo(30)
    const beeps = () => t.runtime.notes.filter((n) => n.kind === 'sound' && n.sound === 'beep').length
    expect(beeps()).toBe(1)
    // An earlier event arrives: ticks 10 to 29 are played again, the beep's tick among them.
    t.addRemote(rec(10, 1, { kind: 'join', name: 'Maya' }))
    t.advanceTo(31)
    expect(t.rewinds).toBe(1)
    expect(beeps()).toBe(1)
  })
})
