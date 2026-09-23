import { draftIsValid } from '../../brick/brickRules'
import { PLATE_HEIGHT, STUD, rotatedSize } from '../../brick/parts'
import type { BrickDraft, BrickInstance, BrickPart } from '../../brick/types'
import { ROBOTICS_PART_IDS, isDevicePart, roboticsSpec } from '../parts/catalog'
import { deriveStudJoints } from './assembly'
import type { PartMap } from './grid'
import { deriveMechanisms, type Mechanisms } from './mechanism'
import {
  EDGE_OUTWARD, EDGE_ROTATION, PLATE_EDGES, connectorPose, edgeFacing, edgeSlots, isPlatePart, mirroredMotorPose, plateRect, preferredEdges, rawPose, validPose,
  type EdgeSlots, type PlateEdge, type Rect, type SnapPose,
} from './plateEdges'
import { socketCoveredBy, socketOf, socketRoomOf } from './socketRoom'
import { add, distance, scale, type Vec3 } from './vec'

// The geometry this module has always offered, now shared from `plateEdges.ts`.
export { EDGE_OUTWARD, EDGE_ROTATION, PLATE_EDGES, connectorPose, edgeSlots, isPlatePart, plateRect, preferredEdges }
export type { EdgeSlots, PlateEdge, Rect, SnapPose }

/**
 * Magnetic connections for the armed ghost (docs/robotics/KID-UX.md §S; contract §3:
 * "a wheel snaps onto a free axle end", "a motor's output face accepts one axle").
 *
 * - An **axle** snaps into a free motor socket; a **wheel** snaps onto a free axle end.
 *   The ghost snaps when the pointer is over the part it connects to, or anywhere near
 *   where the snapped part would sit (about 1.5 studs), over another brick or over the
 *   bare baseplate. When two places compete, the one nearer the pointer wins. Every pose
 *   comes from the same connector geometry the mechanism reader (`mechanism.ts`) checks,
 *   so a snapped part is connected by construction. An axle never snaps through a loose
 *   wheel's hole (kid-UX lane W): a wheel on an axle with no motor cannot spin, so that
 *   place would look connected and not be; a loose wheel gets its own one-tap fix
 *   (`wheelFix.ts`) that builds the whole chain.
 * - A **motor** hovered anywhere over a plate goes to the nearer of its long sides (a car's
 *   motors go on its sides), turned so its socket faces out over that edge, flush with it,
 *   sliding along to the nearest spot where it fits and an axle fits in its socket; the
 *   other long side when the near one is full (kid-UX lane W: a green spot always places the
 *   motor facing out). Over a part of a robot (its hub, a sensor, another motor) it goes the
 *   same way onto that robot's plate: never on top of the hub, where its wheel could not
 *   reach the ground. Over bare ground near a robot's plate it goes onto that plate's side.
 *   A plate with one motor on it pulls a motor near the spot across from it exactly there
 *   ("the other side"). With no room on either side the ghost shows where it would go, red.
 *
 * Anything else answers null and placement is the studio's own. Nothing here edits the
 * document; the scene draws the same targets (`createSnapContext`) as glowing markers.
 */

/** How near the pointer must be to where the snapped part would sit. */
export const SNAP_REACH_STUDS = 1.5
/** A motor over bare ground this near a robot's plate goes onto the plate instead. */
export const PLATE_REACH_STUDS = 3

export type SnapKind = 'socket' | 'wheel-hole' | 'axle-end' | 'plate-edge'

/** A place the armed part can connect: where it would sit and the connector it would touch. */
export type SnapTarget = {
  key: string
  kind: SnapKind
  /** The part the connection is made to: a motor, a wheel, an axle or a plate. */
  brickId: string
  /** The pointer over any of these counts as over the target (a wheel over a motor goes onto the axle in it). */
  ownerIds: string[]
  /** The connector, world units: a socket, a wheel face, an axle end, or where a motor's socket would be. */
  point: Vec3
  /** Which way the snapped part extends from the connector. */
  outward: Vec3
  pose: SnapPose
  /** The pose overlaps a brick or leaves the build plate: the ghost still snaps there (red) and a refusal names the cause. */
  blocked: boolean
}

