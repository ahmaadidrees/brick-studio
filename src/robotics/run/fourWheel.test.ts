import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { STUD, createPartMap } from '../../brick/parts'
import { FOUR_WHEEL_IDS } from '../model/fixtures'
import { rotateByQuat, type Vec3 } from '../model/vec'
import { installRoboticsParts } from '../parts/install'
import { compileContextFor, compileProgram } from '../program/compile'
import { starterFor } from '../program/starters'
import { wiredFourWheel, wiredRover, type WiredFixture } from '../program/testFixtures'
import { createProgramRuntime } from '../runtime'
import type { MotorReading } from './types'
import { createRunController, deriveCreationForSpace } from './controller'

/**
 * A four-wheel car on the test plate (KID-UX, "every motor drives"), the whole way a student's
 * program goes: the compiler lowers the helper onto all four motors, the runtime and the arbiter
 * run it, Rapier rolls the wheels. Compared with the two-wheel rover under the same program.
 */
let partMap: ReturnType<typeof createPartMap>
beforeAll(async () => {
  await RAPIER.init()
  installRoboticsParts(true)
  partMap = createPartMap([])
})

const ids = FOUR_WHEEL_IDS
const FOUR_MOTORS = [ids.frontLeftMotor, ids.backLeftMotor, ids.frontRightMotor, ids.backRightMotor]
const RIGHT = new Set<string>([ids.frontRightMotor, ids.backRightMotor])

const DRIVE_40 = {
  blocks: { languageVersion: 0, blocks: [{
    type: 'robo_when_run', id: 'hat', x: 40, y: 40,
    next: { block: { type: 'robo_drive', id: 'drive', fields: { DIRECTION: 'forward' }, inputs: { POWER: { shadow: { type: 'robo_number', id: 'power', fields: { NUM: 40 } } } } } },
  }] },
}

type Run = { forward: number; sideways: number; yaw: number; motors: Record<string, MotorReading> }

/**
 * Runs `workspace` on the test plate for `seconds` at 60 fps and reports how far the middle of the
 * creation's wheels went (studs, forward is -Z) and how far it turned (degrees, left positive).
 */
function run(fixture: WiredFixture, workspace: unknown, seconds: number, joystick?: { up: number; right: number }): Run {
  const input = { bricks: fixture.bricks, partMap, plateSize: 64, section: fixture.section }
  const creation = deriveCreationForSpace(input, 'c1', 'testPlate')!
  const compiled = compileProgram(workspace, compileContextFor(creation))
  expect(compiled, JSON.stringify(compiled.diagnostics)).toMatchObject({ ok: true, diagnostics: [] })
  const controller = createRunController({ rapier: RAPIER, bricks: fixture.bricks, partMap, plateSize: 64, creation, space: 'testPlate' })
  // Bodies start at the origin, unturned: body-local points are world points as built.
  const wheels = creation.wheels.map((wheel) => fixture.bricks.find((brick) => brick.id === wheel.brickId)!)
  const middle: Vec3 = {
    x: wheels.reduce((sum, brick) => sum + (brick.x + 0.5 - 32) * STUD, 0) / wheels.length,
    y: 0,
    z: wheels.reduce((sum, brick) => sum + (brick.z + 1.5 - 32) * STUD, 0) / wheels.length,
  }
  if (joystick) controller.setJoystick(joystick.up, joystick.right)
  controller.run(createProgramRuntime(compiled.ir, { fixedStep: controller.mechanics.fixedStep }))
  for (let frame = 0; frame < Math.round(seconds * 60); frame += 1) controller.advance(1 / 60)
  const pose = controller.poses().get(controller.bodyOfBrick(creation.hubs[0].brickId)!)!
  const moved = rotateByQuat(pose.rotation, middle)
  const facing = rotateByQuat(pose.rotation, { x: 0, y: 0, z: -1 })
  const result = {
    forward: -(moved.z + pose.position.z - middle.z) / STUD,
    sideways: (moved.x + pose.position.x - middle.x) / STUD,
    yaw: (Math.atan2(-facing.x, -facing.z) * 180) / Math.PI,
    motors: controller.observe().motors,
  }
  controller.dispose()
  return result
}

describe('a four-wheel car driven by its program', () => {
  it('"drive forward at 40 %" turns all four wheels and drives straight, further than the rover in the same time', () => {
    const rover = run(wiredRover(), DRIVE_40, 2)
    const car = run(wiredFourWheel(), DRIVE_40, 2)
    for (const id of FOUR_MOTORS) {
      const motor = car.motors[id]
      // The helper's command, the right side's reversal folded in: every wheel pushes forward.
      expect(motor.powerPercent, id).toBe(RIGHT.has(id) ? -40 : 40)
      expect(motor.forwardPercent!, id).toBeGreaterThan(35)
      expect(Math.abs(motor.positionDegrees), id).toBeGreaterThan(300)
    }
    // Measured: the car 6.9 studs in 2 s, the rover (whose nose drags) 5.9; both dead straight.
    expect(car.forward).toBeGreaterThan(6.5)
    expect(car.forward).toBeGreaterThan(rover.forward)
    for (const { sideways, yaw } of [car, rover]) {
      expect(Math.abs(sideways)).toBeLessThan(0.1)
      expect(Math.abs(yaw)).toBeLessThan(1)
    }
  })

  it('"drive using joystick" pushed right or left turns it on the spot, all four wheels turning', () => {
    const fixture = wiredFourWheel()
    const joystick = starterFor(fixture.creation, 'joystick-drive')!.workspace
    const right = run(fixture, joystick, 2.5, { up: 0, right: 100 })
    const left = run(fixture, joystick, 2.5, { up: 0, right: -100 })
    // Measured: about 123° either way in 2.5 s, the middle of the wheels staying within a hundredth of a stud.
    expect(right.yaw).toBeLessThan(-90)
    expect(left.yaw).toBeGreaterThan(90)
    for (const spin of [right, left]) expect(Math.hypot(spin.forward, spin.sideways)).toBeLessThan(0.25)
    for (const id of FOUR_MOTORS) {
      // Pushed right, the left side rolls forward and the right side backward.
      expect(Math.sign(right.motors[id].forwardPercent!), id).toBe(RIGHT.has(id) ? -1 : 1)
      expect(Math.abs(right.motors[id].forwardPercent!), id).toBeGreaterThan(60)
    }
  })

  it('"drive using joystick" pushed up drives it straight ahead', () => {
    const fixture = wiredFourWheel()
    const ahead = run(fixture, starterFor(fixture.creation, 'joystick-drive')!.workspace, 1, { up: 100, right: 0 })
    expect(ahead.forward).toBeGreaterThan(6)
    expect(Math.abs(ahead.yaw)).toBeLessThan(1)
    for (const id of FOUR_MOTORS) expect(ahead.motors[id].forwardPercent!, id).toBeGreaterThan(90)
  })
})
