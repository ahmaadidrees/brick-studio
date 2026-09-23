import { beforeAll, describe, expect, it } from 'vitest'
import { PLATE_HEIGHT, STUD, createPartMap } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import { ROBOTICS_PART_IDS } from '../parts/catalog'
import { installRoboticsParts } from '../parts/install'
import { deriveStudJoints } from './assembly'
import { ROVER_IDS, roverBricks } from './fixtures'
import { deriveMechanisms } from './mechanism'
import { EDGE_OUTWARD, createSnapContext, findSnap, type PlateEdge, type SnapPose } from './snap'
import type { Vec3 } from './vec'

/**
 * Magnetic connections (docs/robotics/KID-UX.md §S): the ghost snaps when the pointer is
 * near where the part would sit, over the target, another brick or the bare baseplate; the
 * nearer of two targets wins; a motor turns to face out over the plate edge it is near;
 * and whatever snaps is connected by construction, as the mechanism and assembly readers
 * see it.
 */
let partMap: ReturnType<typeof createPartMap>
beforeAll(() => {
  installRoboticsParts(true)
  partMap = createPartMap([])
})

const plateSize = 64
/** Plate grid coordinates (studs from the corner; y in plates) to world units, the studio's rule. */
const world = (x: number, y: number, z: number): Vec3 => ({ x: (x - plateSize / 2) * STUD, y: y * PLATE_HEIGHT, z: (z - plateSize / 2) * STUD })
const byId = (bricks: BrickInstance[], id: string) => bricks.find((brick) => brick.id === id)!
const find = (bricks: BrickInstance[], partId: string, hitPoint: Vec3, hitId: string | null = null, rotation?: 0 | 1 | 2 | 3) =>
  findSnap({ draft: { partId, rotation }, hitBrick: hitId ? byId(bricks, hitId) : null, hitPoint, bricks, partMap, plateSize })
const pose = (found: ReturnType<typeof find>) => found.found?.pose ?? null
const brick = (id: string, partId: string, x: number, y: number, z: number, rotation: 0 | 1 | 2 | 3 = 0): BrickInstance => ({ id, partId, x, y, z, rotation, color: '#52636c' })
const placed = (bricks: BrickInstance[], partId: string, at: SnapPose, id = 'new') => [...bricks, { ...at, id, partId, color: '#000000' }]

/** The rover without its left axle and wheel: the left socket (x 28, facing -X) is free. */
const noLeftAxle = () => roverBricks().filter((candidate) => candidate.id !== ROVER_IDS.leftAxle && candidate.id !== ROVER_IDS.leftWheel)
/** A plate carrying a hub: a robot's plate, as a student starts one. */
const plateAndHub = () => [brick('plate', 'plate_6x8', 28, 0, 26), brick('hub', ROBOTICS_PART_IDS.hub, 29, 1, 27)]

