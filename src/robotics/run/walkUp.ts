import { PLATE_HEIGHT, STUD, rotatedSize } from '../../brick/parts'
import type { BrickInstance } from '../../brick/types'
import type { DerivedCreation, DerivedSensor } from '../model/creations'
import { brickFrame, toWorldPoint, type PartMap } from '../model/grid'
import type { Vec3 } from '../model/vec'
import { roboticsSpec } from '../parts/catalog'
import { SEES_SOMETHING_STUDS, type DeviceId } from '../program/types'
import type { RunSpace, TestProp, WalkApproach, WalkProblem } from './types'

/**
 * The walk-up test (kid lane Y): "Someone walks up" always walks the visitor into the
 * sensor's beam, inside "sees something", however the robot was built and wherever its
 * sensor looks. Pure; the run controller turns the plan into its visitor prop.
 *
 * The plan comes from the sensor's pose at the built pose (its face and which way it looks,
 * always level: parts only turn about the vertical). The visitor stops with its near side
 * `standStuds` from the sensor's face (so the sensor reads 3), facing it. It comes in from
 * the side, across the beam: quickly at first, then slowly for the last steps into the beam,
 * so the sensor sees it and the robot has time to react (the gate is open, the light is on)
 * before it stops. It waits there, then walks back the way it came.
 *
 * The robot's own bricks and, in My world, the student's other bricks are in the way of a walk:
 * a stop and a path through them are avoided when another fits (the other side, a little nearer
 * or further, or straight up the beam), and floor-height bricks (plates) are walked over. When the
 * beam meets one of the student's bricks inside "sees something", the sensor sees that brick
 * instead, and the plan says so (`problem: 'wall'`).
 */
export const WALK_UP = Object.freeze({
  /** The stop: its near side this many studs from the sensor's face, which is what the sensor reads. */
  standStuds: 3,
  /** Other stops tried, nearest first after 3, when that one is taken (all inside "sees something"). */
  otherStandStuds: [3.5, 2.5, 4, 2, 4.5] as readonly number[],
  /** How far from the stop the walk starts (studs), shortest first. */
  startStuds: [7, 9, 11] as readonly number[],
  /** Walking speed up to the beam, studs a second. */
  studsPerSecond: 3.5,
  /** The last steps into the beam, seen all the way, take at least this long. */
  slowSeconds: 1,
  /** …and go no faster than this, studs a second. */
  slowStudsPerSecond: 1.6,
  /** How long the visitor stands where the sensor sees it before it walks back. */
  pauseSeconds: 3,
  /** The visitor's box, world units: wide across the beam, thin along it, as tall as a person or the beam. */
  size: Object.freeze({ width: 1.1, height: 2.2, depth: 0.5 }),
  /** Bricks no taller than this above the ground (two plates) are floor the visitor walks over. */
  floor: 2 * PLATE_HEIGHT + 0.04,
})

/** Gap left between the visitor's side and the beam at the end of the quick part (world units). */
const BEAM_MARGIN = 0.12
/** Where the studio's home camera stands, as a horizontal direction from the build: the visitor comes in from that side if it can. */
const CAMERA_SIDE: Vec3 = { x: Math.SQRT1_2, y: 0, z: Math.SQRT1_2 }
const UP: Vec3 = { x: 0, y: 1, z: 0 }

type Geometry = { bricks: readonly BrickInstance[]; partMap: PartMap; plateSize: number }
type Box = { id: string; minX: number; maxX: number; minZ: number; maxZ: number; bottom: number; top: number; own: boolean }
type Rect = { minX: number; maxX: number; minZ: number; maxZ: number }

const dot2 = (a: Vec3, b: Vec3) => a.x * b.x + a.z * b.z
const along = (from: Vec3, direction: Vec3, amount: number, y = from.y): Vec3 => ({ x: from.x + direction.x * amount, y, z: from.z + direction.z * amount })
const crossUp = (forward: Vec3): Vec3 => ({ x: UP.y * forward.z - UP.z * forward.y, y: 0, z: UP.x * forward.y - UP.y * forward.x })

