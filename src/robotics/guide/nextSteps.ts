import { rotateLocalPoint } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { readinessPlan, type ReadinessStep } from '../drive/readiness'
import type { DerivedCreation, DerivedMotor } from '../model/creations'
import { dot, type Vec3 } from '../model/vec'
import { ROBOTICS_PART_IDS, roboticsSpec } from '../parts/catalog'
import type { RoboticsModel } from '../state/roboticsStore'

/**
 * What this robot needs next (docs/robotics/KID-UX.md §G): the checklist of its path, each
 * step in a third grader's words with one thing to do about it, and, once it is ready,
 * a few ideas to make it theirs. Pure: it reads the robot and the model and returns rows;
 * `runStepAction` (guide/actions.ts) does what a row says.
 *
 * The checklist is `readinessPlan` (drive/readiness.ts) turned into rows, so the current
 * row always says exactly what `readiness().reason` says and the Drive / Try it button
 * and the guide never disagree.
 *
 * - **step**: the path. Rover: plate → hub → a motor on each side → an axle in each
 *   motor → a wheel on each axle → plugged in → "Ready to drive!". Gate: hub → an arm on
 *   the hinge motor → (not stuck to the frame) → a sensor → plugged in → "Ready to try!".
 *   Signal light: hub → sensor → light → plugged in → "Ready to try!".
 * - **choice**: a robot with nothing to do yet (a hub alone) offers two ways to go.
 * - **idea**: optional, for a rover (a sensor at the front, a light, a seat, bricks on top).
 */
export type StepState = 'done' | 'current' | 'todo'
export type StepGroup = 'step' | 'choice' | 'idea'

export type StepAction =
  /** Arm a part in the studio, turned the way this robot needs it. */
  | { kind: 'arm'; partId: string; rotation: 0 | 1 | 2 | 3 }
  /** Plug a device into its hub's first free port. */
  | { kind: 'plug'; deviceId: string }
  /** Open Drive (a rover) or Try it (a gate, a signal light). */
  | { kind: 'play'; creationId: string }
  /** Select a brick that needs turning or taking off. */
  | { kind: 'select'; brickId: string }

export type StepIcon = { part: string } | { symbol: 'plug' | 'drive' | 'try' | 'turn' | 'fix' }

export type NextStep = {
  id: string
  group: StepGroup
  text: string
  /** A second, smaller line (choices only). */
  hint?: string
  state: StepState
  /** Null when there is nothing to do about it yet (the play row before the robot is ready). */
  action: StepAction | null
  icon: StepIcon | TriedIcon
}

/** The ready row's tick after a try that worked (kid lane Y). */
export type TriedIcon = { symbol: 'worked' }

type Rotation = 0 | 1 | 2 | 3
const ROTATIONS: readonly Rotation[] = [0, 1, 2, 3]

/** The quarter turn that points a part's local direction the way `want` points (either way along it when `axis`). */
function rotationToward(local: Vec3, want: Vec3 | null, axis = false): Rotation {
  if (!want) return 0
  let best: Rotation = 0
  let bestScore = -Infinity
  for (const rotation of ROTATIONS) {
    const [x, y, z] = rotateLocalPoint([local.x, local.y, local.z], rotation)
    const along = dot({ x, y, z }, want)
    const score = axis ? Math.abs(along) : along
    if (score > bestScore + 1e-9) { best = rotation; bestScore = score }
  }
  return best
}

const MOTOR_SOCKET = roboticsSpec(ROBOTICS_PART_IDS.motor)?.socket?.normal ?? { x: 1, y: 0, z: 0 }
const ALONG_X: Vec3 = { x: 1, y: 0, z: 0 }
/** Sensors and seats look along -Z when they are not turned. */
const LOOKS: Vec3 = { x: 0, y: 0, z: -1 }
const PLATE_PART = 'plate_6x8'
const ARM_PART = 'brick_1x4'
const STACK_PART = 'brick_2x2'

const arm = (partId: string, rotation: Rotation = 0): StepAction => ({ kind: 'arm', partId, rotation })
const reversed = (vector: Vec3): Vec3 => ({ x: -vector.x, y: -vector.y, z: -vector.z })

export const READY_TO_DRIVE = 'Ready to drive!'
export const READY_TO_TRY = 'Ready to try!'

