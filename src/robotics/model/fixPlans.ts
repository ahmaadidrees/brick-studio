import { draftIsValid } from '../../brick/brickRules'
import { rotatedSize } from '../../brick/parts'
import type { BrickInstance, BrickPart } from '../../brick/types'
import { ROBOTICS_PART_IDS, isDevicePart, roboticsSpec } from '../parts/catalog'
import { deriveStudJoints, studsTopOf } from './assembly'
import { overlappingBricks } from './blocked'
import { deviceName, type DeriveInput, type DerivedCreation } from './creations'
import { deriveMechanisms, type Mechanisms } from './mechanism'
import { EDGE_ROTATION, PLATE_EDGES, connectorPose, edgeSlots, isPlatePart, plateRect, preferredEdges, type PlateEdge, type Rect, type SnapPose } from './snap'
import { axlePoseAt, socketCoveredBy, socketOf, type SocketFrame } from './socketRoom'
import { add, scale } from './vec'

/**
 * One-tap fixes for a robot built from separate parts (kid-UX lane W), planned here and carried
 * out through the studio's own actions (`guide/fixes.ts`) as one Undo. Pure: each planner reads
 * the bricks and answers either the steps (parts to add, parts to move, each to a pose the
 * snapper would also give, so the result is connected by construction and stands on what is
 * under it) or why it can't, with what is in the way.
 *
 * - **A wheel that can't spin** (`planWheelFix`): onto a free axle end a motor holds, else an
 *   axle into a motor with nothing in its socket and the wheel onto that axle, else a new motor
 *   on the edge of the plate by the wheel, socket facing the wheel's side, an axle in it and the
 *   wheel on the axle. The nearest wins, a new part counting as a few studs of travel. A wheel
 *   never crosses to the other side of the robot. No plate near: "Motors go on a plate."; no
 *   room: "No room for a motor here. Try a bigger plate." with what is in the way.
 * - **A part beside a robot** (`planPutOnRobot`): a motor to the other side of a robot with one
 *   motor, else the nearest free edge spot with room for its axle; a sensor, light, button,
 *   seat or hub on top of the robot, on its plate first.
 * - **A motor away from the sides** (`planMotorToSide`): to the nearest edge spot of its plate
 *   where an axle fits, the other side of a lone motor first.
 * - **The other side** (`otherSideSpot`): where the second motor of a robot with one goes, the
 *   first mirrored across its plate, or why there is no room.
 * - **A red preview** (`previewProblem`): why the armed robot part can't go where it is.
 */
const MOTOR = ROBOTICS_PART_IDS.motor
const AXLE = ROBOTICS_PART_IDS.axleShort
const WHEEL = ROBOTICS_PART_IDS.wheel

export type FixStep = { op: 'add'; partId: string; pose: SnapPose } | { op: 'move'; brickId: string; pose: SnapPose }

export type FixPlan = {
  ok: true
  /** The part the fix is for (the wheel, the part put on, the motor moved). */
  brickId: string
  /** The button: "Add a motor for it", "Put it on Left motor", "Put it on Speedy", "Move it to the side". */
  label: string
  /** The Undo entry. */
  undoLabel: string
  /** What the line says once it is done. */
  done: string
  steps: FixStep[]
}

export type FixRefusal = {
  ok: false
  brickId: string
  reason: 'no-plate' | 'no-room' | 'stacked' | 'nothing'
  /** Why, in a third grader's words (empty for `nothing`: there is nothing to fix). */
  text: string
  /** What is in the way, to outline. */
  blockers: string[]
  /** Where the missing part would go, to draw in red. */
  ghost: { partId: string; pose: SnapPose } | null
}

export type FixOutcome = FixPlan | FixRefusal

export const WHEEL_CANT_SPIN = "This wheel can't spin yet. It needs an axle in a motor."
export const WHEEL_NEAR_AXLE = "This wheel isn't on the axle yet."
export const WHEEL_AXLE_NO_MOTOR = "This wheel can't spin yet. Its axle needs a motor."
export const NO_ROOM_FOR_MOTOR = 'No room for a motor here. Try a bigger plate.'
export const MOTORS_GO_ON_A_PLATE = 'Motors go on a plate. Put a plate down first.'
export const MOTORS_GO_ON_THE_SIDES = 'Motors go on the sides so the wheels touch the ground.'
export const ADD_A_MOTOR = 'Add a motor for it'
export const MOVE_TO_SIDE = 'Move it to the side'

