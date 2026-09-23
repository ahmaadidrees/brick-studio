import { driveSidesOf, type DerivedCreation, type DerivedDevice, type DerivedMotor } from '../model/creations'
import { dot, scale, sub, type Vec3 } from '../model/vec'
import { HUB_PORTS, ROBOTICS_PART_IDS, roboticsSpec } from '../parts/catalog'

/**
 * Can this creation be played with right now, and if not, the one thing to do first,
 * in words a third grader reads (docs/robotics/KID-UX.md §copy). Pure; the panel's Drive /
 * Try it button and the next-steps guide both read it.
 *
 * - A creation **drives** when every motor has an axle and a wheel, the wheels stand on both
 *   sides, every wheel rolls forward (no motor faces front, back, up or down) and every motor
 *   with a wheel is plugged in: a four-wheel car's four, not only the first two.
 * - A creation with a hinge motor or a light and a sensor can be **tried** (its starter runs
 *   and someone walks up to it): a gate needs an arm on its hinge motor, free of the frame,
 *   and a sensor to see who walks up.
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
  /**
   * How the step is done when it is not the obvious way: `select` a brick to turn or take off, or,
   * with a full hub, `unplug` a part that does not drive (`brickId`) or `add-hub`; `side` moves a
   * motor whose socket is over its plate to the side (one tap, kid-UX lane W).
   */
  fix?: 'select' | 'unplug' | 'add-hub' | 'side'
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

const centroid = (points: readonly Vec3[]): Vec3 => scale(points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y, z: total.z + point.z }), { x: 0, y: 0, z: 0 }), 1 / points.length)

/**
 * The pairs a rover could drive on before its wheels are on: two motors on opposite sides whose
 * axle holes face away from each other, or two motors that already hold axles along one line (a
 * motor mounted outboard, facing in, is fine once its axle is in: the model drives any such pair).
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

/** A motor with no axle yet whose axle hole points back into the robot (toward the middle of its motors), where no axle fits. */
export function motorFacingIn(motors: readonly DerivedMotor[]): DerivedMotor | null {
  if (motors.length < 2) return null
  const middles = motors.map(motorMiddle)
  const middle = centroid(middles)
  return motors.find((motor, index) => !motor.axleId && dot(motor.socketNormal, sub(middles[index], middle)) < -EPSILON) ?? null
}

/** Where a motor sits among the others, in the studio's words for the sides of the plate. */
function sideOf(motor: DerivedMotor, motors: readonly DerivedMotor[]): 'left' | 'right' | 'front' | 'back' {
  const offset = sub(motorMiddle(motor), centroid(motors.map(motorMiddle)))
  if (Math.abs(offset.x) >= Math.abs(offset.z)) return offset.x < 0 ? 'left' : 'right'
  return offset.z < 0 ? 'front' : 'back'
}

/** Which way a motor that is not on a side faces: along the robot (forward, backward), or up or down. */
function facingWord(normal: Vec3, forward: Vec3): string {
  if (Math.abs(normal.y) > 0.5) return normal.y > 0 ? 'up' : 'down'
  return dot(normal, forward) >= 0 ? 'forward' : 'backward'
}

/**
 * The motors step, the robot's shape: two motors or more, none facing into the robot where no
 * axle fits, two that can pair up; and once every motor has its axle and its wheel, wheels on both
 * sides with every wheel rolling forward (the model's drive sides). The shape checks that need
 * wheels wait for them, so a missing wheel is always asked for before a turned motor.
 */
function motorsStep(creation: DerivedCreation): ReadinessStep {
  const motors = creation.motors
  const step = (done: boolean, now: string, brickId: string | null = null, fix?: ReadinessStep['fix']): ReadinessStep => ({ id: 'motors', text: 'Put a motor on each side.', done, now, brickId, ...(fix ? { fix } : {}) })
  if (motors.length === 0) return step(false, 'Put a motor on each side.')
  // A motor that can't turn a wheel where it stands (in the middle of the plate, turned around, on
  // top of the hub, or at the front or back facing out): one tap puts it right (kid-UX lane W).
  const stuck = motors.find((motor) => !motor.axleId && STUCK.has(motor.socketRoom ?? 'open')) ?? motors.find((motor) => !motor.axleId && motor.crossways)
  if (stuck) return sideStep(stuck)
  if (motors.length === 1) return step(false, 'Put a motor on the other side.', motors[0].brickId)
  // Said by where the motor is, not by its name.
  const facingIn = motorFacingIn(motors)
  if (facingIn) return step(false, `Turn the ${sideOf(facingIn, motors)} motor to face out.`, facingIn.brickId, 'select')
  // All on one side, facing the same way: the other side still needs one. Otherwise, one on each side.
  const oneWay = motors.every((motor) => dot(motor.socketNormal, motors[0].socketNormal) > 0.999)
  const eachSide = () => (oneWay ? step(false, 'Put a motor on the other side.', motors[0].brickId) : step(false, 'Put one motor on each side of the plate.', motors[motors.length - 1].brickId, 'select'))
  if (!creation.drivePair && candidatePairs(motors).length === 0) return eachSide()
  const complete = motors.every((motor) => motor.axleId && motor.wheelIds.length > 0)
  if (complete) {
    const sides = driveSidesOf(creation)
    if (!sides) return eachSide()
    // A wheel that does not roll forward drags the robot sideways (it is braked, even plugged in).
    const onSides = new Set([...sides.left, ...sides.right])
    const astray = motors.find((motor) => !onSides.has(motor.brickId))
    if (astray) return step(false, `${astray.name} faces ${facingWord(astray.socketNormal, sides.forward)}. Turn it to face the side.`, astray.brickId, 'select')
  }
  return step(true, 'Put a motor on each side.')
}

