import { PLATE_HEIGHT, STUD, rotatedSize } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import type { DerivedCreation } from '../model/creations'
import { brickFrame, type PartMap } from '../model/grid'
import type { Vec3 } from '../model/vec'
import type { TestProp } from '../run/types'

/**
 * The Drive view's test plate (docs/robotics/KID-UX.md §D): a small course around the robot,
 * made of test props, so there is something to drive around and into. A low fence all round
 * keeps the robot on the plate and in view. Inside it, straight ahead, two posts make a gate
 * wide enough to drive through, and one more post further on stands in the robot's path. Props
 * live only in the run, never in the document (contract §7.4), and are built from the robot's
 * footprint as it was built, so a robot anywhere on the plate, facing any way, gets the same
 * course in front of it. Pure; every size is in studs and plates until it becomes a world-unit
 * `TestProp`.
 */
type Geometry = { bricks: readonly BrickInstance[]; partMap: PartMap; plateSize: number }

/** A course rectangle in the robot's own axes: `s` along its forward, `t` across it (towards its left), world units. */
export type CourseArea = { forward: Vec3; across: Vec3; s0: number; s1: number; t0: number; t1: number }

/** The robot's footprint at the built pose in the same axes, and its middle across. */
export type Footprint = { s0: number; s1: number; t0: number; t1: number }

export const COURSE = Object.freeze({
  /** Room in front of the robot's nose, studs (at least; a wide robot gets 1.6 × its width). */
  aheadStuds: 20,
  /** Room behind its tail. */
  behindStuds: 5,
  /** Room beside each side (at least; a wide robot gets 0.6 × its width). */
  sideStuds: 7,
  /** A fence never comes closer than this to the robot, even at the plate's edge (the ground goes on past it). */
  minRoomStuds: 4,
  fenceThicknessStuds: 1,
  fencePlates: 4,
  postStuds: 2,
  postPlates: 12,
  /** The gate's posts and the far post, bright against the plate. */
  gateColor: '#f7931e',
  farColor: '#f4ca3a',
  /** Posts keep this much room from the fence. */
  postClearStuds: 2,
})

/** The ground under a stage reaches this far past the plate's edge (`sim/mechanics.ts`). */
const GROUND_MARGIN = 20

const UP: Vec3 = { x: 0, y: 1, z: 0 }

/** The nearest grid axis to a horizontal direction (drive pairs are grid-aligned; this keeps rounding out). */
function gridAxis(direction: Vec3): Vec3 {
  return Math.abs(direction.x) >= Math.abs(direction.z) ? { x: Math.sign(direction.x) || 1, y: 0, z: 0 } : { x: 0, y: 0, z: Math.sign(direction.z) || 1 }
}

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const crossUp = (forward: Vec3): Vec3 => ({ x: UP.y * forward.z - UP.z * forward.y, y: UP.z * forward.x - UP.x * forward.z, z: UP.x * forward.y - UP.y * forward.x })

/** Where a robot faces: its drive pair's forward, else the shape's (a rover without its wheels still has one). */
export function driveAxes(creation: Pick<DerivedCreation, 'drivePair' | 'driveForward'>): { forward: Vec3; across: Vec3 } | null {
  const raw = creation.drivePair?.forward ?? creation.driveForward
  if (!raw || (Math.abs(raw.x) < 1e-6 && Math.abs(raw.z) < 1e-6)) return null
  const forward = gridAxis(raw)
  return { forward, across: crossUp(forward) }
}

/** The robot's bricks at the built pose, as a rectangle in (forward, across), world units. */
export function robotFootprint(creation: Pick<DerivedCreation, 'brickIds'>, geometry: Geometry, axes: { forward: Vec3; across: Vec3 }): Footprint | null {
  const ids = new Set(creation.brickIds)
  let s0 = Infinity
  let s1 = -Infinity
  let t0 = Infinity
  let t1 = -Infinity
  for (const brick of geometry.bricks) {
    if (!ids.has(brick.id)) continue
    const part = geometry.partMap[brick.partId]
    if (!part) continue
    const origin = brickFrame(brick, part, geometry.plateSize).origin
    const size = rotatedSize(part, brick.rotation)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const corner = { x: origin.x + (sx * size.width * STUD) / 2, y: 0, z: origin.z + (sz * size.depth * STUD) / 2 }
      const s = dot(corner, axes.forward)
      const t = dot(corner, axes.across)
      s0 = Math.min(s0, s)
      s1 = Math.max(s1, s)
      t0 = Math.min(t0, t)
      t1 = Math.max(t1, t)
    }
  }
  return Number.isFinite(s0) ? { s0, s1, t0, t1 } : null
}

