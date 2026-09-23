import { ARM_OPEN_DEGREES } from '../drive/tryOutcome'
import { driveSidesOf, type DerivedCreation, type DerivedDevice, type DerivedMotor, type DriveSides } from '../model/creations'
import { SEES_SOMETHING_STUDS } from '../program/types'
import type { RunObservation } from '../run/types'
import { isRecord, walkBlocks } from '../program/workspaceJson'

/**
 * What the stage panel shows, derived from the run's observation and the creation
 * (contract §8: the readings on the stage are the values the blocks read). Pure, so the
 * words are tested directly.
 */
export type ReadingTone = 'idle' | 'live' | 'warn' | 'bad'

export type ReadingChip = {
  id: string
  label: string
  value: string
  /** A second, smaller line (the drive's speeds, a motor's position). */
  detail?: string
  tone: ReadingTone
  /** A light's colour. */
  swatch?: string
}

export const LIGHT_SWATCH: Record<string, string> = {
  red: '#ff3b30', orange: '#ff9500', yellow: '#ffd60a', green: '#34c759', blue: '#0a84ff', purple: '#bf5af2', white: '#ffffff',
}

const round = (value: number) => {
  const rounded = Math.round(value)
  return Object.is(rounded, -0) ? 0 : rounded
}
const signed = (value: number) => `${round(value) < 0 ? '−' : ''}${Math.abs(round(value))}`
const unplugged = (device: DerivedDevice, label = device.name): ReadingChip => ({ id: device.brickId, label, value: 'not plugged in', tone: 'warn' })
/**
 * How far away, in a third grader's words (kid lane Y): a stud is a "step", whole numbers
 * without a decimal ("3 steps away", "2.4 steps away", "1 step away").
 */
export function stepsAway(studs: number): string {
  const whole = Math.round(studs)
  const text = Math.abs(studs - whole) < 0.05 ? String(whole) : studs.toFixed(1)
  return `${text} ${text === '1' ? 'step' : 'steps'} away`
}
/** "Left motor", "Left motor and Right motor", "3 motors". */
const someMotors = (motors: readonly DerivedMotor[]) => (motors.length > 2 ? `${motors.length} motors` : motors.map((motor) => motor.name).join(' and '))

/**
 * The drive, by side, every motor on it counted, as the creation feels it: a motor that faces
 * the other way is flipped, so "drive forward at 40 %" reads Left 40 · Right 40 and two raw
 * "run … at 50 %" blocks on a mirror-mounted pair read Left 50 · Right −50, with speeds of
 * opposite signs: the two sides fight and the robot turns. A turn the program asks for with the
 * helpers (`turnsOnPurpose`) is just a turn. A side reads its busiest motor; one of its motors
 * left still (a program written before the car had four wheels) is named.
 */