describe('proximity snap: an axle', () => {
  const inLeftSocket = { x: 26, y: 0, z: 32, rotation: 0 }

  it('snaps into the socket with the pointer on the bare baseplate a stud off, and is in the socket', () => {
    const bricks = noLeftAxle()
    expect(pose(find(bricks, ROBOTICS_PART_IDS.axleShort, world(25, 0, 32.5)))).toEqual(inLeftSocket)
    expect(pose(find(bricks, ROBOTICS_PART_IDS.axleShort, world(27, 0, 34)))).toEqual(inLeftSocket)
    const mechanisms = deriveMechanisms(placed(bricks, ROBOTICS_PART_IDS.axleShort, inLeftSocket as SnapPose), partMap, plateSize)
    expect(mechanisms.motorById.get(ROVER_IDS.leftMotor)?.axleId).toBe('new')
  })

  it('snaps with the pointer over another brick nearby', () => {
    const bricks = [...noLeftAxle(), brick('post', 'brick_1x1', 25, 0, 33)]
    expect(pose(find(bricks, ROBOTICS_PART_IDS.axleShort, world(25.5, 3, 33.5), 'post'))).toEqual(inLeftSocket)
  })

  it('does not snap from further than about a stud and a half', () => {
    const result = find(noLeftAxle(), ROBOTICS_PART_IDS.axleShort, world(23.4, 0, 32.5))
    expect(result.found).toBeNull()
    expect(result.hint).toBeNull()
  })

  it('a loose wheel nearby never pulls the axle away from the socket (kid-UX lane W)', () => {
    // A loose wheel two studs out: an axle through it (x 23–25) would turn nothing, so only the socket (x 26–28) is a target.
    const bricks = [...noLeftAxle(), brick('loose', ROBOTICS_PART_IDS.wheel, 22, 0, 31)]
    const nearSocket = find(bricks, ROBOTICS_PART_IDS.axleShort, world(25.8, 0, 32.5))
    expect(nearSocket.found?.target.kind).toBe('socket')
    expect(pose(nearSocket)).toEqual(inLeftSocket)
    const nearWheel = find(bricks, ROBOTICS_PART_IDS.axleShort, world(25.2, 0, 32.5))
    expect(nearWheel.found?.target.kind).toBe('socket')
    expect(pose(nearWheel)).toEqual(inLeftSocket)
    // Aimed right at the wheel, beyond the socket's reach: nothing to snap to.
    expect(find(bricks, ROBOTICS_PART_IDS.axleShort, world(21.5, 0, 32.5)).found).toBeNull()
  })

  it('at a motor standing on the ground there is nothing to snap to, and the hint says why', () => {
    // Its socket is 3 plates up; an axle on the ground has its rod 4 plates up.
    const bricks = [brick('grounded', ROBOTICS_PART_IDS.motor, 30, 0, 30)]
    const result = find(bricks, ROBOTICS_PART_IDS.axleShort, world(34, 0, 31.5))
    expect(result.found).toBeNull()
    expect(result.hint).toMatchObject({ kind: 'motor-on-ground', brickId: 'grounded' })
    expect(find(bricks, ROBOTICS_PART_IDS.axleShort, world(31.5, 6, 31.5), 'grounded').hint?.kind).toBe('motor-on-ground')
  })
})

describe('proximity snap: a wheel', () => {
  const noLeftWheel = () => roverBricks().filter((candidate) => candidate.id !== ROVER_IDS.leftWheel)

  it('snaps onto the free axle end with the pointer on the baseplate a stud off', () => {
    const bricks = noLeftWheel()
    const result = find(bricks, ROBOTICS_PART_IDS.wheel, world(24, 0, 32.5))
    expect(pose(result)).toEqual({ x: 25, y: 0, z: 31, rotation: 0 })
    expect(deriveMechanisms(placed(bricks, ROBOTICS_PART_IDS.wheel, pose(result)!), partMap, plateSize).wheelById.get('new')?.axleId).toBe(ROVER_IDS.leftAxle)
  })

  it('between two free axle ends, the nearer one wins', () => {
    const bricks = [brick('a', ROBOTICS_PART_IDS.axleShort, 30, 0, 30), brick('b', ROBOTICS_PART_IDS.axleShort, 35, 0, 30)]
    expect(pose(find(bricks, ROBOTICS_PART_IDS.wheel, world(33.3, 0, 30.5)))).toEqual({ x: 32, y: 0, z: 29, rotation: 0 })
    expect(pose(find(bricks, ROBOTICS_PART_IDS.wheel, world(33.7, 0, 30.5)))).toEqual({ x: 34, y: 0, z: 29, rotation: 0 })
  })

  it('at a motor with nothing in its socket: no snap, and the hint asks for an axle first', () => {
    const result = find(noLeftAxle(), ROBOTICS_PART_IDS.wheel, world(27, 0, 32.5))
    expect(result.found).toBeNull()
    expect(result.hint).toMatchObject({ kind: 'needs-axle', brickId: ROVER_IDS.leftMotor })
  })
})

