import * as THREE from 'three'
import { createStudGeometry, mergeBrickGeometries } from '../../brick/geometry'
import { PLATE_HEIGHT, STUD, partFootprintCells, partWorldSize } from '../../brick/parts'
import type { BrickPart } from '../../brick/types'
import { AXLE_ROD_RADIUS, HINGE_TURNTABLE_RADIUS, MOTOR_SOCKET_RADIUS, ROBOTICS_PART_IDS, WHEEL_HALF_WIDTH, WHEEL_RADIUS } from './catalog'

/**
 * Simple-primitive shapes for the robotics parts. Each builder returns one merged
 * geometry in the part's local frame (footprint centre at the bottom face), the same
 * contract as `createBrickGeometry`, so the studio renders, instances and thumbnails
 * these parts exactly like bricks. The shapes exist to show how a part connects: a
 * socket ring on the motor, a real hole through the wheel, a rod that reaches into
 * socket and hole, port frames on the hub, eyes on the sensor, a turntable on the
 * hinge motor. No materials or lighting polish (contract §3, checkpoint 1).
 */
const plates = (count: number) => count * PLATE_HEIGHT
const studs = (count: number) => count * STUD
/** How far the axle rod reaches past its grid extent, into the socket or the wheel hole. */
export const AXLE_ROD_OVERHANG = 0.26

function box(width: number, height: number, depth: number, x = 0, y = height / 2, z = 0) {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  geometry.translate(x, y, z)
  return geometry
}

/** A cylinder whose axis runs along +X. */
function xCylinder(radius: number, length: number, segments: number, x = 0, y = 0, z = 0, radiusBottom = radius) {
  const cylinder = new THREE.CylinderGeometry(radius, radiusBottom, length, segments)
  cylinder.rotateZ(-Math.PI / 2)
  cylinder.translate(x, y, z)
  return cylinder
}

function yCylinder(radius: number, height: number, segments: number, x = 0, y = 0, z = 0) {
  const cylinder = new THREE.CylinderGeometry(radius, radius, height, segments)
  cylinder.translate(x, y, z)
  return cylinder
}

function studsOnTop(part: BrickPart, top: number, cells = partFootprintCells(part)) {
  return cells.map(([x, z]) => createStudGeometry((x - (part.width - 1) / 2) * STUD, top, (z - (part.depth - 1) / 2) * STUD))
}

/** A thin rectangular frame standing proud of a ±X face, marking a socket. */
function portFrame(sign: 1 | -1, faceX: number, y: number, z: number, width = 0.3, height = 0.22, lip = 0.05, proud = 0.03) {
  const x = faceX + sign * proud / 2
  return [
    box(proud, lip, width, x, y + height / 2 - lip / 2, z),
    box(proud, lip, width, x, y - height / 2 + lip / 2, z),
    box(proud, height, lip, x, y, z - width / 2 + lip / 2),
    box(proud, height, lip, x, y, z + width / 2 - lip / 2),
  ]
}

export function buildHub(part: BrickPart) {
  const { width, depth, height } = partWorldSize(part)
  const parts: THREE.BufferGeometry[] = [box(width, height, depth)]
  const y = plates(3)
  for (const z of [-studs(1), studs(1)]) {
    parts.push(...portFrame(-1, -width / 2, y, z), ...portFrame(1, width / 2, y, z))
  }
  // A shallow screen recess on top, drawn as a raised bezel so the hub reads as the brain.
  parts.push(box(width * 0.55, 0.02, depth * 0.35, 0, height + 0.01, 0))
  parts.push(...studsOnTop(part, height))
  return mergeBrickGeometries(parts, part.id)
}

export function buildMotor(part: BrickPart) {
  const { width, depth, height } = partWorldSize(part)
  const parts: THREE.BufferGeometry[] = [box(width, height, depth)]
  // Socket ring on the +X face; the spinning output disc is drawn by the scene layer.
  const ring = new THREE.TorusGeometry(MOTOR_SOCKET_RADIUS, 0.045, 8, 24)
  ring.rotateY(Math.PI / 2)
  ring.translate(width / 2 + 0.02, plates(3), 0)
  parts.push(ring)
  parts.push(...studsOnTop(part, height))
  return mergeBrickGeometries(parts, part.id)
}

export function buildAxle(part: BrickPart) {
  const length = studs(part.width) + AXLE_ROD_OVERHANG * 2
  // A square rod: four radial segments turned so a flat faces up, like a cross axle.
  const rod = new THREE.CylinderGeometry(AXLE_ROD_RADIUS * 1.25, AXLE_ROD_RADIUS * 1.25, length, 4)
  rod.rotateY(Math.PI / 4)
  rod.rotateZ(-Math.PI / 2)
  rod.translate(0, plates(4), 0)
  return mergeBrickGeometries([rod], part.id)
}