function driveChip(creation: DerivedCreation, sides: DriveSides, observation: RunObservation | null, turnsOnPurpose: boolean): ReadingChip {
  const reversed = new Set(sides.reversedIds)
  const felt = (motor: DerivedMotor, percent: number) => (reversed.has(motor.brickId) ? -percent : percent)
  const motorsOf = (ids: readonly string[]) => ids.flatMap((id) => creation.motors.filter((motor) => motor.brickId === id))
  const left = motorsOf(sides.left)
  const right = motorsOf(sides.right)
  const all = [...left, ...right]
  const names = left.length === 1 && right.length === 1 ? `${left[0].name} · ${right[0].name}` : `${left.length} on the left · ${right.length} on the right`
  const speedOf = (motor: DerivedMotor) => {
    const reading = observation?.motors[motor.brickId]
    return reading ? reading.forwardPercent ?? felt(motor, reading.speedPercent) : null
  }
  const sideSpeed = (list: readonly DerivedMotor[]) => {
    const speeds = list.map(speedOf).filter((speed): speed is number => speed !== null)
    return speeds.length ? speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length : null
  }

  const missing = all.filter((motor) => !motor.plugged)
  if (missing.length) {
    // While it runs, the motors still plugged in show that they turn.
    const running = all.filter((motor) => motor.plugged)
    const one = running.length === 1 ? speedOf(running[0]) : null
    const [l, r] = [sideSpeed(left.filter((motor) => motor.plugged)), sideSpeed(right.filter((motor) => motor.plugged))]
    const detail = !observation || !running.length ? names
      : running.length === 1 ? (one === null ? names : `${running[0].name} speed ${signed(one)} %`)
        : `speed ${l === null ? '—' : signed(l)} · ${r === null ? '—' : signed(r)} %`
    return { id: 'drive', label: 'Motors', value: `${someMotors(missing)} not plugged in`, tone: 'warn', detail }
  }
  if (!observation || !left.length || !right.length || all.some((motor) => !observation.motors[motor.brickId])) return { id: 'drive', label: 'Motors', value: '—', detail: names, tone: 'idle' }

  const read = (list: readonly DerivedMotor[]) => list.map((motor) => ({ motor, power: felt(motor, observation.motors[motor.brickId].powerPercent), speed: speedOf(motor)! }))
  const [readLeft, readRight] = [read(left), read(right)]
  const busiest = (side: typeof readLeft) => side.reduce((best, entry) => (Math.abs(entry.power) > Math.abs(best.power) ? entry : best)).power
  const [powerLeft, powerRight] = [busiest(readLeft), busiest(readRight)]
  const [speedLeft, speedRight] = [sideSpeed(left)!, sideSpeed(right)!]
  const fighting = !turnsOnPurpose && Math.abs(speedLeft) > 5 && Math.abs(speedRight) > 5 && Math.sign(speedLeft) !== Math.sign(speedRight)
  // Motors not doing what their side does: running the other way, or left still.
  const odd = [...readLeft.map((entry) => ({ ...entry, side: powerLeft })), ...readRight.map((entry) => ({ ...entry, side: powerRight }))].filter((entry) => Math.abs(entry.side) >= 1)
  const against = odd.filter((entry) => Math.abs(entry.power) >= 1 && Math.sign(entry.power) !== Math.sign(entry.side)).map((entry) => entry.motor)
  const still = odd.filter((entry) => Math.abs(entry.power) < 1).map((entry) => entry.motor)
  let why = ''
  if (fighting) {
    // Say why a block that says 50 reads −50 here: the motor faces the other way.
    const flipped = all.filter((motor) => reversed.has(motor.brickId))
    if (flipped.length === 1) why = `${flipped[0].name} faces the other way`
    else if (flipped.length > 1) why = `${flipped.every((motor) => right.includes(motor)) ? 'the right motors' : flipped.every((motor) => left.includes(motor)) ? 'the left motors' : `${flipped.length} motors`} face the other way`
  } else if (against.length) why = `${someMotors(against)} ${against.length === 1 ? 'runs' : 'run'} the other way`
  else if (still.length) why = `${someMotors(still)} ${still.length === 1 ? 'is' : 'are'} not running`
  return {
    id: 'drive',
    label: 'Motors',
    value: `Left ${signed(powerLeft)} · Right ${signed(powerRight)} %`,
    detail: `speed ${signed(speedLeft)} · ${signed(speedRight)} %${why ? ` · ${why}` : ''}`,
    tone: fighting || against.length ? 'bad' : still.length ? 'warn' : 'live',
  }
}

export type ReadingOptions = {
  /**
   * The program moves the drive motors only with the drive helpers (see `programTurnsOnPurpose`),
   * so sides running opposite ways are a turn it asked for, not two motors fighting.
   */
  turnsOnPurpose?: boolean
}

/** The readings chips for the devices this creation has, in the order the mock reads them: sensors, drive, motors, arms, lights, buttons. */
export function readingChips(creation: DerivedCreation, observation: RunObservation | null, options: ReadingOptions = {}): ReadingChip[] {
  const chips: ReadingChip[] = []
  const live = observation !== null
  for (const sensor of creation.sensors) {
    if (!sensor.plugged) { chips.push(unplugged(sensor)); continue }
    const reading = observation?.sensors[sensor.brickId]
    // Kid words: how many steps away; "sees something" under it when a "when … sees something" block would fire.
    const sees = Boolean(reading?.hit && reading.distanceStuds < SEES_SOMETHING_STUDS)
    chips.push({
      id: sensor.brickId,
      label: sensor.name,
      value: !reading ? '—' : reading.hit ? stepsAway(reading.distanceStuds) : 'nothing seen',
      ...(sees ? { detail: 'sees something' } : {}),
      tone: !reading ? 'idle' : 'live',
    })
  }
  const sides = driveSidesOf(creation)
  const sideIds = new Set(sides ? [...sides.left, ...sides.right] : [])
  if (sides) chips.push(driveChip(creation, sides, observation, options.turnsOnPurpose ?? false), { id: 'speed', label: 'Speed', value: live ? `${observation.speedStudsPerSecond.toFixed(1)} st/s` : '—', tone: live ? 'live' : 'idle' })
  for (const motor of creation.motors) {
    if (sideIds.has(motor.brickId)) continue
    if (!motor.plugged) { chips.push(unplugged(motor)); continue }
    const reading = observation?.motors[motor.brickId]
    chips.push(reading
      ? { id: motor.brickId, label: motor.name, value: `${signed(reading.powerPercent)} %`, detail: `speed ${signed(reading.speedPercent)} % · ${signed(reading.positionDegrees)}°`, tone: 'live' }
      : { id: motor.brickId, label: motor.name, value: '—', tone: 'idle' })
  }
  for (const hinge of creation.hinges) {
    if (!hinge.plugged) { chips.push(unplugged(hinge)); continue }
    const reading = observation?.motors[hinge.brickId]
    const stuck = reading?.stuck ?? (hinge.locked ? 'locked' : null)
    // Kid words: open or closed; how far it turned (the number a "turn … to" block uses) underneath.
    const angle = reading ? round(reading.positionDegrees) : 0
    const turned = reading && angle !== 0 ? `turned to ${signed(reading.positionDegrees)}` : null
    chips.push({
      id: hinge.brickId,
      label: hinge.name,
      value: reading ? (Math.abs(reading.positionDegrees) >= ARM_OPEN_DEGREES ? 'open' : 'closed') : '—',
      ...(stuck ? { detail: stuck === 'locked' ? 'built into the frame · can’t swing' : 'blocked · pushing on something' } : turned ? { detail: turned } : {}),
      tone: stuck ? 'bad' : reading ? 'live' : 'idle',
    })
  }
  for (const light of creation.lights) {
    if (!light.plugged) { chips.push(unplugged(light)); continue }
    const color = observation ? observation.lights[light.brickId] ?? null : undefined
    chips.push({ id: light.brickId, label: light.name, value: color === undefined ? '—' : color ?? 'off', tone: color === undefined ? 'idle' : 'live', ...(color ? { swatch: LIGHT_SWATCH[color] } : {}) })
  }
  for (const button of creation.buttons) {
    if (!button.plugged) { chips.push(unplugged(button)); continue }
    const pressed = observation ? observation.buttons[button.brickId] ?? false : undefined
    chips.push({ id: button.brickId, label: button.name, value: pressed === undefined ? '—' : pressed ? 'pressed' : 'not pressed', tone: pressed === undefined ? 'idle' : 'live' })
  }
  return chips
}