/** A new motor counts as this many studs of travel, a new axle as one: a waiting motor is used first. */
const NEW_MOTOR_COST = 5
const NEW_AXLE_COST = 1
/** A wheel moves at most this far onto a motor or an axle end that is already there. */
const EXISTING_REACH_STUDS = 10
/** A plate this near a wheel (studs between footprints) can take the wheel's motor. */
const WHEEL_PLATE_REACH_STUDS = 4

/* ------------------------------------------------------------------ layout */

type Layout = {
  input: Pick<DeriveInput, 'bricks' | 'partMap' | 'plateSize'>
  byId: Map<string, BrickInstance>
  /** The bricks but `ignore`, plus `extra` (parts a plan adds before this one). */
  others: (ignore: ReadonlySet<string>, extra?: readonly BrickInstance[]) => BrickInstance[]
  fits: (partId: string, pose: SnapPose, ignore: ReadonlySet<string>, extra?: readonly BrickInstance[]) => boolean
  blockers: (partId: string, pose: SnapPose, ignore: ReadonlySet<string>, extra?: readonly BrickInstance[]) => string[]
}

function layoutOf(input: Pick<DeriveInput, 'bricks' | 'partMap' | 'plateSize'>): Layout {
  const others = (ignore: ReadonlySet<string>, extra: readonly BrickInstance[] = []) => [...input.bricks.filter((brick) => !ignore.has(brick.id)), ...extra]
  return {
    input,
    byId: new Map(input.bricks.map((brick) => [brick.id, brick])),
    others,
    fits: (partId, pose, ignore, extra) => draftIsValid({ partId, ...pose, color: '#000000' }, others(ignore, extra), null, input.partMap, input.plateSize),
    blockers: (partId, pose, ignore, extra) => overlappingBricks({ partId, ...pose }, others(ignore, extra), input.partMap).map((brick) => brick.id),
  }
}

const asBrick = (id: string, partId: string, pose: SnapPose): BrickInstance => ({ id, partId, ...pose, color: '#000000' })

type Point = { x: number; z: number }

/** The middle of a part's footprint, in studs. */
function centerOf(pose: Pick<SnapPose, 'x' | 'z' | 'rotation'>, part: BrickPart): Point {
  const size = rotatedSize(part, pose.rotation)
  return { x: pose.x + size.width / 2, z: pose.z + size.depth / 2 }
}

const travel = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)

function footprintOf(brick: Pick<BrickInstance, 'x' | 'z' | 'rotation'>, part: BrickPart): Rect {
  const size = rotatedSize(part, brick.rotation)
  return { x0: brick.x, x1: brick.x + size.width, z0: brick.z, z1: brick.z + size.depth }
}

const gapBetween = (a: Rect, b: Rect) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.z0 - b.z1, b.z0 - a.z1))
const overlap = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1

/** Slot numbers from `start` outward (start, start−1, start+1, …) inside [lo, hi]. */
function nearestFirst(lo: number, hi: number, start: number): number[] {
  const first = Math.min(hi, Math.max(lo, Math.round(start)))
  const order = [first]
  for (let step = 1; step <= hi - lo; step += 1) {
    if (first - step >= lo) order.push(first - step)
    if (first + step <= hi) order.push(first + step)
  }
  return order
}

const isGroundPlate = (layout: Layout, brick: BrickInstance) => brick.y === 0 && isPlatePart(layout.input.partMap[brick.partId])

/** The plate lying on the ground that a brick stands on (its bottom on the plate's top, footprints overlapping). */
function plateUnder(layout: Layout, brick: BrickInstance): BrickInstance | null {
  const part = layout.input.partMap[brick.partId]
  if (!part) return null
  const own = footprintOf(brick, part)
  return layout.input.bricks.find((candidate) => {
    const plate = layout.input.partMap[candidate.partId]
    return candidate.id !== brick.id && isGroundPlate(layout, candidate) && plate && brick.y === candidate.y + plate.height && overlap(own, footprintOf(candidate, plate))
  }) ?? null
}

/** Plates lying on the ground under or within `reach` studs of a brick, nearest first. */
function groundPlatesNear(layout: Layout, brick: BrickInstance, reach: number): BrickInstance[] {
  const part = layout.input.partMap[brick.partId]
  if (!part) return []
  const own = footprintOf(brick, part)
  return layout.input.bricks
    .filter((candidate) => candidate.id !== brick.id && isGroundPlate(layout, candidate))
    .map((plate) => ({ plate, gap: gapBetween(own, footprintOf(plate, layout.input.partMap[plate.partId]!)) }))
    .filter((entry) => entry.gap <= reach)
    .sort((a, b) => a.gap - b.gap)
    .map((entry) => entry.plate)
}

