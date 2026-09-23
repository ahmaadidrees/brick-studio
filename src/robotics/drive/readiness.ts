import type { DerivedCreation } from '../model/creations'

/**
 * Can this creation be played with right now, and if not, the one thing to do first,
 * in words a third grader reads (docs/robotics/KID-UX.md §copy). Pure; the panel's Drive /
 * Try it button and the next-steps guide both read it.
 *
 * - A creation with a drive pair and both motors plugged in can **drive**.
 * - A creation with a hinge motor or a light and a sensor can be **tried** (its starter runs
 *   and someone walks up to it).
 */
export type PlayKind = 'drive' | 'try'
export type Readiness = { kind: PlayKind | null; ready: boolean; reason: string | null }

export function readiness(creation: DerivedCreation): Readiness {
  const hasHub = creation.hubs.length > 0
  const motors = creation.motors
  if (motors.length > 0 || creation.kind === 'rover') {
    if (!hasHub) return { kind: 'drive', ready: false, reason: 'Add a hub. It is the robot’s brain.' }
    if (motors.length < 2) return { kind: 'drive', ready: false, reason: motors.length === 0 ? 'Add a motor on each side.' : 'Add a motor on the other side.' }
    const noAxle = motors.find((motor) => !motor.axleId)
    if (noAxle) return { kind: 'drive', ready: false, reason: `Put an axle in ${noAxle.name}.` }
    const noWheel = motors.find((motor) => motor.wheelIds.length === 0)
    if (noWheel) return { kind: 'drive', ready: false, reason: `Put a wheel on ${noWheel.name}’s axle.` }
    const pair = creation.drivePair
    if (!pair) return { kind: 'drive', ready: false, reason: 'Put the motors on opposite sides, facing out.' }
    const unplugged = motors.filter((motor) => (motor.brickId === pair.leftId || motor.brickId === pair.rightId) && !motor.plugged)
    if (unplugged.length) return { kind: 'drive', ready: false, reason: `Plug ${unplugged[0].name} into the hub.` }
    return { kind: 'drive', ready: true, reason: null }
  }
  if (creation.hinges.length > 0) {
    if (!hasHub) return { kind: 'try', ready: false, reason: 'Add a hub. It is the robot’s brain.' }
    const hinge = creation.hinges[0]
    if (hinge.locked) return { kind: 'try', ready: false, reason: 'The arm is stuck to the frame. Take off the brick that joins them.' }
    if (!hinge.plugged) return { kind: 'try', ready: false, reason: `Plug ${hinge.name} into the hub.` }
    return { kind: 'try', ready: true, reason: null }
  }
  if (creation.lights.length > 0 || creation.sensors.length > 0) {
    if (!hasHub) return { kind: 'try', ready: false, reason: 'Add a hub. It is the robot’s brain.' }
    if (!creation.sensors.length) return { kind: 'try', ready: false, reason: 'Add a sensor so it can see.' }
    if (!creation.lights.length) return { kind: 'try', ready: false, reason: 'Add a light so it can show what it sees.' }
    const unplugged = [...creation.sensors, ...creation.lights].find((device) => !device.plugged)
    if (unplugged) return { kind: 'try', ready: false, reason: `Plug ${unplugged.name} into the hub.` }
    return { kind: 'try', ready: true, reason: null }
  }
  return { kind: null, ready: false, reason: hasHub ? 'Add motors to make it move, or a sensor and a light.' : 'Add a hub. It is the robot’s brain.' }
}