/**
 * The course rectangle inside the fence: generous room ahead, some behind and beside, kept on
 * the plate where it can be, but never closer than `minRoomStuds` to the robot (past the plate's
 * edge the stage's ground goes on, so a robot built at the edge still has room to move).
 */
export function courseArea(footprint: Footprint, axes: { forward: Vec3; across: Vec3 }, plateSize: number, room: { ahead: number; behind: number; side: number } = defaultRoom(footprint)): CourseArea {
  const plateHalf = (plateSize * STUD) / 2
  const onPlate = plateHalf - COURSE.fenceThicknessStuds * STUD
  const groundHalf = plateHalf + GROUND_MARGIN - 2 * STUD
  const least = COURSE.minRoomStuds * STUD
  // Along each axis the robot's coordinate is ±x or ±z, so the plate is [-onPlate, onPlate] in both.
  const low = (edge: number, want: number) => Math.max(-groundHalf, Math.min(edge - least, Math.max(edge - want * STUD, -onPlate)))
  const high = (edge: number, want: number) => Math.min(groundHalf, Math.max(edge + least, Math.min(edge + want * STUD, onPlate)))
  return {
    ...axes,
    s0: low(footprint.s0, room.behind),
    s1: high(footprint.s1, room.ahead),
    t0: low(footprint.t0, room.side),
    t1: high(footprint.t1, room.side),
  }
}

function defaultRoom(footprint: Footprint) {
  const width = (footprint.t1 - footprint.t0) / STUD
  return { ahead: Math.max(COURSE.aheadStuds, 1.6 * width), behind: COURSE.behindStuds, side: Math.max(COURSE.sideStuds, 0.6 * width) }
}

/** A wall prop from a centre and sizes in the robot's axes (world units). */
function wall(id: string, area: Pick<CourseArea, 'forward' | 'across'>, s: number, t: number, alongS: number, alongT: number, height: number, color?: string): TestProp {
  const center = { x: area.forward.x * s + area.across.x * t, y: height / 2, z: area.forward.z * s + area.across.z * t }
  const forwardIsX = Math.abs(area.forward.x) > 0.5
  const size = forwardIsX ? { x: alongS, y: height, z: alongT } : { x: alongT, y: height, z: alongS }
  return { id, kind: 'wall', center, size, ...(color ? { color } : {}) }
}

/**
 * The course's props: the fence (four walls just outside the area, meeting at the corners) and
 * the posts that fit inside it: a pair either side of the robot's path, far enough apart for it
 * to drive between them, then one in the middle of its path further on. Where the plate leaves
 * less room ahead (a robot built near its edge), the posts move in with the fence, and one that
 * would stand too close to the robot or the fence is left out.
 */
export function courseProps(area: CourseArea, footprint: Footprint): TestProp[] {
  const thick = COURSE.fenceThicknessStuds * STUD
  const fenceHeight = COURSE.fencePlates * PLATE_HEIGHT
  const midS = (area.s0 + area.s1) / 2
  const midT = (area.t0 + area.t1) / 2
  const lengthS = area.s1 - area.s0
  const lengthT = area.t1 - area.t0 + 2 * thick
  const props: TestProp[] = [
    wall('fence-ahead', area, area.s1 + thick / 2, midT, thick, lengthT, fenceHeight),
    wall('fence-behind', area, area.s0 - thick / 2, midT, thick, lengthT, fenceHeight),
    wall('fence-right', area, midS, area.t0 - thick / 2, lengthS, thick, fenceHeight),
    wall('fence-left', area, midS, area.t1 + thick / 2, lengthS, thick, fenceHeight),
  ]
  const post = COURSE.postStuds * STUD
  const postHeight = COURSE.postPlates * PLATE_HEIGHT
  const clear = COURSE.postClearStuds * STUD
  const width = footprint.t1 - footprint.t0
  const middle = (footprint.t0 + footprint.t1) / 2
  const fits = (s: number, t: number) => s - post / 2 > footprint.s1 + STUD && s + post / 2 < area.s1 - clear && t - post / 2 > area.t0 + clear && t + post / 2 < area.t1 - clear
  const room = area.s1 - footprint.s1
  const gate = Math.min(Math.max(7 * STUD, 0.55 * width), 0.45 * room)
  const far = Math.min(Math.max(14 * STUD, 1.15 * width), room - post - clear - STUD)
  const gateT = width / 2 + 3 * STUD
  const posts: [string, number, number, string][] = []
  if (gate >= 3 * STUD) posts.push(['post-right', footprint.s1 + gate + post / 2, middle - gateT, COURSE.gateColor], ['post-left', footprint.s1 + gate + post / 2, middle + gateT, COURSE.gateColor])
  if (far >= gate + post + 2 * STUD) posts.push(['post-far', footprint.s1 + far + post / 2, middle, COURSE.farColor])
  for (const [id, s, t, color] of posts) if (fits(s, t)) props.push(wall(id, area, s, t, post, post, postHeight, color))
  return props
}

