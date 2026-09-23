import type { BrickInstance } from '../../brick/types'
import { ROLE_LABELS, roboticsSpec, type HubPort, type RoboticsPartRole } from '../parts/catalog'
import { WORLD_NODE, brickIdOfNode, deriveStudJoints, type StudJoint } from './assembly'
import { deriveBodies, type RigidBody } from './bodies'
import { connectionOf } from './control'
import { brickFrame, toWorldDirection, type PartMap } from './grid'
import { deriveMechanisms, wheelsOnMotor, type Mechanisms } from './mechanism'
import type { RoboticsCreation, RoboticsSection, TestSpace } from './section'
import { cross, dot, type Vec3 } from './vec'

/**
 * Creations (contract §2, §4): a name over a set of bodies. Membership follows
 * assembly and mechanism links from the bricks the student named; a brick reachable
 * only through a cable is not part of it, and the build plate never joins two
 * creations. Everything here is derived on read from the bricks and the section;
 * the card reports it and edits nothing.
 */
export type DeriveInput = {
  bricks: readonly BrickInstance[]
  partMap: PartMap
  plateSize: number
  section: RoboticsSection
}

export type CreationKind = 'rover' | 'gate' | 'signal' | 'creation'

export type FacingWord = 'forward' | 'backward' | 'left' | 'right' | 'the far side' | 'the near side' | 'up' | 'down'

export type DerivedPort = { hubId: string; port: HubPort } | null

export type DerivedDevice = {
  brickId: string
  role: RoboticsPartRole
  name: string
  port: DerivedPort
  /** False for every device but the hub when it has no cable. */
  plugged: boolean
}

export type DerivedMotor = DerivedDevice & {
  socketNormal: Vec3
  /** Where an axle end goes in (world units): with the normal it tells a motor facing out from one facing in. */
  socketPoint: Vec3
  axleId: string | null
  wheelIds: string[]
  /** Which way the body goes when this motor runs at positive power, relative to the creation's forward. */
  drives: 'forward' | 'backward' | 'sideways' | null
}

export type DerivedWheel = {
  brickId: string
  onAxle: boolean
  axleId: string | null
  motorId: string | null
  /** Why it is decorative, when it is. */
  note: string | null
}

export type DerivedHinge = DerivedDevice & {
  baseBodyId: string | null
  armBodyId: string | null
  /** True when the arm is built into the frame: both sides are one body. */
  locked: boolean
  /** The joints that bridge the arm to the base when it is locked. */
  bridging: StudJoint[]
  armBrickIds: string[]
}

export type DerivedSensor = DerivedDevice & { normal: Vec3; facing: FacingWord }

export type DrivePair = { leftId: string; rightId: string; reversedIds: string[]; forward: Vec3 }

export type DerivedCreation = {
  id: string
  name: string
  kind: CreationKind
  testSpace: TestSpace
  /** True when the record is stored in the section (false for a candidate the card previews). */
  saved: boolean
  brickIds: string[]
  bodies: RigidBody[]
  armBodyIds: string[]
  hubs: DerivedDevice[]
  motors: DerivedMotor[]
  hinges: DerivedHinge[]
  sensors: DerivedSensor[]
  lights: DerivedDevice[]
  buttons: DerivedDevice[]
  seats: string[]
  axles: { brickId: string; motorId: string | null; wheelIds: string[] }[]
  wheels: DerivedWheel[]
  drivePair: DrivePair | null
  /** True when one of its bricks is a plate lying on the ground: motors standing on it reach the ground with their wheels. */
  onPlate: boolean
  /** Which way it would drive: the drive pair's forward, or, with a wheel missing, the forward its motors' axles give. */
  driveForward: Vec3 | null
  lines: { attached: string; parts: string; ready: string }
}

type Derivation = {
  input: DeriveInput
  bricksById: Map<string, BrickInstance>
  joints: StudJoint[]
  mechanisms: Mechanisms
  neighbours: Map<string, Set<string>>
}