/** A free stretch of a robot plate's edge where a motor fits, for the glowing marker. */
export type EdgeRun = {
  key: string
  plateId: string
  edge: PlateEdge
  /** The stretch on the plate's top face, world units. */
  from: Vec3
  to: Vec3
  outward: Vec3
  poses: SnapPose[]
}

export type SnapHintKind = 'needs-axle' | 'motor-on-ground'
/** No snap, but the pointer is at a connector that cannot take the part yet; the scene says why. */
export type SnapHint = { kind: SnapHintKind; brickId: string; point: Vec3 }

export type SnapFound = { pose: SnapPose; target: SnapTarget }
export type SnapOutcome = { found: SnapFound | null; hint: SnapHint | null }

/**
 * Everything the snapper derives from the bricks, computed once per document state and
 * reused across pointer moves (the studio asks on every move).
 */
export type SnapContext = {
  readonly bricks: readonly BrickInstance[]
  readonly partMap: PartMap
  readonly plateSize: number
  mechanisms(): Mechanisms
  /** Plates standing on the ground that carry a robot: a device is studded onto them, directly or through other bricks. */
  robotPlateIds(): ReadonlySet<string>
  /** The robot plate a brick is studded to, directly or through other bricks (its hub, a sensor, a motor on it). */
  robotPlateOf(brickId: string): string | null
  /** For a plate with one motor on it (at a side, facing out), where the second goes: across from it, when it fits there. */
  otherSideOf(plateId: string, motorPartId: string): SnapPose | null
  /** Sockets, holes and axle ends the part can connect to, with where it would sit. */
  connectorTargets(partId: string): readonly SnapTarget[]
  /** Free stretches of robot plates' long sides where the motor fits, facing out. */
  motorEdgeRuns(partId: string): readonly EdgeRun[]
}

export type SnapInput = {
  /** The armed part; its rotation (the student's R) settles a corner, where two edges are about as near. */
  draft: Pick<BrickDraft, 'partId'> & Partial<Pick<BrickDraft, 'rotation'>>
  /** The brick under the pointer; null over the bare baseplate. */
  hitBrick?: BrickInstance | null
  /** Where the pointer hit, world units. */
  hitPoint: Vec3
  bricks: readonly BrickInstance[]
  partMap: PartMap
  plateSize: number
  /** Reused when it was built for these bricks, parts and plate (`createSnapContext`). */
  context?: SnapContext
}

export function createSnapContext(bricks: readonly BrickInstance[], partMap: PartMap, plateSize: number): SnapContext {
  let mechanisms: Mechanisms | null = null
  let robots: RobotPlates | null = null
  const targets = new Map<string, SnapTarget[]>()
  const runs = new Map<string, EdgeRun[]>()
  const otherSides = new Map<string, SnapPose | null>()
  const plates = () => (robots ??= findRobotPlates(bricks, partMap))
  const context: SnapContext = {
    bricks,
    partMap,
    plateSize,
    mechanisms: () => (mechanisms ??= deriveMechanisms(bricks, partMap, plateSize)),
    robotPlateIds: () => plates().ids,
    robotPlateOf: (brickId) => plates().of(brickId),
    otherSideOf: (plateId, motorPartId) => {
      const key = `${plateId}:${motorPartId}`
      if (!otherSides.has(key)) otherSides.set(key, otherSideFor(context, plateId, motorPartId))
      return otherSides.get(key) ?? null
    },
    connectorTargets: (partId) => {
      let list = targets.get(partId)
      if (!list) targets.set(partId, (list = connectorTargetsFor(context, partId)))
      return list
    },
    motorEdgeRuns: (partId) => {
      let list = runs.get(partId)
      if (!list) runs.set(partId, (list = motorEdgeRunsFor(context, partId)))
      return list
    },
  }
  return context
}