/** The sensor the walk tests: the one the program reads when there is one, else the first plugged in, else the first. */
export function walkUpSensor(creation: Pick<DerivedCreation, 'sensors'>, preferredId?: DeviceId | null): DerivedSensor | null {
  return (preferredId ? creation.sensors.find((sensor) => sensor.brickId === preferredId) : undefined)
    ?? creation.sensors.find((sensor) => sensor.plugged)
    ?? creation.sensors[0]
    ?? null
}

/** A sensor's face (world units) and which way it looks, level, at the built pose. */
export function sensorMount(sensor: Pick<DerivedSensor, 'brickId' | 'normal'>, geometry: Geometry): { point: Vec3; facing: Vec3; level: boolean } | null {
  const brick = geometry.bricks.find((candidate) => candidate.id === sensor.brickId)
  const part = brick ? geometry.partMap[brick.partId] : undefined
  const spec = brick ? roboticsSpec(brick.partId) : null
  if (!brick || !part || !spec?.sensor) return null
  const point = toWorldPoint(brickFrame(brick, part, geometry.plateSize), spec.sensor.point)
  const flat = Math.hypot(sensor.normal.x, sensor.normal.z)
  // Parts only turn about the vertical, so a sensor always looks level; one that did not would be walked up to from the front.
  if (flat < 0.5) return { point, facing: { x: 0, y: 0, z: 1 }, level: false }
  return { point, facing: { x: sensor.normal.x / flat, y: 0, z: sensor.normal.z / flat }, level: true }
}

function boxesOf(creation: Pick<DerivedCreation, 'brickIds'>, geometry: Geometry, space: RunSpace): Box[] {
  const own = new Set(creation.brickIds)
  const boxes: Box[] = []
  for (const brick of geometry.bricks) {
    const mine = own.has(brick.id)
    // On the test plate every other brick is left out of the run.
    if (!mine && space === 'testPlate') continue
    const part = geometry.partMap[brick.partId]
    if (!part) continue
    const size = rotatedSize(part, brick.rotation)
    const minX = (brick.x - geometry.plateSize / 2) * STUD
    const minZ = (brick.z - geometry.plateSize / 2) * STUD
    boxes.push({ id: brick.id, minX, maxX: minX + size.width * STUD, minZ, maxZ: minZ + size.depth * STUD, bottom: brick.y * PLATE_HEIGHT, top: (brick.y + part.height) * PLATE_HEIGHT, own: mine })
  }
  return boxes
}

/** Where the level beam first meets one of `boxes`, world units along it, within `reach`. */
function beamBlockedAt(point: Vec3, facing: Vec3, boxes: readonly Box[], reach: number): number | null {
  let nearest: number | null = null
  for (const box of boxes) {
    if (point.y < box.bottom || point.y > box.top) continue
    // Slab test of the level ray against the box's footprint.
    let near = 0
    let far = reach
    for (const [origin, direction, min, max] of [[point.x, facing.x, box.minX, box.maxX], [point.z, facing.z, box.minZ, box.maxZ]] as const) {
      if (Math.abs(direction) < 1e-9) {
        if (origin < min || origin > max) { near = Infinity; break }
        continue
      }
      const a = (min - origin) / direction
      const b = (max - origin) / direction
      near = Math.max(near, Math.min(a, b))
      far = Math.min(far, Math.max(a, b))
    }
    if (near <= far && near < reach && (nearest === null || near < nearest)) nearest = Math.max(0, near)
  }
  return nearest
}

function overlapArea(rect: Rect, boxes: readonly Box[], height: number): number {
  let total = 0
  for (const box of boxes) {
    if (box.top <= WALK_UP.floor || box.bottom >= height) continue
    const x = Math.min(rect.maxX, box.maxX) - Math.max(rect.minX, box.minX)
    const z = Math.min(rect.maxZ, box.maxZ) - Math.max(rect.minZ, box.minZ)
    // Touching faces are not in the way: a hundredth of a stud either way is the grid's rounding.
    if (x > 0.01 && z > 0.01) total += x * z
  }
  return total
}

function footprint(center: Vec3, halfX: number, halfZ: number): Rect {
  return { minX: center.x - halfX, maxX: center.x + halfX, minZ: center.z - halfZ, maxZ: center.z + halfZ }
}

const union = (a: Rect, b: Rect): Rect => ({ minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minZ: Math.min(a.minZ, b.minZ), maxZ: Math.max(a.maxZ, b.maxZ) })

