import type { BrickInstance } from '../../brick/types'
import { connect } from '../model/control'
import { deriveCreations, type DerivedCreation } from '../model/creations'
import { FOUR_WHEEL_IDS, GATE_IDS, ROVER_IDS, SIGNAL_IDS, fixtureInput, fourWheelBricks, gateBricks, roverBricks, signalPostBricks } from '../model/fixtures'
import { emptyRoboticsSection, type RoboticsSection } from '../model/section'
import type { HubPort } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'

/**
 * Test support (not shipped): the three spike builds as named, wired creations, derived
 * through `deriveCreations` exactly as the app derives them.
 */
export type WiredFixture = { bricks: BrickInstance[]; section: RoboticsSection; creation: DerivedCreation }

export function wiredCreation(bricks: BrickInstance[], anchorId: string, hubId: string, cables: readonly (readonly [string, HubPort])[], name = 'Test'): WiredFixture {
  installRoboticsParts(true)
  let section: RoboticsSection = { ...emptyRoboticsSection(), creations: [{ id: 'c1', name, anchorBrickIds: [anchorId] }] }
  for (const [deviceId, port] of cables) section = connect(section, deviceId, hubId, port)
  const [creation] = deriveCreations(fixtureInput(bricks, section))
  return { bricks, section, creation }
}

/** Rover: left motor on A, right motor on B (mounted mirror-wise, so reversed), front sensor on C. */
export function wiredRover(options: Parameters<typeof roverBricks>[0] & { unplug?: string[] } = {}): WiredFixture {
  const cables = ([[ROVER_IDS.leftMotor, 'A'], [ROVER_IDS.rightMotor, 'B'], [ROVER_IDS.sensor, 'C']] as const).filter(([id]) => !options.unplug?.includes(id))
  return wiredCreation(roverBricks(options), ROVER_IDS.hub, ROVER_IDS.hub, cables, 'Buggy')
}

/** Four-wheel car: front left motor on A, front right on B, back left on C, back right on D (the order a student adds them). */
export function wiredFourWheel(options: Parameters<typeof fourWheelBricks>[0] & { unplug?: string[] } = {}): WiredFixture {
  const ids = FOUR_WHEEL_IDS
  const cables = ([[ids.frontLeftMotor, 'A'], [ids.frontRightMotor, 'B'], [ids.backLeftMotor, 'C'], [ids.backRightMotor, 'D']] as const).filter(([id]) => !options.unplug?.includes(id))
  return wiredCreation(fourWheelBricks(options), ids.hub, ids.hub, cables, 'Four-wheel car')
}

/** Gate: arm (hinge) motor on A, sensor on B. */
export function wiredGate(): WiredFixture {
  return wiredCreation(gateBricks(), GATE_IDS.hinge, GATE_IDS.hub, [[GATE_IDS.hinge, 'A'], [GATE_IDS.sensor, 'B']], 'Gate')
}

/** Signal post: sensor on A, light on B. */
export function wiredSignalPost(): WiredFixture {
  return wiredCreation(signalPostBricks(), SIGNAL_IDS.hub, SIGNAL_IDS.hub, [[SIGNAL_IDS.sensor, 'A'], [SIGNAL_IDS.light, 'B']], 'Signal post')
}