/** Where the armed part snaps for this pointer, or why it cannot connect at the connector the pointer is at. */
export function findSnap(input: SnapInput): SnapOutcome {
  const { draft, hitPoint, bricks, partMap, plateSize } = input
  const hitBrick = input.hitBrick ?? null
  const spec = roboticsSpec(draft.partId)
  const part = partMap[draft.partId]
  if (!spec || !part) return { found: null, hint: null }
  const context = input.context && input.context.bricks === bricks && input.context.partMap === partMap && input.context.plateSize === plateSize
    ? input.context
    : createSnapContext(bricks, partMap, plateSize)
  if (spec.role === 'motor') return { found: findMotorSnap(context, part, hitBrick, hitPoint, draft.rotation ?? null), hint: null }
  if (!spec.axle && !spec.wheel) return { found: null, hint: null }
  const found = nearestTarget(context.connectorTargets(draft.partId), hitBrick, hitPoint, part, plateSize)
  if (found) return { found: { pose: found.pose, target: found }, hint: null }
  return { found: null, hint: hintFor(context, spec.wheel ? 'wheel' : 'axle', hitBrick, hitPoint) }
}

/** The pose alone, for callers that only place (the studio's hook and older tests). */
export function snapDraftToConnector(input: SnapInput): SnapPose | null {
  return findSnap(input).found?.pose ?? null
}

/* ------------------------------------------------------------------ connectors */

function connectorTargetsFor(context: SnapContext, partId: string): SnapTarget[] {
  const spec = roboticsSpec(partId)
  const part = context.partMap[partId]
  if (!spec || !part) return []
  const { plateSize } = context
  const mechanisms = context.mechanisms()
  const targets: SnapTarget[] = []
  const push = (target: Omit<SnapTarget, 'blocked'>) => targets.push({ ...target, blocked: !fits(context, partId, target.pose) })
  if (spec.axle) {
    // Free motor sockets only: an axle through a loose wheel's hole turns nothing (see the note above).
    for (const motor of mechanisms.motors) {
      if (motor.axleId) continue
      const pose = validPose(rawPose(part, spec.axle.center, motor.socket.point, motor.socket.normal, spec.axle.halfLength, plateSize), part, plateSize)
      if (pose) push({ key: `socket:${motor.motorId}`, kind: 'socket', brickId: motor.motorId, ownerIds: [motor.motorId], point: motor.socket.point, outward: motor.socket.normal, pose })
    }
  } else if (spec.wheel) {
    for (const axle of mechanisms.axles) {
      const holder = axle.ends.find((end) => end.motorId)?.motorId ?? null
      for (const end of axle.ends) {
        if (end.motorId || end.wheelId) continue
        const pose = validPose(rawPose(part, spec.wheel.center, end.point, end.outward, spec.wheel.halfThickness, plateSize), part, plateSize)
        if (pose) push({ key: `end:${axle.axleId}:${end.index}`, kind: 'axle-end', brickId: axle.axleId, ownerIds: holder ? [axle.axleId, holder] : [axle.axleId], point: end.point, outward: end.outward, pose })
      }
    }
  }
  return targets
}

type Ranked<T> = T & { reach: number; tie: number }

/** The target the pointer is over or nearest to, within reach; ties go to the nearer connector. */
function nearestTarget(targets: readonly SnapTarget[], hitBrick: BrickInstance | null, hitPoint: Vec3, part: BrickPart, plateSize: number): SnapTarget | null {
  let best: Ranked<{ target: SnapTarget }> | null = null
  for (const target of targets) {
    const reach = hitBrick && target.ownerIds.includes(hitBrick.id) ? 0 : distanceToBox(hitPoint, poseBox(target.pose, part, plateSize))
    if (reach > SNAP_REACH_STUDS * STUD) continue
    const tie = distance(hitPoint, target.point)
    if (!best || reach < best.reach - 1e-9 || (Math.abs(reach - best.reach) <= 1e-9 && tie < best.tie)) best = { target, reach, tie }
  }
  return best?.target ?? null
}

