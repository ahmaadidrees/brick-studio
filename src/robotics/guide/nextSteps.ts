import { rotateLocalPoint } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { readinessPlan, type ReadinessStep } from '../drive/readiness'
import type { DerivedCreation, DerivedMotor } from '../model/creations'
import { dot, type Vec3 } from '../model/vec'
import { ROBOTICS_PART_IDS, roboticsSpec } from '../parts/catalog'
import { robotLooksPainted } from '../paint/paintRules'
import type { StarterId } from '../program/starters'
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
 * - **idea**: optional, once the robot is ready. A rover's first four (a sensor at the front, a
 *   light, a seat, bricks on top); once those are done, and for a gate or a signal light from the
 *   start, more that make it theirs: paint it, name it, build it taller, change what it does in
 *   Code. Those stay tappable when done, so the list never ends empty-handed (lane P).
 */
export type StepState = 'done' | 'current' | 'todo'
export type StepGroup = 'step' | 'choice' | 'idea'

export type StepAction =
  /**
   * Arm a part in the studio, turned the way this robot needs it. It is placed once (the brush is
   * put down after it lands, `guide/oneShot.ts`) unless `repeat` (a row that asks for several).
   * `onRobot`: it comes already on that robot's highest free spot, and a one-shot part that lands
   * on no robot goes back into the hand, onto the robot (`guide/onRobot.ts`).
   */
  | { kind: 'arm'; partId: string; rotation: 0 | 1 | 2 | 3; repeat?: true; onRobot?: string }
  /** Plug a device into its hub's first free port. */
  | { kind: 'plug'; deviceId: string }
  /** Open Drive (a rover) or Try it (a gate, a signal light). */
  | { kind: 'play'; creationId: string }
  /** Select a brick that needs turning or taking off. */
  | { kind: 'select'; brickId: string }
  /** Start painting in the brush colour (the robot panel's Paint row). */
  | { kind: 'paint'; creationId: string }
  /** Put the cursor in the robot's name field. */
  | { kind: 'rename'; creationId: string }
  /** Open Code on a program begun from this starter (made if the robot has none from it yet). */
  | { kind: 'code'; creationId: string; starter: StarterId }

export type StepIcon = { part: string } | { symbol: 'plug' | 'drive' | 'try' | 'turn' | 'fix' | 'paint' | 'name' | 'code' }

export type NextStep = {
  id: string
  group: StepGroup
  text: string
  /** A second, smaller line (choices only). */
  hint?: string
  state: StepState
  /** Null when there is nothing to do about it yet (the play row before the robot is ready). */
  action: StepAction | null
  icon: StepIcon
}

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
/** A part the row asks for several of: it stays armed after each one lands. */
const armMany = (partId: string, onRobot?: string): StepAction => ({ kind: 'arm', partId, rotation: 0, repeat: true, ...(onRobot ? { onRobot } : {}) })
/** A part that goes on top of this robot (an idea's light, seat or bricks). */
const armOn = (robotId: string, partId: string, rotation: Rotation = 0): StepAction => ({ kind: 'arm', partId, rotation, onRobot: robotId })
const reversed = (vector: Vec3): Vec3 => ({ x: -vector.x, y: -vector.y, z: -vector.z })

export const READY_TO_DRIVE = 'Ready to drive!'
export const READY_TO_TRY = 'Ready to try!'

export function nextSteps(creation: DerivedCreation, model: Pick<RoboticsModel, 'input'>): NextStep[] {
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
  rows.push({
    id: 'ready',
    group: 'step',
    text: plan.kind === 'drive' ? READY_TO_DRIVE : READY_TO_TRY,
    state: ready ? 'current' : 'todo',
    action: ready ? { kind: 'play', creationId: creation.id } : null,
    icon: { symbol: plan.kind === 'drive' ? 'drive' : 'try' },
  })
  if (plan.path) rows.push(...ideasFor(plan.path, creation, model))
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
  // Bricks of the student's own on top: anything that is not a robotics part or the plate it stands on.
  const stacked = stackedBricks(creation, model) > 0
  const idea = (id: string, text: string, done: boolean, action: StepAction, icon: StepIcon): NextStep => ({ id, group: 'idea', text, state: done ? 'done' : 'todo', action: done ? null : action, icon })
  return [
    turnSensor
      ? idea('idea-sensor', turnText, false, { kind: 'select', brickId: turnSensor.brickId }, { symbol: 'turn' })
      : idea('idea-sensor', 'Add a sensor at the front. It is the robot’s eyes.', facingFront !== null, arm(ROBOTICS_PART_IDS.distanceSensor, rotationToward(LOOKS, forward)), { part: ROBOTICS_PART_IDS.distanceSensor }),
    idea('idea-light', 'Add a light on top.', creation.lights.length > 0, armOn(creation.id, ROBOTICS_PART_IDS.light), { part: ROBOTICS_PART_IDS.light }),
    idea('idea-seat', 'Add a seat. Ride it in Explore.', creation.seats.length > 0, armOn(creation.id, ROBOTICS_PART_IDS.seat, rotationToward(LOOKS, forward)), { part: ROBOTICS_PART_IDS.seat }),
    idea('idea-stack', 'Stack bricks on top. They ride along.', stacked, armMany(STACK_PART, creation.id), { part: STACK_PART }),
  ]
}

