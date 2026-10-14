import { describe, expect, it } from 'vitest'
import { DEFAULT_CAR_FEEL, createCar, gridSpots, solidUnder, stepCar } from '../engine/car'
import { DEFAULT_RACE } from '../engine/kits'
import { computeLoop, createLapState, trackLaps } from '../engine/laps'
import { levelFromJson, levelToJson } from '../engine/level'
import { raceAutopilot } from '../engine/raceAutopilot'
import { RT, raceTrack } from '../engine/raceTiles'
import { RACE_COURSES } from './raceCourses'

describe('starter race tracks', () => {
  for (const course of RACE_COURSES) {
    describe(course.title, () => {
      const d = course.level()

      it('laps count, and it saves and loads unchanged', () => {
        const loop = computeLoop(d)
        expect(loop).toMatchObject({ ok: true })
        if (loop.ok) expect(loop.length).toBeGreaterThan(100)
        expect(levelToJson(levelFromJson(JSON.parse(JSON.stringify(levelToJson(d)))))).toEqual(levelToJson(d))
      })

      it('every car on the grid starts on the road, and Walkers stand on it', () => {
        for (const s of gridSpots(d, 4)) {
          expect(solidUnder(d, s.x, s.y, 5.5)).toBe(-1)
          expect(raceTrack(d.tiles[Math.floor(s.y / 16) * d.width + Math.floor(s.x / 16)])).toBe(true)
        }
        for (const o of d.objects) if (o.kind === 'walker') expect(raceTrack(d.tiles[o.y * d.width + o.x])).toBe(true)
      })

      it('has ? blocks and coins to drive through', () => {
        expect(d.tiles.some((t) => t === RT.ITEM)).toBe(true)
        expect(d.tiles.some((t) => t === RT.COIN)).toBe(true)
      })

      it('a computer driver finishes three laps in a sensible time', () => {
        const loop = computeLoop(d)
        const car = createCar(gridSpots(d, 1)[0]), lap = createLapState()
        for (let i = 0; i < 60 * 150 && lap.done < 0; i++) {
          stepCar(car, raceAutopilot(car, loop, d, lap.d), d, DEFAULT_CAR_FEEL, i)
          trackLaps(lap, loop, d, car.x, car.y, i, DEFAULT_RACE.laps)
        }
        expect(lap.lapTimes).toHaveLength(3)
        for (const t of lap.lapTimes.slice(1)) {
          expect(t / 60).toBeGreaterThan(8)
          expect(t / 60).toBeLessThan(40)
        }
      })
    })
  }

  it('ids do not clash', () => {
    expect(new Set(RACE_COURSES.map((c) => c.id)).size).toBe(RACE_COURSES.length)
  })
})
