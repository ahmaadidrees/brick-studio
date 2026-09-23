import { beforeAll, describe, expect, it } from 'vitest'
import { createPartMap } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { connect } from '../model/control'
import { deriveCreations } from '../model/creations'
import { ROVER_IDS, fixtureInput, roverBricks } from '../model/fixtures'
import { emptyRoboticsSection, type RoboticsSection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import type { RoboticsModel } from '../state/roboticsStore'
import { cableScene } from './Cables'
import { brickObstacles, deviceCableEnd, highestUnder, hubPortEnd, looseCable, routeCable, routeLift } from './route'

beforeAll(() => { installRoboticsParts(true) })

const partMap = () => createPartMap([])
const bricks = () => roverBricks()
const byId = (list: BrickInstance[], id: string) => list.find((brick) => brick.id === id)!

function rover(section: RoboticsSection, list = bricks()): RoboticsModel {
  const input = fixtureInput(list, section)
  return { input, section, creations: deriveCreations(input) }
}
function wired(): RoboticsSection {
  let section: RoboticsSection = { ...emptyRoboticsSection(), creations: [{ id: 'r', name: 'Rover', anchorBrickIds: [ROVER_IDS.hub] }] }
  section = connect(section, ROVER_IDS.leftMotor, ROVER_IDS.hub, 'A')
  section = connect(section, ROVER_IDS.rightMotor, ROVER_IDS.hub, 'B')
  section = connect(section, ROVER_IDS.sensor, ROVER_IDS.hub, 'C')
  return section
}

describe('cable anchors', () => {
  it('a motor’s cable leaves its top, toward its back, whichever way it is turned', () => {
    const list = bricks()
    for (const rotation of [0, 1, 2, 3] as const) {
      const motor = { ...byId(list, ROVER_IDS.leftMotor), rotation }
      const end = deviceCableEnd(motor, partMap(), 64)!
      expect(end.normal).toEqual({ x: 0, y: 1, z: 0 })
      expect(end.point.y).toBeCloseTo((1 + 6) * 0.18)
      // The loose end lies away from the output socket, still over the motor's own top.
      const socketSide = [{ x: 1, z: 0 }, { x: 0, z: -1 }, { x: -1, z: 0 }, { x: 0, z: 1 }][rotation]
      expect(end.looseEnd!.x * socketSide.x + end.looseEnd!.z * socketSide.z).toBeLessThan(0)
    }
  })
  it('a hub port end is the catalog socket, facing out of the hub', () => {
    const list = bricks()
    const a = hubPortEnd(byId(list, ROVER_IDS.hub), 'A', partMap(), 64)!
    const c = hubPortEnd(byId(list, ROVER_IDS.hub), 'C', partMap(), 64)!
    expect(a.normal.x).toBeCloseTo(-1)
    expect(c.normal.x).toBeCloseTo(1)
    expect(a.point.y).toBeCloseTo(c.point.y)
  })
  it('the hub itself has no cable anchor', () => {
    expect(deviceCableEnd(byId(bricks(), ROVER_IDS.hub), partMap(), 64)).toBeNull()
  })
})

describe('routing', () => {
  it('a cable leaves and enters its sockets straight, then runs lifted clear of every brick under it', () => {
    const list = bricks()
    const obstacles = brickObstacles(list, partMap(), 64)
    const from = deviceCableEnd(byId(list, ROVER_IDS.leftMotor), partMap(), 64)!
    const to = hubPortEnd(byId(list, ROVER_IDS.hub), 'C', partMap(), 64)!
    const points = routeCable(from, to, obstacles)
    expect(points[0].y).toBeCloseTo(from.point.y + 0.02)
    expect(points.at(-1)!.x).toBeCloseTo(to.point.x + to.normal.x * 0.02)
    // Port C is on the far face of the hub from the left motor: the run goes over the hub.
    const hubTop = obstacles.find((box) => box.id === ROVER_IDS.hub)!.top
    expect(routeLift(points)).toBeGreaterThan(hubTop)
    expect(Math.min(points[2].y, points[3].y)).toBeGreaterThanOrEqual(highestUnder(points[1], points[4], obstacles) + 0.1)
  })
  it('with nothing between the ends the cable still arcs a little above both', () => {
    const from = { point: { x: 0, y: 0.5, z: 0 }, normal: { x: 1, y: 0, z: 0 } }
    const to = { point: { x: 2, y: 0.5, z: 0 }, normal: { x: -1, y: 0, z: 0 } }
    const points = routeCable(from, to, [])
    expect(routeLift(points)).toBeGreaterThan(0.5)
    expect(routeLift(points)).toBeLessThan(0.8)
  })
  it('routing is deterministic: the same build draws the same cable', () => {
    const list = bricks()
    const obstacles = brickObstacles(list, partMap(), 64)
    const from = deviceCableEnd(byId(list, ROVER_IDS.sensor), partMap(), 64)!
    const to = hubPortEnd(byId(list, ROVER_IDS.hub), 'C', partMap(), 64)!
    expect(routeCable(from, to, obstacles)).toEqual(routeCable(from, to, obstacles))
  })
  it('a loose cable from a top anchor ends above its own part; one from a back anchor droops but stays above the ground', () => {
    const list = bricks()
    const motor = deviceCableEnd(byId(list, ROVER_IDS.leftMotor), partMap(), 64)!
    const tip = looseCable(motor).at(-1)!
    const box = brickObstacles([byId(list, ROVER_IDS.leftMotor)], partMap(), 64)[0]
    expect(tip.x).toBeGreaterThan(box.minX)
    expect(tip.x).toBeLessThan(box.maxX)
    expect(tip.y).toBeGreaterThan(box.top)
    const light = deviceCableEnd({ id: 'light', partId: 'robo_light', x: 10, y: 0, z: 10, rotation: 0, color: '#fff' }, partMap(), 64)!
    const droop = looseCable(light)
    expect(droop.at(-1)!.y).toBeLessThan(light.point.y)
    expect(droop.at(-1)!.y).toBeGreaterThan(0)
  })
})

describe('what the scene draws', () => {
  it('one cable per plugged-in device, none lit until one is selected', () => {
    const scene = cableScene(rover(wired()), null, new Set())
    expect(scene.cables.map((cable) => cable.port).sort()).toEqual(['A', 'B', 'C'])
    expect(scene.stubs).toEqual([])
    expect(scene.cables.every((cable) => !cable.lit)).toBe(true)
    const selected = cableScene(rover(wired()), ROVER_IDS.leftMotor, new Set())
    expect(selected.cables.filter((cable) => cable.lit).map((cable) => cable.deviceId)).toEqual([ROVER_IDS.leftMotor])
  })
  it('an unplugged device has a loose end instead of a cable', () => {
    const section = { ...wired(), connections: wired().connections.filter((connection) => connection.deviceId !== ROVER_IDS.leftMotor) }
    const scene = cableScene(rover(section), ROVER_IDS.leftMotor, new Set())
    expect(scene.cables.some((cable) => cable.deviceId === ROVER_IDS.leftMotor)).toBe(false)
    expect(scene.stubs).toMatchObject([{ deviceId: ROVER_IDS.leftMotor, lit: true }])
  })
  it('a stale cable (its device deleted) is not drawn; a cable to a deleted hub leaves the device with a loose end', () => {
    const noRight = bricks().filter((brick) => brick.id !== ROVER_IDS.rightMotor)
    const scene = cableScene(rover(wired(), noRight), null, new Set())
    expect(scene.cables.map((cable) => cable.port).sort()).toEqual(['A', 'C'])
    expect(scene.stubs).toEqual([])
    const noHub = bricks().filter((brick) => brick.id !== ROVER_IDS.hub)
    const orphaned = cableScene(rover(wired(), noHub), null, new Set())
    expect(orphaned.cables).toEqual([])
    expect(orphaned.stubs.map((stub) => stub.deviceId).sort()).toEqual([ROVER_IDS.leftMotor, ROVER_IDS.rightMotor, ROVER_IDS.sensor].sort())
  })
  it('bricks a running nudge owns are left out, cables and loose ends alike', () => {
    const scene = cableScene(rover(wired()), null, new Set([ROVER_IDS.hub, ROVER_IDS.leftMotor, ROVER_IDS.rightMotor]))
    expect(scene.cables).toEqual([])
    expect(scene.stubs).toEqual([])
  })
  it('…unless they ride with their body: a cable whose device and hub share a body moves with it; one between two bodies is left out', () => {
    // Kid lane Y ("Test the motors"): the chassis carries the hub and the sensor; the left motor rides on another body here.
    const hidden = new Set([ROVER_IDS.hub, ROVER_IDS.leftMotor, ROVER_IDS.rightMotor, ROVER_IDS.sensor])
    const bodyOf: Record<string, string> = { [ROVER_IDS.hub]: 'chassis', [ROVER_IDS.sensor]: 'chassis', [ROVER_IDS.rightMotor]: 'chassis', [ROVER_IDS.leftMotor]: 'elsewhere' }
    const bodies = { simulated: hidden, bodyOfBrick: (id: string) => bodyOf[id] ?? null, poses: () => new Map() }
    const scene = cableScene(rover(wired()), ROVER_IDS.sensor, hidden, bodies)
    expect(scene.cables).toEqual([])
    expect([...scene.riding.keys()]).toEqual(['chassis'])
    const riding = scene.riding.get('chassis')!
    expect(riding.map((cable) => cable.deviceId).sort()).toEqual([ROVER_IDS.rightMotor, ROVER_IDS.sensor].sort())
    // The same route as in Build (drawn at the built pose, moved with the body), and the selection still lights it.
    const built = cableScene(rover(wired()), ROVER_IDS.sensor, new Set())
    expect(riding.find((cable) => cable.deviceId === ROVER_IDS.sensor)!.points).toEqual(built.cables.find((cable) => cable.deviceId === ROVER_IDS.sensor)!.points)
    expect(riding.find((cable) => cable.deviceId === ROVER_IDS.sensor)!.lit).toBe(true)
  })
})