export type StageStatus = { text: string; tone: 'idle' | 'running' | 'stopped' | 'loading'; /** A longer line for the tooltip. */ detail?: string }

/**
 * "Running · 2.1 s", "Stopped", "Ready". When every script has finished the program is
 * done but the stage still runs (motors keep their last command), so it says which:
 * "Done · motors still on" or "Done · 4.2 s".
 */
export function stageStatus(observation: RunObservation | null, loading: boolean): StageStatus {
  if (loading && !observation) return { text: 'Getting ready…', tone: 'loading' }
  if (!observation || observation.phase === 'ready') return { text: 'Ready', tone: 'idle' }
  if (observation.phase === 'stopped') return { text: 'Stopped', tone: 'stopped' }
  if (observation.idle) {
    const motorsOn = Object.values(observation.motors).some((motor) => motor.plugged && Math.abs(motor.powerPercent) > 0.5)
    return {
      text: motorsOn ? 'Done · motors still on' : `Done · ${observation.timeSeconds.toFixed(1)} s`,
      tone: 'running',
      detail: motorsOn ? 'Every script has finished. Motors keep their last command until Stop.' : 'Every script has finished.',
    }
  }
  return { text: `Running · ${observation.timeSeconds.toFixed(1)} s`, tone: 'running' }
}

const INPUT_BLOCKS = new Set(['robo_when_joystick_moves', 'robo_when_controls_update', 'robo_joystick', 'robo_key_held', 'robo_when_key_pressed', 'robo_drive_joystick'])

const DRIVE_HELPERS = new Set(['robo_drive', 'robo_turn', 'robo_drive_joystick'])
const RAW_MOTOR_BLOCKS = new Set(['robo_run_motor', 'robo_turn_motor_to'])

/**
 * The program drives with the helpers (drive, turn, drive using joystick) and moves no drive
 * motor with a raw block, so when its sides run opposite ways the robot turns because it was
 * told to. Two raw "run … at 40 %" blocks on a mirror-mounted pair spin it too, by mistake:
 * that program is not one of these, and its chip still says which motor faces the other way.
 */
export function programTurnsOnPurpose(workspace: unknown, creation: Pick<DerivedCreation, 'drivePair' | 'driveSides'>): boolean {
  const sides = driveSidesOf(creation)
  if (!sides) return false
  const driveIds = new Set([...sides.left, ...sides.right])
  let helpers = false
  let raw = false
  walkBlocks(workspace, (block) => {
    if (typeof block.type !== 'string') return
    if (DRIVE_HELPERS.has(block.type)) helpers = true
    const motor = isRecord(block.fields) ? block.fields.MOTOR : undefined
    if (RAW_MOTOR_BLOCKS.has(block.type) && typeof motor === 'string' && driveIds.has(motor)) raw = true
  })
  return helpers && !raw
}

/** The program reads the joystick or the keys, so the stage offers the on-screen joystick and key pad. */
export function programUsesInput(workspace: unknown): boolean {
  let found = false
  walkBlocks(workspace, (block) => { if (typeof block.type === 'string' && INPUT_BLOCKS.has(block.type)) found = true })
  return found
}
