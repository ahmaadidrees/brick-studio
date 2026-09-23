import type { DerivedCreation, DerivedDevice, DerivedMotor } from '../model/creations'
import { dot, scale, sub, type Vec3 } from '../model/vec'
import { ROBOTICS_PART_IDS, roboticsSpec } from '../parts/catalog'

/**
 * Can this creation be played with right now, and if not, the one thing to do first,
 * in words a third grader reads (docs/robotics/KID-UX.md §copy). Pure; the panel's Drive /
 * Try it button and the next-steps guide both read it.
 *
 * - A creation with a drive pair and both motors plugged in can **drive**.
 * - A creation with a hinge motor or a light and a sensor can be **tried** (its starter runs
 *   and someone walks up to it).
 *
 * `readinessPlan` is the same answer as a checklist: the path the robot is on and each step
 * of it, done or not. `readiness().reason` is always the first open step's `now`, so the
 * button and the next steps (`guide/nextSteps.ts`) can never disagree.
 */
export type PlayKind = 'drive' | 'try'
export type Readiness = { kind: PlayKind | null; ready: boolean; reason: string | null }

/** What the robot is becoming: motors make a rover, else a hinge motor makes a gate, else a sensor or a light a signal light. */
export type RobotPath = 'rover' | 'gate' | 'signal'

export type ReadinessStepId = 'plate' | 'hub' | 'motors' | 'axles' | 'wheels' | 'arm' | 'unstick' | 'sensor' | 'light' | 'plug'

export type ReadinessStep = {
  id: ReadinessStepId
  /** The step in general words: how it reads once it is done, or while it is still ahead. */
  text: string
  done: boolean
  /** Exactly what to do now, while this is the first step not done. */
  now: string
  /** The brick that step is about right now: the motor to turn or give an axle, the part to plug in, the brick to take off. */
  brickId: string | null
}

export type ReadinessPlan = { path: RobotPath | null; kind: PlayKind | null; steps: ReadinessStep[] }

export const HUB_STEP = 'Add a hub. It is the robot’s brain.'
export const CHOOSE_REASON = 'Add motors to make it move, or a sensor and a light.'

export function readiness(creation: DerivedCreation): Readiness {
  const plan = readinessPlan(creation)
  const next = plan.steps.find((step) => !step.done)
  if (!plan.kind) return { kind: null, ready: false, reason: next ? next.now : CHOOSE_REASON }
  return { kind: plan.kind, ready: !next, reason: next ? next.now : null }
}

export function readinessPlan(creation: DerivedCreation): ReadinessPlan {
  if (creation.motors.length > 0 || creation.kind === 'rover') return { path: 'rover', kind: 'drive', steps: roverSteps(creation) }
  if (creation.hinges.length > 0) return { path: 'gate', kind: 'try', steps: gateSteps(creation) }
  if (creation.lights.length > 0 || creation.sensors.length > 0) return { path: 'signal', kind: 'try', steps: signalSteps(creation) }
  return { path: null, kind: null, steps: [hubStep(creation)] }
}

function hubStep(creation: DerivedCreation): ReadinessStep {
  return { id: 'hub', text: HUB_STEP, done: creation.hubs.length > 0, now: HUB_STEP, brickId: null }
}

function plugStep(devices: readonly DerivedDevice[], text: string): ReadinessStep {
  const unplugged = devices.find((device) => !device.plugged) ?? null
  return { id: 'plug', text, done: !unplugged, now: unplugged ? `Plug ${unplugged.name} into the hub.` : text, brickId: unplugged?.brickId ?? null }
}

/* ------------------------------------------------------------------ rover */

export type MotorPair = readonly [DerivedMotor, DerivedMotor]

const EPSILON = 1e-6

/** How far a motor's axle hole sits out from its middle (the socket is on the motor's face). */
const SOCKET_REACH = (() => {
  const point = roboticsSpec(ROBOTICS_PART_IDS.motor)?.socket?.point
  return point ? Math.hypot(point.x, point.z) : 0
})()

/** The middle of a motor, read back from its axle hole: two motors side by side facing each other share a hole point but not a middle. */
const motorMiddle = (motor: DerivedMotor): Vec3 => sub(motor.socketPoint, scale(motor.socketNormal, SOCKET_REACH))

/**
 * The pairs a rover could drive on before it has wheels: two motors on opposite sides whose axle
 * holes face away from each other, or two motors that already hold axles along one line (a motor
 * mounted outboard, facing in, is fine once its axle is in: the model drives any such pair).
 */
export function candidatePairs(motors: readonly DerivedMotor[]): MotorPair[] {
  const pairs: MotorPair[] = []
  for (let i = 0; i < motors.length; i += 1) {
    for (let j = i + 1; j < motors.length; j += 1) {
      const a = motors[i]
      const b = motors[j]
      const along = dot(a.socketNormal, b.socketNormal)
      const outward = along < -0.999 && dot(a.socketNormal, sub(motorMiddle(a), motorMiddle(b))) > EPSILON
      const axled = Math.abs(along) > 0.999 && a.axleId !== null && b.axleId !== null
      if (outward || axled) pairs.push([a, b])
    }
  }
  return pairs
}

const pairProgress = (pair: MotorPair) => pair.reduce((total, motor) => total + (motor.axleId ? 1 : 0) + (motor.wheelIds.length ? 1 : 0), 0)

/** The pair to finish: the model's drive pair once there is one, else the candidate furthest along (the first on a tie). */
export function roverPair(creation: DerivedCreation): MotorPair | null {
  const drive = creation.drivePair
  if (drive) {
    const left = creation.motors.find((motor) => motor.brickId === drive.leftId)
    const right = creation.motors.find((motor) => motor.brickId === drive.rightId)
    if (left && right) return [left, right]
  }
  let best: MotorPair | null = null
  for (const pair of candidatePairs(creation.motors)) if (!best || pairProgress(pair) > pairProgress(best)) best = pair
  return best
}