/**
 * A connector the part cannot take yet: a wheel at a motor with nothing in its socket
 * ("put an axle in first"), or an axle at a motor standing on the ground, whose socket is
 * one plate lower than an axle on the ground can reach ("put the motor on a plate first").
 */
function hintFor(context: SnapContext, armed: 'axle' | 'wheel', hitBrick: BrickInstance | null, hitPoint: Vec3): SnapHint | null {
  const axlePart = context.partMap[ROBOTICS_PART_IDS.axleShort]
  const axleSpec = roboticsSpec(ROBOTICS_PART_IDS.axleShort)
  if (!axlePart || !axleSpec?.axle) return null
  let best: Ranked<{ hint: SnapHint }> | null = null
  for (const motor of context.mechanisms().motors) {
    if (motor.axleId) continue
    const raw = rawPose(axlePart, axleSpec.axle.center, motor.socket.point, motor.socket.normal, axleSpec.axle.halfLength, context.plateSize)
    if (!raw) continue
    const low = raw.y < 0
    if (armed === 'axle' && !low) continue // a socket an axle can reach is a target, not a hint
    const reach = hitBrick?.id === motor.motorId ? 0 : distanceToBox(hitPoint, poseBox({ ...raw, y: Math.max(0, raw.y) }, axlePart, context.plateSize))
    if (reach > SNAP_REACH_STUDS * STUD) continue
    const tie = distance(hitPoint, motor.socket.point)
    if (!best || reach < best.reach - 1e-9 || (Math.abs(reach - best.reach) <= 1e-9 && tie < best.tie)) {
      best = { hint: { kind: low ? 'motor-on-ground' : 'needs-axle', brickId: motor.motorId, point: motor.socket.point }, reach, tie }
    }
  }
  return best?.hint ?? null
}

/* ------------------------------------------------------------------ motors on plate edges */

/** The long side of the plate nearer the pointer first (at the middle, the one the motor already faces). */
function longSidesByDistance(rect: Rect, px: number, pz: number, rotation: number | null): PlateEdge[] {
  const [low, high] = preferredEdges(rect)
  const alongX = low === 'left'
  const [middle, at] = alongX ? [(rect.x0 + rect.x1) / 2, px] : [(rect.z0 + rect.z1) / 2, pz]
  if (Math.abs(at - middle) < 1e-6) return EDGE_ROTATION[high] === rotation ? [high, low] : [low, high]
  return at < middle ? [low, high] : [high, low]
}

/**
 * A motor at `pose` fits there, and its socket is where an axle on the ground turns a wheel on the
 * ground (the motor stands on a plate lying on the ground) with room for that axle (loose wheels and
 * axles in the way don't count: they move).
 */
function openFor(context: SnapContext, motorPartId: string, pose: SnapPose): boolean {
  return fits(context, motorPartId, pose) && socketRoomOf({ id: 'snap:motor', partId: motorPartId, ...pose }, context.bricks, context.partMap, context.plateSize) === 'open'
}

/** The open slot nearest to `from` along the edge, or null when there is none. */
function nearestFreeSlot(context: SnapContext, motorId: string, slots: EdgeSlots, from: number): SnapPose | null {
  for (let step = 0; step <= slots.hi - slots.lo; step += 1) {
    for (const slot of step === 0 ? [from] : [from - step, from + step]) {
      if (slot < slots.lo || slot > slots.hi) continue
      const pose = slots.pose(slot)
      if (openFor(context, motorId, pose)) return pose
    }
  }
  return null
}

function edgeTarget(context: SnapContext, motorPart: BrickPart, plate: BrickInstance, edge: PlateEdge, pose: SnapPose, blocked: boolean): SnapTarget {
  const spec = roboticsSpec(motorPart.id)
  const size = rotatedSize(motorPart, pose.rotation)
  const origin = { x: (pose.x + size.width / 2 - context.plateSize / 2) * STUD, y: pose.y * PLATE_HEIGHT, z: (pose.z + size.depth / 2 - context.plateSize / 2) * STUD }
  const outward = EDGE_OUTWARD[edge]
  const reachOut = spec?.socket ? spec.socket.point.x : (size.width * STUD) / 2
  const point = { x: origin.x + outward.x * reachOut, y: origin.y + (spec?.socket?.point.y ?? 0), z: origin.z + outward.z * reachOut }
  return { key: `${plate.id}:${edge}`, kind: 'plate-edge', brickId: plate.id, ownerIds: [plate.id], point, outward, pose, blocked }
}

