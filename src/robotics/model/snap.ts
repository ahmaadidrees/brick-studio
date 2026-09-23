import { draftIsValid } from '../../brick/brickRules'
import { PLATE_HEIGHT, STUD, rotatedSize } from '../../brick/parts'
import type { BrickDraft, BrickInstance, BrickPart } from '../../brick/types'
import { ROBOTICS_PART_IDS, isDevicePart, roboticsSpec } from '../parts/catalog'
import { deriveStudJoints } from './assembly'
import type { PartMap } from './grid'
import { deriveMechanisms, type Mechanisms } from './mechanism'
import { add, distance, scale, type Vec3 } from './vec'

/**
 * Magnetic connections for the armed ghost (docs/robotics/KID-UX.md §S; contract §3:
 * "a wheel snaps onto a free axle end", "a motor's output face accepts one axle").
 *
 * - An **axle** snaps into a free motor socket or through a loose wheel's hole; a
 *   **wheel** snaps onto a free axle end. The ghost snaps when the pointer is over the
 *   part it connects to, or anywhere near where the snapped part would sit (about 1.5
 *   studs), over another brick or over the bare baseplate. When two places compete, the
 *   one nearer the pointer wins. Every pose comes from the same connector geometry the
 *   mechanism reader (`mechanism.ts`) checks, so a snapped part is connected by
 *   construction.
 * - A **motor** hovered over a plate near one of its edges turns so its socket faces out
 *   over that edge and sits flush with it, sliding along the edge to the nearest spot with
 *   room; at a corner the student's own turn (R) picks between the two edges, and away from
 *   edges it stands as turned. Over bare ground near a robot's plate it goes onto that
 *   plate's edge instead, where there is room.
 *
 * Anything else answers null and placement is the studio's own. Nothing here edits the
 * document; the scene draws the same targets (`createSnapContext`) as glowing markers.
 */
export type SnapPose = { x: number; y: number; z: number; rotation: 0 | 1 | 2 | 3 }

/** How near the pointer must be to where the snapped part would sit. */
export const SNAP_REACH_STUDS = 1.5
/** A motor over a plate this near one of its edges turns to face out over it. */
export const EDGE_REACH_STUDS = 2
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