/** Bricks studded onto the top of this one: moving it would leave them in the air. */
function studdedOnTop(layout: Layout, brick: BrickInstance): string[] {
  return deriveStudJoints(layout.input.bricks, layout.input.partMap).filter((joint) => joint.lowerBrickId === brick.id).map((joint) => joint.upperBrickId)
}

const roleOf = (brick: BrickInstance | undefined) => (brick ? roboticsSpec(brick.partId)?.role ?? null : null)

/** Motors standing on a plate (bottom on its top, footprints overlapping). */
function motorsOn(layout: Layout, plate: BrickInstance, ignore: ReadonlySet<string>): BrickInstance[] {
  const platePart = layout.input.partMap[plate.partId]!
  const rect = footprintOf(plate, platePart)
  return layout.input.bricks.filter((brick) => !ignore.has(brick.id) && roleOf(brick) === 'motor' && brick.y === plate.y + platePart.height && overlap(rect, footprintOf(brick, layout.input.partMap[brick.partId]!)))
}

type Axis = 'x' | 'z'
const EDGES_ON: Readonly<Record<Axis, readonly PlateEdge[]>> = { x: ['left', 'right'], z: ['far', 'near'] }
const OPPOSITE: Readonly<Record<PlateEdge, PlateEdge>> = { left: 'right', right: 'left', far: 'near', near: 'far' }
const axisOfEdge = (edge: PlateEdge): Axis => (edge === 'left' || edge === 'right' ? 'x' : 'z')

/** The way a plate's wheels turn on: along its motors' sockets, else across its long sides (a car's motors go on its long sides). */
function driveAxis(layout: Layout, plate: BrickInstance, ignore: ReadonlySet<string>): Axis {
  let alongX = 0
  let alongZ = 0
  for (const motor of motorsOn(layout, plate, ignore)) {
    const socket = socketOf(motor, layout.input.partMap, layout.input.plateSize)
    if (!socket || Math.abs(socket.normal.y) > 0.5) continue
    if (Math.abs(socket.normal.x) > 0.5) alongX += 1
    else alongZ += 1
  }
  if (alongX !== alongZ) return alongX > alongZ ? 'x' : 'z'
  return axisOfEdge(preferredEdges(plateRect(plate, layout.input.partMap[plate.partId]!))[0])
}

/** The edges of a plate on a point's side along an axis (both when it is in the middle). */
function edgesToward(rect: Rect, axis: Axis, point: Point): PlateEdge[] {
  const middle = axis === 'x' ? (rect.x0 + rect.x1) / 2 : (rect.z0 + rect.z1) / 2
  const at = axis === 'x' ? point.x : point.z
  const [low, high] = EDGES_ON[axis]
  if (at < middle - 0.25) return [low]
  if (at > middle + 0.25) return [high]
  return [low, high]
}

/** The edge a motor's socket faces out over. */
function edgeOfNormal(normal: { x: number; z: number }): PlateEdge {
  if (Math.abs(normal.x) > 0.5) return normal.x > 0 ? 'right' : 'left'
  return normal.z > 0 ? 'near' : 'far'
}

/** A part `from` is on this motor's side: not behind the middle of the motor its socket faces away from. */
function onSocketSide(layout: Layout, motor: BrickInstance, normal: { x: number; z: number }, from: Point): boolean {
  const middle = centerOf(motor, layout.input.partMap[motor.partId]!)
  return normal.x * (from.x - middle.x) + normal.z * (from.z - middle.z) > -0.25
}

/** A motor at `pose` would have an axle's room at its socket (nothing but loose wheels and axles there). */
function socketOpenAt(layout: Layout, pose: SnapPose, ignore: ReadonlySet<string>, extra: readonly BrickInstance[] = []): boolean {
  const covered = socketCoveredBy({ id: 'fix:motor', partId: MOTOR, ...pose }, layout.others(ignore, extra), layout.input.partMap, layout.input.plateSize)
  return covered !== null && covered.length === 0
}

type Chain = { ok: true; axleStep: FixStep; axlePose: SnapPose; wheelPose: SnapPose } | { ok: false; blockers: string[] }

