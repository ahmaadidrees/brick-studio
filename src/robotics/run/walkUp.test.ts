import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { BRICK_PART_MAP, STUD, createPartMap, rotatedSize } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { kitAt, kitById, placeKitInSection, type KitId } from '../kits/kits'
import { deriveCreations } from '../model/creations'
import { SIGNAL_IDS, signalPostBricks } from '../model/fixtures'
import { emptyRoboticsSection, type RoboticsConnection, type RoboticsSection } from '../model/section'
import { installRoboticsParts } from '../parts/install'
import { SEES_SOMETHING_STUDS } from '../program/types'
import { createRunController, deriveCreationForSpace, type StageRunController } from './controller'
import type { RunSpace, TestProp } from './types'
import { WALK_UP, planWalkUp, sensorMount } from './walkUp'

/**
 * The walk-up test (kid lane Y): wherever the sensor looks and however the robot is turned,
 * "Someone walks up" crosses the beam, is seen before it stops, and stops 3 studs in front of it.
 */
let partMap: ReturnType<typeof createPartMap>
beforeAll(async () => {
  await RAPIER.init()
  installRoboticsParts(true)
  partMap = createPartMap([])
})

type Visitor = Extract<TestProp, { kind: 'visitor' }>

/** The studio's own group quarter turn (store.ts `rotateBrickGroup`), `turns` times; the group is nudged a stud when a turn would leave the grid. */
function turnGroup(bricks: BrickInstance[], turns: number): BrickInstance[] {
  let group = bricks.map((brick) => ({ ...brick }))
  for (let turn = 0; turn < turns; turn += 1) {
    for (const shift of [0, 1]) {
      const moved = group.map((brick) => ({ ...brick, x: brick.x + shift }))
      const sizes = moved.map((brick) => rotatedSize(BRICK_PART_MAP[brick.partId], brick.rotation))
      const minX = Math.min(...moved.map((brick) => brick.x))
      const minZ = Math.min(...moved.map((brick) => brick.z))
      const pivotX2 = minX + Math.max(...moved.map((brick, index) => brick.x + sizes[index].width))
      const pivotZ2 = minZ + Math.max(...moved.map((brick, index) => brick.z + sizes[index].depth))
      const next = moved.map((brick, index) => {
        const rotation = ((brick.rotation + 1) % 4) as BrickInstance['rotation']
        const size = rotatedSize(BRICK_PART_MAP[brick.partId], rotation)
        const cx2 = pivotX2 + (brick.z * 2 + sizes[index].depth - pivotZ2)
        const cz2 = pivotZ2 - (brick.x * 2 + sizes[index].width - pivotX2)
        return { ...brick, rotation, x: (cx2 - size.width) / 2, z: (cz2 - size.depth) / 2 }
      })
      if (next.every((brick) => Number.isInteger(brick.x) && Number.isInteger(brick.z))) { group = next; break }
    }
  }
  return group
}

/** A kit placed on the plate (turned `turns` quarter turns), its robot named and plugged in the way the drawer does it. */
function placedKit(kitId: KitId, turns = 0, extra: BrickInstance[] = []): { bricks: BrickInstance[]; section: RoboticsSection; id: string } {
  const kit = kitById(kitId)
  const bricks = turnGroup(kitAt(kit, { x: 32, z: 32 }, 64), turns)
  const all = [...bricks, ...extra]
  const input = { bricks: all, partMap, plateSize: 64, section: emptyRoboticsSection() }
  const placement = placeKitInSection({ input, section: input.section, creations: deriveCreations(input) }, kit, bricks.map((brick) => brick.id), 'robot')
  return { bricks: all, section: placement.section, id: 'robot' }
}

function stageFor(bricks: BrickInstance[], section: RoboticsSection, id: string, space: RunSpace = 'myWorld'): StageRunController {
  const input = { bricks, partMap, plateSize: 64, section }
  const creation = deriveCreationForSpace(input, id, space)!
  return createRunController({ rapier: RAPIER, bricks, partMap, plateSize: 64, creation, space })
}