/** Where a motor stands that no axle and wheel can work from (`socketRoom.ts`). */
const STUCK: ReadonlySet<string> = new Set(['covered', 'facing-in', 'high'])

/**
 * The one thing to do about a motor that can't turn a wheel where it stands, in a third grader's
 * words, done with one tap (`fix: 'side'`): in the middle of the plate or on top of the hub it
 * moves to the side; turned around at an edge, or facing the front or the back, it turns.
 */
export function sideStepText(motor: Pick<DerivedMotor, 'name' | 'socketRoom' | 'crossways'>): string {
  if (motor.socketRoom === 'facing-in') return `Turn ${motor.name} around.`
  if (motor.socketRoom === 'covered' || motor.socketRoom === 'high') return `Move ${motor.name} to the side of the plate.`
  return `Turn ${motor.name} to face the side.`
}

function sideStep(motor: DerivedMotor): ReadinessStep {
  return { id: 'motors', text: 'Put a motor on each side.', done: false, now: sideStepText(motor), brickId: motor.brickId, fix: 'side' }
}

/**
 * Plug every motor in (an unplugged motor holds its wheel still), or, when every port of the
 * robot's hubs is taken by its own parts (a Buggy with its sensor and four motors), make room
 * first: unplug a part that does not drive, or add a hub.
 */
function motorPlugStep(creation: DerivedCreation): ReadinessStep {
  const text = 'Plug the motors into the hub.'
  const motors = creation.motors
  const unplugged = motors.find((motor) => !motor.plugged) ?? null
  if (motors.length < 2 || !unplugged) return { id: 'plug', text, done: motors.length >= 2, now: text, brickId: null }
  const devices = [...creation.motors, ...creation.hinges, ...creation.sensors, ...creation.lights, ...creation.buttons]
  const full = creation.hubs.every((hub) => devices.filter((device) => device.port?.hubId === hub.brickId).length >= HUB_PORTS.length)
  if (!full) return { id: 'plug', text, done: false, now: `Plug ${unplugged.name} into the hub.`, brickId: unplugged.brickId }
  const spare = [...creation.sensors, ...creation.lights, ...creation.buttons, ...creation.hinges].find((device) => device.plugged)
  return spare
    ? { id: 'plug', text, done: false, now: `The hub is full. Unplug ${spare.name} to plug in ${unplugged.name}.`, brickId: spare.brickId, fix: 'unplug' }
    : { id: 'plug', text, done: false, now: `The hub is full. Add another hub for ${unplugged.name}.`, brickId: unplugged.brickId, fix: 'add-hub' }
}

function roverSteps(creation: DerivedCreation): ReadinessStep[] {
  const motors = creation.motors
  const hubName = creation.hubs.length > 0 ? 'hub' : 'motor'
  const noAxle = motors.find((motor) => !motor.axleId) ?? null
  const noWheel = motors.find((motor) => motor.wheelIds.length === 0) ?? null
  const enough = motors.length >= 2
  return [
    { id: 'plate', text: 'Put the robot on a plate.', done: creation.onPlate, now: `Put a plate down. Then move the ${hubName} onto it.`, brickId: null },
    hubStep(creation),
    motorsStep(creation),
    { id: 'axles', text: 'Put an axle in each motor.', done: enough && !noAxle, now: noAxle ? `Put an axle in ${noAxle.name}.` : 'Put an axle in each motor.', brickId: noAxle?.brickId ?? null },
    { id: 'wheels', text: 'Put a wheel on each axle.', done: enough && !noWheel, now: noWheel ? `Put a wheel on ${noWheel.name}’s axle.` : 'Put a wheel on each axle.', brickId: noWheel?.brickId ?? null },
    motorPlugStep(creation),
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
    steps.push({ id: 'unstick', text: 'The arm swings free.', done: false, now: 'The arm is stuck to the frame. Take off the brick that joins them.', brickId: holder, fix: 'select' })
  }
  steps.push(
    { id: 'sensor', text: 'Add a sensor so it can see.', done: creation.sensors.length > 0, now: 'Add a sensor so it can see.', brickId: null },
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
