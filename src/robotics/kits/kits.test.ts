import { beforeAll, describe, expect, it } from 'vitest'
import { validateBrickGroup } from '../../brick/store'
import type { BrickInstance } from '../../brick/types'
import { readiness } from '../drive/readiness'
import { creationComponent, deriveCreations } from '../model/creations'
import { fixtureInput } from '../model/fixtures'
import { emptyRoboticsSection, type RoboticsSection } from '../model/section'
import { ROBOTICS_PART_IDS, isRoboticsPart, roboticsSpec } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { KITS, kitAt, kitById, kitFootprint, placeKitInSection, uniqueRobotName, type Kit } from './kits'
import { kitBetweenTwoRobots, kitUnderAnOverhang } from './kitTestFixtures'

beforeAll(() => installRoboticsParts(true))

const PLATE = 64

/** A kit placed on an empty 64-stud plate as its own bricks, and the robot that makes. */
function placedAlone(kit: Kit, center = { x: 32, z: 32 }, section: RoboticsSection = emptyRoboticsSection()) {
  const bricks = kitAt(kit, center, PLATE)
  const input = fixtureInput(bricks, section)
  const placement = placeKitInSection({ input, section, creations: deriveCreations(input) }, kit, bricks.map((brick) => brick.id), 'robot-1')
  const robot = deriveCreations(fixtureInput(bricks, placement.section)).find((creation) => creation.id === placement.creationId)!
  return { bricks, placement, robot }
}

describe('kit layouts', () => {
  it.each(KITS.map((kit) => [kit.id, kit] as const))('%s: fits the plate with no overlaps, wherever it is centred', (_id, kit) => {
    const { width, depth } = kitFootprint(kit.bricks)
    for (const center of [{ x: 32, z: 32 }, { x: 0, z: 0 }, { x: PLATE, z: PLATE }, { x: 3, z: PLATE - 1 }]) {
      const bricks = kitAt(kit, center, PLATE)
      expect(validateBrickGroup(bricks, [], 5000, PLATE)).toEqual({ valid: true, reason: null })
      const minX = Math.min(...bricks.map((brick) => brick.x))
      const minZ = Math.min(...bricks.map((brick) => brick.z))
      expect(minX).toBeGreaterThanOrEqual(0)
      expect(minZ).toBeGreaterThanOrEqual(0)
      expect(minX + width).toBeLessThanOrEqual(PLATE)
      expect(minZ + depth).toBeLessThanOrEqual(PLATE)
    }
  })

  it.each(KITS.map((kit) => [kit.id, kit] as const))('%s: stands on the ground on a plain plate that comes first, and is one piece', (_id, kit) => {
    const [base, ...rest] = kit.bricks
    expect(base.partId.startsWith('plate_')).toBe(true)
    expect(isRoboticsPart(base.partId)).toBe(false)
    expect(base.y).toBe(0)
    expect(Math.min(...kit.bricks.map((brick) => brick.y))).toBe(0)
    expect(rest.length).toBeGreaterThan(0)
    // Studs, axles and wheels join every brick of the kit to its plate.
    const bricks = kitAt(kit, { x: 32, z: 32 }, PLATE)
    expect(new Set(creationComponent(fixtureInput(bricks), bricks[0].id))).toEqual(new Set(bricks.map((brick) => brick.id)))
    // Ids are unique, and never a document's own.
    expect(new Set(kit.bricks.map((brick) => brick.id)).size).toBe(kit.bricks.length)
    expect(kit.bricks.every((brick) => brick.id.startsWith(`kit:${kit.id}:`))).toBe(true)
  })

  it('robot parts come in their own drawer colours', () => {
    for (const kit of KITS) {
      for (const brick of kit.bricks) {
        const spec = roboticsSpec(brick.partId)
        if (spec) expect(brick.color).toBe(spec.part.defaultColor)
      }
    }
  })

  it('every cable goes from a device of the kit to the kit hub, one port each', () => {
    for (const kit of KITS) {
      const ids = new Set(kit.bricks.map((brick) => brick.id))
      const hub = kit.bricks.find((brick) => brick.partId === ROBOTICS_PART_IDS.hub)!
      expect(kit.cables.every((cable) => ids.has(cable.deviceId) && cable.hubId === hub.id)).toBe(true)
      expect(new Set(kit.cables.map((cable) => cable.port)).size).toBe(kit.cables.length)
    }
  })
})