describe('motors orient themselves on a plate edge', () => {
  /** The motor is studded onto the plate, its socket faces out over the edge and sits on the edge line, 4 plates up. */
  function expectMounted(bricks: BrickInstance[], plateId: string, at: SnapPose, edge: PlateEdge) {
    const withMotor = placed(bricks, ROBOTICS_PART_IDS.motor, at, 'motor')
    expect(deriveStudJoints(withMotor, partMap).some((joint) => joint.lowerBrickId === plateId && joint.upperBrickId === 'motor')).toBe(true)
    const socket = deriveMechanisms(withMotor, partMap, plateSize).motorById.get('motor')!.socket
    expect(socket.normal.x).toBeCloseTo(EDGE_OUTWARD[edge].x)
    expect(socket.normal.z).toBeCloseTo(EDGE_OUTWARD[edge].z)
    const plate = byId(bricks, plateId)
    const part = partMap[plate.partId]
    const [width, depth] = plate.rotation % 2 ? [part.depth, part.width] : [part.width, part.depth]
    const line = { left: world(plate.x, 0, 0).x, right: world(plate.x + width, 0, 0).x, far: world(0, 0, plate.z).z, near: world(0, 0, plate.z + depth).z }[edge]
    expect(edge === 'left' || edge === 'right' ? socket.point.x : socket.point.z).toBeCloseTo(line)
    expect(socket.point.y).toBeCloseTo((plate.y + part.height + 3) * PLATE_HEIGHT)
  }

  it('turns to face out over each of the four edges of a plate, flush with it', () => {
    const bricks = [brick('plate', 'plate_6x8', 28, 0, 26)]
    const cases: [PlateEdge, Vec3, SnapPose][] = [
      ['left', world(28.8, 1, 30), { x: 28, y: 1, z: 29, rotation: 2 }],
      ['right', world(33.2, 1, 30), { x: 31, y: 1, z: 29, rotation: 0 }],
      ['far', world(31, 1, 26.8), { x: 30, y: 1, z: 26, rotation: 1 }],
      ['near', world(31, 1, 33.2), { x: 30, y: 1, z: 31, rotation: 3 }],
    ]
    for (const [edge, at, expected] of cases) {
      const result = find(bricks, ROBOTICS_PART_IDS.motor, at, 'plate')
      expect(result.found?.pose, edge).toEqual(expected)
      expect(result.found?.target).toMatchObject({ kind: 'plate-edge', key: `plate:${edge}`, brickId: 'plate', blocked: false })
      expectMounted(bricks, 'plate', expected, edge)
    }
  })

  it('works the same for a plate stacked on a plate, sitting on the upper one', () => {
    const bricks = [brick('base', 'plate_6x8', 28, 0, 26), brick('upper', 'plate_4x6', 29, 1, 27)]
    const cases: [PlateEdge, Vec3, SnapPose][] = [
      ['left', world(29.6, 2, 30), { x: 29, y: 2, z: 29, rotation: 2 }],
      ['right', world(32.4, 2, 30), { x: 30, y: 2, z: 29, rotation: 0 }],
      ['far', world(31, 2, 27.6), { x: 30, y: 2, z: 27, rotation: 1 }],
      ['near', world(31, 2, 32.4), { x: 30, y: 2, z: 30, rotation: 3 }],
    ]
    for (const [edge, at, expected] of cases) {
      expect(pose(find(bricks, ROBOTICS_PART_IDS.motor, at, 'upper')), edge).toEqual(expected)
      expectMounted(bricks, 'upper', expected, edge)
    }
  })

  it('away from the edges the student\'s own rotation stands (no snap)', () => {
    expect(find([brick('plate', 'plate_6x8', 28, 0, 26)], ROBOTICS_PART_IDS.motor, world(31, 1, 30), 'plate').found).toBeNull()
  })

  it('at a corner, a near tie goes to the long side, where a car\'s wheels go', () => {
    expect(pose(find([brick('plate', 'plate_6x8', 28, 0, 26)], ROBOTICS_PART_IDS.motor, world(29.5, 1, 32.5), 'plate'))).toEqual({ x: 28, y: 1, z: 31, rotation: 2 })
    // The same plate turned a quarter runs along X: its long sides are the far and near edges.
    expect(pose(find([brick('plate', 'plate_6x8', 28, 0, 26, 1)], ROBOTICS_PART_IDS.motor, world(29.5, 1, 30.5), 'plate'))).toEqual({ x: 28, y: 1, z: 29, rotation: 3 })
  })

  it('at a corner the student\'s own turn picks the edge; one clearly nearer edge still wins', () => {
    const plate = [brick('plate', 'plate_6x8', 28, 0, 26)]
    // Turned to face the near side (R three times), a motor at the near-left corner goes on the near edge...
    expect(pose(find(plate, ROBOTICS_PART_IDS.motor, world(29.4, 1, 32.6), 'plate', 3))).toEqual({ x: 28, y: 1, z: 31, rotation: 3 })
    // ...turned to face left (R twice), on the left edge, even with the pointer a little nearer the near edge.
    expect(pose(find(plate, ROBOTICS_PART_IDS.motor, world(29.8, 1, 32.6), 'plate', 2))).toEqual({ x: 28, y: 1, z: 31, rotation: 2 })
    // Away from the corner the nearer edge wins whatever the turn.
    expect(pose(find(plate, ROBOTICS_PART_IDS.motor, world(28.6, 1, 30), 'plate', 3))).toEqual({ x: 28, y: 1, z: 29, rotation: 2 })
  })

  it('slides along the edge to the nearest spot with room', () => {
    // The hub fills the middle of the plate: beside it on the left edge, the motor goes to the free end.
    const result = find(plateAndHub(), ROBOTICS_PART_IDS.motor, world(28.5, 1, 29), 'plate')
    expect(result.found?.pose).toEqual({ x: 28, y: 1, z: 31, rotation: 2 })
    expect(result.found?.target.blocked).toBe(false)
  })

  it('with every spot along the edge taken it still shows where (blocked), so the refusal can say what is in the way', () => {
    const bricks = [...plateAndHub(), brick('left', ROBOTICS_PART_IDS.motor, 28, 1, 31, 2)]
    const result = find(bricks, ROBOTICS_PART_IDS.motor, world(28.5, 1, 29), 'plate')
    expect(result.found?.pose).toEqual({ x: 28, y: 1, z: 28, rotation: 2 })
    expect(result.found?.target.blocked).toBe(true)
  })
})