/** An axle in `socket` (the wheel's own axle when it has one) and the wheel on its far end, if both fit. */
function chainAt(layout: Layout, socket: SocketFrame, carried: BrickInstance | null, ignore: ReadonlySet<string>, extra: readonly BrickInstance[]): Chain {
  const { partMap, plateSize } = layout.input
  const axlePartId = carried?.partId ?? AXLE
  const axle = roboticsSpec(axlePartId)?.axle
  const wheelPart = partMap[WHEEL]
  const wheel = roboticsSpec(WHEEL)?.wheel
  const axlePose = axle ? axlePoseAt(socket, partMap, plateSize, axlePartId) : null
  if (!axle || !axlePose || !wheelPart || !wheel) return { ok: false, blockers: [] }
  const axleBlockers = layout.blockers(axlePartId, axlePose, ignore, extra)
  if (axleBlockers.length) return { ok: false, blockers: axleBlockers }
  const end = add(socket.point, scale(socket.normal, 2 * axle.halfLength))
  const wheelPose = connectorPose(wheelPart, wheel.center, end, socket.normal, wheel.halfThickness, plateSize)
  if (!wheelPose) return { ok: false, blockers: [] }
  const wheelBlockers = layout.blockers(WHEEL, wheelPose, ignore, [...extra, asBrick('fix:axle', axlePartId, axlePose)])
  if (wheelBlockers.length) return { ok: false, blockers: wheelBlockers }
  return { ok: true, axleStep: carried ? { op: 'move', brickId: carried.id, pose: axlePose } : { op: 'add', partId: AXLE, pose: axlePose }, axlePose, wheelPose }
}

function refusal(brickId: string, reason: FixRefusal['reason'], text = '', more: Partial<Pick<FixRefusal, 'blockers' | 'ghost'>> = {}): FixRefusal {
  return { ok: false, brickId, reason, text, blockers: more.blockers ?? [], ghost: more.ghost ?? null }
}

/* ------------------------------------------------------------------ a wheel that can't spin */