/** The row that stands for a rover's first four ideas once they are all done. */
export const FIRST_IDEAS_DONE = 'You did all 4 ideas!'

/**
 * A rover's ideas: its first four until they are all done, then a line saying so and more ideas.
 * A gate and a signal light go straight to the more ideas.
 */
function ideasFor(path: 'rover' | 'gate' | 'signal', creation: DerivedCreation, model: Pick<RoboticsModel, 'input'>): NextStep[] {
  if (path !== 'rover') return moreIdeas(path, creation, model)
  const first = roverIdeas(creation, model)
  if (!first.every((row) => row.state === 'done')) return first
  return [{ id: 'ideas-done', group: 'idea', text: FIRST_IDEAS_DONE, state: 'done', action: null, icon: { symbol: 'drive' } }, ...moreIdeas(path, creation, model)]
}

/** Names a robot gets without the student choosing one (a kit's, the card's default, "Buggy 2"…). */
const DEFAULT_NAME = /^(buggy|gate|signal light|robot|my robot)( \d+)?$/i

/** Bricks of the student's own stacked on the robot, besides the plate it stands on (and robot parts). */
function stackedBricks(creation: DerivedCreation, model: Pick<RoboticsModel, 'input'>): number {
  const byId = new Map(model.input.bricks.map((brick) => [brick.id, brick]))
  return creation.brickIds.filter((id) => {
    const brick = byId.get(id)
    if (!brick || roboticsSpec(brick.partId)) return false
    return !(brick.y === 0 && model.input.partMap[brick.partId]?.height === 1)
  }).length
}

/** Rows that stay tappable once done (a ✓ in front): the student can paint it again, rename it again… */
const evergreen = (id: string, text: string, done: boolean, action: StepAction, icon: StepIcon): NextStep => ({ id, group: 'idea', text, state: done ? 'done' : 'todo', action, icon })

/**
 * Ideas that make the robot theirs and really work today: paint it (opens Paint), name it (the name
 * field), build it taller (a rover: five bricks stacked on it), and change what it does in Code (its
 * kind's starter: stop at a wall, how far the gate opens, the light's colour).
 */
function moreIdeas(path: 'rover' | 'gate' | 'signal', creation: DerivedCreation, model: Pick<RoboticsModel, 'input'>): NextStep[] {
  const id = creation.id
  const hasProgram = (starter: StarterId) => model.input.section.programs.some((program) => program.creationId === id && program.starter === starter)
  const ideas = [
    evergreen('idea-paint', 'Paint it your colors.', robotLooksPainted(creation, model.input.bricks), { kind: 'paint', creationId: id }, { symbol: 'paint' }),
    evergreen('idea-name', 'Give it a name of your own.', !DEFAULT_NAME.test(creation.name.trim()), { kind: 'rename', creationId: id }, { symbol: 'name' }),
  ]
  if (path === 'rover') {
    ideas.push(evergreen('idea-taller', 'Build it taller. Stack 5 bricks on it.', stackedBricks(creation, model) >= 5, armMany(STACK_PART, id), { part: STACK_PART }))
    if (creation.sensors.length > 0) ideas.push(evergreen('idea-code', 'Make it stop at a wall. Try it in Code.', hasProgram('stop-before-wall'), { kind: 'code', creationId: id, starter: 'stop-before-wall' }, { symbol: 'code' }))
  } else if (path === 'gate') {
    ideas.push(evergreen('idea-code', 'Change how far it opens. Try it in Code.', hasProgram('smart-gate'), { kind: 'code', creationId: id, starter: 'smart-gate' }, { symbol: 'code' }))
  } else {
    ideas.push(evergreen('idea-code', 'Pick the light’s color. Try it in Code.', hasProgram('signal-post'), { kind: 'code', creationId: id, starter: 'signal-post' }, { symbol: 'code' }))
  }
  return ideas
}
