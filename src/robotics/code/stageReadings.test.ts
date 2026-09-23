import { beforeAll, describe, expect, it } from 'vitest'
import { FOUR_WHEEL_IDS, GATE_IDS, ROVER_IDS, SIGNAL_IDS } from '../model/fixtures'
import { wiredFourWheel, wiredGate, wiredRover, wiredSignalPost } from '../program/testFixtures'
import { starterFor } from '../program/starters'
import { installRoboticsParts } from '../parts/install'
import type { MotorReading, RunObservation } from '../run/types'
import { joystickAxes } from './StageInput'
import { programTurnsOnPurpose, programUsesInput, readingChips, stageStatus } from './stageReadings'
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
      ['Motors', 'Left 40 · Right 40 %', 'speed 38 · 37 %', 'live'],
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
    expect(chips[1]).toMatchObject({ value: 'Left 50 · Right −50 %', detail: 'speed 45 · −45 % · Right motor faces the other way', tone: 'bad' })
  })

  it('says which part is not plugged in, and shows dashes before a stage exists', () => {
    const { creation } = wiredRover({ unplug: [ROVER_IDS.leftMotor] })
    expect(readingChips(creation, null).map((chip) => [chip.label, chip.value])).toEqual([
      ['Front sensor', '—'], ['Motors', 'Left motor not plugged in'], ['Speed', '—'],
    ])
    expect(readingChips(creation, null)[1].detail).toBe('Left motor · Right motor')
    // While it runs, the motor still plugged in shows that it turns.
    const running = readingChips(creation, observation({ motors: { [ROVER_IDS.leftMotor]: motor({ plugged: false, speedPercent: 4 }), [ROVER_IDS.rightMotor]: motor({ powerPercent: 40, speedPercent: 26, forwardPercent: -26 }) } }))
    expect(running[1]).toMatchObject({ value: 'Left motor not plugged in', detail: 'Right motor speed −26 %', tone: 'warn' })
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

describe('the Motors chip on a four-wheel car (every motor counted)', () => {
  const ids = FOUR_WHEEL_IDS
  /** Readings as the run controller reports them: the right side's motors run reversed. */
  const car = (felt: Record<string, number>, speed = (percent: number) => percent * 0.97) => Object.fromEntries(Object.entries(felt).map(([id, power]) => {
    const reversed = id === ids.frontRightMotor || id === ids.backRightMotor
    return [id, motor({ powerPercent: reversed ? -power : power, speedPercent: reversed ? -speed(power) : speed(power), forwardPercent: speed(power) })]
  }))

  it('one chip for all four motors, by side, and the speed', () => {
    const { creation } = wiredFourWheel()
    const chips = readingChips(creation, observation({ motors: car({ [ids.frontLeftMotor]: 40, [ids.backLeftMotor]: 40, [ids.frontRightMotor]: 40, [ids.backRightMotor]: 40 }), speedStudsPerSecond: 3.9 }))
    expect(chips.map((chip) => [chip.label, chip.value, chip.detail ?? '', chip.tone])).toEqual([
      ['Motors', 'Left 40 · Right 40 %', 'speed 39 · 39 %', 'live'],
      ['Speed', '3.9 st/s', '', 'live'],
    ])
    expect(readingChips(creation, null).map((chip) => [chip.label, chip.value, chip.detail ?? ''])).toEqual([['Motors', '—', '2 on the left · 2 on the right'], ['Speed', '—', '']])
  })

  it('a program that runs only the first two motors: the chip names the two left still', () => {
    const { creation } = wiredFourWheel()
    const chip = readingChips(creation, observation({ motors: car({ [ids.frontLeftMotor]: 40, [ids.backLeftMotor]: 0, [ids.frontRightMotor]: 40, [ids.backRightMotor]: 0 }, (percent) => percent / 2) }))[0]
    expect(chip).toMatchObject({ value: 'Left 40 · Right 40 %', detail: 'speed 10 · 10 % · Back left motor and Back right motor are not running', tone: 'warn' })
  })

  it('raw blocks at 50 % on all four: the sides fight and the chip says the right motors face the other way', () => {
    const { creation } = wiredFourWheel()
    const motors = Object.fromEntries([ids.frontLeftMotor, ids.backLeftMotor, ids.frontRightMotor, ids.backRightMotor].map((id) => {
      const right = id === ids.frontRightMotor || id === ids.backRightMotor
      return [id, motor({ powerPercent: 50, speedPercent: 45, forwardPercent: right ? -45 : 45 })]
    }))
    expect(readingChips(creation, observation({ motors }))[0]).toMatchObject({ value: 'Left 50 · Right −50 %', detail: 'speed 45 · −45 % · the right motors face the other way', tone: 'bad' })
  })

  it('a motor on a side running against the others is named', () => {
    const { creation } = wiredFourWheel()
    const chip = readingChips(creation, observation({ motors: car({ [ids.frontLeftMotor]: 40, [ids.backLeftMotor]: -40, [ids.frontRightMotor]: 40, [ids.backRightMotor]: 40 }, () => 0) }))[0]
    expect(chip).toMatchObject({ value: 'Left 40 · Right 40 %', detail: 'speed 0 · 0 % · Back left motor runs the other way', tone: 'bad' })
  })

  it('an unplugged motor on either side; the rest show that they turn', () => {
    const { creation } = wiredFourWheel({ unplug: [ids.backRightMotor] })
    expect(readingChips(creation, null)[0]).toMatchObject({ value: 'Back right motor not plugged in', detail: '2 on the left · 2 on the right', tone: 'warn' })
    const running = readingChips(creation, observation({ motors: car({ [ids.frontLeftMotor]: 40, [ids.backLeftMotor]: 40, [ids.frontRightMotor]: 40, [ids.backRightMotor]: 0 }) }))[0]
    expect(running).toMatchObject({ value: 'Back right motor not plugged in', detail: 'speed 39 · 39 %', tone: 'warn' })
    const three = wiredFourWheel({ unplug: [ids.frontLeftMotor, ids.backLeftMotor, ids.backRightMotor] }).creation
    expect(readingChips(three, null)[0].value).toBe('3 motors not plugged in')
  })

  it('a motor facing the wrong way is not on a side: it keeps its own chip', () => {
    const { creation } = wiredFourWheel({ backRightFacingBack: true })
    const chips = readingChips(creation, observation({ motors: { ...car({ [ids.frontLeftMotor]: 40, [ids.backLeftMotor]: 40, [ids.frontRightMotor]: 40 }), [ids.backRightMotor]: motor({ powerPercent: 0, speedPercent: 0, positionDegrees: 0 }) } }))
    expect(chips.map((chip) => [chip.label, chip.value])).toEqual([['Motors', 'Left 40 · Right 40 %'], ['Speed', '0.0 st/s'], ['Back motor', '0 %']])
  })
})

describe('a turn the program asks for is not a fight', () => {
  it('with the helpers only, sides running opposite ways read as a turn; with raw blocks, as a fight', () => {
    const ids = FOUR_WHEEL_IDS
    // The joystick pushed hard right: every motor at +100, the left side rolls forward, the right side back.
    const motors = Object.fromEntries([ids.frontLeftMotor, ids.backLeftMotor, ids.frontRightMotor, ids.backRightMotor].map((id) => {
      const right = id === ids.frontRightMotor || id === ids.backRightMotor
      return [id, motor({ powerPercent: 100, speedPercent: 76, forwardPercent: right ? -76 : 76 })]
    }))
    const { creation } = wiredFourWheel()
    expect(readingChips(creation, observation({ motors }), { turnsOnPurpose: true })[0]).toMatchObject({ value: 'Left 100 · Right −100 %', detail: 'speed 76 · −76 %', tone: 'live' })
    expect(readingChips(creation, observation({ motors }))[0]).toMatchObject({ detail: 'speed 76 · −76 % · the right motors face the other way', tone: 'bad' })
  })

  it('knows a helpers-only program from one that runs a drive motor with a raw block', () => {
    const { creation } = wiredRover()
    const program = (...body: { type: string; fields?: Record<string, unknown> }[]) => {
      const blocks = body.map((block, index) => ({ ...block, id: `b${index}` })) as { type: string; id: string; next?: unknown }[]
      for (let index = blocks.length - 1; index > 0; index -= 1) blocks[index - 1].next = { block: blocks[index] }
      return { blocks: { languageVersion: 0, blocks: [{ type: 'robo_when_run', id: 'hat', next: { block: blocks[0] } }] } }
    }
    expect(programTurnsOnPurpose(starterFor(creation, 'joystick-drive')!.workspace, creation)).toBe(true)
    expect(programTurnsOnPurpose(starterFor(creation, 'stop-before-wall')!.workspace, creation)).toBe(true)
    expect(programTurnsOnPurpose(program({ type: 'robo_turn', fields: { DIRECTION: 'left' } }), creation)).toBe(true)
    // Contract failure F2: two raw blocks on the mirror-mounted pair.
    expect(programTurnsOnPurpose(program({ type: 'robo_run_motor', fields: { MOTOR: ROVER_IDS.leftMotor } }, { type: 'robo_run_motor', fields: { MOTOR: ROVER_IDS.rightMotor } }), creation)).toBe(false)
    expect(programTurnsOnPurpose(program({ type: 'robo_drive', fields: { DIRECTION: 'forward' } }, { type: 'robo_turn_motor_to', fields: { MOTOR: ROVER_IDS.rightMotor } }), creation)).toBe(false)
    // A raw block on a motor that does not drive leaves the helpers' turns alone; no helper, no turn on purpose.
    expect(programTurnsOnPurpose(program({ type: 'robo_turn', fields: { DIRECTION: 'left' } }, { type: 'robo_run_motor', fields: { MOTOR: 'an-arm-motor' } }), creation)).toBe(true)
    expect(programTurnsOnPurpose(starterFor(creation, 'blank')!.workspace, creation)).toBe(false)
    expect(programTurnsOnPurpose(starterFor(creation, 'joystick-drive')!.workspace, { ...creation, drivePair: null })).toBe(false)
  })
})

describe('status, input and framing', () => {
  it('words the stage status', () => {
    expect(stageStatus(null, true).text).toBe('Getting ready…')
    expect(stageStatus(observation({ phase: 'ready' }), false).text).toBe('Ready')
    expect(stageStatus(observation(), false).text).toBe('Running · 2.1 s')
    expect(stageStatus(observation({ idle: true }), false)).toMatchObject({ text: 'Done · 2.1 s', detail: 'Every script has finished.' })
    const driving = observation({ idle: true })
    driving.motors = { m: { powerPercent: 40, speedPercent: 38, positionDegrees: 90, plugged: true } }
    expect(stageStatus(driving, false)).toMatchObject({ text: 'Done · motors still on', detail: 'Every script has finished. Motors keep their last command until Stop.' })
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