export function planWheelFix(input: DeriveInput, wheelId: string, mechanisms: Mechanisms = deriveMechanisms(input.bricks, input.partMap, input.plateSize)): FixOutcome {
  const layout = layoutOf(input)
  const wheel = layout.byId.get(wheelId)
  const wheelPart = input.partMap[WHEEL]
  const motorPart = input.partMap[MOTOR]
  if (!wheel || roleOf(wheel) !== 'wheel' || !wheelPart || !motorPart) return refusal(wheelId, 'nothing')
  const link = mechanisms.wheelById.get(wheelId)
  const carriedLink = link?.axleId ? mechanisms.axleById.get(link.axleId) ?? null : null
  if (carriedLink?.ends.some((end) => end.motorId)) return refusal(wheelId, 'nothing')
  // A wheel on an axle no motor holds brings that axle along.
  const carried = carriedLink ? layout.byId.get(carriedLink.axleId) ?? null : null
  const ignore = new Set([wheelId, ...(carried ? [carried.id] : [])])
  const from = centerOf(wheel, wheelPart)
  const options: { cost: number; plan: FixPlan }[] = []
  const plan = (label: string, undoLabel: string, done: string, steps: FixStep[]): FixPlan => ({ ok: true, brickId: wheelId, label, undoLabel, done, steps })

  // A free axle end that a motor holds: the wheel goes on it.
  for (const axle of mechanisms.axles) {
    const holderId = axle.ends.find((end) => end.motorId)?.motorId
    const holder = holderId ? layout.byId.get(holderId) : undefined
    if (!holder || axle.axleId === carried?.id) continue
    for (const end of axle.ends) {
      if (end.motorId || end.wheelId || !onSocketSide(layout, holder, end.outward, from)) continue
      const wheelSpec = roboticsSpec(WHEEL)!.wheel!
      const pose = connectorPose(wheelPart, wheelSpec.center, end.point, end.outward, wheelSpec.halfThickness, input.plateSize)
      if (!pose || !layout.fits(WHEEL, pose, ignore)) continue
      const distance = travel(from, centerOf(pose, wheelPart))
      if (distance > EXISTING_REACH_STUDS) continue
      const name = deviceName(input, holder)
      options.push({ cost: distance, plan: plan(`Put it on ${name}'s axle`, `Put the wheel on ${name}'s axle`, 'The wheel can spin now!', [{ op: 'move', brickId: wheelId, pose }]) })
    }
  }

  // A motor with nothing in its socket: an axle in, the wheel on the axle.
  for (const motorLink of mechanisms.motors) {
    const motor = layout.byId.get(motorLink.motorId)
    if (!motor || motorLink.axleId || !onSocketSide(layout, motor, motorLink.socket.normal, from)) continue
    const chain = chainAt(layout, motorLink.socket, carried, ignore, [])
    if (!chain.ok) continue
    const distance = travel(from, centerOf(chain.wheelPose, wheelPart))
    if (distance > EXISTING_REACH_STUDS) continue
    const name = deviceName(input, motor)
    options.push({ cost: distance + (carried ? 0 : NEW_AXLE_COST), plan: plan(`Put it on ${name}`, `Put the wheel on ${name}`, 'The wheel can spin now!', [chain.axleStep, { op: 'move', brickId: wheelId, pose: chain.wheelPose }]) })
  }

  // A new motor on the edge of the plate by the wheel, its socket facing the wheel's side.
  let miss: Pick<FixRefusal, 'blockers' | 'ghost'> | null = null
  const plates = groundPlatesNear(layout, wheel, WHEEL_PLATE_REACH_STUDS)
  for (const plate of plates) {
    const platePart = input.partMap[plate.partId]!
    const rect = plateRect(plate, platePart)
    for (const edge of edgesToward(rect, driveAxis(layout, plate, ignore), from)) {
      const slots = edgeSlots(plate, platePart, motorPart, edge)
      for (const slot of nearestFirst(slots.lo, slots.hi, slots.slotOf(from.x, from.z))) {
        const motorPose = slots.pose(slot)
        const inTheWay = layout.blockers(MOTOR, motorPose, ignore)
        if (inTheWay.length) {
          miss ??= { blockers: inTheWay, ghost: { partId: MOTOR, pose: motorPose } }
          continue
        }
        const socket = socketOf({ partId: MOTOR, ...motorPose }, input.partMap, input.plateSize)
        const chain = socket ? chainAt(layout, socket, carried, ignore, [asBrick('fix:motor', MOTOR, motorPose)]) : { ok: false as const, blockers: [] }
        if (!chain.ok) {
          miss ??= { blockers: chain.blockers, ghost: { partId: MOTOR, pose: motorPose } }
          continue
        }
        const cost = travel(from, centerOf(chain.wheelPose, wheelPart)) + NEW_MOTOR_COST + (carried ? 0 : NEW_AXLE_COST)
        options.push({ cost, plan: plan(ADD_A_MOTOR, 'Add a motor for the wheel', 'Added a motor and an axle. The wheel can spin now!', [{ op: 'add', partId: MOTOR, pose: motorPose }, chain.axleStep, { op: 'move', brickId: wheelId, pose: chain.wheelPose }]) })
        break
      }
    }
  }

  if (options.length) return options.reduce((best, option) => (option.cost < best.cost - 1e-9 ? option : best)).plan
  if (!plates.length) return refusal(wheelId, 'no-plate', MOTORS_GO_ON_A_PLATE)
  return refusal(wheelId, 'no-room', NO_ROOM_FOR_MOTOR, miss ?? {})
}

/** What the loose-wheel line says about this wheel before it is fixed. */
export function wheelProblemText(mechanisms: Mechanisms, wheelId: string, nearMissReach: number): string {
  const link = mechanisms.wheelById.get(wheelId)
  if (link?.axleId) return WHEEL_AXLE_NO_MOTOR
  const gap = link?.nearest?.gap
  if (link?.nearest && gap && Math.hypot(gap.x, gap.y, gap.z) <= nearMissReach) {
    const axle = mechanisms.axleById.get(link.nearest.axleId)
    if (axle?.ends.some((end) => end.motorId)) return WHEEL_NEAR_AXLE
  }
  return WHEEL_CANT_SPIN
}

/* ------------------------------------------------------------------ the other side */

export type OtherSideSpot = {
  /** The robot's one motor. */
  motorId: string
  plateId: string
  /** Where the second motor goes: the first mirrored across the plate, or the nearest spot with room on that side. */
  pose: SnapPose
  free: boolean
  /** True when `pose` is exactly the mirror of the first motor. */
  mirrored: boolean
  /** What is in the way when it is not free. */
  blockers: string[]
}

