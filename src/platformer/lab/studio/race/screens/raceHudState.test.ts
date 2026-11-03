import { describe, expect, it } from 'vitest'
import { play } from '../../../core/index'
import type { LevelDesign } from '../../../core/contracts'
import { raceLapState, racePlace } from '../../../core/race'
import { CAR_BRICK_ID, createRacerBrick } from '../carBrick'
import { COUNTDOWN_STEP, createBeginnerRace, raceDesign, TrackPainter, trackChar } from '../raceTrack'
import { ordinal, raceCarOf, readRaceHud, type RaceHudState } from './raceHudState'

/** The beginner race with a Car that drives itself (the Computer racers' blocks), so it finishes with nobody pressing keys. */
function selfDrivingRace(): LevelDesign {
  const design = createBeginnerRace()
  const racer = createRacerBrick().brick
  return { ...design, bricks: design.bricks.map((b) => (b.id === CAR_BRICK_ID ? { ...b, program: racer.program } : b)) }
}

/** Run a race, reading the HUD after every tick. */
function runHud(design: LevelDesign, until: (hud: RaceHudState) => boolean, maxTicks = 4000, every = 1) {
  const runtime = play(design)
  const huds: Array<{ tick: number; hud: RaceHudState }> = []
  for (let tick = 1; tick <= maxTicks; tick++) {
    runtime.step()
    if (tick % every !== 0) continue
    const hud = readRaceHud(runtime.world, design)
    huds.push({ tick, hud })
    if (until(hud)) break
  }
  return { runtime, huds, last: huds[huds.length - 1].hud }
}

describe('the race HUD, read from the beginner race', () => {
  it('mirrors the Starter: 3, 2, 1, Go!, a second apart, then nothing', () => {
    const { huds } = runHud(createBeginnerRace(), () => false, 5 * 30)
    const changes: Array<{ tick: number; text: string | null }> = []
    for (const { tick, hud } of huds) if (!changes.length || hud.countdown !== changes[changes.length - 1].text) changes.push({ tick, text: hud.countdown })
    expect(changes.map((c) => c.text)).toEqual(['3', '2', '1', 'Go!', null])
    for (let i = 1; i < 4; i++) expect(changes[i].tick - changes[i - 1].tick).toBe(COUNTDOWN_STEP * 30)
  })

  it('shows lap 1 of 3 and the Car’s place among three racers from the start', () => {
    const design = createBeginnerRace()
    const runtime = play(design)
    runtime.step()
    const hud = readRaceHud(runtime.world, design)
    expect(hud).toMatchObject({ lap: 1, laps: 3, racers: 3, finished: false, noLaps: null, standings: [] })
    expect(hud.place).toBe(racePlace(runtime.world, raceCarOf(runtime.world, design)!))
    expect([1, 2, 3]).toContain(hud.place)
  })

  it('a Car left alone stays on lap 1, ends up 3rd, and gets no results card when the others finish', { timeout: 30_000 }, () => {
    const { runtime, last } = runHud(createBeginnerRace(), () => false, 3000, 30)
    const racers = runtime.world.targets.filter((t) => t.brickId !== CAR_BRICK_ID && raceLapState(t)?.lap === 3)
    expect(racers).toHaveLength(2)
    expect(last).toMatchObject({ lap: 1, place: 3, finished: false, standings: [] })
    // The Starter is showing the results now: too long for the countdown.
    expect(last.countdown).toBeNull()
  })

  it('counts the laps up and shows the results once the Car finishes', { timeout: 30_000 }, () => {
    const design = selfDrivingRace()
    const { runtime, huds, last } = runHud(design, (hud) => hud.finished, 4000, 5)
    expect(last.finished).toBe(true)
    // The lap went 1, 2, 3 while racing.
    const laps = [...new Set(huds.map((h) => h.hud.lap))]
    expect(laps).toEqual([1, 2, 3])
    const car = raceCarOf(runtime.world, design)!
    expect(raceLapState(car)?.lap).toBe(3)
    // Everyone is on the card, the Car on its own place's line; whoever hasn't finished is still racing.
    expect(last.standings.map((s) => s.place)).toEqual([1, 2, 3])
    expect(new Set(last.standings.map((s) => s.name))).toEqual(new Set(['You', 'Red racer', 'Blue racer']))
    const you = last.standings.find((s) => s.you)!
    expect(you).toMatchObject({ name: 'You', done: true, place: last.place })
    for (const s of last.standings) expect(s.done).toBe(s.place <= last.standings.filter((x) => x.done).length)
  })

  it('names a remixed Car’s results line too', { timeout: 30_000 }, () => {
    const base = selfDrivingRace()
    const design: LevelDesign = {
      ...base,
      bricks: base.bricks.map((b) => (b.id === CAR_BRICK_ID ? { ...b, id: 'brick_mine', name: 'My Car', remixOf: CAR_BRICK_ID } : b)),
      copies: base.copies.map((c) => (c.brickId === CAR_BRICK_ID ? { ...c, brickId: 'brick_mine' } : c)),
    }
    const { last } = runHud(design, (hud) => hud.finished, 4000, 5)
    expect(last.finished).toBe(true)
    expect(last.standings.find((s) => s.you)?.name).toBe('You')
  })

  it('says why laps don’t count on a track with no finish line', () => {
    const p = new TrackPainter(40, 20)
    for (let c = 2; c < 38; c++) for (let r = 2; r < 18; r++) p.set(c, r, trackChar('road'))
    const design = raceDesign({ id: 'r', name: 'Loop', tiles: p.layer(), car: { col: 5, row: 5 }, starter: { col: 3, row: 3 } })
    const runtime = play(design)
    runtime.step()
    const hud = readRaceHud(runtime.world, design)
    expect(hud.noLaps).toBe('Add a finish line so laps can count')
    expect(hud.place).toBe(0)
  })

  it('writes places the way kids say them', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd'])
  })
})