const UP: Vec3 = { x: 0, y: 1, z: 0 }

function prepare(input: DeriveInput): Derivation {
  const joints = deriveStudJoints(input.bricks, input.partMap)
  const mechanisms = deriveMechanisms(input.bricks, input.partMap, input.plateSize)
  const neighbours = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (!neighbours.has(a)) neighbours.set(a, new Set())
    if (!neighbours.has(b)) neighbours.set(b, new Set())
    neighbours.get(a)!.add(b)
    neighbours.get(b)!.add(a)
  }
  for (const brick of input.bricks) if (!neighbours.has(brick.id)) neighbours.set(brick.id, new Set())
  for (const joint of joints) if (joint.lower !== WORLD_NODE && joint.lowerBrickId) link(joint.lowerBrickId, joint.upperBrickId)
  for (const motor of mechanisms.motors) if (motor.axleId) link(motor.motorId, motor.axleId)
  for (const axle of mechanisms.axles) for (const end of axle.ends) if (end.wheelId) link(axle.axleId, end.wheelId)
  return { input, bricksById: new Map(input.bricks.map((brick) => [brick.id, brick])), joints, mechanisms, neighbours }
}

function reachable(derivation: Derivation, seeds: readonly string[]): string[] {
  const seen = new Set<string>()
  const queue = seeds.filter((id) => derivation.bricksById.has(id))
  for (const id of queue) seen.add(id)
  while (queue.length) {
    const id = queue.shift()!
    for (const next of derivation.neighbours.get(id) ?? []) {
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return [...seen].sort((a, b) => derivation.input.bricks.findIndex((brick) => brick.id === a) - derivation.input.bricks.findIndex((brick) => brick.id === b))
}

/** The bricks a device would join: everything attached to it by studs, axles and wheels. */
export function creationComponent(input: DeriveInput, brickId: string): string[] {
  return reachable(prepare(input), [brickId])
}

/**
 * Only a brick that attaches by studs can anchor a creation. Axles and wheels join
 * through mechanism links alone, so a wheel left lying beside the buggy is not the
 * buggy's, even if the student named the buggy while it was on its axle.
 */
export function isAnchorableBrick(brick: BrickInstance, partMap: PartMap): boolean {
  const part = partMap[brick.partId]
  if (!part) return false
  const spec = roboticsSpec(brick.partId)
  return !spec || spec.studsTop || spec.tubesBottom
}

export function anchorableBrickIds(input: Pick<DeriveInput, 'bricks' | 'partMap'>, brickIds: readonly string[]): string[] {
  const byId = new Map(input.bricks.map((brick) => [brick.id, brick]))
  return brickIds.filter((id) => { const brick = byId.get(id); return brick ? isAnchorableBrick(brick, input.partMap) : true })
}

const facingFromNormal = (normal: Vec3, forward: Vec3 | null): FacingWord => {
  if (Math.abs(normal.y) > 0.5) return normal.y > 0 ? 'up' : 'down'
  if (forward) {
    const left = cross(UP, forward)
    if (dot(normal, forward) > 0.5) return 'forward'
    if (dot(normal, forward) < -0.5) return 'backward'
    return dot(normal, left) > 0 ? 'left' : 'right'
  }
  if (Math.abs(normal.z) > 0.5) return normal.z < 0 ? 'the far side' : 'the near side'
  return normal.x < 0 ? 'left' : 'right'
}

/** Default names read off the build; the section's `devices` override them. */
export function defaultDeviceName(brick: BrickInstance, input: Pick<DeriveInput, 'partMap' | 'plateSize'>): string {
  const spec = roboticsSpec(brick.partId)
  const part = input.partMap[brick.partId]
  if (!spec || !part) return 'Part'
  const frame = brickFrame(brick, part, input.plateSize)
  const side = (normal: Vec3) => {
    const facing = facingFromNormal(normal, null)
    return facing === 'the far side' ? 'Front' : facing === 'the near side' ? 'Back' : facing === 'left' ? 'Left' : facing === 'right' ? 'Right' : ''
  }
  switch (spec.role) {
    case 'motor': return `${side(toWorldDirection(frame, spec.socket!.normal)) || 'Drive'} motor`
    case 'hinge-motor': return 'Arm motor'
    case 'distance-sensor': return `${side(toWorldDirection(frame, spec.sensor!.normal)) || 'Distance'} sensor`
    case 'hub': return 'Hub'
    case 'light': return 'Light'
    case 'button': return 'Button'
    default: return part.name
  }
}

export function deviceName(input: DeriveInput, brick: BrickInstance): string {
  return input.section.devices[brick.id]?.name ?? defaultDeviceName(brick, input)
}

function devicePort(input: DeriveInput, brickId: string): DerivedPort {
  const connection = connectionOf(input.section, brickId)
  return connection && input.bricks.some((brick) => brick.id === connection.hubId) ? { hubId: connection.hubId, port: connection.port } : null
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function defaultTestSpace(kind: CreationKind): TestSpace {
  return kind === 'rover' ? 'testPlate' : 'myWorld'
}

function deriveOne(derivation: Derivation, record: RoboticsCreation, saved: boolean): DerivedCreation {
  const { input, mechanisms, joints, bricksById } = derivation
  const brickIds = reachable(derivation, anchorableBrickIds(input, record.anchorBrickIds))
  const members = new Set(brickIds)
  const device = (brick: BrickInstance, role: RoboticsPartRole): DerivedDevice => {
    const port = devicePort(input, brick.id)
    return { brickId: brick.id, role, name: deviceName(input, brick), port, plugged: role === 'hub' ? true : port !== null }
  }
  const hubs: DerivedDevice[] = []
  const lights: DerivedDevice[] = []
  const buttons: DerivedDevice[] = []
  const seats: string[] = []
  const motors: DerivedMotor[] = []
  const hinges: DerivedHinge[] = []
  const sensors: DerivedSensor[] = []
  const axles: DerivedCreation['axles'] = []
  const wheels: DerivedWheel[] = []

  for (const id of brickIds) {
    const brick = bricksById.get(id)!
    const spec = roboticsSpec(brick.partId)
    if (!spec) continue
    switch (spec.role) {
      case 'hub': hubs.push(device(brick, 'hub')); break
      case 'light': lights.push(device(brick, 'light')); break
      case 'button': buttons.push(device(brick, 'button')); break
      case 'seat': seats.push(brick.id); break
      case 'motor': {
        const link = mechanisms.motorById.get(brick.id)!
        motors.push({ ...device(brick, 'motor'), socketNormal: link.socket.normal, socketPoint: link.socket.point, axleId: link.axleId, wheelIds: wheelsOnMotor(mechanisms, brick.id).map((wheel) => wheel.wheelId), drives: null })
        break
      }
      case 'distance-sensor': {
        const link = mechanisms.sensors.find((sensor) => sensor.sensorId === brick.id)!
        sensors.push({ ...device(brick, 'distance-sensor'), normal: link.normal, facing: 'the far side' })
        break
      }
      case 'axle': {
        const link = mechanisms.axleById.get(brick.id)!
        axles.push({ brickId: brick.id, motorId: link.ends.find((end) => end.motorId)?.motorId ?? null, wheelIds: link.ends.flatMap((end) => (end.wheelId ? [end.wheelId] : [])) })
        break
      }
      case 'wheel': {
        const link = mechanisms.wheelById.get(brick.id)!
        const motorId = link.axleId ? mechanisms.axleById.get(link.axleId)!.ends.find((end) => end.motorId)?.motorId ?? null : null
        let note: string | null = null
        if (!link.axleId) {
          note = 'Not on an axle'
          if (link.nearest) {
            const gap = link.nearest.gap
            const plates = Math.round(Math.abs(gap.y) / 0.18)
            if (plates > 0 && Math.hypot(gap.x, gap.z) < 1e-3) note += ` · the nearest axle end is ${plates} plate${plates === 1 ? '' : 's'} ${gap.y > 0 ? 'higher' : 'lower'}`
          }
        }
        wheels.push({ brickId: brick.id, onAxle: Boolean(link.axleId), axleId: link.axleId, motorId, note })
        break
      }
      case 'hinge-motor':
        break // needs bodies; filled in below
    }
  }

  // A wheel that nearly reaches one of this creation's axle ends is not attached, so it is not a
  // member, but it is the student's wheel: the card lists it as "Not on an axle" beside the others.
  for (const link of mechanisms.wheels) {
    if (members.has(link.wheelId) || link.axleId || !link.nearest || !members.has(link.nearest.axleId)) continue
    const gap = link.nearest.gap
    const platesOff = Math.round(Math.abs(gap.y) / 0.18)
    const studsOff = Math.round(Math.hypot(gap.x, gap.z) / 0.62 * 2) / 2
    const where = platesOff > 0 && studsOff === 0 ? `${platesOff} plate${platesOff === 1 ? '' : 's'} ${gap.y > 0 ? 'higher' : 'lower'}` : studsOff > 0 ? `${studsOff} stud${studsOff === 1 ? '' : 's'} away` : null
    wheels.push({ brickId: link.wheelId, onAxle: false, axleId: null, motorId: null, note: `Not on an axle${where ? ` · the nearest axle end is ${where}` : ''}` })
  }

  // Drive pair (contract §6): two motors with wheels whose axles are parallel.
  let drivePair: DrivePair | null = null
  const driven = motors.filter((motor) => motor.wheelIds.length > 0)
  for (let i = 0; i < driven.length && !drivePair; i += 1) {
    for (let j = i + 1; j < driven.length && !drivePair; j += 1) {
      const a = driven[i]
      const b = driven[j]
      if (Math.abs(dot(a.socketNormal, b.socketNormal)) < 0.999) continue
      const axleAxis = a.socketNormal
      const sensorForward = sensors.map((sensor) => sensor.normal).find((normal) => Math.abs(dot(normal, axleAxis)) < 0.01 && Math.abs(normal.y) < 0.5)
      const forward = sensorForward ?? (Math.abs(axleAxis.x) > 0.5 ? { x: 0, y: 0, z: -1 } : { x: -1, y: 0, z: 0 })
      const left = cross(UP, forward)
      const leftMotor = dot(a.socketNormal, left) >= dot(b.socketNormal, left) ? a : b
      const rightMotor = leftMotor === a ? b : a
      const reversedIds = [a, b].filter((motor) => dot(cross(motor.socketNormal, UP), forward) < 0).map((motor) => motor.brickId)
      drivePair = { leftId: leftMotor.brickId, rightId: rightMotor.brickId, reversedIds, forward }
    }
  }
  // The shape of a rover without its wheels: two motors with axles whose sockets line up. A rover
  // that loses a wheel stays a rover (same run space, same wall ahead); only driving it needs the pair.
  let driveForward: Vec3 | null = drivePair?.forward ?? null
  if (!driveForward) {
    const axled = motors.filter((motor) => motor.axleId)
    for (let i = 0; i < axled.length && !driveForward; i += 1) {
      for (let j = i + 1; j < axled.length && !driveForward; j += 1) {
        const axleAxis = axled[i].socketNormal
        if (Math.abs(dot(axleAxis, axled[j].socketNormal)) < 0.999) continue
        const sensorForward = sensors.map((sensor) => sensor.normal).find((normal) => Math.abs(dot(normal, axleAxis)) < 0.01 && Math.abs(normal.y) < 0.5)
        driveForward = sensorForward ?? (Math.abs(axleAxis.x) > 0.5 ? { x: 0, y: 0, z: -1 } : { x: -1, y: 0, z: 0 })
      }
    }
  }
  const forward = drivePair?.forward ?? null
  for (const motor of motors) {
    if (motor.wheelIds.length === 0) continue
    const velocity = cross(motor.socketNormal, UP)
    const along = forward ? dot(velocity, forward) : 0
    motor.drives = !forward ? null : Math.abs(along) < 0.5 ? 'sideways' : along > 0 ? 'forward' : 'backward'
  }
  for (const sensor of sensors) sensor.facing = facingFromNormal(sensor.normal, forward)

  // Bodies, in the space this creation runs in.
  const hasHinge = brickIds.some((id) => roboticsSpec(bricksById.get(id)!.partId)?.hinge)
  const provisionalKind: CreationKind = driveForward ? 'rover' : hasHinge ? 'gate' : hubs.length > 0 && (sensors.length > 0 || lights.length > 0 || buttons.length > 0) && motors.length === 0 ? 'signal' : 'creation'
  const testSpace = record.testSpace ?? defaultTestSpace(provisionalKind)
  const graph = deriveBodies(input.bricks, input.partMap, input.plateSize, { anchorToWorld: testSpace === 'myWorld', joints, mechanisms })
  // In My world every brick studded to the plate joins the one anchored body; only the creation's own
  // bricks belong to it (the rest is the world's scenery, which a sensor must still see).
  const bodies = graph.bodies
    .filter((body) => body.brickIds.some((id) => members.has(id)))
    .map((body) => (body.brickIds.every((id) => members.has(id)) ? body : { ...body, nodes: body.nodes.filter((node) => members.has(brickIdOfNode(node)!)), brickIds: body.brickIds.filter((id) => members.has(id)) }))
  const armBodyIds: string[] = []
  for (const id of brickIds) {
    const brick = bricksById.get(id)!
    const link = mechanisms.hingeById.get(id)
    if (!link) continue
    const baseBodyId = graph.bodyOfNode.get(link.fixedNode) ?? null
    const armBodyId = graph.bodyOfNode.get(link.movingNode) ?? null
    const locked = baseBodyId !== null && baseBodyId === armBodyId
    const armBody = armBodyId ? bodies.find((body) => body.id === armBodyId) : null
    const armBrickIds = locked ? [] : armBody?.brickIds.filter((brickId) => brickId !== id) ?? []
    let bridging: StudJoint[] = []
    if (locked) {
      // The arm is whatever stacks upward from the turntable's studs. Any joint that ties a
      // brick of that stack to a brick outside it (or to the build plate) is where the arm is
      // built into the frame: that is the contact the card highlights.
      const stack = new Set<string>()
      const queue = joints.filter((joint) => joint.lower === link.movingNode).map((joint) => joint.upperBrickId)
      while (queue.length) {
        const brickId = queue.shift()!
        if (stack.has(brickId)) continue
        stack.add(brickId)
        for (const joint of joints) if (joint.lowerBrickId === brickId && joint.upperBrickId !== id) queue.push(joint.upperBrickId)
      }
      bridging = joints.filter((joint) => {
        if (joint.lowerBrickId === id || joint.upperBrickId === id) return false
        if (joint.lower === WORLD_NODE) return stack.has(joint.upperBrickId)
        return (joint.lowerBrickId !== null && stack.has(joint.lowerBrickId)) !== stack.has(joint.upperBrickId)
      })
      stack.forEach((brickId) => armBrickIds.push(brickId))
    } else if (armBodyId) {
      armBodyIds.push(armBodyId)
    }
    hinges.push({ ...device(brick, 'hinge-motor'), baseBodyId, armBodyId, locked, bridging, armBrickIds })
  }

  const kind: CreationKind = provisionalKind
  // A plate-high brick on the ground: a motor standing on it holds its axle at a wheel's hole height.
  const onPlate = brickIds.some((id) => { const brick = bricksById.get(id)!; return brick.y === 0 && input.partMap[brick.partId]?.height === 1 && !roboticsSpec(brick.partId) })
  const partCounts: [number, string][] = [
    [hubs.length, 'hub'], [motors.length, 'motor'], [hinges.length, 'hinge motor'], [wheels.length, 'wheel'], [axles.length, 'axle'],
    [sensors.length, 'distance sensor'], [lights.length, 'light'], [buttons.length, 'button'], [seats.length, 'seat'],
  ]
  const parts = partCounts.filter(([count]) => count > 0).map(([count, noun]) => plural(count, noun)).join(', ') || 'no robotics parts yet'
  const attached = `${plural(brickIds.length, 'brick')} attached`
  let ready: string
  const looseWheels = wheels.filter((wheel) => !wheel.onAxle).length
  const motorsWithWheels = motors.filter((motor) => motor.wheelIds.length > 0).length
  const lockedHinge = hinges.find((hinge) => hinge.locked)
  if (lockedHinge) ready = `${lockedHinge.name}'s arm is built into the frame, so it can't swing`
  else if (hinges.length > 0) ready = `Fixed side on the frame, moving side on the arm · zero is as built`
  else if (motors.length > 0 && motorsWithWheels === motors.length && looseWheels === 0) ready = motors.length >= 2 ? `Axles and wheels on ${motors.length === 2 ? 'both' : 'all'} motors, so it can roll` : 'Axle and wheel on the motor, so it can turn a wheel'
  else if (motors.length > 0 && looseWheels > 0) ready = `${plural(looseWheels, 'wheel')} not on an axle · ${plural(motorsWithWheels, 'motor')} with a wheel`
  else if (motors.length > 0) ready = motors.some((motor) => motor.axleId) ? 'Axles in the motors, no wheels yet' : 'Motors have no axles yet'
  else if (kind === 'signal') ready = `Hub${sensors.length ? ', sensor' : ''}${lights.length ? ' and light' : buttons.length ? ' and button' : ''}, so it can sense and signal`
  else if (hubs.length === 0) ready = 'Add a hub to power its parts'
  else ready = 'Add a motor, a hinge motor or a sensor to give it something to do'
  const unplugged = [...motors, ...hinges, ...sensors, ...lights, ...buttons].filter((item) => !item.plugged)
  if (unplugged.length && hubs.length === 0) ready += ' · add a hub to plug things in'

  return {
    id: record.id,
    name: record.name,
    kind,
    testSpace,
    saved,
    brickIds,
    bodies,
    armBodyIds,
    hubs, motors, hinges, sensors, lights, buttons, seats, axles, wheels,
    drivePair,
    onPlate,
    driveForward,
    lines: { attached, parts, ready },
  }
}

export function deriveCreations(input: DeriveInput): DerivedCreation[] {
  const derivation = prepare(input)
  return input.section.creations.map((record) => deriveOne(derivation, record, true))
}

/** What the card previews for a component that is not a creation yet. */
export function deriveCandidate(input: DeriveInput, anchorBrickIds: readonly string[], name = ''): DerivedCreation {
  return deriveOne(prepare(input), { id: 'candidate', name, anchorBrickIds: [...anchorBrickIds] }, false)
}

/** The saved creation a brick belongs to, if any. */
export function creationOfBrick(creations: readonly DerivedCreation[], brickId: string): DerivedCreation | null {
  return creations.find((creation) => creation.brickIds.includes(brickId)) ?? null
}

/** A readable name for a creation kind, for default names. */
export function defaultCreationName(kind: CreationKind, existing: readonly string[]): string {
  const base = kind === 'rover' ? 'Buggy' : kind === 'gate' ? 'Gate' : kind === 'signal' ? 'Signal light' : 'Robot'
  if (!existing.includes(base)) return base
  let counter = 2
  while (existing.includes(`${base} ${counter}`)) counter += 1
  return `${base} ${counter}`
}

export const roleLabel = (role: RoboticsPartRole) => ROLE_LABELS[role]