type Candidate = { stand: number; approach: WalkApproach; path: Vec3[]; legSeconds: number[]; score: number; beamClear: boolean }

/**
 * The visitor for a creation with a sensor, or null when it has none (there is nothing to walk
 * up to). `preferredSensorId`: the sensor the program reads.
 */
export function planWalkUp(creation: Pick<DerivedCreation, 'brickIds' | 'sensors'>, space: RunSpace, geometry: Geometry, preferredSensorId?: DeviceId | null): Extract<TestProp, { kind: 'visitor' }> | null {
  const sensor = walkUpSensor(creation, preferredSensorId)
  if (!sensor) return null
  const mount = sensorMount(sensor, geometry)
  if (!mount) return null
  const { point, facing } = mount
  const size = WALK_UP.size
  const height = Math.max(size.height, point.y + 0.7)
  // Across the beam: the camera's side of it first (`side`), then the far side (`other-side`).
  const across = crossUp(facing)
  const side = dot2(across, CAMERA_SIDE) >= 0 ? across : { x: -across.x, y: 0, z: -across.z }
  // Across the beam the visitor is `width` wide, along it `depth` deep (the box never turns).
  const halfX = (Math.abs(facing.x) * size.depth + Math.abs(side.x) * size.width) / 2
  const halfZ = (Math.abs(facing.z) * size.depth + Math.abs(side.z) * size.width) / 2
  const boxes = boxesOf(creation, geometry, space)
  const range = SEES_SOMETHING_STUDS * STUD
  // The student's bricks in the beam are what the sensor sees (a wall). The robot's own tall bricks
  // hide anyone behind them the way they would a real sensor's (the stage's ray skips the robot's
  // own parts, so it never sees itself): nobody is sent to stand behind them.
  const blockedAt = beamBlockedAt(point, facing, boxes.filter((box) => !box.own), range)
  const hiddenAt = beamBlockedAt(point, facing, boxes.filter((box) => box.own && box.id !== sensor.brickId && box.top > WALK_UP.floor), range)
  const candidates: Candidate[] = []
  for (const stand of [WALK_UP.standStuds, ...WALK_UP.otherStandStuds]) {
    const reach = stand * STUD + size.depth / 2
    const stop = along(point, facing, reach, height / 2)
    const standArea = overlapArea(footprint(stop, halfX, halfZ), boxes, height)
    const beamClear = (blockedAt === null || blockedAt > stand * STUD + 1e-6) && (hiddenAt === null || hiddenAt > stand * STUD + 1e-6) && standArea === 0
    for (const approach of ['side', 'other-side', 'ahead'] as WalkApproach[]) {
      for (const start of WALK_UP.startStuds) {
        let path: Vec3[]
        let slow: number
        if (approach === 'ahead') {
          // Straight up the beam: seen once its near side is inside "sees something".
          const seenFrom = (SEES_SOMETHING_STUDS - stand) * STUD + BEAM_MARGIN
          if (start * STUD <= seenFrom + STUD) continue
          path = [along(stop, facing, start * STUD), along(stop, facing, seenFrom), stop]
          slow = seenFrom
        } else {
          const direction = approach === 'side' ? side : { x: -side.x, y: 0, z: -side.z }
          const edge = size.width / 2 + BEAM_MARGIN
          path = [along(stop, direction, start * STUD), along(stop, direction, edge), stop]
          slow = edge
        }
        const [from, beamEdge] = path
        const swept = union(footprint(from, halfX, halfZ), footprint(stop, halfX, halfZ))
        const score = standArea * 3 + overlapArea(swept, boxes, height) + overlapArea(footprint(from, halfX, halfZ), boxes, height) * 2
        const quick = Math.hypot(beamEdge.x - from.x, beamEdge.z - from.z)
        const slowSeconds = Math.max(WALK_UP.slowSeconds, slow / STUD / WALK_UP.slowStudsPerSecond)
        candidates.push({ stand, approach, path, legSeconds: [quick / STUD / WALK_UP.studsPerSecond, slowSeconds], score, beamClear })
        if (score === 0) break
      }
    }
  }
  // The first spot in the order of preference that is clear all the way; else the least in the way.
  const seeable = candidates.filter((candidate) => candidate.beamClear)
  const wall = blockedAt !== null ? { wallStuds: Math.round((blockedAt / STUD) * 100) / 100 } : {}
  if (!seeable.length && blockedAt === null) {
    // Nowhere to stand in the beam (it runs into the robot itself): walk up in front of the robot
    // instead, where the student sees it, and let the stage say the sensor did not see them.
    const front = walkInFront(creation, boxes, height, size)
    if (front) return { ...front, sensorId: sensor.brickId, walk: { standStuds: 0, approach: 'front', problem: 'no-room' } }
  }
  const pool = seeable.length ? seeable : candidates
  const best = pool.find((candidate) => candidate.score === 0) ?? pool.reduce((least, candidate) => (candidate.score < least.score - 1e-9 ? candidate : least))
  // A brick of the student's in the beam inside "sees something" is seen whether or not anyone walks up.
  const problem: WalkProblem | null = !mount.level ? 'looks-away' : blockedAt !== null ? 'wall' : best.score > 0 ? 'crowded' : null
  const boxSize = Math.abs(side.x) > 0.5 ? { x: size.width, y: height, z: size.depth } : { x: size.depth, y: height, z: size.width }
  return {
    id: 'visitor',
    kind: 'visitor',
    path: best.path,
    size: boxSize,
    secondsPerLeg: best.legSeconds[0],
    legSeconds: best.legSeconds,
    pauseSeconds: WALK_UP.pauseSeconds,
    facing: { x: -facing.x, y: 0, z: -facing.z },
    sensorId: sensor.brickId,
    walk: { standStuds: best.stand, approach: best.approach, problem, ...wall },
  }
}