/** Motors standing on a plate (bottom on its top, footprints overlapping). */
function motorsOnPlate(context: SnapContext, plate: BrickInstance): BrickInstance[] {
  const platePart = context.partMap[plate.partId]!
  const rect = plateRect(plate, platePart)
  return context.bricks.filter((brick) => {
    const part = context.partMap[brick.partId]
    if (!part || roboticsSpec(brick.partId)?.role !== 'motor' || brick.y !== plate.y + platePart.height) return false
    const own = plateRect(brick, part)
    return own.x0 < rect.x1 && rect.x0 < own.x1 && own.z0 < rect.z1 && rect.z0 < own.z1
  })
}

/** Across from a plate's one motor (at a side, facing out), when the second fits there with room for its axle. */
function otherSideFor(context: SnapContext, plateId: string, motorPartId: string): SnapPose | null {
  const plate = context.bricks.find((brick) => brick.id === plateId)
  const platePart = plate ? context.partMap[plate.partId] : undefined
  const motorPart = context.partMap[motorPartId]
  if (!plate || !isPlatePart(platePart) || !motorPart) return null
  const motors = motorsOnPlate(context, plate)
  if (motors.length !== 1) return null
  const socket = socketOf(motors[0], context.partMap, context.plateSize)
  const covered = socketCoveredBy(motors[0], context.bricks, context.partMap, context.plateSize)
  // Only a motor at a side facing out has an "other side".
  if (!socket || Math.abs(socket.normal.y) > 0.5 || covered === null || covered.length > 0) return null
  const pose = mirroredMotorPose(motors[0], motorPart, plateRect(plate, platePart), edgeFacing(socket.normal))
  return openFor(context, motorPartId, pose) ? pose : null
}

/** The pointer is on or near the footprint `pose` would fill (within a stud and a half). */
function nearPose(pose: SnapPose, part: BrickPart, px: number, pz: number): boolean {
  const size = rotatedSize(part, pose.rotation)
  return Math.hypot(Math.max(0, pose.x - px, px - (pose.x + size.width)), Math.max(0, pose.z - pz, pz - (pose.z + size.depth))) <= SNAP_REACH_STUDS
}

/** Onto a plate's side, for this pointer: the other side of a lone motor, else the nearer long side with room, else the other. */
function motorOnPlate(context: SnapContext, motorPart: BrickPart, plate: BrickInstance, px: number, pz: number, rotation: number | null, showBlocked: boolean): SnapFound | null {
  const platePart = context.partMap[plate.partId]!
  const rect = plateRect(plate, platePart)
  const across = context.otherSideOf(plate.id, motorPart.id)
  if (across && nearPose(across, motorPart, px, pz)) return { pose: across, target: edgeTarget(context, motorPart, plate, edgeOfRotation(across.rotation), across, false) }
  const edges = longSidesByDistance(rect, Math.min(rect.x1, Math.max(rect.x0, px)), Math.min(rect.z1, Math.max(rect.z0, pz)), rotation)
  for (const edge of edges) {
    const slots = edgeSlots(plate, platePart, motorPart, edge)
    const pose = nearestFreeSlot(context, motorPart.id, slots, slots.slotOf(px, pz))
    if (pose) return { pose, target: edgeTarget(context, motorPart, plate, edge, pose, false) }
  }
  if (!showBlocked) return null
  // No room on either side: show where it would go (red) so the refusal can say what is in the way.
  const slots = edgeSlots(plate, platePart, motorPart, edges[0])
  const pose = slots.pose(slots.slotOf(px, pz))
  return { pose, target: edgeTarget(context, motorPart, plate, edges[0], pose, true) }
}

