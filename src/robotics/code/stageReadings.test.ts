import { beforeAll, describe, expect, it } from 'vitest'
import { GATE_IDS, ROVER_IDS, SIGNAL_IDS } from '../model/fixtures'
import { wiredGate, wiredRover, wiredSignalPost } from '../program/testFixtures'
import { starterFor } from '../program/starters'
import { installRoboticsParts } from '../parts/install'
import type { MotorReading, RunObservation } from '../run/types'
import { joystickAxes } from './StageInput'
import { programUsesInput, readingChips, stageStatus } from './stageReadings'
import { problemList, propFramePoints } from './CodeView'

beforeAll(() => installRoboticsParts(true))

const motor = (reading: Partial<MotorReading>): MotorReading => ({ powerPercent: 0, speedPercent: 0, positionDegrees: 0, plugged: true, ...reading })
const observation = (extra: Partial<RunObservation> = {}): RunObservation => ({
  phase: 'running', tick: 252, timeSeconds: 2.1, sensors: {}, motors: {}, lights: {}, buttons: {}, beams: [], contacts: [], activeBlockIds: [], diagnostics: [], speedStudsPerSecond: 0, variables: {}, ...extra,
})

describe('readings chips', () => {
  it('reads a rover the way the mock does: sensor studs, the drive pair as the creation feels it, speed', () => {
    const { creation } = wiredRover()
    expect(creation.drivePair?.reversedIds).toEqual([ROVER_IDS.rightMotor])
    const chips = readingChips(creation, observation({
      sensors: { [ROVER_IDS.sensor]: { distanceStuds: 2.63, hit: true } },
      // "drive forward at 40 %": the right motor is mounted reversed, so the compiler sends it −40.
      motors: { [ROVER_IDS.leftMotor]: motor({ powerPercent: 40, speedPercent: 38, forwardPercent: 38 }), [ROVER_IDS.rightMotor]: motor({ powerPercent: -40, speedPercent: -37, forwardPercent: 37 }) },
      speedStudsPerSecond: 2.4,
    }))
    expect(chips.map((chip) => [chip.label, chip.value, chip.detail ?? '', chip.tone])).toEqual([
      ['Front sensor', '2.6 studs', '', 'live'],
      ['Motors', '40 · 40 %', 'speed 38 · 37 %', 'live'],
      ['Speed', '2.4 st/s', '', 'live'],
    ])
  })

  it('shows two motors fighting (raw blocks on a reversed pair) and "nothing seen"', () => {
    const { creation } = wiredRover()
    const chips = readingChips(creation, observation({
      sensors: { [ROVER_IDS.sensor]: { distanceStuds: 40, hit: false } },
      motors: { [ROVER_IDS.leftMotor]: motor({ powerPercent: 50, speedPercent: 45, forwardPercent: 45 }), [ROVER_IDS.rightMotor]: motor({ powerPercent: 50, speedPercent: 45, forwardPercent: -45 }) },
    }))
    expect(chips[0].value).toBe('nothing seen')
    expect(chips[1]).toMatchObject({ value: '50 · −50 %', detail: 'speed 45 · −45 %', tone: 'bad' })
  })

  it('says which part is not plugged in, and shows dashes before a stage exists', () => {
    const { creation } = wiredRover({ unplug: [ROVER_IDS.leftMotor] })
    expect(readingChips(creation, null).map((chip) => [chip.label, chip.value])).toEqual([
      ['Front sensor', '—'], ['Motors', 'Left motor not plugged in'], ['Speed', '—'],
    ])
  })

  it('reads a gate’s arm in degrees, and says when it is stuck', () => {
    const { creation } = wiredGate()
    expect(readingChips(creation, observation({ motors: { [GATE_IDS.hinge]: motor({ positionDegrees: 89.6 }) } })).find((chip) => chip.id === GATE_IDS.hinge)).toMatchObject({ value: '90°', tone: 'live' })
    expect(readingChips(creation, observation({ motors: { [GATE_IDS.hinge]: motor({ positionDegrees: 3, stuck: 'blocked' }) } })).find((chip) => chip.id === GATE_IDS.hinge)).toMatchObject({ value: '3°', detail: 'blocked · pushing on something', tone: 'bad' })
  })

  it('shows a light’s colour with a swatch', () => {
    const { creation } = wiredSignalPost()
    const chip = readingChips(creation, observation({ lights: { [SIGNAL_IDS.light]: 'red' } })).find((candidate) => candidate.id === SIGNAL_IDS.light)
    expect(chip).toMatchObject({ value: 'red', swatch: '#ff3b30' })
    expect(readingChips(creation, observation({ lights: { [SIGNAL_IDS.light]: null } })).find((candidate) => candidate.id === SIGNAL_IDS.light)?.value).toBe('off')
  })
})

describe('status, input and framing', () => {
  it('words the stage status', () => {
    expect(stageStatus(null, true).text).toBe('Getting the stage ready…')
    expect(stageStatus(observation({ phase: 'ready' }), false).text).toBe('Ready')
    expect(stageStatus(observation(), false).text).toBe('Running · 2.1 s')
    expect(stageStatus(observation({ idle: true }), false).text).toBe('Running · 2.1 s · scripts done')
    expect(stageStatus(observation({ phase: 'stopped' }), false).text).toBe('Stopped')
  })

  it('offers the joystick only to programs that read it', () => {
    const { creation } = wiredRover()
    expect(programUsesInput(starterFor(creation, 'joystick-drive')!.workspace)).toBe(true)
    expect(programUsesInput(starterFor(creation, 'stop-before-wall')!.workspace)).toBe(false)
  })

  it('turns a drag into joystick axes, clamped to the circle', () => {
    expect(joystickAxes(0, -34, 34)).toEqual({ up: 100, right: 0 })
    expect(joystickAxes(17, 0, 34)).toEqual({ up: 0, right: 50 })
    expect(joystickAxes(0, 200, 34)).toEqual({ up: -100, right: 0 })
    expect(joystickAxes(0, 0, 34)).toEqual({ up: 0, right: 0 })
  })

  it('frames the wall’s corners and the visitor’s path', () => {
    const points = propFramePoints([
      { id: 'wall', kind: 'wall', center: { x: 0, y: 1, z: 10 }, size: { x: 4, y: 2, z: 0.6 } },
      { id: 'visitor', kind: 'visitor', path: [{ x: 5, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }], size: { x: 1, y: 2, z: 0.5 }, secondsPerLeg: 2 },
    ])
    expect(points).toHaveLength(6)
    expect(points[0]).toEqual({ x: -2.4, y: 2, z: 9.3 })
    expect(points[4]).toEqual({ x: 5, y: 2, z: 0 })
  })

  it('lists problems errors first, each message once', () => {
    const list = problemList([
      { code: 'device.unplugged', severity: 'warning', message: 'Left motor is not plugged in', blockId: 'a' },
      { code: 'drive.no-pair', severity: 'error', message: 'Choose two drive motors first', blockId: 'b' },
      { code: 'device.unplugged', severity: 'warning', message: 'Left motor is not plugged in', blockId: 'c' },
    ])
    expect(list.map((problem) => [problem.severity, problem.message])).toEqual([['error', 'Choose two drive motors first'], ['warning', 'Left motor is not plugged in']])
  })
})