/**
 * Where the second motor of a robot with one motor goes (the step "Put a motor on the other side"):
 * the first motor mirrored across the plate it stands on, turned to face out over the opposite
 * edge; if that spot is taken, the nearest spot along that edge with room for the motor and its
 * axle; if none, the mirror spot with what is in the way. Null when the robot does not have
 * exactly one motor, or its motor is not on the edge of a plate facing out.
 */
export function otherSideSpot(input: Pick<DeriveInput, 'bricks' | 'partMap' | 'plateSize'>, robot: Pick<DerivedCreation, 'brickIds'>, ignore: ReadonlySet<string> = new Set()): OtherSideSpot | null {
  const layout = layoutOf(input)
  const motors = robot.brickIds.filter((id) => !ignore.has(id)).map((id) => layout.byId.get(id)).filter((brick): brick is BrickInstance => roleOf(brick) === 'motor')
  if (motors.length !== 1) return null
  const [motor] = motors
  const plate = plateUnder(layout, motor)
  const socket = socketOf(motor, input.partMap, input.plateSize)
  const motorPart = input.partMap[MOTOR]
  if (!plate || !socket || !motorPart || Math.abs(socket.normal.y) > 0.5) return null
  const covered = socketCoveredBy(motor, layout.others(ignore), input.partMap, input.plateSize)
  if (covered === null || covered.length > 0) return null
  const platePart = input.partMap[plate.partId]!
  const rect = plateRect(plate, platePart)
  const size = rotatedSize(motorPart, motor.rotation)
  const opposite = OPPOSITE[edgeOfNormal(socket.normal)]
  const alongX = axisOfEdge(opposite) === 'x'
  const mirror: SnapPose = alongX
    ? { x: rect.x0 + rect.x1 - (motor.x + size.width), y: motor.y, z: motor.z, rotation: EDGE_ROTATION[opposite] }
    : { x: motor.x, y: motor.y, z: rect.z0 + rect.z1 - (motor.z + size.depth), rotation: EDGE_ROTATION[opposite] }
  const open = (pose: SnapPose) => layout.fits(MOTOR, pose, ignore) && socketOpenAt(layout, pose, ignore)
  const base = { motorId: motor.id, plateId: plate.id }
  if (open(mirror)) return { ...base, pose: mirror, free: true, mirrored: true, blockers: [] }
  const slots = edgeSlots(plate, platePart, motorPart, opposite)
  for (const slot of nearestFirst(slots.lo, slots.hi, alongX ? mirror.z : mirror.x)) {
    const pose = slots.pose(slot)
    if (open(pose)) return { ...base, pose, free: true, mirrored: false, blockers: [] }
  }
  const inTheWay = layout.blockers(MOTOR, mirror, ignore)
  const socketWay = inTheWay.length ? [] : socketCoveredBy({ id: 'fix:motor', partId: MOTOR, ...mirror }, layout.others(ignore), input.partMap, input.plateSize) ?? []
  return { ...base, pose: mirror, free: false, mirrored: true, blockers: inTheWay.length ? inTheWay : socketWay }
}

/* ------------------------------------------------------------------ a part beside a robot */

/** A motor at an end of a side leaves the middle of the plate for the hub, as the Buggy's do. */
const MIDDLE_OF_SIDE_COST = 1.5

/**
 * Every spot on the robot's ground plates' edges where a motor fits with room for its axle: on the
 * drive axis first, then nearest `from`, an end of a side before its middle.
 */
function openMotorSpots(layout: Layout, plates: readonly BrickInstance[], from: Point, ignore: ReadonlySet<string>): SnapPose[] {
  const motorPart = layout.input.partMap[MOTOR]
  if (!motorPart) return []
  const spots: { pose: SnapPose; cost: number }[] = []
  for (const plate of plates) {
    const platePart = layout.input.partMap[plate.partId]!
    const axis = driveAxis(layout, plate, ignore)
    for (const edge of PLATE_EDGES) {
      const slots = edgeSlots(plate, platePart, motorPart, edge)
      for (let slot = slots.lo; slot <= slots.hi; slot += 1) {
        const pose = slots.pose(slot)
        if (!layout.fits(MOTOR, pose, ignore) || !socketOpenAt(layout, pose, ignore)) continue
        const end = slot === slots.lo || slot === slots.hi
        spots.push({ pose, cost: travel(from, centerOf(pose, motorPart)) + (axisOfEdge(edge) === axis ? 0 : 4) + (end ? 0 : MIDDLE_OF_SIDE_COST) })
      }
    }
  }
  return spots.sort((a, b) => a.cost - b.cost).map((spot) => spot.pose)
}

