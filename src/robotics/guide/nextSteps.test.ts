import { beforeAll, describe, expect, it } from 'vitest'
import type { BrickInstance } from '../../brick/types'
import { readiness } from '../drive/readiness'
import { deriveCreations } from '../model/creations'
import { FOUR_WHEEL_IDS, GATE_IDS, ROVER_IDS, SIGNAL_IDS, fixtureInput, fourWheelBricks, gateBricks, roverBricks, signalPostBricks } from '../model/fixtures'
import { emptyRoboticsSection, type RoboticsConnection } from '../model/section'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { nextSteps, type NextStep } from './nextSteps'

beforeAll(() => installRoboticsParts(true))

/**
 * Every path and every partial state of it, built from the spike's fixture bricks with
 * parts taken away (or turned), exactly as a student could leave them. Each case also
 * checks the guide against `readiness()`: the highlighted step says what the button's
 * reason says, and "Ready to …" is highlighted exactly when the button is on.
 */
type Wire = [deviceId: string, hubId: string, port: RoboticsConnection['port']]

function robot(bricks: BrickInstance[], anchor: string, wires: Wire[] = []) {
  const section = { ...emptyRoboticsSection(), creations: [{ id: 'robot', name: 'Buggy', anchorBrickIds: [anchor] }], connections: wires.map(([deviceId, hubId, port]) => ({ deviceId, hubId, port })) }
  const input = fixtureInput(bricks, section)
  const creation = deriveCreations(input)[0]
  const rows = nextSteps(creation, { input })
  checkAgainstReadiness(rows, readiness(creation))
  return { creation, rows }
}

function checkAgainstReadiness(rows: NextStep[], status: ReturnType<typeof readiness>) {
  const current = rows.filter((row) => row.group === 'step' && row.state === 'current')
  expect(current.length).toBeLessThanOrEqual(1)
  if (status.ready) {
    expect(current[0]?.id).toBe('ready')
    expect(current[0]?.action).toEqual({ kind: 'play', creationId: 'robot' })
  } else if (current[0]) {
    expect(current[0].text).toBe(status.reason)
    expect(current[0].id).not.toBe('ready')
  } else {
    // Nothing to do yet but choose: the reason is the choosing line.
    expect(status.kind).toBeNull()
    expect(rows.filter((row) => row.group === 'choice').every((row) => row.state === 'current')).toBe(true)
  }
  const ready = rows.find((row) => row.id === 'ready')
  if (ready && !status.ready) expect(ready).toMatchObject({ state: 'todo', action: null })
}

const pick = (bricks: BrickInstance[], ...ids: string[]) => bricks.filter((brick) => ids.includes(brick.id))
const without = (bricks: BrickInstance[], ...ids: string[]) => bricks.filter((brick) => !ids.includes(brick.id))
const at = (id: string, partId: string, x: number, y: number, z: number, rotation: 0 | 1 | 2 | 3 = 0): BrickInstance => ({ id, partId, x, y, z, rotation, color: '#52636c' })
const current = (rows: NextStep[]) => rows.find((row) => row.state === 'current' && row.group === 'step') ?? null
const states = (rows: NextStep[]) => rows.filter((row) => row.group === 'step').map((row) => `${row.id}:${row.state}`)
const row = (rows: NextStep[], id: string) => rows.find((candidate) => candidate.id === id)!

const R = ROVER_IDS
const ROVER_WIRES: Wire[] = [[R.leftMotor, R.hub, 'A'], [R.rightMotor, R.hub, 'B'], [R.sensor, R.hub, 'C']]