/**
 * The walk when the beam leaves no room to stand in it: up to the robot's near side (the one the
 * home camera looks at, +Z, else +X, −Z, −X), 3 studs out from its footprint and facing it, in from
 * the camera's side. Null when every side is taken.
 */
function walkInFront(creation: Pick<DerivedCreation, 'brickIds'>, boxes: readonly Box[], height: number, size: typeof WALK_UP.size): Omit<Extract<TestProp, { kind: 'visitor' }>, 'sensorId' | 'walk'> | null {
  const own = boxes.filter((box) => box.own)
  if (!own.length || !creation.brickIds.length) return null
  const minX = Math.min(...own.map((box) => box.minX))
  const maxX = Math.max(...own.map((box) => box.maxX))
  const minZ = Math.min(...own.map((box) => box.minZ))
  const maxZ = Math.max(...own.map((box) => box.maxZ))
  const middle = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 }
  const sides: { out: Vec3; edge: number }[] = [
    { out: { x: 0, y: 0, z: 1 }, edge: maxZ - middle.z },
    { out: { x: 1, y: 0, z: 0 }, edge: maxX - middle.x },
    { out: { x: 0, y: 0, z: -1 }, edge: middle.z - minZ },
    { out: { x: -1, y: 0, z: 0 }, edge: middle.x - minX },
  ]
  for (const { out, edge } of sides) {
    const across = crossUp(out)
    const inFrom = dot2(across, CAMERA_SIDE) >= 0 ? across : { x: -across.x, y: 0, z: -across.z }
    const halfX = (Math.abs(out.x) * size.depth + Math.abs(inFrom.x) * size.width) / 2
    const halfZ = (Math.abs(out.z) * size.depth + Math.abs(inFrom.z) * size.width) / 2
    const stop = along({ x: middle.x, y: height / 2, z: middle.z }, out, edge + WALK_UP.standStuds * STUD + size.depth / 2)
    const start = along(stop, inFrom, WALK_UP.startStuds[0] * STUD)
    if (overlapArea(union(footprint(start, halfX, halfZ), footprint(stop, halfX, halfZ)), boxes, height) > 0) continue
    const seconds = WALK_UP.startStuds[0] / WALK_UP.studsPerSecond
    return {
      id: 'visitor',
      kind: 'visitor',
      path: [start, stop],
      size: Math.abs(inFrom.x) > 0.5 ? { x: size.width, y: height, z: size.depth } : { x: size.depth, y: height, z: size.width },
      secondsPerLeg: seconds,
      legSeconds: [seconds],
      pauseSeconds: WALK_UP.pauseSeconds,
      facing: { x: -out.x, y: 0, z: -out.z },
    }
  }
  return null
}