/** A spot on top of one of the robot's bricks (its plate first) where the part sits studded on. */
function topSpot(layout: Layout, members: readonly BrickInstance[], device: BrickInstance, from: Point, ignore: ReadonlySet<string>): SnapPose | null {
  const part = layout.input.partMap[device.partId]
  if (!part) return null
  // A sensor or a seat keeps the way it faces; anything else may turn to fit.
  const role = roleOf(device)
  const rotations = role === 'distance-sensor' || role === 'seat' ? [device.rotation] : [device.rotation, ((device.rotation + 1) % 4) as SnapPose['rotation']]
  let best: { pose: SnapPose; cost: number } | null = null
  for (const carrier of members) {
    const carrierPart = layout.input.partMap[carrier.partId]
    if (!carrierPart || !studsTopOf(carrierPart) || roboticsSpec(carrier.partId)?.hinge) continue
    const rect = footprintOf(carrier, carrierPart)
    const top = carrier.y + carrierPart.height
    for (const rotation of rotations) {
      const size = rotatedSize(part, rotation)
      for (let x = rect.x0; x + size.width <= rect.x1; x += 1) {
        for (let z = rect.z0; z + size.depth <= rect.z1; z += 1) {
          const pose: SnapPose = { x, y: top, z, rotation }
          if (!layout.fits(device.partId, pose, ignore)) continue
          const cost = top * 2 + travel(from, centerOf(pose, part))
          if (!best || cost < best.cost - 1e-9) best = { pose, cost }
        }
      }
    }
  }
  return best?.pose ?? null
}

/**
 * Puts a part that lies beside a robot onto it, where it works: a motor on an edge of the robot's
 * plate facing out (the other side of a robot with one motor first), anything else on top.
 */
export function planPutOnRobot(input: DeriveInput, robot: Pick<DerivedCreation, 'name' | 'brickIds'>, brickId: string): FixOutcome {
  const layout = layoutOf(input)
  const device = layout.byId.get(brickId)
  const part = device ? input.partMap[device.partId] : undefined
  if (!device || !part || !isDevicePart(device.partId)) return refusal(brickId, 'nothing')
  const name = deviceName(input, device)
  const onTop = studdedOnTop(layout, device)
  if (onTop.length) return refusal(brickId, 'stacked', `Something is on top of ${name}. Take it off first.`, { blockers: onTop })
  const ignore = new Set([brickId])
  const members = robot.brickIds.filter((id) => id !== brickId).map((id) => layout.byId.get(id)).filter((brick): brick is BrickInstance => Boolean(brick))
  const from = centerOf(device, part)
  const plan = (pose: SnapPose): FixPlan => ({ ok: true, brickId, label: `Put it on ${robot.name}`, undoLabel: `Put ${name} on ${robot.name}`, done: `${name} is on ${robot.name} now.`, steps: [{ op: 'move', brickId, pose }] })
  if (roleOf(device) === 'motor') {
    const other = otherSideSpot(input, robot, ignore)
    if (other?.free) return plan(other.pose)
    const [spot] = openMotorSpots(layout, members.filter((brick) => isGroundPlate(layout, brick)), from, ignore)
    return spot ? plan(spot) : refusal(brickId, 'no-room', `There's no room for it on ${robot.name}. Try a bigger plate.`)
  }
  const spot = topSpot(layout, members, device, from, ignore)
  return spot ? plan(spot) : refusal(brickId, 'no-room', `There's no room for it on ${robot.name}.`)
}

/* ------------------------------------------------------------------ a motor away from the sides */