describe('the rover path', () => {
  it('a motor on the bare ground: a plate comes first', () => {
    const { rows } = robot([at('m', ROBOTICS_PART_IDS.motor, 30, 0, 30)], 'm')
    expect(current(rows)).toMatchObject({ id: 'plate', text: 'Put a plate down. Then move the motor onto it.', action: { kind: 'arm', partId: 'plate_6x8', rotation: 0 }, icon: { part: 'plate_6x8' } })
    expect(states(rows)).toEqual(['plate:current', 'hub:todo', 'motors:todo', 'axles:todo', 'wheels:todo', 'plug:todo', 'ready:todo'])
  })

  it('a plate and a motor: the hub is next, and it arms the hub', () => {
    const { rows } = robot(pick(roverBricks(), R.plate, R.rightMotor), R.plate)
    expect(current(rows)).toMatchObject({ id: 'hub', text: 'Add a hub. It is the robot’s brain.', action: { kind: 'arm', partId: ROBOTICS_PART_IDS.hub, rotation: 0 } })
    expect(row(rows, 'plate').state).toBe('done')
    // Steps ahead stay tappable (a student may build in any order); plugging in waits for a hub.
    expect(row(rows, 'axles').action).toMatchObject({ kind: 'arm', partId: ROBOTICS_PART_IDS.axleShort })
    expect(row(rows, 'plug')).toMatchObject({ state: 'todo', action: null })
  })

  it('one motor: the other side, armed facing the other way', () => {
    const { rows } = robot(pick(roverBricks(), R.plate, R.hub, R.rightMotor), R.hub, [[R.rightMotor, R.hub, 'A']])
    expect(current(rows)).toMatchObject({ id: 'motors', text: 'Put a motor on the other side.', action: { kind: 'arm', partId: ROBOTICS_PART_IDS.motor, rotation: 2 } })
    // With the left motor instead, the second one comes armed facing right.
    const other = robot(pick(roverBricks(), R.plate, R.hub, R.leftMotor), R.hub, [[R.leftMotor, R.hub, 'A']])
    expect(current(other.rows)?.action).toEqual({ kind: 'arm', partId: ROBOTICS_PART_IDS.motor, rotation: 0 })
  })

  it('two motors facing each other: turn the one on the left, then the one on the right', () => {
    const bricks = [...pick(roverBricks(), R.plate, R.hub), at('in-left', ROBOTICS_PART_IDS.motor, 28, 1, 31, 0), at('in-right', ROBOTICS_PART_IDS.motor, 31, 1, 31, 2)]
    const { rows } = robot(bricks, R.hub)
    expect(current(rows)).toMatchObject({ id: 'motors', text: 'Turn the left motor to face out.', action: { kind: 'select', brickId: 'in-left' }, icon: { symbol: 'turn' } })
    const turned = robot([...pick(roverBricks(), R.plate, R.hub), at('in-left', ROBOTICS_PART_IDS.motor, 28, 1, 31, 2), at('in-right', ROBOTICS_PART_IDS.motor, 31, 1, 31, 2)], R.hub)
    expect(current(turned.rows)).toMatchObject({ text: 'Turn the right motor to face out.', action: { kind: 'select', brickId: 'in-right' } })
  })

  it('two motors on the same side, both facing out that way: put them on opposite sides', () => {
    const bricks = [at('p', 'plate_6x8', 28, 0, 26), at('front', ROBOTICS_PART_IDS.motor, 28, 1, 26, 2), at('back', ROBOTICS_PART_IDS.motor, 28, 1, 31, 2), at('h', ROBOTICS_PART_IDS.hub, 28, 7, 26)]
    const { rows } = robot(bricks, 'p')
    expect(current(rows)).toMatchObject({ id: 'motors', text: 'Put the motors on opposite sides, facing out.', action: { kind: 'select', brickId: 'back' } })
  })

  it('a motor mounted outboard facing in is fine once its axle and wheel are on (it drives straight)', () => {
    // The checkpoint-2 "other way round" rover: the right motor hangs from a beam outboard of its wheel.
    const outboard = [
      ...pick(roverBricks(), R.plate, R.hub, R.leftMotor, R.leftAxle, R.leftWheel, R.sensor),
      at('pillar', 'pillar_1x1', 33, 1, 32), at('beam', 'brick_1x6', 33, 10, 32, 1), at('riser', 'brick_1x1', 37, 7, 32),
      at('right', ROBOTICS_PART_IDS.motor, 37, 1, 31, 2), at('right-axle', ROBOTICS_PART_IDS.axleShort, 35, 0, 32), at('right-wheel', ROBOTICS_PART_IDS.wheel, 34, 0, 31),
    ]
    const { rows, creation } = robot(outboard, R.hub, [[R.leftMotor, R.hub, 'A'], ['right', R.hub, 'B']])
    expect(creation.drivePair?.reversedIds).toEqual([])
    expect(current(rows)?.id).toBe('ready')
    // Before its wheel goes on, the pair already counts (its axle is in), so the wheel is the next step.
    const noWheel = robot(outboard.filter((brick) => brick.id !== 'right-wheel'), R.hub, [[R.leftMotor, R.hub, 'A'], ['right', R.hub, 'B']])
    expect(current(noWheel.rows)?.text).toMatch(/^Put a wheel on .*’s axle\.$/)
  })

  it('two motors facing out: an axle in each, in turn, lined up with the motor', () => {
    const noAxles = robot(pick(roverBricks(), R.plate, R.hub, R.leftMotor, R.rightMotor), R.hub, ROVER_WIRES.slice(0, 2))
    expect(current(noAxles.rows)).toMatchObject({ id: 'axles', text: 'Put an axle in Left motor.', action: { kind: 'arm', partId: ROBOTICS_PART_IDS.axleShort, rotation: 0 }, icon: { part: ROBOTICS_PART_IDS.axleShort } })
    expect(states(noAxles.rows)).toEqual(['plate:done', 'hub:done', 'motors:done', 'axles:current', 'wheels:todo', 'plug:done', 'ready:todo'])
    const oneAxle = robot(pick(roverBricks(), R.plate, R.hub, R.leftMotor, R.rightMotor, R.leftAxle), R.hub, ROVER_WIRES.slice(0, 2))
    expect(current(oneAxle.rows)?.text).toBe('Put an axle in Right motor.')
  })

  it('a motor facing front or back gets its axle turned a quarter', () => {
    const bricks = [at('p', 'plate_6x8', 28, 0, 26), at('h', ROBOTICS_PART_IDS.hub, 29, 1, 28), at('front', ROBOTICS_PART_IDS.motor, 29, 1, 26, 1), at('back', ROBOTICS_PART_IDS.motor, 29, 1, 31, 3)]
    const { rows } = robot(bricks, 'p')
    expect(current(rows)).toMatchObject({ id: 'axles', action: { kind: 'arm', partId: ROBOTICS_PART_IDS.axleShort, rotation: 1 } })
  })

  it('axles in, wheels next; a wheel left off its axle is named by its motor', () => {
    const noWheels = robot(without(roverBricks(), R.leftWheel, R.rightWheel, R.sensor), R.hub, ROVER_WIRES.slice(0, 2))
    expect(current(noWheels.rows)).toMatchObject({ id: 'wheels', text: 'Put a wheel on Left motor’s axle.', action: { kind: 'arm', partId: ROBOTICS_PART_IDS.wheel, rotation: 0 } })
    const wheelOff = robot(roverBricks({ leftWheelOff: true }), R.hub, ROVER_WIRES)
    expect(current(wheelOff.rows)?.text).toBe('Put a wheel on Left motor’s axle.')
    const oneWheel = robot(without(roverBricks(), R.leftWheel), R.hub, ROVER_WIRES)
    expect(current(oneWheel.rows)?.text).toBe('Put a wheel on Left motor’s axle.')
  })

  it('built but a motor unplugged: plugging it in is one tap', () => {
    const { rows } = robot(roverBricks(), R.hub, ROVER_WIRES.slice(1))
    expect(current(rows)).toMatchObject({ id: 'plug', text: 'Plug Left motor into the hub.', action: { kind: 'plug', deviceId: R.leftMotor }, icon: { symbol: 'plug' } })
  })

  it('ready: "Ready to drive!" opens Drive, then ideas; a sensor facing the front counts', () => {
    const { rows } = robot(roverBricks(), R.hub, ROVER_WIRES)
    expect(current(rows)).toMatchObject({ id: 'ready', text: 'Ready to drive!', action: { kind: 'play', creationId: 'robot' }, icon: { symbol: 'drive' } })
    expect(rows.filter((candidate) => candidate.group === 'step').every((candidate) => candidate.state === 'done' || candidate.id === 'ready')).toBe(true)
    const ideas = rows.filter((candidate) => candidate.group === 'idea')
    expect(ideas.map((idea) => `${idea.id}:${idea.state}`)).toEqual(['idea-sensor:done', 'idea-light:todo', 'idea-seat:todo', 'idea-stack:todo'])
    expect(ideas.map((idea) => idea.text)).toEqual(['Add a sensor at the front. It is the robot’s eyes.', 'Add a light on top.', 'Add a seat. Ride it in Explore.', 'Stack bricks on top. They ride along.'])
    expect(row(rows, 'idea-light').action).toEqual({ kind: 'arm', partId: ROBOTICS_PART_IDS.light, rotation: 0 })
    expect(row(rows, 'idea-stack').action).toEqual({ kind: 'arm', partId: 'brick_2x2', rotation: 0 })
    expect(row(rows, 'idea-sensor').action).toBeNull()
  })

  it('ideas: no sensor arms one facing forward; a sensor facing sideways is turned; done ideas are checked', () => {
    const noSensor = robot(without(roverBricks(), R.sensor), R.hub, ROVER_WIRES.slice(0, 2))
    expect(row(noSensor.rows, 'idea-sensor')).toMatchObject({ state: 'todo', action: { kind: 'arm', partId: ROBOTICS_PART_IDS.distanceSensor, rotation: 0 } })
    const sideways = robot(roverBricks({ sensorSideways: true }), R.hub, ROVER_WIRES)
    expect(row(sideways.rows, 'idea-sensor')).toMatchObject({ text: 'Turn the sensor to face the front.', action: { kind: 'select', brickId: R.sensor }, icon: { symbol: 'turn' } })
    const dressed = robot([...roverBricks(), at('light', ROBOTICS_PART_IDS.light, 29, 7, 27), at('seat', ROBOTICS_PART_IDS.seat, 30, 7, 28), at('roof', 'brick_2x2', 31, 7, 29)], R.hub, [...ROVER_WIRES, ['light', R.hub, 'D']])
    expect(dressed.rows.filter((candidate) => candidate.group === 'idea').map((idea) => idea.state)).toEqual(['done', 'done', 'done', 'done'])
    expect(current(dressed.rows)?.id).toBe('ready')
  })
})