describe('a motor near a robot, over bare ground', () => {
  it('goes onto the robot plate\'s nearest edge with room instead of the ground', () => {
    const bricks = plateAndHub()
    const result = find(bricks, ROBOTICS_PART_IDS.motor, world(26.5, 0, 32.5))
    expect(result.found?.pose).toEqual({ x: 28, y: 1, z: 31, rotation: 2 })
    expect(pose(find(bricks, ROBOTICS_PART_IDS.motor, world(36.2, 0, 33)))).toEqual({ x: 31, y: 1, z: 31, rotation: 0 })
  })

  it('from about three studs; further out it stays where the pointer is', () => {
    expect(find(plateAndHub(), ROBOTICS_PART_IDS.motor, world(25.2, 0, 32.5)).found).not.toBeNull()
    expect(find(plateAndHub(), ROBOTICS_PART_IDS.motor, world(24, 0, 32.5)).found).toBeNull()
  })

  it('only a robot\'s plate pulls it in: a plate with nothing on it does not', () => {
    expect(find([brick('plate', 'plate_6x8', 28, 0, 26)], ROBOTICS_PART_IDS.motor, world(26.5, 0, 32.5)).found).toBeNull()
  })

  it('also over a loose wheel or axle beside the robot (they cannot carry a motor)', () => {
    const bricks = [...plateAndHub(), brick('loose', ROBOTICS_PART_IDS.wheel, 26, 0, 31)]
    expect(pose(find(bricks, ROBOTICS_PART_IDS.motor, world(26.5, 4, 32.5), 'loose'))).toEqual({ x: 28, y: 1, z: 31, rotation: 2 })
  })

  it('never onto a spot that is taken: with the plate full it does not snap', () => {
    const bricks = [...plateAndHub(), brick('left', ROBOTICS_PART_IDS.motor, 28, 1, 31, 2), brick('right', ROBOTICS_PART_IDS.motor, 31, 1, 31, 0)]
    expect(find(bricks, ROBOTICS_PART_IDS.motor, world(26.5, 0, 32.5)).found).toBeNull()
  })
})

describe('what glows', () => {
  it('for a motor: the free stretches of a robot plate\'s long sides', () => {
    const runs = createSnapContext(plateAndHub(), partMap, plateSize).motorEdgeRuns(ROBOTICS_PART_IDS.motor)
    expect(runs.map((run) => [run.key, run.poses])).toEqual([
      ['plate:left', [{ x: 28, y: 1, z: 31, rotation: 2 }]],
      ['plate:right', [{ x: 31, y: 1, z: 31, rotation: 0 }]],
    ])
    expect(createSnapContext([brick('plate', 'plate_6x8', 28, 0, 26)], partMap, plateSize).motorEdgeRuns(ROBOTICS_PART_IDS.motor)).toEqual([])
  })

  it('for an axle: free motor sockets only, never a loose wheel; for a wheel: free axle ends', () => {
    const bare = roverBricks().filter((candidate) => ![ROVER_IDS.leftAxle, ROVER_IDS.rightAxle, ROVER_IDS.leftWheel, ROVER_IDS.rightWheel].includes(candidate.id as never))
    const context = createSnapContext([...bare, brick('loose', ROBOTICS_PART_IDS.wheel, 20, 0, 40)], partMap, plateSize)
    expect(context.connectorTargets(ROBOTICS_PART_IDS.axleShort).map((target) => target.key).sort()).toEqual([`socket:${ROVER_IDS.leftMotor}`, `socket:${ROVER_IDS.rightMotor}`])
    const axles = createSnapContext(roverBricks().filter((candidate) => candidate.id !== ROVER_IDS.leftWheel), partMap, plateSize)
    expect(axles.connectorTargets(ROBOTICS_PART_IDS.wheel).map((target) => target.key)).toEqual([`end:${ROVER_IDS.leftAxle}:0`])
  })
})