const edgeOfRotation = (rotation: number): PlateEdge => PLATE_EDGES.find((edge) => EDGE_ROTATION[edge] === rotation) ?? 'right'

function findMotorSnap(context: SnapContext, motorPart: BrickPart, hitBrick: BrickInstance | null, hitPoint: Vec3, rotation: number | null): SnapFound | null {
  const px = hitPoint.x / STUD + context.plateSize / 2
  const pz = hitPoint.z / STUD + context.plateSize / 2
  const hitPart = hitBrick ? context.partMap[hitBrick.partId] : undefined
  // Over a plate: onto one of its long sides, facing out (a robot's plate stacked on its chassis: onto the chassis).
  if (hitBrick && isPlatePart(hitPart)) {
    const chassisId = hitBrick.y > 0 ? context.robotPlateOf(hitBrick.id) : null
    const plate = (chassisId ? context.bricks.find((brick) => brick.id === chassisId) : null) ?? hitBrick
    return motorOnPlate(context, motorPart, plate, px, pz, rotation, true)
  }
  const role = hitBrick ? roboticsSpec(hitBrick.partId)?.role : undefined
  if (hitBrick && role !== 'axle' && role !== 'wheel') {
    // Over a robot's hub, sensor or motor: onto that robot's plate, never on top of it. Anything else is the studio's.
    const plateId = context.robotPlateOf(hitBrick.id)
    const plate = plateId ? context.bricks.find((brick) => brick.id === plateId) : undefined
    return plate ? motorOnPlate(context, motorPart, plate, px, pz, rotation, true) : null
  }
  // Over bare ground (or a loose axle or wheel, which cannot carry it): onto the nearest robot plate within reach.
  const plates = [...context.robotPlateIds()]
    .map((id) => context.bricks.find((brick) => brick.id === id)!)
    .map((plate) => {
      const rect = plateRect(plate, context.partMap[plate.partId]!)
      return { plate, rect, d: Math.hypot(Math.max(0, rect.x0 - px, px - rect.x1), Math.max(0, rect.z0 - pz, pz - rect.z1)) }
    })
    .filter((entry) => entry.d <= PLATE_REACH_STUDS)
    .sort((a, b) => a.d - b.d)
  for (const { plate } of plates) {
    const found = motorOnPlate(context, motorPart, plate, px, pz, rotation, false)
    if (found) return found
  }
  return null
}

/** Every spot along any edge of this plate where a motor fits, facing out (for "is there room on the plate?"). */
export function freeMotorSpots(context: SnapContext, plateId: string, motorPartId: string = ROBOTICS_PART_IDS.motor): SnapPose[] {
  const plate = context.bricks.find((brick) => brick.id === plateId)
  const platePart = plate ? context.partMap[plate.partId] : undefined
  const motorPart = context.partMap[motorPartId]
  if (!plate || !isPlatePart(platePart) || !motorPart) return []
  const spots: SnapPose[] = []
  for (const edge of PLATE_EDGES) {
    const slots = edgeSlots(plate, platePart, motorPart, edge)
    for (let slot = slots.lo; slot <= slots.hi; slot += 1) {
      const pose = slots.pose(slot)
      if (fits(context, motorPartId, pose)) spots.push(pose)
    }
  }
  return spots
}

function motorEdgeRunsFor(context: SnapContext, partId: string): EdgeRun[] {
  const motorPart = context.partMap[partId]
  if (!motorPart || roboticsSpec(partId)?.role !== 'motor') return []
  const runs: EdgeRun[] = []
  for (const id of context.robotPlateIds()) {
    const plate = context.bricks.find((brick) => brick.id === id)
    const platePart = plate ? context.partMap[plate.partId] : undefined
    if (!plate || !platePart) continue
    for (const edge of preferredEdges(plateRect(plate, platePart))) {
      const slots = edgeSlots(plate, platePart, motorPart, edge)
      let current: SnapPose[] = []
      const flush = () => {
        if (!current.length) return
        runs.push(runFor(context, plate, platePart, motorPart, edge, current))
        current = []
      }
      for (let slot = slots.lo; slot <= slots.hi; slot += 1) {
        const pose = slots.pose(slot)
        if (openFor(context, partId, pose)) current.push(pose)
        else flush()
      }
      flush()
    }
  }
  return runs
}