const F = FOUR_WHEEL_IDS
const FOUR_WIRES: Wire[] = [[F.frontLeftMotor, F.hub, 'A'], [F.frontRightMotor, F.hub, 'B'], [F.backLeftMotor, F.hub, 'C'], [F.backRightMotor, F.hub, 'D']]

describe('a four-wheel car (every motor drives)', () => {
  it('all four motors with wheels, plugged in: ready to drive', () => {
    const { rows } = robot(fourWheelBricks(), F.hub, FOUR_WIRES)
    expect(current(rows)?.id).toBe('ready')
    expect(states(rows)).toEqual(['plate:done', 'hub:done', 'motors:done', 'axles:done', 'wheels:done', 'plug:done', 'ready:current'])
  })

  it('every motor needs its axle and its wheel, in build order, named where they stand', () => {
    const noBackAxles = robot(without(fourWheelBricks(), F.backLeftAxle, F.backRightAxle, F.backLeftWheel, F.backRightWheel), F.hub, FOUR_WIRES)
    expect(current(noBackAxles.rows)).toMatchObject({ id: 'axles', text: 'Put an axle in Back left motor.', action: { kind: 'arm', partId: ROBOTICS_PART_IDS.axleShort, rotation: 0 } })
    const wheelOff = robot(fourWheelBricks({ backLeftWheelOff: true }), F.hub, FOUR_WIRES)
    expect(current(wheelOff.rows)).toMatchObject({ id: 'wheels', text: 'Put a wheel on Back left motor’s axle.' })
  })

  it('every motor must be plugged in, not only the first two', () => {
    const { rows } = robot(fourWheelBricks(), F.hub, FOUR_WIRES.filter(([id]) => id !== F.backRightMotor))
    expect(current(rows)).toMatchObject({ id: 'plug', text: 'Plug Back right motor into the hub.', action: { kind: 'plug', deviceId: F.backRightMotor } })
  })

  it('a motor facing backward, its wheel behind it: turn it (the row picks it)', () => {
    const { rows } = robot(fourWheelBricks({ backRightFacingBack: true }), F.hub, FOUR_WIRES)
    expect(current(rows)).toMatchObject({ id: 'motors', text: 'Back motor faces backward. Turn it to face out to the side.', action: { kind: 'select', brickId: F.backRightMotor }, icon: { symbol: 'turn' } })
  })

  it('a missing wheel is asked for before a turned motor', () => {
    const bricks = fourWheelBricks({ backRightFacingBack: true, backLeftWheelOff: true })
    const { rows } = robot(bricks, F.hub, FOUR_WIRES)
    expect(current(rows)?.text).toBe('Put a wheel on Back left motor’s axle.')
  })

  it('a full hub: pick the part to unplug for room, or arm another hub', () => {
    const sensor = at('4wd-sensor', ROBOTICS_PART_IDS.distanceSensor, 30, 1, 18)
    const withSensor = robot([...fourWheelBricks(), sensor], F.hub, [[F.frontLeftMotor, F.hub, 'A'], [F.frontRightMotor, F.hub, 'B'], [sensor.id, F.hub, 'C'], [F.backLeftMotor, F.hub, 'D']])
    expect(current(withSensor.rows)).toMatchObject({ id: 'plug', text: 'The hub is full. Unplug Front sensor to plug in Back right motor.', action: { kind: 'select', brickId: sensor.id } })
    const fifth = [at('4wd-corner-motor', ROBOTICS_PART_IDS.motor, 28, 1, 18, 2), at('4wd-corner-axle', ROBOTICS_PART_IDS.axleShort, 26, 0, 19), at('4wd-corner-wheel', ROBOTICS_PART_IDS.wheel, 25, 0, 18)]
    const five = robot([...fourWheelBricks(), ...fifth], F.hub, FOUR_WIRES)
    expect(current(five.rows)).toMatchObject({ id: 'plug', text: 'The hub is full. Add another hub for Front left motor.', action: { kind: 'arm', partId: ROBOTICS_PART_IDS.hub }, icon: { part: ROBOTICS_PART_IDS.hub } })
  })

  it('wheels all on one side: put the motors on opposite sides', () => {
    const left = [F.frontPlate, F.backPlate, F.hub, F.frontLeftMotor, F.backLeftMotor, F.frontLeftAxle, F.backLeftAxle, F.frontLeftWheel, F.backLeftWheel]
    const { rows } = robot(pick(fourWheelBricks(), ...left), F.hub, [[F.frontLeftMotor, F.hub, 'A'], [F.backLeftMotor, F.hub, 'B']])
    expect(current(rows)).toMatchObject({ id: 'motors', text: 'Put the motors on opposite sides, facing out.', action: { kind: 'select' } })
  })
})

