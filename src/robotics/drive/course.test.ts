import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { STUD } from '../../brick/parts'
import { useBrickStore } from '../../brick/store'
import { loadWorld } from '../code/codeTestFixtures'
import { ROVER_IDS, fixtureInput, roverBricks } from '../model/fixtures'
import { installRoboticsParts } from '../parts/install'
import { wiredRover } from '../program/testFixtures'
import type { TestProp } from '../run/types'
import { installRoboticsWatcher, useRoboticsStore } from '../state/roboticsStore'
import { resetStageStoreForTests, useStageStore } from '../state/stageStore'
import { COURSE, courseArea, courseProps, driveAxes, driveCourse, driveFramePoints, robotFootprint } from './course'
import { stageOptionsFor } from './DriveView'

beforeAll(() => {
  installRoboticsParts(true)
  installRoboticsWatcher()
})

type Wall = Extract<TestProp, { kind: 'wall' }>
const walls = (props: TestProp[]) => props.filter((prop): prop is Wall => prop.kind === 'wall')
const box = (wall: Wall) => ({ x0: wall.center.x - wall.size.x / 2, x1: wall.center.x + wall.size.x / 2, z0: wall.center.z - wall.size.z / 2, z1: wall.center.z + wall.size.z / 2 })

/** The rover's footprint at the built pose (world units): its bricks' extents on the plate. */
function roverBox() {
  const rover = wiredRover()
  const input = fixtureInput(rover.bricks, rover.section)
  const axes = driveAxes(rover.creation)!
  return { rover, input, axes, footprint: robotFootprint(rover.creation, input, axes)! }
}

describe('the test plate course', () => {
  it('a fence all round and three posts: a gate to drive through, then one in the way', () => {
    const { rover, input } = roverBox()
    const props = driveCourse(rover.creation, input)
    expect(props.map((prop) => prop.id)).toEqual(['fence-ahead', 'fence-behind', 'fence-right', 'fence-left', 'post-right', 'post-left', 'post-far'])
    const posts = walls(props).filter((wall) => wall.id.startsWith('post'))
    expect(posts.map((post) => post.color)).toEqual([COURSE.gateColor, COURSE.gateColor, COURSE.farColor])
    expect(walls(props).filter((wall) => wall.id.startsWith('fence')).every((wall) => wall.color === undefined)).toBe(true)
  })

  it('stands clear of the robot, in front of it, and on the stage’s ground', () => {
    const { rover, input, axes, footprint } = roverBox()
    const props = walls(driveCourse(rover.creation, input))
    // The rover faces -Z (the far side of the plate).
    expect(axes.forward).toEqual({ x: 0, y: 0, z: -1 })
    const robot = { x0: -footprint.t1, x1: -footprint.t0, z0: -footprint.s1, z1: -footprint.s0 }
    const clear = (wall: Wall) => { const b = box(wall); return b.x1 <= robot.x0 || b.x0 >= robot.x1 || b.z1 <= robot.z0 || b.z0 >= robot.z1 }
    expect(props.every(clear)).toBe(true)
    const ground = (64 * STUD) / 2 + 20
    expect(props.every((wall) => { const b = box(wall); return Math.max(Math.abs(b.x0), Math.abs(b.x1), Math.abs(b.z0), Math.abs(b.z1)) < ground })).toBe(true)
    // Every post is ahead of the robot's nose; the gate is wider than the robot.
    const posts = props.filter((wall) => wall.id.startsWith('post'))
    expect(posts.every((post) => box(post).z1 < robot.z0)).toBe(true)
    const [right, left] = posts
    const gap = box(right).x0 - box(left).x1
    expect(Math.abs(gap)).toBeGreaterThan(robot.x1 - robot.x0 + 2 * STUD)
    // The fence encloses the robot with room all round.
    const fence = walls(driveCourse(rover.creation, input)).filter((wall) => wall.id.startsWith('fence'))
    const inside = { x0: Math.max(...fence.filter((w) => w.id === 'fence-left' || w.id === 'fence-right').map((w) => box(w).x0).filter((x) => x < robot.x0)), z0: box(fence.find((w) => w.id === 'fence-ahead')!).z1 }
    expect(robot.x0 - inside.x0).toBeGreaterThan(COURSE.minRoomStuds * STUD)
    expect(robot.z0 - inside.z0).toBeGreaterThan(COURSE.aheadStuds * STUD - 0.01)
  })

  it('is laid out along whichever way the robot faces', () => {
    const footprint = { s0: -2, s1: 2, t0: -3, t1: 3 }
    const facingX = courseProps(courseArea(footprint, { forward: { x: 1, y: 0, z: 0 }, across: { x: 0, y: 0, z: -1 } }, 64), footprint)
    const far = walls(facingX).find((wall) => wall.id === 'post-far')!
    // Straight ahead along +X, in the robot's middle across.
    expect(far.center.x).toBeGreaterThan(2 + 14 * STUD)
    expect(Math.abs(far.center.z)).toBeLessThan(1e-9)
    const ahead = walls(facingX).find((wall) => wall.id === 'fence-ahead')!
    expect(ahead.size.x).toBeCloseTo(COURSE.fenceThicknessStuds * STUD)
    expect(ahead.size.z).toBeGreaterThan(6)
  })

  it('a robot built at the plate’s edge still gets room in front (the stage’s ground goes on past the plate)', () => {
    const plateHalf = (64 * STUD) / 2
    const footprint = { s0: plateHalf - 6, s1: plateHalf - 0.5, t0: -3, t1: 3 }
    const area = courseArea(footprint, { forward: { x: 0, y: 0, z: 1 }, across: { x: 1, y: 0, z: 0 } }, 64)
    expect(area.s1 - footprint.s1).toBeGreaterThanOrEqual(COURSE.minRoomStuds * STUD - 1e-9)
    expect(area.s1).toBeLessThan(plateHalf + 20)
    // No post fits in so little room: only the fence.
    expect(courseProps(area, footprint).map((prop) => prop.id)).toEqual(['fence-ahead', 'fence-behind', 'fence-right', 'fence-left'])
  })

  it('frames the course on the test plate and a patch of ground ahead in My world', () => {
    const { rover, input } = roverBox()
    expect(driveFramePoints(rover.creation, input, 'testPlate')).toHaveLength(4)
    expect(driveFramePoints(rover.creation, input, 'myWorld')).toHaveLength(4)
  })
})