const SIGNAL_WIRING: RoboticsConnection[] = [
  { deviceId: SIGNAL_IDS.sensor, hubId: SIGNAL_IDS.hub, port: 'A' },
  { deviceId: SIGNAL_IDS.light, hubId: SIGNAL_IDS.hub, port: 'B' },
]

/** The signal post with its sensor turned to face -Z (0), -X (1), +Z (2) or +X (3), on the hub's edge that way. */
function signalPostFacing(rotation: 0 | 1 | 2 | 3, extra: BrickInstance[] = []): BrickInstance[] {
  const at: Record<number, [number, number]> = { 0: [41, 40], 1: [40, 41], 2: [41, 43], 3: [43, 41] }
  const [x, z] = at[rotation]
  return [...signalPostBricks().map((brick) => (brick.id === SIGNAL_IDS.sensor ? { ...brick, x, z, rotation } : brick)), ...extra]
}
const signalSection = (): RoboticsSection => ({ ...emptyRoboticsSection(), creations: [{ id: 'post', name: 'Signal light', anchorBrickIds: [SIGNAL_IDS.hub] }], connections: SIGNAL_WIRING })

/**
 * Sends the visitor and steps the stage until it stops: when the sensor first saw it (seconds
 * after the press, and whether it was still walking), what it reads at the stop, and whether
 * the sensor kept seeing it for the whole pause.
 */
function walkUp(controller: StageRunController, sensorId: string) {
  controller.triggerVisitor()
  let seenAt: number | null = null
  let seenWhile: string | null = null
  let arrivedAt: number | null = null
  let seenThroughPause = true
  for (let frame = 1; frame <= 60 * 12; frame += 1) {
    controller.advance(1 / 60)
    const o = controller.observe()
    const reading = o.sensors[sensorId]
    const sees = reading.hit && reading.distanceStuds < SEES_SOMETHING_STUDS
    if (sees && seenAt === null) { seenAt = frame / 60; seenWhile = o.visitorPhase ?? null }
    if (o.visitorPhase === 'here' && arrivedAt === null) arrivedAt = frame / 60
    if (o.visitorPhase === 'here' && !sees) seenThroughPause = false
    if (o.visitorPhase === 'leaving') break
  }
  const atStop = controller.observe().sensors[sensorId]
  return { seenAt, seenWhile, arrivedAt, seenThroughPause, atStop }
}

/** How far the path's first point is from the beam's line, and where the stop is along the beam (world units). */
function geometryOf(visitor: Visitor, point: { x: number; z: number }, facing: { x: number; z: number }) {
  const offset = (p: { x: number; z: number }) => ({ along: (p.x - point.x) * facing.x + (p.z - point.z) * facing.z, across: Math.abs((p.x - point.x) * -facing.z + (p.z - point.z) * facing.x) })
  return { start: offset(visitor.path[0]), stop: offset(visitor.path[visitor.path.length - 1]) }
}