/** The test plate course for a robot that drives (none for one with no forward to lay it out along). */
export function driveCourse(creation: Pick<DerivedCreation, 'drivePair' | 'driveForward' | 'brickIds'>, geometry: Geometry): TestProp[] {
  const axes = driveAxes(creation)
  if (!axes) return []
  const footprint = robotFootprint(creation, geometry, axes)
  if (!footprint) return []
  return courseProps(courseArea(footprint, axes, geometry.plateSize), footprint)
}

/**
 * Points to keep in view with the robot: the course and its fence on the test plate; in My world
 * the same patch of ground (no fence), so the robot is framed at the same size with somewhere to go.
 *
 * The studio frames a box by rule of thumb from its home view, which looks at the build from the
 * +X +Z side. Seen from that corner a wide, flat course comes out lopsided: its near half (towards
 * +X +Z) is drawn much larger than its far half, so framed as it is, it runs off the bottom of the
 * canvas while the top stays empty. The points therefore pull the far side in and push the near side
 * out a little (fractions of the course's size, so any course comes out the same): the course lands
 * in the middle of the free area, as large as it fits.
 */
export function driveFramePoints(creation: Pick<DerivedCreation, 'drivePair' | 'driveForward' | 'brickIds'>, geometry: Geometry, space: 'testPlate' | 'myWorld'): Vec3[] {
  const axes = driveAxes(creation)
  if (!axes) return []
  const footprint = robotFootprint(creation, geometry, axes)
  if (!footprint) return []
  const area = courseArea(footprint, axes, geometry.plateSize)
  const fence = COURSE.fenceThicknessStuds * STUD
  const xs: number[] = []
  const zs: number[] = []
  for (const s of [area.s0 - fence, area.s1 + fence]) for (const t of [area.t0 - fence, area.t1 + fence]) {
    xs.push(axes.forward.x * s + axes.across.x * t)
    zs.push(axes.forward.z * s + axes.across.z * t)
  }
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  const extent = Math.max(x1 - x0, z1 - z0)
  const far = FRAME_FAR_PULL * extent
  const near = FRAME_NEAR_PUSH * extent
  const y = space === 'testPlate' ? COURSE.fencePlates * PLATE_HEIGHT : 0
  return [
    { x: x0 + far, y, z: z0 + far },
    { x: x1 + near, y, z: z0 + far },
    { x: x0 + far, y, z: z1 + near },
    { x: x1 + near, y, z: z1 + near },
  ]
}

/** Measured in real Chrome at 1366×768 and 1024×768 (docs/qa/robotics-kid/drive): the course then clears the bar, the joystick column and the canvas's edges by 45 px or more. */
const FRAME_FAR_PULL = 0.43
const FRAME_NEAR_PUSH = 0.085

const PROP_MARGIN = 0.4

/** Points to keep in view for props (a wall's top corners, a visitor's walk), as the Code view frames them. */
export function propFramePoints(props: readonly TestProp[]): Vec3[] {
  const points: Vec3[] = []
  for (const prop of props) {
    if (prop.kind === 'wall') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) points.push({ x: prop.center.x + sx * (prop.size.x / 2 + PROP_MARGIN), y: prop.center.y + prop.size.y / 2, z: prop.center.z + sz * (prop.size.z / 2 + PROP_MARGIN) })
    } else {
      for (const point of prop.path) points.push({ x: point.x, y: point.y + prop.size.y / 2, z: point.z })
    }
  }
  return points
}