/**
 * `tried`: what the robot's last walk-up said (kid lane Y, `drive/tryOutcome.ts`), while it is still
 * about this build and this code. The ready row of a gate or a signal light then says that instead
 * of "Ready to try!" ("It worked! Try it again" with a tick), and still opens Try it.
 */
export type NextStepOptions = { tried?: { worked: boolean; text: string } | null }

export function nextSteps(creation: DerivedCreation, model: Pick<RoboticsModel, 'input'>, options: NextStepOptions = {}): NextStep[] {
  const plan = readinessPlan(creation)
  const bricks = new Map(model.input.bricks.map((brick) => [brick.id, brick]))
  const open = plan.steps.findIndex((step) => !step.done)
  const rows: NextStep[] = plan.steps.map((step, index) => {
    const state: StepState = step.done ? 'done' : index === open ? 'current' : 'todo'
    const icon = state === 'current' && step.fix === 'add-hub' ? { part: ROBOTICS_PART_IDS.hub } : state === 'current' && step.fix === 'select' && step.id === 'motors' ? { symbol: 'turn' as const } : stepIcon(step)
    return { id: step.id, group: 'step', text: state === 'current' ? step.now : step.text, state, action: state === 'done' ? null : stepAction(step, state, creation, bricks), icon }
  })
  if (!plan.kind) return [...rows, ...choices(creation, open === -1)]
  const ready = open === -1
  const tried = ready && plan.kind === 'try' ? options.tried ?? null : null
  rows.push({
    id: 'ready',
    group: 'step',
    text: tried ? tried.text : plan.kind === 'drive' ? READY_TO_DRIVE : READY_TO_TRY,
    state: ready ? 'current' : 'todo',
    action: ready ? { kind: 'play', creationId: creation.id } : null,
    icon: { symbol: tried?.worked ? 'worked' : plan.kind === 'drive' ? 'drive' : 'try' },
  })
  if (plan.path === 'rover') rows.push(...roverIdeas(creation, model))
  return rows
}

function stepIcon(step: ReadinessStep): StepIcon {
  switch (step.id) {
    case 'plate': return { part: PLATE_PART }
    case 'hub': return { part: ROBOTICS_PART_IDS.hub }
    case 'motors': return { part: ROBOTICS_PART_IDS.motor }
    case 'axles': return { part: ROBOTICS_PART_IDS.axleShort }
    case 'wheels': return { part: ROBOTICS_PART_IDS.wheel }
    case 'arm': return { part: ARM_PART }
    case 'unstick': return { symbol: 'fix' }
    case 'sensor': return { part: ROBOTICS_PART_IDS.distanceSensor }
    case 'light': return { part: ROBOTICS_PART_IDS.light }
    case 'plug': return { symbol: 'plug' }
  }
}

function motorOf(creation: DerivedCreation, brickId: string | null): DerivedMotor | null {
  return (brickId && creation.motors.find((motor) => motor.brickId === brickId)) || null
}

/** The first motor still waiting for an axle (or a wheel): the one the part should line up with. */
function motorNeeding(creation: DerivedCreation, need: 'axle' | 'wheel'): DerivedMotor | null {
  return creation.motors.find((motor) => (need === 'axle' ? !motor.axleId : motor.axleId && motor.wheelIds.length === 0)) ?? creation.motors[0] ?? null
}