describe('a robot with nothing to do yet', () => {
  it('a hub on a plate offers two ways to go: move (a motor) or see and light up (a sensor)', () => {
    const { rows, creation } = robot(pick(roverBricks(), R.plate, R.hub), R.hub)
    expect(readiness(creation)).toEqual({ kind: null, ready: false, reason: 'Add motors to make it move, or a sensor and a light.' })
    expect(states(rows)).toEqual(['hub:done'])
    expect(rows.filter((candidate) => candidate.group === 'choice')).toEqual([
      { id: 'choose-move', group: 'choice', text: 'Make it move', hint: 'Add motors and wheels.', state: 'current', action: { kind: 'arm', partId: ROBOTICS_PART_IDS.motor, rotation: 0 }, icon: { part: ROBOTICS_PART_IDS.motor } },
      { id: 'choose-see', group: 'choice', text: 'Make it see and light up', hint: 'Add a sensor and a light.', state: 'current', action: { kind: 'arm', partId: ROBOTICS_PART_IDS.distanceSensor, rotation: 0 }, icon: { part: ROBOTICS_PART_IDS.distanceSensor } },
    ])
    expect(rows.some((candidate) => candidate.id === 'ready' || candidate.group === 'idea')).toBe(false)
  })

  it('a hub on the bare ground: moving starts with a plate', () => {
    const { rows } = robot([at('h', ROBOTICS_PART_IDS.hub, 29, 0, 27)], 'h')
    expect(row(rows, 'choose-move')).toMatchObject({ hint: 'Put a plate down. Then move the hub onto it.', action: { kind: 'arm', partId: 'plate_6x8', rotation: 0 } })
  })

  it('a button with no hub: the hub first, the choices after it', () => {
    const { rows } = robot([at('p', 'plate_2x4', 10, 0, 10), at('b', ROBOTICS_PART_IDS.button, 10, 1, 10)], 'p')
    expect(current(rows)?.id).toBe('hub')
    expect(rows.filter((candidate) => candidate.group === 'choice').map((choice) => choice.state)).toEqual(['todo', 'todo'])
  })
})

