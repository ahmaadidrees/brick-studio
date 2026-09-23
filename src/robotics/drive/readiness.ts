import { driveSidesOf, type DerivedCreation, type DerivedMotor } from '../model/creations'
import { dot, type Vec3 } from '../model/vec'
import { HUB_PORTS } from '../parts/catalog'

/**
 * Can this creation be played with right now, and if not, the one thing to do first,
 * in words a third grader reads (docs/robotics/KID-UX.md §copy). Pure; the panel's Drive /
 * Try it button and the next-steps guide both read it.
 *
 * - A creation **drives** when every motor has an axle and a wheel, the wheels stand on both
 *   sides, every wheel rolls forward (no motor faces front, back, up or down) and every motor
 *   with a wheel is plugged in: a four-wheel car's four, not only the first two.
 * - A creation with a hinge motor or a light and a sensor can be **tried** (its starter runs
 *   and someone walks up to it).
 */
export type PlayKind = 'drive' | 'try'
export type Readiness = { kind: PlayKind | null; ready: boolean; reason: string | null }

export function readiness(creation: DerivedCreation): Readiness {
  const hasHub = creation.hubs.length > 0
  const motors = creation.motors
  if (motors.length > 0 || creation.kind === 'rover') {
    const notYet = (reason: string): Readiness => ({ kind: 'drive', ready: false, reason })
    if (!hasHub) return notYet('Add a hub. It is the robot’s brain.')
    if (motors.length < 2) return notYet(motors.length === 0 ? 'Add a motor on each side.' : 'Add a motor on the other side.')
    const noAxle = motors.find((motor) => !motor.axleId)
    if (noAxle) return notYet(`Put an axle in ${noAxle.name}.`)
    const noWheel = motors.find((motor) => motor.wheelIds.length === 0)
    if (noWheel) return notYet(`Put a wheel on ${noWheel.name}’s axle.`)
    const sides = driveSidesOf(creation)
    if (!sides) return notYet('Put the motors on opposite sides, facing out.')
    // A wheel that does not roll forward drags the robot sideways (it is braked, even plugged in).
    const onSides = new Set([...sides.left, ...sides.right])
    const astray = motors.find((motor) => !onSides.has(motor.brickId))
    if (astray) return notYet(`${astray.name} faces ${facingWord(astray.socketNormal, sides.forward)}. Turn it to face out to the side.`)
    // An unplugged motor holds its wheel still, so every motor with a wheel must be plugged in.
    const unplugged = motors.find((motor) => !motor.plugged)
    if (unplugged) return notYet(plugIn(creation, unplugged))
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

/** Which way a motor that is not on a side faces: along the robot (forward, backward), or up or down. */
function facingWord(normal: Vec3, forward: Vec3): string {
  if (Math.abs(normal.y) > 0.5) return normal.y > 0 ? 'up' : 'down'
  return dot(normal, forward) >= 0 ? 'forward' : 'backward'
}

/**
 * Plug a motor in, or, when every port of the robot's hubs is taken by its own parts (a Buggy
 * with its sensor and four motors), make room first: unplug a part that does not drive, or add a hub.
 */
function plugIn(creation: DerivedCreation, motor: DerivedMotor): string {
  const devices = [...creation.motors, ...creation.hinges, ...creation.sensors, ...creation.lights, ...creation.buttons]
  const full = creation.hubs.every((hub) => devices.filter((device) => device.port?.hubId === hub.brickId).length >= HUB_PORTS.length)
  if (!full) return `Plug ${motor.name} into the hub.`
  const spare = [...creation.sensors, ...creation.lights, ...creation.buttons, ...creation.hinges].find((device) => device.plugged)
  return spare ? `The hub is full. Unplug ${spare.name} to plug in ${motor.name}.` : `The hub is full. Add another hub for ${motor.name}.`
}