/** Moves a motor whose socket is over the plate (or against a part) to an edge of its plate, facing out. */
export function planMotorToSide(input: DeriveInput, motorId: string, robot?: Pick<DerivedCreation, 'brickIds'> | null): FixOutcome {
  const layout = layoutOf(input)
  const motor = layout.byId.get(motorId)
  const motorPart = input.partMap[MOTOR]
  if (!motor || roleOf(motor) !== 'motor' || !motorPart) return refusal(motorId, 'nothing')
  const name = deviceName(input, motor)
  const plate = plateUnder(layout, motor)
  if (!plate) return refusal(motorId, 'no-plate', MOTORS_GO_ON_A_PLATE)
  const onTop = studdedOnTop(layout, motor)
  if (onTop.length) return refusal(motorId, 'stacked', `Something is on top of ${name}. Take it off first.`, { blockers: onTop })
  const ignore = new Set([motorId])
  const plan = (pose: SnapPose): FixPlan => ({ ok: true, brickId: motorId, label: MOVE_TO_SIDE, undoLabel: `Move ${name} to the side`, done: `${name} is on the side now. It can take an axle.`, steps: [{ op: 'move', brickId: motorId, pose }] })
  // A lone other motor on the robot: this one goes across from it.
  const other = robot ? otherSideSpot(input, robot, ignore) : null
  if (other?.free) return plan(other.pose)
  const [spot] = openMotorSpots(layout, [plate], centerOf(motor, motorPart), ignore)
  return spot ? plan(spot) : refusal(motorId, 'no-room', 'No room on the sides of the plate. Try a bigger plate.')
}

/* ------------------------------------------------------------------ doing it in order */

/**
 * The plan's steps in an order where every step lands on a free spot as it happens (a wheel standing
 * where its motor goes moves first), or null when no order works.
 */
export function orderFixSteps(input: Pick<DeriveInput, 'bricks' | 'partMap' | 'plateSize'>, steps: readonly FixStep[]): FixStep[] | null {
  const permutations = (list: readonly FixStep[]): FixStep[][] => (list.length <= 1 ? [list.slice()] : list.flatMap((step, index) => permutations([...list.slice(0, index), ...list.slice(index + 1)]).map((rest) => [step, ...rest])))
  for (const order of permutations(steps)) {
    let bricks = input.bricks.slice()
    let ok = true
    order.forEach((step, index) => {
      if (!ok) return
      const partId = step.op === 'add' ? step.partId : bricks.find((brick) => brick.id === step.brickId)?.partId
      if (!partId || !draftIsValid({ partId, ...step.pose, color: '#000000' }, bricks, step.op === 'move' ? step.brickId : null, input.partMap, input.plateSize)) { ok = false; return }
      bricks = step.op === 'add' ? [...bricks, asBrick(`fix:${index}`, partId, step.pose)] : bricks.map((brick) => (brick.id === step.brickId ? { ...brick, ...step.pose } : brick))
    })
    if (ok) return order
  }
  return null
}

/* ------------------------------------------------------------------ a red preview says why */

export type PreviewProblem = { text: string; blockers: string[] }

export const PREVIEW_TEXT = {
  inTheWay: 'Something is in the way.',
  noRoom: 'No room on the plate. Try a bigger plate.',
  onThePlate: "It needs to sit on the robot's plate.",
  edge: 'Too close to the edge.',
} as const

/**
 * Why a robot part's ghost is red where it is, in a few words, and what is in the way (to outline).
 * Null when it can go there, or for a part that is not a robot part. `snapKind` is the connector the
 * ghost snapped to, if any (a motor snapped to a plate edge with every spot taken has no room).
 */
export function previewProblem(input: Pick<DeriveInput, 'bricks' | 'partMap' | 'plateSize'>, draft: Pick<BrickInstance, 'partId' | 'x' | 'y' | 'z' | 'rotation'>, ignoreId: string | null, snapKind: string | null = null): PreviewProblem | null {
  const part = input.partMap[draft.partId]
  if (!part || !roboticsSpec(draft.partId)) return null
  const others = ignoreId ? input.bricks.filter((brick) => brick.id !== ignoreId) : input.bricks
  if (draftIsValid({ ...draft, color: '#000000' }, others as BrickInstance[], null, input.partMap, input.plateSize)) return null
  const size = rotatedSize(part, draft.rotation)
  if (draft.x < 0 || draft.z < 0 || draft.y < 0 || draft.x + size.width > input.plateSize || draft.z + size.depth > input.plateSize) return { text: PREVIEW_TEXT.edge, blockers: [] }
  const blockers = overlappingBricks(draft, others, input.partMap)
  const ids = blockers.map((brick) => brick.id)
  if (snapKind === 'plate-edge') return { text: PREVIEW_TEXT.noRoom, blockers: ids }
  // A device sunk into a plate it should stand on.
  if (isDevicePart(draft.partId) && blockers.length && blockers.every((brick) => isPlatePart(input.partMap[brick.partId]))) return { text: PREVIEW_TEXT.onThePlate, blockers: ids }
  return { text: PREVIEW_TEXT.inTheWay, blockers: ids }
}