const G = GATE_IDS
const GATE_WIRES: Wire[] = [[G.hinge, G.hub, 'A'], [G.sensor, G.hub, 'B']]

describe('the gate path', () => {
  it('a hinge motor with no hub: the hub first', () => {
    const { rows, creation } = robot(without(gateBricks(), G.hub, G.sensor, G.door), G.hinge)
    expect(readiness(creation).kind).toBe('try')
    expect(states(rows)).toEqual(['hub:current', 'arm:todo', 'sensor:todo', 'plug:todo', 'ready:todo'])
    expect(row(rows, 'ready').text).toBe('Ready to try!')
  })

  it('no arm on it yet: a long brick on top', () => {
    const { rows } = robot(without(gateBricks(), G.door, G.sensor), G.hinge, GATE_WIRES.slice(0, 1))
    expect(current(rows)).toMatchObject({ id: 'arm', text: 'Put a long brick on top of Arm motor. It will swing.', action: { kind: 'arm', partId: 'brick_1x4', rotation: 0 }, icon: { part: 'brick_1x4' } })
  })

  it('an arm stuck to the frame: take off the brick that holds it (the row selects it)', () => {
    const { rows } = robot(gateBricks({ builtIntoFrame: true }), G.hinge, GATE_WIRES)
    expect(current(rows)).toMatchObject({ id: 'unstick', text: 'The arm is stuck to the frame. Take off the brick that joins them.', action: { kind: 'select', brickId: `${G.bridge}-2` }, icon: { symbol: 'fix' } })
    expect(states(rows)).toEqual(['hub:done', 'arm:done', 'unstick:current', 'sensor:done', 'plug:done', 'ready:todo'])
  })

  it('no sensor: one, so it sees who walks up; then plugged in; then ready to try', () => {
    const noSensor = robot(without(gateBricks(), G.sensor), G.hinge, GATE_WIRES.slice(0, 1))
    expect(current(noSensor.rows)).toMatchObject({ id: 'sensor', text: 'Add a sensor so it can see.', action: { kind: 'arm', partId: ROBOTICS_PART_IDS.distanceSensor } })
    const unplugged = robot(gateBricks(), G.hinge, GATE_WIRES.slice(0, 1))
    expect(current(unplugged.rows)).toMatchObject({ id: 'plug', text: 'Plug Front sensor into the hub.', action: { kind: 'plug', deviceId: G.sensor } })
    const ready = robot(gateBricks(), G.hinge, GATE_WIRES)
    expect(current(ready.rows)).toMatchObject({ id: 'ready', text: 'Ready to try!', icon: { symbol: 'try' } })
    expect(ready.rows.some((candidate) => candidate.group === 'idea')).toBe(false)
  })
})

