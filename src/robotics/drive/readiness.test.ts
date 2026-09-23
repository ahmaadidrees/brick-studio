import { beforeAll, describe, expect, it } from 'vitest'
import { ROVER_IDS, fixtureInput, gateBricks, roverBricks, signalPostBricks, GATE_IDS, SIGNAL_IDS } from '../model/fixtures'
import { deriveCreations } from '../model/creations'
import { emptyRoboticsSection, type RoboticsConnection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import { readiness } from './readiness'

beforeAll(() => installRoboticsParts(true))

const creationOf = (bricks: ReturnType<typeof roverBricks>, anchor: string, connections: RoboticsConnection[]) =>
  deriveCreations(fixtureInput(bricks, { ...emptyRoboticsSection(), creations: [{ id: 'c', name: 'Test', anchorBrickIds: [anchor] }], connections }))[0]

const ROVER_WIRES: RoboticsConnection[] = [
  { deviceId: ROVER_IDS.leftMotor, hubId: ROVER_IDS.hub, port: 'A' },
  { deviceId: ROVER_IDS.rightMotor, hubId: ROVER_IDS.hub, port: 'B' },
  { deviceId: ROVER_IDS.sensor, hubId: ROVER_IDS.hub, port: 'C' },
]

describe('readiness', () => {
  it('a wired rover can drive', () => {
    expect(readiness(creationOf(roverBricks(), ROVER_IDS.hub, ROVER_WIRES))).toEqual({ kind: 'drive', ready: true, reason: null })
  })
  it('a rover with a wheel off says which motor needs its wheel', () => {
    const result = readiness(creationOf(roverBricks({ leftWheelOff: true }), ROVER_IDS.hub, ROVER_WIRES))
    expect(result.ready).toBe(false)
    expect(result.reason).toMatch(/Put a wheel on .*axle/)
  })
  it('an unplugged drive motor is the thing to fix', () => {
    const result = readiness(creationOf(roverBricks(), ROVER_IDS.hub, ROVER_WIRES.slice(1)))
    expect(result).toMatchObject({ kind: 'drive', ready: false })
    expect(result.reason).toMatch(/^Plug .* into the hub\.$/)
  })
  it('a gate can be tried; built into the frame it cannot', () => {
    const wires: RoboticsConnection[] = [{ deviceId: GATE_IDS.hinge, hubId: GATE_IDS.hub, port: 'A' }, { deviceId: GATE_IDS.sensor, hubId: GATE_IDS.hub, port: 'B' }]
    expect(readiness(creationOf(gateBricks(), GATE_IDS.hinge, wires))).toEqual({ kind: 'try', ready: true, reason: null })
    expect(readiness(creationOf(gateBricks({ builtIntoFrame: true }), GATE_IDS.hinge, wires)).reason).toMatch(/stuck to the frame/)
  })
  it('a signal post can be tried', () => {
    const wires: RoboticsConnection[] = [{ deviceId: SIGNAL_IDS.sensor, hubId: SIGNAL_IDS.hub, port: 'A' }, { deviceId: SIGNAL_IDS.light, hubId: SIGNAL_IDS.hub, port: 'B' }]
    expect(readiness(creationOf(signalPostBricks(), SIGNAL_IDS.hub, wires))).toEqual({ kind: 'try', ready: true, reason: null })
  })
})
