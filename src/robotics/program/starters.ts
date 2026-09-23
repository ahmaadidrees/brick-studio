import type { DerivedCreation, DerivedDevice } from '../model/creations'
import { SEES_SOMETHING_STUDS } from './types'
import type { WorkspaceJson } from './workspaceJson'

/**
 * Program starters (CP2-PLAN §1, §5): a half-finished program and a goal line, built for
 * one creation's real device ids, in exactly the shape `Blockly.serialization.workspaces.save()`
 * produces and `compileProgram` reads. The first-run state is one script: each starter's
 * workspace holds a single hat with its blocks under it.
 *
 * Block ids are fixed per starter (`<starter>:<role>`) so a starter opens the same way
 * every time and tests can name its blocks.
 */
export type StarterId = 'stop-before-wall' | 'joystick-drive' | 'smart-gate' | 'signal-post' | 'blank'

export type Starter = {
  id: StarterId
  name: string
  /** The goal line under the stage, in the mock's voice. */
  goal: string
  /** A controller starter shows its Input blocks on the first run (contract §6). */
  controller: boolean
  workspace: WorkspaceJson
}

type StarterBlock = {
  type: string
  id: string
  x?: number
  y?: number
  fields?: Record<string, unknown>
  inputs?: Record<string, { block?: StarterBlock; shadow?: StarterBlock }>
  next?: { block: StarterBlock }
}

export const STARTER_NAMES: Readonly<Record<StarterId, string>> = Object.freeze({
  'stop-before-wall': 'Stop before the wall',
  'joystick-drive': 'Joystick drive',
  'smart-gate': 'Smart gate',
  'signal-post': 'Signal post',
  blank: 'My program',
})

export const STARTER_GOALS: Readonly<Record<StarterId, string>> = Object.freeze({
  'stop-before-wall': 'Try it: change 3 to 6. Does it stop earlier or later?',
  'joystick-drive': 'Try it: drive with the joystick or the arrow keys. Can you stop right in front of the wall?',
  'smart-gate': 'Try it: change 90 to 45. How far does the door open now?',
  'signal-post': 'Try it: change red to green. Then press “Someone walks up”.',
  blank: 'Try it: snap a block under “when run”, then press Run.',
})

/** The goal line for a program that began as a starter, if it did. */
export function starterGoal(starterId: string | undefined): string | null {
  return starterId && Object.hasOwn(STARTER_GOALS, starterId) ? STARTER_GOALS[starterId as StarterId] : null
}

const block = (type: string, id: string, rest: Omit<StarterBlock, 'type' | 'id'> = {}): StarterBlock => ({ type, id, ...rest })
const number = (value: number, id: string) => ({ shadow: block('robo_number', id, { fields: { NUM: value } }) })
const chain = (...blocks: StarterBlock[]): StarterBlock => {
  for (let index = blocks.length - 1; index > 0; index -= 1) blocks[index - 1].next = { block: blocks[index] }
  return blocks[0]
}
const workspace = (top: StarterBlock): WorkspaceJson => ({ blocks: { languageVersion: 0, blocks: [{ ...top, x: 40, y: 40 }] } })

function starter(id: StarterId, controller: boolean, top: StarterBlock): Starter {
  return { id, name: STARTER_NAMES[id], goal: STARTER_GOALS[id], controller, workspace: workspace(top) }
}

/** The sensor a rover watches the road with: one facing forward if it has one. */
function frontSensor(creation: DerivedCreation): DerivedDevice | null {
  return creation.sensors.find((sensor) => sensor.facing === 'forward') ?? creation.sensors[0] ?? null
}

function stopBeforeWall(sensor: DerivedDevice): Starter {
  const id = (role: string) => `stop-before-wall:${role}`
  return starter('stop-before-wall', false, chain(
    block('robo_when_run', id('when-run')),
    block('robo_drive', id('drive'), { fields: { DIRECTION: 'forward' }, inputs: { POWER: number(40, id('power')) } }),
    block('robo_wait_until', id('wait-until'), {
      inputs: { CONDITION: { block: block('robo_sensor_sees', id('sees'), { fields: { SENSOR: sensor.brickId }, inputs: { STUDS: number(3, id('studs')) } }) } },
    }),
    block('robo_stop_motors', id('stop')),
  ))
}