describe('the stage with the Drive view’s options', () => {
  beforeEach(() => {
    resetStageStoreForTests()
    useBrickStore.getState().newBuild()
    useRoboticsStore.setState({ card: null, frameRequest: null })
  })

  it('the test plate gets the course; the Code view’s stage keeps its wall', async () => {
    loadWorld()
    await useStageStore.getState().openStage('rover', 'testPlate', stageOptionsFor('drive', 'testPlate'))
    expect(useStageStore.getState().stage!.controller.props.map((prop) => prop.id)).toEqual(['fence-ahead', 'fence-behind', 'fence-right', 'fence-left', 'post-right', 'post-left', 'post-far'])
    // Reset rebuilds the same stage, course and all.
    useStageStore.getState().resetStage()
    expect(useStageStore.getState().stage!.controller.props).toHaveLength(7)
    await useStageStore.getState().openStage('rover')
    expect(useStageStore.getState().stage!.controller.props.map((prop) => prop.kind)).toEqual(['wall'])
    expect(useStageStore.getState().stage!.options).toBeUndefined()
  })

  it('in My world the robot rolls free among the scenery; the Code view’s My world still anchors it', async () => {
    loadWorld([...roverBricks(), { id: 'scenery', partId: 'brick_2x4', x: 40, y: 0, z: 20, rotation: 0, color: '#6fae5b' }])
    const before = JSON.stringify(useBrickStore.getState().getDocumentSnapshot())
    await useStageStore.getState().openStage('rover', 'myWorld', stageOptionsFor('drive', 'myWorld'))
    const stage = useStageStore.getState().stage!
    expect(stage.space).toBe('myWorld')
    expect(stage.controller.props).toEqual([])
    expect(stage.creation.bodies.every((body) => !body.anchored)).toBe(true)
    // The student's own bricks stay the studio's to draw: only the robot's are the stage's.
    expect(stage.controller.hiddenBrickIds.has('scenery')).toBe(false)
    expect(stage.controller.hiddenBrickIds.has(ROVER_IDS.hub)).toBe(true)
    expect(JSON.stringify(useBrickStore.getState().getDocumentSnapshot())).toBe(before)
    await useStageStore.getState().openStage('rover', 'myWorld')
    expect(useStageStore.getState().stage!.creation.bodies.some((body) => body.anchored)).toBe(true)
  })

  it('Try it keeps the stage exactly as the Code view has it', () => {
    expect(stageOptionsFor('try', 'myWorld')).toBeUndefined()
  })
})