describe('the robot each kit makes', () => {
  it('Buggy: a drive pair, three devices plugged in (motors A and B, the sensor C), ready to drive', () => {
    const { robot, placement } = placedAlone(kitById('buggy'))
    expect(placement.name).toBe('Buggy')
    expect(robot.kind).toBe('rover')
    expect(robot.drivePair).not.toBeNull()
    expect(robot.brickIds).toHaveLength(9)
    expect(robot.motors.map((motor) => [motor.name, motor.port?.port])).toEqual([['Left motor', 'A'], ['Right motor', 'B']])
    expect(robot.sensors.map((sensor) => [sensor.name, sensor.port?.port, sensor.facing])).toEqual([['Front sensor', 'C', 'forward']])
    expect(robot.wheels.every((wheel) => wheel.onAxle)).toBe(true)
    expect(placement.section.connections).toHaveLength(3)
    expect(readiness(robot)).toEqual({ kind: 'drive', ready: true, reason: null })
  })

  it('Gate: a hinge that is not locked, plugged in with its sensor, ready to try', () => {
    const { robot, placement } = placedAlone(kitById('gate'))
    expect(placement.name).toBe('Gate')
    expect(robot.kind).toBe('gate')
    expect(robot.hinges).toHaveLength(1)
    expect(robot.hinges[0]).toMatchObject({ locked: false, plugged: true, port: { port: 'A' } })
    expect(robot.hinges[0].armBrickIds).toHaveLength(1)
    expect(robot.sensors[0]).toMatchObject({ plugged: true, port: { port: 'B' } })
    expect(robot.testSpace).toBe('myWorld')
    expect(readiness(robot)).toEqual({ kind: 'try', ready: true, reason: null })
  })

  it('Signal light: its sensor and its light plugged in, ready to try', () => {
    const { robot, placement } = placedAlone(kitById('signal-light'))
    expect(placement.name).toBe('Signal light')
    expect(robot.kind).toBe('signal')
    expect(robot.sensors.map((sensor) => sensor.port?.port)).toEqual(['A'])
    expect(robot.lights.map((light) => light.port?.port)).toEqual(['B'])
    expect(robot.brickIds).toHaveLength(4)
    expect(readiness(robot)).toEqual({ kind: 'try', ready: true, reason: null })
  })

  it('Robot base: a hub on a plate, a robot of its own named for the student', () => {
    const { robot, placement, bricks } = placedAlone(kitById('robot-base'))
    expect(placement.name).toBe('My robot')
    expect(robot.brickIds).toEqual(bricks.map((brick) => brick.id))
    expect(robot.hubs).toHaveLength(1)
    expect(bricks[0].partId).toBe('plate_6x8')
    expect(bricks[1]).toMatchObject({ partId: ROBOTICS_PART_IDS.hub, y: 1 })
    expect(placement.section.connections).toEqual([])
  })

  it('a kit is plugged in whatever the wiring setting says', () => {
    const manual: RoboticsSection = { ...emptyRoboticsSection(), settings: { wiring: 'manual' } }
    const { robot } = placedAlone(kitById('buggy'), undefined, manual)
    expect(readiness(robot).ready).toBe(true)
  })
})

describe('names', () => {
  it('the second kit of a kind is numbered, without regard to case, and a free number is reused', () => {
    expect(uniqueRobotName('Buggy', [])).toBe('Buggy')
    expect(uniqueRobotName('Buggy', ['Buggy'])).toBe('Buggy 2')
    expect(uniqueRobotName('Buggy', ['Buggy', 'Buggy 2'])).toBe('Buggy 3')
    expect(uniqueRobotName('Buggy', ['buggy ', 'Gate'])).toBe('Buggy 2')
    expect(uniqueRobotName('Buggy', ['Buggy', 'Buggy 3'])).toBe('Buggy 2')
    expect(uniqueRobotName('Signal light', ['Signal light'])).toBe('Signal light 2')
  })

  it('a kit placed beside a saved robot of the same kind gets the next name', () => {
    const buggy = kitById('buggy')
    const first = kitAt(buggy, { x: 16, z: 16 }, PLATE).map((brick) => ({ ...brick, id: `first-${brick.id}` }))
    const firstSection: RoboticsSection = { ...emptyRoboticsSection(), creations: [{ id: 'saved', name: 'Buggy', anchorBrickIds: [first[0].id] }] }
    const second = kitAt(buggy, { x: 44, z: 44 }, PLATE)
    const bricks: BrickInstance[] = [...first, ...second]
    const input = fixtureInput(bricks, firstSection)
    const placement = placeKitInSection({ input, section: firstSection, creations: deriveCreations(input) }, buggy, second.map((brick) => brick.id), 'robot-2')
    expect(placement.name).toBe('Buggy 2')
    expect(placement.joined).toEqual([])
    expect(placement.section.creations.map((creation) => creation.name)).toEqual(['Buggy', 'Buggy 2'])
  })
})

describe('a kit built onto a saved robot', () => {
  it('joins that robot: no second record, the robot keeps its name and anchors the kit', () => {
    const { existing, section, base } = kitUnderAnOverhang()
    expect(validateBrickGroup(base, existing, 5000, PLATE).valid).toBe(true)
    const input = fixtureInput([...existing, ...base], section)
    const placement = placeKitInSection({ input, section, creations: deriveCreations(input) }, kitById('robot-base'), base.map((brick) => brick.id), 'unused')
    expect(placement.joined.map((creation) => creation.id)).toEqual(['old'])
    expect(placement.creationId).toBe('old')
    expect(placement.name).toBe('Signal light')
    expect(placement.section.creations).toHaveLength(1)
    expect(placement.section.creations[0].anchorBrickIds).toEqual(expect.arrayContaining(base.map((brick) => brick.id)))
  })

  it('touching two saved robots: only its cables are written and no robot is named (the join card names them)', () => {
    const { existing, section, base } = kitBetweenTwoRobots()
    expect(validateBrickGroup(base, existing, 5000, PLATE).valid).toBe(true)
    const input = fixtureInput([...existing, ...base], section)
    const placement = placeKitInSection({ input, section, creations: deriveCreations(input) }, kitById('robot-base'), base.map((brick) => brick.id), 'unused')
    expect(placement.joined.map((creation) => creation.id)).toEqual(['a', 'b'])
    expect(placement.creationId).toBeNull()
    expect(placement.section.creations).toEqual(section.creations)
  })
})