const S = SIGNAL_IDS

describe('the signal light path', () => {
  it('a sensor with no hub: the hub first', () => {
    const { rows } = robot([at('p', 'plate_2x4', 40, 0, 40), at('s', ROBOTICS_PART_IDS.distanceSensor, 40, 1, 40)], 'p')
    expect(states(rows)).toEqual(['hub:current', 'sensor:done', 'light:todo', 'plug:todo', 'ready:todo'])
  })

  it('hub and sensor: a light next; hub and light: a sensor next', () => {
    const noLight = robot(pick(signalPostBricks(), S.hub, S.sensor), S.hub, [[S.sensor, S.hub, 'A']])
    expect(current(noLight.rows)).toMatchObject({ id: 'light', text: 'Add a light so it can show what it sees.', action: { kind: 'arm', partId: ROBOTICS_PART_IDS.light }, icon: { part: ROBOTICS_PART_IDS.light } })
    const noSensor = robot(pick(signalPostBricks(), S.hub, S.light), S.hub, [[S.light, S.hub, 'A']])
    expect(current(noSensor.rows)).toMatchObject({ id: 'sensor', text: 'Add a sensor so it can see.' })
  })

  it('both, one unplugged: plug it in; both plugged: ready to try', () => {
    const unplugged = robot(signalPostBricks(), S.hub, [[S.sensor, S.hub, 'A']])
    expect(current(unplugged.rows)).toMatchObject({ id: 'plug', text: 'Plug Light into the hub.', action: { kind: 'plug', deviceId: S.light } })
    const ready = robot(signalPostBricks(), S.hub, [[S.sensor, S.hub, 'A'], [S.light, S.hub, 'B']])
    expect(current(ready.rows)).toMatchObject({ id: 'ready', text: 'Ready to try!', action: { kind: 'play', creationId: 'robot' } })
  })
})