export type PlateEdge = 'left' | 'right' | 'far' | 'near'
export const PLATE_EDGES: readonly PlateEdge[] = ['left', 'right', 'far', 'near']
/** Quarter turns that face a motor's socket out over each edge (rotation 0 faces +X, the right). */
export const EDGE_ROTATION: Readonly<Record<PlateEdge, 0 | 1 | 2 | 3>> = { right: 0, far: 1, left: 2, near: 3 }
export const EDGE_OUTWARD: Readonly<Record<PlateEdge, Vec3>> = {
  right: { x: 1, y: 0, z: 0 }, far: { x: 0, y: 0, z: -1 }, left: { x: -1, y: 0, z: 0 }, near: { x: 0, y: 0, z: 1 },
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

const isPlatePart = (part: BrickPart | undefined): part is BrickPart => part?.kind === 'plate'

export function createSnapContext(bricks: readonly BrickInstance[], partMap: PartMap, plateSize: number): SnapContext {
  let mechanisms: Mechanisms | null = null
  let robotPlates: Set<string> | null = null
  const targets = new Map<string, SnapTarget[]>()
  const runs = new Map<string, EdgeRun[]>()
  const context: SnapContext = {
    bricks,
    partMap,
    plateSize,
    mechanisms: () => (mechanisms ??= deriveMechanisms(bricks, partMap, plateSize)),
    robotPlateIds: () => (robotPlates ??= findRobotPlates(bricks, partMap)),
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
    for (const motor of mechanisms.motors) {
      if (motor.axleId) continue
      const pose = validPose(rawPose(part, spec.axle.center, motor.socket.point, motor.socket.normal, spec.axle.halfLength, plateSize), part, plateSize)
      if (pose) push({ key: `socket:${motor.motorId}`, kind: 'socket', brickId: motor.motorId, ownerIds: [motor.motorId], point: motor.socket.point, outward: motor.socket.normal, pose })
    }
    for (const wheel of mechanisms.wheels) {
      if (wheel.axleId) continue
      for (const sign of [1, -1] as const) {
        const outward = scale(wheel.axis, sign)
        const face = add(wheel.center, scale(outward, wheel.halfThickness))
        const pose = validPose(rawPose(part, spec.axle.center, face, outward, spec.axle.halfLength, plateSize), part, plateSize)
        if (pose) push({ key: `hole:${wheel.wheelId}:${sign > 0 ? 'a' : 'b'}`, kind: 'wheel-hole', brickId: wheel.wheelId, ownerIds: [wheel.wheelId], point: face, outward, pose })
      }
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

type Rect = { x0: number; x1: number; z0: number; z1: number }

function plateRect(plate: BrickInstance, part: BrickPart): Rect {
  const size = rotatedSize(part, plate.rotation)
  return { x0: plate.x, x1: plate.x + size.width, z0: plate.z, z1: plate.z + size.depth }
}

/** Long sides first: a car's motors go on its long sides (on a square plate, left and right). */
function preferredEdges(rect: Rect): readonly PlateEdge[] {
  return rect.x1 - rect.x0 > rect.z1 - rect.z0 ? ['far', 'near'] : ['left', 'right']
}

/** Studs from a point (plate grid units) to an edge segment of the rectangle. */
function edgeDistance(rect: Rect, px: number, pz: number, edge: PlateEdge): number {
  const alongX = Math.max(0, rect.x0 - px, px - rect.x1)
  const alongZ = Math.max(0, rect.z0 - pz, pz - rect.z1)
  switch (edge) {
    case 'left': return Math.hypot(px - rect.x0, alongZ)
    case 'right': return Math.hypot(rect.x1 - px, alongZ)
    case 'far': return Math.hypot(pz - rect.z0, alongX)
    case 'near': return Math.hypot(rect.z1 - pz, alongX)
  }
}

/**
 * Edges within reach, nearest first. At a corner, where two edges are about as near, the
 * student's own turn decides (the edge the motor already faces, within three quarters of a
 * stud), and after that the long sides (within a quarter stud).
 */
function edgesByDistance(rect: Rect, px: number, pz: number, reach: number, rotation: number | null): PlateEdge[] {
  const preferred = preferredEdges(rect)
  return PLATE_EDGES
    .map((edge) => ({ edge, d: edgeDistance(rect, px, pz, edge) }))
    .filter((entry) => entry.d <= reach)
    .map((entry) => ({ ...entry, score: entry.d - (EDGE_ROTATION[entry.edge] === rotation ? 0.75 : 0) - (preferred.includes(entry.edge) ? 0.25 : 0) }))
    .sort((a, b) => a.score - b.score || a.d - b.d)
    .map((entry) => entry.edge)
}

type EdgeSlots = { rotation: 0 | 1 | 2 | 3; y: number; lo: number; hi: number; pose: (slot: number) => SnapPose; slotOf: (px: number, pz: number) => number }

/** Where a motor can sit flush along an edge: one grid slot per stud along it. */
function edgeSlots(plate: BrickInstance, platePart: BrickPart, motorPart: BrickPart, edge: PlateEdge): EdgeSlots {
  const rect = plateRect(plate, platePart)
  const rotation = EDGE_ROTATION[edge]
  const size = rotatedSize(motorPart, rotation)
  const y = plate.y + platePart.height
  const alongZ = edge === 'left' || edge === 'right'
  const x = edge === 'left' ? rect.x0 : rect.x1 - size.width
  const z = edge === 'far' ? rect.z0 : rect.z1 - size.depth
  // A plate narrower than the motor: it overhangs both ends, still studded onto the plate.
  const [lo, hi] = alongZ ? [rect.z0, rect.z1 - size.depth].sort((a, b) => a - b) : [rect.x0, rect.x1 - size.width].sort((a, b) => a - b)
  return {
    rotation,
    y,
    lo,
    hi,
    pose: (slot) => (alongZ ? { x, y, z: slot, rotation } : { x: slot, y, z, rotation }),
    slotOf: (px, pz) => Math.min(hi, Math.max(lo, Math.round(alongZ ? pz - size.depth / 2 : px - size.width / 2))),
  }
}

/** The free slot nearest to `from` along the edge, or null when the whole edge is taken. */
function nearestFreeSlot(context: SnapContext, motorId: string, slots: EdgeSlots, from: number): SnapPose | null {
  for (let step = 0; step <= slots.hi - slots.lo; step += 1) {
    for (const slot of step === 0 ? [from] : [from - step, from + step]) {
      if (slot < slots.lo || slot > slots.hi) continue
      const pose = slots.pose(slot)
      if (fits(context, motorId, pose)) return pose
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

function findMotorSnap(context: SnapContext, motorPart: BrickPart, hitBrick: BrickInstance | null, hitPoint: Vec3, rotation: number | null): SnapFound | null {
  const px = hitPoint.x / STUD + context.plateSize / 2
  const pz = hitPoint.z / STUD + context.plateSize / 2
  const hitPart = hitBrick ? context.partMap[hitBrick.partId] : undefined
  if (hitBrick && isPlatePart(hitPart)) {
    // Over a plate: near an edge the motor faces out over it, sliding along to the nearest spot with room.
    const rect = plateRect(hitBrick, hitPart)
    const edges = edgesByDistance(rect, Math.min(rect.x1, Math.max(rect.x0, px)), Math.min(rect.z1, Math.max(rect.z0, pz)), EDGE_REACH_STUDS, rotation)
    for (const edge of edges) {
      const slots = edgeSlots(hitBrick, hitPart, motorPart, edge)
      const pose = nearestFreeSlot(context, motorPart.id, slots, slots.slotOf(px, pz))
      if (pose) return { pose, target: edgeTarget(context, motorPart, hitBrick, edge, pose, false) }
    }
    if (!edges.length) return null
    // Every spot along the nearest edge is taken: show where it would go (red) so the refusal can say what is in the way.
    const slots = edgeSlots(hitBrick, hitPart, motorPart, edges[0])
    const pose = slots.pose(slots.slotOf(px, pz))
    return { pose, target: edgeTarget(context, motorPart, hitBrick, edges[0], pose, true) }
  }
  // Over bare ground (or a loose axle or wheel, which cannot carry it): onto the nearest robot plate within reach.
  const role = hitBrick ? roboticsSpec(hitBrick.partId)?.role : undefined
  if (hitBrick && role !== 'axle' && role !== 'wheel') return null
  const plates = [...context.robotPlateIds()]
    .map((id) => context.bricks.find((brick) => brick.id === id)!)
    .map((plate) => {
      const rect = plateRect(plate, context.partMap[plate.partId]!)
      return { plate, rect, d: Math.hypot(Math.max(0, rect.x0 - px, px - rect.x1), Math.max(0, rect.z0 - pz, pz - rect.z1)) }
    })
    .filter((entry) => entry.d <= PLATE_REACH_STUDS)
    .sort((a, b) => a.d - b.d)
  for (const { plate, rect } of plates) {
    for (const edge of edgesByDistance(rect, px, pz, PLATE_REACH_STUDS, rotation)) {
      const slots = edgeSlots(plate, context.partMap[plate.partId]!, motorPart, edge)
      const pose = nearestFreeSlot(context, motorPart.id, slots, slots.slotOf(px, pz))
      if (pose) return { pose, target: edgeTarget(context, motorPart, plate, edge, pose, false) }
    }
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
        if (fits(context, partId, pose)) current.push(pose)
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

/** Plates on the ground whose studded-together bricks include a device: the robots' chassis plates. */
function findRobotPlates(bricks: readonly BrickInstance[], partMap: PartMap): Set<string> {
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
  return new Set(bricks.filter((brick) => brick.y === 0 && isPlatePart(partMap[brick.partId]) && robots.has(find(brick.id))).map((brick) => brick.id))
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

const onGrid = (value: number) => Math.abs(value - Math.round(value)) < 1e-6

/**
 * Grid pose whose connector (running along the part's local X through `localCenter`)
 * touches `point` with the body extending `reach` along `outward`. Both connectors are
 * centred on their footprint, so a quarter turn only swaps the axis; a vertical connector
 * has no stud-grid pose and answers null. The pose may lie below the ground or off the
 * plate (`validPose` says whether it can be placed).
 */
function rawPose(part: BrickPart, localCenter: Vec3, point: Vec3, outward: Vec3, reach: number, plateSize: number): SnapPose | null {
  const rotation: 0 | 1 | null = Math.abs(outward.x) > 0.5 ? 0 : Math.abs(outward.z) > 0.5 ? 1 : null
  if (rotation === null) return null
  const center = add(point, scale(outward, reach))
  const size = rotatedSize(part, rotation)
  const x = center.x / STUD + plateSize / 2 - size.width / 2
  const z = center.z / STUD + plateSize / 2 - size.depth / 2
  const y = (center.y - localCenter.y) / PLATE_HEIGHT
  if (!onGrid(x) || !onGrid(y) || !onGrid(z)) return null
  return { x: Math.round(x), y: Math.round(y), z: Math.round(z), rotation }
}

function validPose(pose: SnapPose | null, part: BrickPart, plateSize: number): SnapPose | null {
  if (!pose) return null
  const size = rotatedSize(part, pose.rotation)
  if (pose.y < 0 || pose.x < 0 || pose.z < 0 || pose.x + size.width > plateSize || pose.z + size.depth > plateSize) return null
  return pose
}
