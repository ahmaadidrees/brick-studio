import { describe, expect, it } from 'vitest'
import { play } from '../../core/index'
import type { Target } from '../../core/contracts'
import { validateDesign } from '../../core/project'
import { computeRaceLoop, raceLapState } from '../../core/race'
import { COUNTDOWN_STEP, createBeginnerRace } from './raceTrack'
import { RACE_GLOBALS } from './carBrick'
import { createStarterProject } from '../starter'
import { exportProjectJson } from '../persist/projectIo'
import { projectFromText } from '../persist/hackableSave'

/** Run the beginner race with nobody touching the keys, writing down what the starter says and when. */
function runRace(maxTicks = 3000) {
  const runtime = play(createBeginnerRace())
  const find = (copyId: string) => runtime.world.targets.find((t) => t.copyId === copyId) as Target
  const starter = find('copy_starter')
  const car = find('copy_car')
  const racers = [find('copy_racer_1'), find('copy_racer_2')]
  const said: Array<{ tick: number; text: string }> = []
  let firstMove = -1
  const startXs = racers.map((r) => r.x)
  for (let tick = 1; tick <= maxTicks; tick++) {
    runtime.step()
    const text = starter.bubble?.text ?? ''
    if (text !== (said[said.length - 1]?.text ?? '')) said.push({ tick, text })
    if (firstMove < 0 && racers.some((r, i) => r.x !== startXs[i])) firstMove = tick
    if ((runtime.world.stage.lists[RACE_GLOBALS.results] ?? []).length === 2 && said[said.length - 1].text.startsWith('Results')) break
  }
  return { runtime, car, racers, said, firstMove, results: runtime.world.stage.lists[RACE_GLOBALS.results] }
}

describe('the beginner race, with no input', () => {
  const race = runRace()

  it('is a valid race project whose road laps', () => {
    const design = createBeginnerRace()
    expect(design.kit).toBe('race')
    expect(validateDesign(design)).toEqual([])
    expect(computeRaceLoop(design.tiles, design.bricks).ok).toBe(true)
  })

  it('counts down 3, 2, 1, Go!, one second apart, and nobody moves before Go', () => {
    expect(race.said.slice(0, 5).map((s) => s.text)).toEqual(['3', '2', '1', 'Go!', ''])
    const ticks = race.said.slice(0, 4).map((s) => s.tick)
    for (let i = 1; i < 4; i++) expect(ticks[i] - ticks[i - 1]).toBe(COUNTDOWN_STEP * 30)
    expect(race.firstMove).toBeGreaterThanOrEqual(ticks[3])
  })

  it('both Computer racers drive 3 laps, then stop', () => {
    for (const r of race.racers) {
      expect(raceLapState(r)?.lap).toBe(3)
      expect(r.variables.racer_go).toBe(0)
    }
    // Laps take a believable time: between 5 and 20 seconds each.
    for (const r of race.racers) {
      const ticks = raceLapState(r)!.lapTicks
      for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeGreaterThan(5 * 30)
      for (let i = 1; i < ticks.length; i++) expect(ticks[i] - ticks[i - 1]).toBeLessThan(20 * 30)
    }
  })

  it('the Car, left alone, never leaves the grid and is last', () => {
    expect(raceLapState(race.car)?.lap ?? 0).toBe(0)
    expect(race.car.variables.car_fwd).toBe(0)
  })

  it('shows the results in finishing order', () => {
    // Whoever finished their third lap first is "1.", by its costume name.
    const byFinish = [...race.racers].sort((a, b) => raceLapState(a)!.lapTicks[2] - raceLapState(b)!.lapTicks[2])
    const name = (t: Target) => race.runtime.world.bricks[t.brickId].costumes[t.costumeIndex].name
    expect(race.results).toEqual([`1. ${name(byFinish[0])}`, `2. ${name(byFinish[1])}`])
    expect(new Set(race.racers.map(name))).toEqual(new Set(['Red racer', 'Blue racer']))
    const last = race.said[race.said.length - 1].text
    expect(last).toBe(`Results: ${race.results.join(' ')}`)
  })

  it('saves and reopens as a race project, finish line and all', () => {
    const project = { ...createStarterProject(), design: createBeginnerRace() }
    const back = projectFromText(exportProjectJson(project))
    expect(back?.design.kit).toBe('race')
    expect(back?.design.bricks.find((b) => b.name === 'Finish line')?.grid).toEqual({ char: 'F', finish: 90 })
    expect(back?.design.tiles).toEqual(project.design.tiles)
  })

  it('runs the same way every time', () => {
    const again = runRace()
    expect(again.said).toEqual(race.said)
    expect(again.racers.map((r) => [r.x, r.y, r.direction])).toEqual(race.racers.map((r) => [r.x, r.y, r.direction]))
  })
})
