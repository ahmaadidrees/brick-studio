import type { DerivedCreation, DerivedDevice } from '../model/creations'
import type { RunObservation } from '../run/types'
import { walkBlocks } from '../program/workspaceJson'

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
  /** A second, smaller line (a drive pair's speeds, a motor's position). */
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

/** The readings chips for the devices this creation has, in the order the mock reads them: sensors, drive, motors, arms, lights, buttons. */
export function readingChips(creation: DerivedCreation, observation: RunObservation | null): ReadingChip[] {
  const chips: ReadingChip[] = []
  const live = observation !== null
  for (const sensor of creation.sensors) {
    if (!sensor.plugged) { chips.push(unplugged(sensor)); continue }
    const reading = observation?.sensors[sensor.brickId]
    chips.push({
      id: sensor.brickId,
      label: sensor.name,
      value: !reading ? '—' : reading.hit ? `${reading.distanceStuds.toFixed(1)} studs` : 'nothing seen',
      tone: !reading ? 'idle' : 'live',
    })
  }
  const pair = creation.drivePair
  const pairIds = new Set(pair ? [pair.leftId, pair.rightId] : [])
  if (pair) {
    const left = creation.motors.find((motor) => motor.brickId === pair.leftId)
    const right = creation.motors.find((motor) => motor.brickId === pair.rightId)
    const a = observation?.motors[pair.leftId]
    const b = observation?.motors[pair.rightId]
    const names = `${left?.name ?? 'Left motor'} · ${right?.name ?? 'Right motor'}`
    if ((left && !left.plugged) || (right && !right.plugged)) {
      const missing = [left, right].filter((motor) => motor && !motor.plugged).map((motor) => motor!.name)
      // While it runs, the one still plugged in shows that it turns (as the creation feels it).
      const other = [left, right].find((motor) => motor?.plugged)
      const turning = other ? observation?.motors[other.brickId] : undefined
      const otherSpeed = turning ? turning.forwardPercent ?? (pair.reversedIds.includes(other!.brickId) ? -turning.speedPercent : turning.speedPercent) : null
      chips.push({ id: 'drive', label: 'Motors', value: `${missing.join(' and ')} not plugged in`, tone: 'warn', detail: otherSpeed === null ? names : `${other!.name} speed ${signed(otherSpeed)} %` })
    } else if (a && b) {
      // The pair reads as the creation feels it: a motor mounted reversed is flipped, so "drive
      // forward at 40 %" reads 40 · 40 and two raw "run … at 50 %" blocks on a reversed pair read
      // 50 · −50, with speeds of opposite signs: the two motors fight and the rover turns.
      const reversed = new Set(pair.reversedIds)
      const powerOf = (id: string, percent: number) => (reversed.has(id) ? -percent : percent)
      const forwardA = a.forwardPercent ?? powerOf(pair.leftId, a.speedPercent)
      const forwardB = b.forwardPercent ?? powerOf(pair.rightId, b.speedPercent)
      const fighting = Math.abs(forwardA) > 5 && Math.abs(forwardB) > 5 && Math.sign(forwardA) !== Math.sign(forwardB)
      chips.push({ id: 'drive', label: 'Motors', value: `${signed(powerOf(pair.leftId, a.powerPercent))} · ${signed(powerOf(pair.rightId, b.powerPercent))} %`, detail: `speed ${signed(forwardA)} · ${signed(forwardB)} %`, tone: fighting ? 'bad' : 'live' })
    } else {
      chips.push({ id: 'drive', label: 'Motors', value: '—', detail: names, tone: 'idle' })
    }
    chips.push({ id: 'speed', label: 'Speed', value: live ? `${observation.speedStudsPerSecond.toFixed(1)} st/s` : '—', tone: live ? 'live' : 'idle' })
  }
  for (const motor of creation.motors) {
    if (pairIds.has(motor.brickId)) continue
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
    chips.push({
      id: hinge.brickId,
      label: hinge.name,
      value: reading ? `${signed(reading.positionDegrees)}°` : '—',
      ...(stuck ? { detail: stuck === 'locked' ? 'built into the frame · can’t swing' : 'blocked · pushing on something' } : {}),
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

/** The program reads the joystick or the keys, so the stage offers the on-screen joystick and key pad. */
export function programUsesInput(workspace: unknown): boolean {
  let found = false
  walkBlocks(workspace, (block) => { if (typeof block.type === 'string' && INPUT_BLOCKS.has(block.type)) found = true })
  return found
}
