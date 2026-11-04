/**
 * Racing build, parity bucket A (2026-11-03): laps −/+ in Build, boost pads that point a way (and boost only cars going
 * that way, like classic), arrows on the finish line, and Computer racers that steer and brake instead of turning
 * instantly. Old race tracks open with their pads pointing the finish line's way.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { play } from '../../core/index'
import { validateDesign } from '../../core/project'
import { EARLIER_BUILT_IN_FINGERPRINTS, upgradeUntouchedBricks, workspaceFingerprint } from '../remix'
import { StudioStore } from '../store'
import { CAR_BRICK_ID, RACE_GLOBALS, RACER_BRICK_ID } from './carBrick'
import { createRaceStarterProject } from './raceProject'
import { boostCostume, boostCostumeR1 } from './raceTrack'
import { LapsChip, MAX_LAPS } from './screens/LapsChip'
import racerR1 from './__fixtures__/racer-r1.json'

afterEach(cleanup)

const PAD_COL = 30

/** Drive the Car across the beginner track's boost pad (column 30), pointing `direction`, gas held. Boost left after. */
function acrossThePad(direction: number): number {
  const design = createRaceStarterProject().design
  const rt = play(design)
  rt.step()
  const car = rt.world.targets.find((t) => t.brickId === CAR_BRICK_ID && !t.isClone)!
  car.variables.car_go = 1
  car.x = PAD_COL * 16 + 8 - (direction === 90 ? 24 : -24)
  car.y = 7 * 16 + 8
  car.direction = direction
  rt.pressKey('up arrow')
  let most = 0
  for (let i = 0; i < 20; i++) {
    car.variables.car_go = 1
    rt.step()
    most = Math.max(most, Number(car.variables.car_boost_left))
  }
  return most
}

describe('boost pads point a way', () => {
  it('the beginner pad points right, like its finish line, and boosts a car going right but not one going left', () => {
    const pad = createRaceStarterProject().design.bricks.find((b) => b.id === 'brick_boost')!
    expect(pad.grid?.way).toBe(90)
    expect(acrossThePad(90)).toBeGreaterThan(0)
    expect(acrossThePad(-90)).toBe(0)
  })

  it('turning the pad turns its cells and which cars it boosts', () => {
    const store = new StudioStore(createRaceStarterProject())
    store.setGridWay('brick_boost', -90)
    const rt = play(store.getState().project.design)
    const cell = rt.world.targets.find((t) => t.brickId === 'brick_boost')!
    expect(cell.direction).toBe(-90)
    expect(validateDesign({ ...store.getState().project.design, bricks: store.getState().project.design.bricks.map((b) => (b.id === 'brick_boost' ? { ...b, grid: { ...b.grid!, way: 45 } } : b)) }).map((p) => p.path)).toContain('bricks[4].grid.way')
  })

  it('a track saved before opens with its pad pointing the finish line\'s way, and R1\'s art turned to point it', () => {
    const project = createRaceStarterProject()
    const pad = project.design.bricks.find((b) => b.id === 'brick_boost')!
    delete pad.grid!.way
    pad.costumes = [boostCostumeR1()]
    const up = upgradeUntouchedBricks(project)
    const upPad = up.design.bricks.find((b) => b.id === 'brick_boost')!
    expect(upPad.grid?.way).toBe(90)
    expect(upPad.costumes[0]!.asset).toBe(boostCostume().asset)
    // A pad the kid repainted keeps its picture.
    const painted = createRaceStarterProject()
    const mine = painted.design.bricks.find((b) => b.id === 'brick_boost')!
    delete mine.grid!.way
    mine.costumes = [{ ...boostCostumeR1(), asset: 'data:image/png;base64,AAAA' }]
    expect(upgradeUntouchedBricks(painted).design.bricks.find((b) => b.id === 'brick_boost')!.costumes[0]!.asset).toBe('data:image/png;base64,AAAA')
  })
})

describe('Computer racers steer and brake', () => {
  it('turn at most their steering a tick (no instant turns), and still go round', { timeout: 30_000 }, () => {
    const rt = play(createRaceStarterProject().design)
    const racers = rt.world.targets.filter((t) => t.brickId === RACER_BRICK_ID && !t.isClone)
    const steering = Number(racers[0]!.variables.racer_steering)
    let worst = 0
    for (let i = 0; i < 1500; i++) {
      const before = racers.map((r) => r.direction)
      rt.step()
      racers.forEach((r, k) => {
        const d = Math.abs(((r.direction - before[k]! + 540) % 360) - 180)
        worst = Math.max(worst, d)
      })
    }
    expect(worst).toBeLessThanOrEqual(steering + 1e-6)
    expect(Math.max(...racers.map((r) => r.lap?.lap ?? 0))).toBeGreaterThanOrEqual(1)
  })

  it('lift off and brake when the track turns more than 52 degrees from where they point, at speed', () => {
    const rt = play(createRaceStarterProject().design)
    const racer = rt.world.targets.find((t) => t.brickId === RACER_BRICK_ID && !t.isClone)!
    for (let i = 0; i < 300; i++) rt.step()
    expect(Number(racer.variables.racer_fwd)).toBeGreaterThan(3)
    expect(Number(racer.variables.racer_brake_in)).toBe(0)
    racer.direction += 120
    rt.step()
    expect([Number(racer.variables.racer_gas), Number(racer.variables.racer_brake_in)]).toEqual([0, 1])
  })

  it('an untouched R1 racer upgrades, keeping its sliders', () => {
    expect(workspaceFingerprint(racerR1.workspace)).toBe('3f8004eb')
    expect(EARLIER_BUILT_IN_FINGERPRINTS[RACER_BRICK_ID]).toContain('3f8004eb')
    const project = createRaceStarterProject()
    const racer = project.design.bricks.find((b) => b.id === RACER_BRICK_ID)!
    racer.program = structuredClone(racerR1.program) as never
    racer.program.variables = racer.program.variables.map((v) => (v.id === 'racer_top' ? { ...v, value: 4 } : v))
    project.workspaces[RACER_BRICK_ID] = structuredClone(racerR1.workspace)
    const up = upgradeUntouchedBricks(project)
    expect(up.workspaces[RACER_BRICK_ID]).toEqual(createRaceStarterProject().workspaces[RACER_BRICK_ID])
    expect(up.design.bricks.find((b) => b.id === RACER_BRICK_ID)!.program.variables.find((v) => v.id === 'racer_top')!.value).toBe(4)
  })
})

describe('laps in Build', () => {
  it('− and + set the race\'s laps, 1 to 9', () => {
    const store = new StudioStore(createRaceStarterProject())
    render(<LapsChip store={store} />)
    const laps = () => store.getState().project.design.stage.program.variables.find((v) => v.id === RACE_GLOBALS.lapsToWin)!.value
    expect(screen.getByText('3 laps')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'More laps' }))
    expect(laps()).toBe(4)
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole('button', { name: 'Fewer laps' }))
    expect(laps()).toBe(1)
    expect(screen.getByText('1 lap')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Fewer laps' }) as HTMLButtonElement).disabled).toBe(true)
    for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole('button', { name: 'More laps' }))
    expect(laps()).toBe(MAX_LAPS)
  })
})