/** A motor with no axle yet whose axle hole points back into the robot (toward the middle of its motors), where no axle fits. */
export function motorFacingIn(motors: readonly DerivedMotor[]): DerivedMotor | null {
  if (motors.length < 2) return null
  const middles = motors.map(motorMiddle)
  const middle = centroid(middles)
  return motors.find((motor, index) => !motor.axleId && dot(motor.socketNormal, sub(middles[index], middle)) < -EPSILON) ?? null
}

const centroid = (points: readonly Vec3[]): Vec3 => scale(points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y, z: total.z + point.z }), { x: 0, y: 0, z: 0 }), 1 / points.length)

/** Where a motor sits among the others, in the studio's words for the sides of the plate. */
function sideOf(motor: DerivedMotor, motors: readonly DerivedMotor[]): 'left' | 'right' | 'front' | 'back' {
  const offset = sub(motorMiddle(motor), centroid(motors.map(motorMiddle)))
  if (Math.abs(offset.x) >= Math.abs(offset.z)) return offset.x < 0 ? 'left' : 'right'
  return offset.z < 0 ? 'front' : 'back'
}

function roverSteps(creation: DerivedCreation): ReadinessStep[] {
  const motors = creation.motors
  const pair = roverPair(creation)
  const hubName = creation.hubs.length > 0 ? 'hub' : 'motor'
  // A pair with wheels on both is always the model's drive pair; the check only guards that rule.
  const pairDrives = pair !== null && (pair.some((motor) => motor.wheelIds.length === 0) || creation.drivePair !== null)
  let motorsNow = 'Put a motor on each side.'
  let motorBrick: string | null = null
  if (motors.length === 1) {
    motorsNow = 'Put a motor on the other side.'
    motorBrick = motors[0].brickId
  } else if (motors.length >= 2 && !(pair && pairDrives)) {
    // Said by where the motor is, not by its name: a motor's default name follows the way it faces.
    const facingIn = motorFacingIn(motors)
    motorsNow = facingIn ? `Turn the ${sideOf(facingIn, motors)} motor to face out.` : 'Put the motors on opposite sides, facing out.'
    motorBrick = (facingIn ?? motors[motors.length - 1]).brickId
  }
  const noAxle = pair?.find((motor) => !motor.axleId) ?? null
  const noWheel = pair?.find((motor) => motor.wheelIds.length === 0) ?? null
  return [
    { id: 'plate', text: 'Put the robot on a plate.', done: creation.onPlate, now: `Put a plate down. Then move the ${hubName} onto it.`, brickId: null },
    hubStep(creation),
    { id: 'motors', text: 'Put a motor on each side.', done: pair !== null && pairDrives, now: motorsNow, brickId: motorBrick },
    { id: 'axles', text: 'Put an axle in each motor.', done: pair !== null && !noAxle, now: noAxle ? `Put an axle in ${noAxle.name}.` : 'Put an axle in each motor.', brickId: noAxle?.brickId ?? null },
    { id: 'wheels', text: 'Put a wheel on each axle.', done: pair !== null && !noWheel, now: noWheel ? `Put a wheel on ${noWheel.name}’s axle.` : 'Put a wheel on each axle.', brickId: noWheel?.brickId ?? null },
    pair ? plugStep(pair, 'Plug the motors into the hub.') : { id: 'plug', text: 'Plug the motors into the hub.', done: false, now: 'Plug the motors into the hub.', brickId: null },
  ]
}

/* ------------------------------------------------------------------- gate */

function gateSteps(creation: DerivedCreation): ReadinessStep[] {
  const noArm = creation.hinges.find((hinge) => !hinge.locked && hinge.armBrickIds.length === 0) ?? null
  const locked = creation.hinges.find((hinge) => hinge.locked) ?? null
  const steps: ReadinessStep[] = [
    hubStep(creation),
    { id: 'arm', text: 'Put an arm on the hinge motor.', done: !noArm, now: noArm ? `Put a long brick on top of ${noArm.name}. It will swing.` : 'Put an arm on the hinge motor.', brickId: noArm?.brickId ?? null },
  ]
  if (locked) {
    // The brick to take off is the one on the frame's side of the joint that holds the arm.
    const arm = new Set(locked.armBrickIds)
    const joint = locked.bridging[0]
    const holder = joint ? (arm.has(joint.upperBrickId) ? joint.lowerBrickId ?? joint.upperBrickId : joint.upperBrickId) : null
    steps.push({ id: 'unstick', text: 'The arm swings free.', done: false, now: 'The arm is stuck to the frame. Take off the brick that joins them.', brickId: holder })
  }
  steps.push(
    { id: 'sensor', text: 'Add a sensor so it sees who walks up.', done: creation.sensors.length > 0, now: 'Add a sensor so it sees who walks up.', brickId: null },
    plugStep([...creation.hinges, ...creation.sensors], 'Plug the parts into the hub.'),
  )
  return steps
}

/* ----------------------------------------------------------- signal light */

function signalSteps(creation: DerivedCreation): ReadinessStep[] {
  return [
    hubStep(creation),
    { id: 'sensor', text: 'Add a sensor so it can see.', done: creation.sensors.length > 0, now: 'Add a sensor so it can see.', brickId: null },
    { id: 'light', text: 'Add a light so it can show what it sees.', done: creation.lights.length > 0, now: 'Add a light so it can show what it sees.', brickId: null },
    plugStep([...creation.sensors, ...creation.lights], 'Plug the sensor and light into the hub.'),
  ]
}