export function buildWheel(part: BrickPart) {
  const y = plates(4)
  const tire = xCylinder(WHEEL_RADIUS, WHEEL_HALF_WIDTH * 2, 28, 0, y, 0)
  const rim = xCylinder(WHEEL_RADIUS * 0.62, WHEEL_HALF_WIDTH * 2 + 0.06, 20, 0, y, 0)
  // A real hole through the hub: a ring extruded along X.
  const shape = new THREE.Shape()
  shape.absarc(0, 0, WHEEL_RADIUS * 0.3, 0, Math.PI * 2, false)
  const hole = new THREE.Path()
  hole.absarc(0, 0, AXLE_ROD_RADIUS * 1.6, 0, Math.PI * 2, true)
  shape.holes.push(hole)
  const hubLength = WHEEL_HALF_WIDTH * 2 + 0.12
  const hub = new THREE.ExtrudeGeometry(shape, { depth: hubLength, bevelEnabled: false, curveSegments: 16 })
  hub.rotateY(Math.PI / 2)
  hub.translate(-hubLength / 2, y, 0)
  return mergeBrickGeometries([tire, rim, hub], part.id)
}

export function buildDistanceSensor(part: BrickPart) {
  const { width, depth, height } = partWorldSize(part)
  const parts: THREE.BufferGeometry[] = [box(width, height, depth)]
  for (const x of [-width * 0.25, width * 0.25]) {
    const eye = new THREE.CylinderGeometry(0.15, 0.15, 0.08, 16)
    eye.rotateX(Math.PI / 2)
    eye.translate(x, height / 2, -depth / 2 - 0.03)
    parts.push(eye)
  }
  parts.push(...studsOnTop(part, height))
  return mergeBrickGeometries(parts, part.id)
}

export function buildLight(part: BrickPart) {
  const { width, depth, height } = partWorldSize(part)
  const base = box(width, height * 0.6, depth)
  const dome = new THREE.SphereGeometry(Math.min(width, depth) * 0.42, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  dome.translate(0, height * 0.6, 0)
  return mergeBrickGeometries([base, dome], part.id)
}

export function buildButton(part: BrickPart) {
  const { width, depth, height } = partWorldSize(part)
  const base = box(width, height, depth)
  const cap = yCylinder(Math.min(width, depth) * 0.34, 0.12, 20, 0, height + 0.06, 0)
  return mergeBrickGeometries([base, cap], part.id)
}

export function buildHingeMotor(part: BrickPart) {
  const { width, depth, height } = partWorldSize(part)
  const housingHeight = plates(4) - 0.01
  const turntableHeight = height - plates(4)
  const housing = box(width, housingHeight, depth)
  const turntable = yCylinder(HINGE_TURNTABLE_RADIUS, turntableHeight, 28, 0, plates(4) + turntableHeight / 2, 0)
  // A notch on the rim so the turntable's angle is visible while it turns.
  const notch = box(0.12, turntableHeight + 0.02, 0.1, HINGE_TURNTABLE_RADIUS - 0.04, plates(4) + turntableHeight / 2, 0)
  const studsGeometry = studsOnTop(part, height)
  return mergeBrickGeometries([housing, turntable, notch, ...studsGeometry], part.id)
}

export function buildSeat(part: BrickPart) {
  const { width, depth, height } = partWorldSize(part)
  const pan = box(width, plates(2), depth)
  const back = box(width, height, 0.22, 0, height / 2, depth / 2 - 0.11)
  const armLeft = box(0.14, plates(3), depth * 0.7, -width / 2 + 0.07, plates(2) + plates(1.5), 0)
  const armRight = box(0.14, plates(3), depth * 0.7, width / 2 - 0.07, plates(2) + plates(1.5), 0)
  return mergeBrickGeometries([pan, back, armLeft, armRight], part.id)
}

export const ROBOTICS_GEOMETRY_BUILDERS: Record<string, (part: BrickPart) => THREE.BufferGeometry> = {
  [ROBOTICS_PART_IDS.hub]: buildHub,
  [ROBOTICS_PART_IDS.motor]: buildMotor,
  [ROBOTICS_PART_IDS.axleShort]: buildAxle,
  [ROBOTICS_PART_IDS.axleLong]: buildAxle,
  [ROBOTICS_PART_IDS.wheel]: buildWheel,
  [ROBOTICS_PART_IDS.distanceSensor]: buildDistanceSensor,
  [ROBOTICS_PART_IDS.light]: buildLight,
  [ROBOTICS_PART_IDS.button]: buildButton,
  [ROBOTICS_PART_IDS.hingeMotor]: buildHingeMotor,
  [ROBOTICS_PART_IDS.seat]: buildSeat,
}