function joystickDrive(): Starter {
  const id = (role: string) => `joystick-drive:${role}`
  // The arrow keys drive the same joystick axes, so this one script answers both.
  return starter('joystick-drive', true, chain(
    block('robo_when_joystick_moves', id('when-joystick')),
    block('robo_drive_joystick', id('drive')),
  ))
}

/**
 * `if <sensor> sees something closer than 5 studs` — the same "sees something" as the event hat,
 * so a visitor the stage walks up to (3 studs away) is seen, and anything under 5 counts.
 */
const seesSomething = (id: (role: string) => string, sensor: DerivedDevice) =>
  block('robo_sensor_sees', id('sees'), { fields: { SENSOR: sensor.brickId }, inputs: { STUDS: number(SEES_SOMETHING_STUDS, id('studs')) } })

/**
 * Smart gate (kid lane Y): the gate stays open while someone is there and closes once they
 * have gone. Read aloud: "when run, forever: if the sensor sees something, turn the arm to
 * 90°, else turn it to 0°". The arm only turns when the command changes (commands latch).
 */
function smartGate(sensor: DerivedDevice, arm: DerivedDevice): Starter {
  const id = (role: string) => `smart-gate:${role}`
  return starter('smart-gate', false, chain(
    block('robo_when_run', id('when-run')),
    block('robo_forever', id('forever'), {
      inputs: {
        DO: {
          block: block('robo_if_else', id('if'), {
            inputs: {
              CONDITION: { block: seesSomething(id, sensor) },
              DO: { block: block('robo_turn_motor_to', id('open'), { fields: { MOTOR: arm.brickId }, inputs: { DEGREES: number(90, id('open-degrees')) } }) },
              ELSE: { block: block('robo_turn_motor_to', id('close'), { fields: { MOTOR: arm.brickId }, inputs: { DEGREES: number(0, id('close-degrees')) } }) },
            },
          }),
        },
      },
    }),
  ))
}

/** Signal post (kid lane Y): the light is red while someone is there and off once they have gone. */
function signalPost(sensor: DerivedDevice, light: DerivedDevice): Starter {
  const id = (role: string) => `signal-post:${role}`
  return starter('signal-post', false, chain(
    block('robo_when_run', id('when-run')),
    block('robo_forever', id('forever'), {
      inputs: {
        DO: {
          block: block('robo_if_else', id('if'), {
            inputs: {
              CONDITION: { block: seesSomething(id, sensor) },
              DO: { block: block('robo_set_light', id('red'), { fields: { LIGHT: light.brickId, COLOR: 'red' } }) },
              ELSE: { block: block('robo_light_off', id('off'), { fields: { LIGHT: light.brickId } }) },
            },
          }),
        },
      },
    }),
  ))
}

function blank(): Starter {
  return starter('blank', false, block('robo_when_run', 'blank:when-run'))
}

/**
 * The starters that fit this creation, in a fixed order: `stop-before-wall` for a rover
 * with a sensor, `joystick-drive` for anything with a drive pair, `smart-gate` for a hinge
 * motor and a sensor, `signal-post` for a sensor and a light, and always `blank`.
 */
export function startersFor(creation: DerivedCreation): Starter[] {
  const starters: Starter[] = []
  const sensor = frontSensor(creation)
  const arm = creation.hinges[0] ?? null
  const light = creation.lights[0] ?? null
  if (creation.drivePair && sensor) starters.push(stopBeforeWall(sensor))
  if (creation.drivePair) starters.push(joystickDrive())
  if (arm && sensor) starters.push(smartGate(sensor, arm))
  if (light && sensor) starters.push(signalPost(sensor, light))
  starters.push(blank())
  return starters
}

export function starterFor(creation: DerivedCreation, id: StarterId): Starter | null {
  return startersFor(creation).find((candidate) => candidate.id === id) ?? null
}

/** The starter a creation's first program begins as, by kind (CP2-PLAN §2): rover, gate, signal post, else blank. */
export function defaultStarterFor(creation: DerivedCreation): Starter {
  const starters = startersFor(creation)
  const pick = (id: StarterId) => starters.find((candidate) => candidate.id === id) ?? null
  const byKind: StarterId[] = creation.kind === 'rover' ? ['stop-before-wall', 'joystick-drive']
    : creation.kind === 'gate' ? ['smart-gate']
      : creation.kind === 'signal' ? ['signal-post']
        : ['stop-before-wall', 'smart-gate', 'signal-post', 'joystick-drive']
  for (const id of byKind) {
    const found = pick(id)
    if (found) return found
  }
  return pick('blank')!
}