describe('the walk-up plan', () => {
  it('a sensor looking -Z, -X, +Z or +X: the visitor comes in across the beam and stops 3 studs in front of it', () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      const bricks = signalPostFacing(rotation)
      const creation = deriveCreations({ bricks, partMap, plateSize: 64, section: signalSection() })[0]
      const sensor = creation.sensors[0]
      const mount = sensorMount(sensor, { bricks, partMap, plateSize: 64 })!
      const expected = [{ x: 0, z: -1 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 1, z: 0 }][rotation]
      expect([mount.facing.x, mount.facing.z].map((value) => Math.round(value))).toEqual([expected.x, expected.z])
      const visitor = planWalkUp(creation, 'myWorld', { bricks, partMap, plateSize: 64 })!
      expect(visitor.sensorId).toBe(SIGNAL_IDS.sensor)
      expect(visitor.walk).toMatchObject({ standStuds: 3, problem: null })
      const { start, stop } = geometryOf(visitor, mount.point, mount.facing)
      // The stop is on the beam, its near side 3 studs from the face.
      expect(stop.across).toBeLessThan(1e-6)
      expect(stop.along).toBeCloseTo(3 * STUD + WALK_UP.size.depth / 2, 6)
      // It starts well off the beam (not in it), from the side.
      expect(start.across).toBeGreaterThan(5 * STUD)
      // Quick steps, then at least a second of slow ones into the beam, then a three-second wait.
      expect(visitor.legSeconds).toHaveLength(2)
      expect(visitor.legSeconds![1]).toBeGreaterThanOrEqual(1)
      expect(visitor.pauseSeconds).toBe(3)
      // It looks at the sensor while it waits.
      expect(visitor.facing!.x).toBeCloseTo(-mount.facing.x, 6)
      expect(visitor.facing!.z).toBeCloseTo(-mount.facing.z, 6)
    }
  })

  it('…and the sensor sees it while it is still walking, reads 3 at the stop, and keeps seeing it for the whole wait', () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      const controller = stageFor(signalPostFacing(rotation), signalSection(), 'post')
      const walk = walkUp(controller, SIGNAL_IDS.sensor)
      expect(walk.seenWhile, `sensor turned ${rotation}`).toBe('arriving')
      // Seen at least half a second before it stops: time for the robot to react first.
      expect(walk.arrivedAt! - walk.seenAt!).toBeGreaterThan(0.5)
      expect(walk.seenThroughPause).toBe(true)
      expect(walk.atStop.hit).toBe(true)
      expect(walk.atStop.distanceStuds).toBeCloseTo(3, 1)
      controller.dispose()
    }
  })

  it('the Gate and Signal light kits, turned any way on the plate: seen on the way in, read at 3 studs, never walking into the robot', () => {
    for (const kitId of ['gate', 'signal-light'] as const) {
      for (const turns of [0, 1, 2, 3]) {
        const { bricks, section, id } = placedKit(kitId, turns)
        const creation = deriveCreations({ bricks, partMap, plateSize: 64, section })[0]
        const visitor = planWalkUp(creation, 'myWorld', { bricks, partMap, plateSize: 64 })!
        expect(visitor.walk, `${kitId} turned ${turns}`).toMatchObject({ standStuds: 3, problem: null })
        const controller = stageFor(bricks, section, id)
        const walk = walkUp(controller, creation.sensors[0].brickId)
        expect(walk.seenWhile, `${kitId} turned ${turns}`).toBe('arriving')
        expect(walk.atStop.distanceStuds).toBeCloseTo(3, 1)
        controller.dispose()
      }
    }
  })

  it('a wall of the student’s bricks on the camera’s side of the stop: the visitor comes from the other side', () => {
    // The post's sensor looks -Z from z = 40: the stop is near z = 36.6, x = 42. A tall wall a stud to its +X side.
    const wall = [0, 3, 6, 9].map((y, index): BrickInstance => ({ id: `wall-${index}`, partId: 'brick_1x6', x: 44, y, z: 33, rotation: 0, color: '#888888' }))
    const bricks = signalPostFacing(0, wall)
    const creation = deriveCreations({ bricks, partMap, plateSize: 64, section: signalSection() })[0]
    const visitor = planWalkUp(creation, 'myWorld', { bricks, partMap, plateSize: 64 })!
    expect(visitor.walk).toMatchObject({ approach: 'other-side', problem: null })
    // On the test plate the student's bricks are not there: it comes from the camera's side again.
    expect(planWalkUp(creation, 'testPlate', { bricks, partMap, plateSize: 64 })!.walk).toMatchObject({ approach: 'side', problem: null })
    const controller = stageFor(bricks, signalSection(), 'post')
    expect(walkUp(controller, SIGNAL_IDS.sensor).atStop.distanceStuds).toBeCloseTo(3, 1)
    controller.dispose()
  })

  it('a sensor looking at a wall inside "sees something" says so; the robot’s own bricks never count', () => {
    // Its near face 2 studs from the sensor's face (z = 40): a 2 × 4 standing at z 34..38, four bricks high.
    const wall = [0, 3, 6, 9].map((y, index): BrickInstance => ({ id: `wall-${index}`, partId: 'brick_2x4', x: 41, y, z: 34, rotation: 0, color: '#888888' }))
    const bricks = signalPostFacing(0, wall)
    const creation = deriveCreations({ bricks, partMap, plateSize: 64, section: signalSection() })[0]
    const visitor = planWalkUp(creation, 'myWorld', { bricks, partMap, plateSize: 64 })!
    expect(visitor.walk?.problem).toBe('wall')
    expect(visitor.walk?.wallStuds).toBeCloseTo(2, 5)
    expect(planWalkUp(creation, 'testPlate', { bricks, partMap, plateSize: 64 })!.walk?.problem).toBeNull()
  })

  it('a beam that runs into the robot’s own bricks leaves nowhere to stand: the visitor walks up to the robot’s front instead, and is not seen', () => {
    // The Gate kit with a column of the robot's own bricks between its sensor and the door, where the visitor would stand.
    const kit = placedKit('gate')
    const hub = kit.bricks.find((brick) => brick.partId === 'robo_hub')!
    const column = [1, 4, 7].map((y, index): BrickInstance => ({ id: `column-${index}`, partId: 'brick_1x4', x: hub.x, y, z: hub.z - 1, rotation: 1, color: '#888888' }))
    const bricks = [...kit.bricks, ...column]
    const input = { bricks, partMap, plateSize: 64, section: kit.section }
    const creation = deriveCreations(input)[0]
    expect(column.every((brick) => creation.brickIds.includes(brick.id))).toBe(true)
    const visitor = planWalkUp(creation, 'myWorld', { bricks, partMap, plateSize: 64 })!
    expect(visitor.walk).toMatchObject({ approach: 'front', problem: 'no-room' })
    // In front: past the robot's near (+Z) side, facing it.
    const maxZ = Math.max(...bricks.map((brick) => (brick.z + rotatedSize(BRICK_PART_MAP[brick.partId], brick.rotation).depth - 32) * STUD))
    expect(visitor.path.at(-1)!.z).toBeGreaterThan(maxZ + 2.5 * STUD)
    expect(visitor.facing!.z).toBe(-1)
    expect(Math.abs(visitor.facing!.x)).toBe(0)
    const controller = stageFor(bricks, kit.section, kit.id)
    const walk = walkUp(controller, creation.sensors[0].brickId)
    expect(walk.seenAt).toBeNull()
    controller.dispose()
  })

  it('walks up to the sensor the program reads when there are two', () => {
    const second: BrickInstance = { id: 'second-sensor', partId: 'robo_distance_sensor', x: 41, y: 6, z: 43, rotation: 2, color: '#f4ca3a' }
    const bricks = [...signalPostBricks(), second]
    const section: RoboticsSection = { ...signalSection(), connections: [...SIGNAL_WIRING, { deviceId: 'second-sensor', hubId: SIGNAL_IDS.hub, port: 'C' }] }
    const creation = deriveCreations({ bricks, partMap, plateSize: 64, section })[0]
    expect(planWalkUp(creation, 'myWorld', { bricks, partMap, plateSize: 64 })!.sensorId).toBe(SIGNAL_IDS.sensor)
    const visitor = planWalkUp(creation, 'myWorld', { bricks, partMap, plateSize: 64 }, 'second-sensor')!
    expect(visitor.sensorId).toBe('second-sensor')
    // In front of the second sensor, which looks +Z: the stop is on the +Z side of the hub.
    expect(visitor.path.at(-1)!.z).toBeGreaterThan((44 - 32) * STUD)
  })

  it('no sensor, no visitor', () => {
    const bricks = signalPostBricks().filter((brick) => brick.id !== SIGNAL_IDS.sensor)
    const creation = deriveCreations({ bricks, partMap, plateSize: 64, section: signalSection() })[0]
    expect(planWalkUp(creation, 'myWorld', { bricks, partMap, plateSize: 64 })).toBeNull()
  })
})