function runFor(context: SnapContext, plate: BrickInstance, platePart: BrickPart, motorPart: BrickPart, edge: PlateEdge, poses: SnapPose[]): EdgeRun {
  const rect = plateRect(plate, platePart)
  const size = rotatedSize(motorPart, EDGE_ROTATION[edge])
  const top = (plate.y + platePart.height) * PLATE_HEIGHT
  const world = (x: number, z: number): Vec3 => ({ x: (x - context.plateSize / 2) * STUD, y: top, z: (z - context.plateSize / 2) * STUD })
  const first = poses[0]
  const last = poses[poses.length - 1]
  const [from, to] = edge === 'left' ? [world(rect.x0, first.z), world(rect.x0, last.z + size.depth)]
    : edge === 'right' ? [world(rect.x1, first.z), world(rect.x1, last.z + size.depth)]
      : edge === 'far' ? [world(first.x, rect.z0), world(last.x + size.width, rect.z0)]
        : [world(first.x, rect.z1), world(last.x + size.width, rect.z1)]
  return { key: `${plate.id}:${edge}`, plateId: plate.id, edge, from, to, outward: EDGE_OUTWARD[edge], poses }
}

type RobotPlates = { ids: Set<string>; of: (brickId: string) => string | null }

/** Plates on the ground whose studded-together bricks include a device: the robots' chassis plates. */
function findRobotPlates(bricks: readonly BrickInstance[], partMap: PartMap): RobotPlates {
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    let root = id
    while (parent.has(root) && parent.get(root) !== root) root = parent.get(root)!
    parent.set(id, root)
    return root
  }
  for (const joint of deriveStudJoints(bricks, partMap)) {
    if (!joint.lowerBrickId) continue
    const a = find(joint.lowerBrickId)
    const b = find(joint.upperBrickId)
    if (a !== b) parent.set(a, b)
  }
  const robots = new Set(bricks.filter((brick) => isDevicePart(brick.partId)).map((brick) => find(brick.id)))
  const plates = bricks.filter((brick) => brick.y === 0 && isPlatePart(partMap[brick.partId]) && robots.has(find(brick.id)))
  const byRoot = new Map<string, string>()
  for (const plate of plates) if (!byRoot.has(find(plate.id))) byRoot.set(find(plate.id), plate.id)
  return { ids: new Set(plates.map((plate) => plate.id)), of: (brickId) => byRoot.get(find(brickId)) ?? null }
}

/* ------------------------------------------------------------------ geometry */

function fits(context: SnapContext, partId: string, pose: SnapPose): boolean {
  return draftIsValid({ partId, x: pose.x, y: pose.y, z: pose.z, rotation: pose.rotation, color: '#000000' }, context.bricks as BrickInstance[], null, context.partMap, context.plateSize)
}

/** The world box a part at `pose` fills. */
function poseBox(pose: SnapPose, part: BrickPart, plateSize: number): { min: Vec3; max: Vec3 } {
  const size = rotatedSize(part, pose.rotation)
  return {
    min: { x: (pose.x - plateSize / 2) * STUD, y: pose.y * PLATE_HEIGHT, z: (pose.z - plateSize / 2) * STUD },
    max: { x: (pose.x + size.width - plateSize / 2) * STUD, y: (pose.y + part.height) * PLATE_HEIGHT, z: (pose.z + size.depth - plateSize / 2) * STUD },
  }
}

function distanceToBox(point: Vec3, box: { min: Vec3; max: Vec3 }): number {
  return Math.hypot(
    Math.max(0, box.min.x - point.x, point.x - box.max.x),
    Math.max(0, box.min.y - point.y, point.y - box.max.y),
    Math.max(0, box.min.z - point.z, point.z - box.max.z),
  )
}