describe('everything that snaps is connected by construction', () => {
  /** Pointers on the ground and on the bricks around a target, within reach. */
  const around = (center: Vec3) => {
    const points: Vec3[] = []
    for (let dx = -2; dx <= 2; dx += 0.5) for (let dz = -2; dz <= 2; dz += 0.5) points.push({ x: center.x + dx * STUD, y: 0, z: center.z + dz * STUD })
    return points
  }

  it('every axle and wheel pose found around the rover is in its socket or on its axle end', () => {
    const scenarios: { bricks: BrickInstance[]; partId: string }[] = [
      { bricks: roverBricks().filter((candidate) => ![ROVER_IDS.leftAxle, ROVER_IDS.rightAxle, ROVER_IDS.leftWheel, ROVER_IDS.rightWheel].includes(candidate.id as never)), partId: ROBOTICS_PART_IDS.axleShort },
      { bricks: roverBricks().filter((candidate) => ![ROVER_IDS.leftAxle, ROVER_IDS.rightAxle, ROVER_IDS.leftWheel, ROVER_IDS.rightWheel].includes(candidate.id as never)), partId: ROBOTICS_PART_IDS.axleLong },
      { bricks: roverBricks().filter((candidate) => candidate.id !== ROVER_IDS.leftWheel && candidate.id !== ROVER_IDS.rightWheel), partId: ROBOTICS_PART_IDS.wheel },
      { bricks: [brick('loose', ROBOTICS_PART_IDS.wheel, 30, 0, 30)], partId: ROBOTICS_PART_IDS.axleShort },
      { bricks: [brick('loose', ROBOTICS_PART_IDS.axleLong, 30, 0, 30)], partId: ROBOTICS_PART_IDS.wheel },
    ]
    let checked = 0
    for (const { bricks, partId } of scenarios) {
      for (const center of [world(26, 0, 32.5), world(36, 0, 32.5), world(31, 0, 31.5), world(33, 0, 30.5)]) {
        for (const point of around(center)) {
          const found = find(bricks, partId, point).found
          if (!found || found.target.blocked) continue
          const mechanisms = deriveMechanisms(placed(bricks, partId, found.pose), partMap, plateSize)
          if (partId === ROBOTICS_PART_IDS.wheel) expect(mechanisms.wheelById.get('new')?.axleId, JSON.stringify(found.pose)).toBe(found.target.brickId)
          else if (found.target.kind === 'socket') expect(mechanisms.motorById.get(found.target.brickId)?.axleId).toBe('new')
          else expect(mechanisms.wheelById.get(found.target.brickId)?.axleId).toBe('new')
          checked += 1
        }
      }
    }
    expect(checked).toBeGreaterThan(100)
  })

  it('every motor pose found around a robot plate is studded onto it with its socket facing out', () => {
    const bricks = plateAndHub()
    let checked = 0
    for (let x = 24; x <= 38; x += 0.5) {
      for (let z = 22; z <= 38; z += 0.5) {
        const onPlate = x > 28 && x < 34 && z > 26 && z < 34
        const found = find(bricks, ROBOTICS_PART_IDS.motor, world(x, onPlate ? 1 : 0, z), onPlate ? 'plate' : null).found
        if (!found || found.target.blocked) continue
        const withMotor = placed(bricks, ROBOTICS_PART_IDS.motor, found.pose, 'motor')
        expect(deriveStudJoints(withMotor, partMap).some((joint) => joint.lowerBrickId === 'plate' && joint.upperBrickId === 'motor')).toBe(true)
        const socket = deriveMechanisms(withMotor, partMap, plateSize).motorById.get('motor')!.socket
        expect(socket.normal).toEqual(expect.objectContaining({ x: expect.closeTo(found.target.outward.x), z: expect.closeTo(found.target.outward.z) }))
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(50)
  })
})