describe('after a try (kid lane Y)', () => {
  it('the ready row says what the last try did (a tick when it worked) and still opens Try it', () => {
    const { creation } = robot(signalPostBricks(), S.hub, [[S.sensor, S.hub, 'A'], [S.light, S.hub, 'B']])
    const input = fixtureInput(signalPostBricks(), { ...emptyRoboticsSection(), creations: [{ id: 'robot', name: 'Buggy', anchorBrickIds: [S.hub] }] })
    const worked = nextSteps(creation, { input }, { tried: { worked: true, text: 'It worked! Try it again' } })
    expect(current(worked)).toMatchObject({ id: 'ready', text: 'It worked! Try it again', icon: { symbol: 'worked' }, action: { kind: 'play', creationId: 'robot' } })
    const failed = nextSteps(creation, { input }, { tried: { worked: false, text: 'The light didn’t come on. Try it again' } })
    expect(current(failed)).toMatchObject({ id: 'ready', text: 'The light didn’t come on. Try it again', icon: { symbol: 'try' } })
  })

  it('only a ready robot that is tried shows it: not a rover, not one with a step left', () => {
    const rover = robot(roverBricks(), R.hub, ROVER_WIRES)
    const input = fixtureInput(roverBricks(), emptyRoboticsSection())
    expect(current(nextSteps(rover.creation, { input }, { tried: { worked: true, text: 'It worked! Try it again' } }))).toMatchObject({ id: 'ready', text: 'Ready to drive!' })
    const unplugged = robot(signalPostBricks(), S.hub, [[S.sensor, S.hub, 'A']])
    const rows = nextSteps(unplugged.creation, { input: fixtureInput(signalPostBricks(), emptyRoboticsSection()) }, { tried: { worked: true, text: 'It worked! Try it again' } })
    expect(row(rows, 'ready').text).toBe('Ready to try!')
  })
})