function stepAction(step: ReadinessStep, state: StepState, creation: DerivedCreation, bricks: ReadonlyMap<string, BrickInstance>): StepAction | null {
  const current = state === 'current'
  // A step about a placed brick (a motor to turn, a brick holding a gate's arm, a part to unplug for room): pick it.
  if (current && (step.fix === 'select' || step.fix === 'unplug')) return step.brickId && bricks.has(step.brickId) ? { kind: 'select', brickId: step.brickId } : null
  if (current && step.fix === 'add-hub') return arm(ROBOTICS_PART_IDS.hub)
  switch (step.id) {
    case 'plate': return arm(PLATE_PART)
    case 'hub': return arm(ROBOTICS_PART_IDS.hub)
    case 'motors': {
      const motors = creation.motors
      // The second motor comes armed facing away from the first, so its axle hole points out on the other side.
      const first = motors.length === 1 ? motors[0] : null
      return arm(ROBOTICS_PART_IDS.motor, first ? rotationToward(MOTOR_SOCKET, reversed(first.socketNormal)) : 0)
    }
    case 'axles': {
      const motor = (current ? motorOf(creation, step.brickId) : null) ?? motorNeeding(creation, 'axle')
      return arm(ROBOTICS_PART_IDS.axleShort, rotationToward(ALONG_X, motor?.socketNormal ?? null, true))
    }
    case 'wheels': {
      const motor = (current ? motorOf(creation, step.brickId) : null) ?? motorNeeding(creation, 'wheel')
      return arm(ROBOTICS_PART_IDS.wheel, rotationToward(ALONG_X, motor?.socketNormal ?? null, true))
    }
    case 'arm': return arm(ARM_PART)
    case 'unstick': return null
    case 'sensor': return arm(ROBOTICS_PART_IDS.distanceSensor)
    case 'light': return arm(ROBOTICS_PART_IDS.light)
    case 'plug': return current && step.brickId ? { kind: 'plug', deviceId: step.brickId } : null
  }
}

function choices(creation: DerivedCreation, now: boolean): NextStep[] {
  const state: StepState = now ? 'current' : 'todo'
  const hasHub = creation.hubs.length > 0
  // Motors must stand on a plate so their wheels reach the ground: a hub on the bare ground gets one first.
  const plateFirst = hasHub && !creation.onPlate
  return [
    {
      id: 'choose-move',
      group: 'choice',
      text: 'Make it move',
      hint: plateFirst ? 'Put a plate down. Then move the hub onto it.' : 'Add motors and wheels.',
      state,
      action: plateFirst ? arm(PLATE_PART) : arm(ROBOTICS_PART_IDS.motor),
      icon: { part: plateFirst ? PLATE_PART : ROBOTICS_PART_IDS.motor },
    },
    {
      id: 'choose-see',
      group: 'choice',
      text: 'Make it see and light up',
      hint: 'Add a sensor and a light.',
      state,
      action: arm(ROBOTICS_PART_IDS.distanceSensor),
      icon: { part: ROBOTICS_PART_IDS.distanceSensor },
    },
  ]
}

function roverIdeas(creation: DerivedCreation, model: Pick<RoboticsModel, 'input'>): NextStep[] {
  const forward = creation.drivePair?.forward ?? creation.driveForward
  const facingFront = creation.sensors.find((sensor) => sensor.facing === 'forward') ?? null
  const turnSensor = !facingFront && creation.sensors.length > 0 ? creation.sensors[0] : null
  const turnText = creation.sensors.length === 1 ? 'Turn the sensor to face the front.' : `Turn ${turnSensor?.name ?? 'a sensor'} to face the front.`
  const byId = new Map(model.input.bricks.map((brick) => [brick.id, brick]))
  // Bricks of the student's own on top: anything that is not a robotics part or the plate it stands on.
  const stacked = creation.brickIds.some((id) => {
    const brick = byId.get(id)
    if (!brick || roboticsSpec(brick.partId)) return false
    return !(brick.y === 0 && model.input.partMap[brick.partId]?.height === 1)
  })
  const idea = (id: string, text: string, done: boolean, action: StepAction, icon: StepIcon): NextStep => ({ id, group: 'idea', text, state: done ? 'done' : 'todo', action: done ? null : action, icon })
  return [
    turnSensor
      ? idea('idea-sensor', turnText, false, { kind: 'select', brickId: turnSensor.brickId }, { symbol: 'turn' })
      : idea('idea-sensor', 'Add a sensor at the front. It is the robot’s eyes.', facingFront !== null, arm(ROBOTICS_PART_IDS.distanceSensor, rotationToward(LOOKS, forward)), { part: ROBOTICS_PART_IDS.distanceSensor }),
    idea('idea-light', 'Add a light on top.', creation.lights.length > 0, arm(ROBOTICS_PART_IDS.light), { part: ROBOTICS_PART_IDS.light }),
    idea('idea-seat', 'Add a seat. Ride it in Explore.', creation.seats.length > 0, arm(ROBOTICS_PART_IDS.seat, rotationToward(LOOKS, forward)), { part: ROBOTICS_PART_IDS.seat }),
    idea('idea-stack', 'Stack bricks on top. They ride along.', stacked, arm(STACK_PART), { part: STACK_PART }),
  ]
}
