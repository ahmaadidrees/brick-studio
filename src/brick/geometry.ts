import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import {
  DOOR_FRAME_MEMBER,
  STUD,
  WINDOW_FRAME_MEMBER,
  archProfile,
  conePartBaseHeight,
  cornerArmThickness,
  partFootprintCells,
  partWorldSize,
  roundPartRadius,
} from './parts'
import type { BrickPart } from './types'

const ROUND_SEGMENTS = 24
const STUD_HEIGHT = 0.1
const geometryCache = new Map<string, THREE.BufferGeometry>()

function box(width: number, height: number, depth: number, x: number, y: number, z: number) {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  geometry.translate(x, y, z)
  return geometry
}

/**
 * Extrudes a side profile drawn in (−z, y) along the part's width. The mirrored
 * first axis is what makes the mesh land on the same z end as the part's colliders.
 */
function extrudeProfile(shape: THREE.Shape, width: number) {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false })
  geometry.rotateY(Math.PI / 2)
  geometry.translate(-width / 2, 0, 0)
  return geometry
}

/** Parts whose top face is missing or pointed take no studs. */
function hasStuds(part: BrickPart) {
  return part.kind !== 'slope' && part.kind !== 'stair' && part.kind !== 'cone'
}

export function createBrickGeometry(part: BrickPart) {
  const cached = geometryCache.get(part.id)
  if (cached) return cached

  const { width, depth, height } = partWorldSize(part)
  const geometries: THREE.BufferGeometry[] = []

  if (part.kind === 'window') {
    const frame = WINDOW_FRAME_MEMBER
    geometries.push(box(width, frame, depth, 0, frame / 2, 0))
    geometries.push(box(width, frame, depth, 0, height - frame / 2, 0))
    geometries.push(box(width, height - frame * 2, frame, 0, height / 2, -depth / 2 + frame / 2))
    geometries.push(box(width, height - frame * 2, frame, 0, height / 2, depth / 2 - frame / 2))
  } else if (part.kind === 'door') {
    const frame = DOOR_FRAME_MEMBER
    geometries.push(box(width, height, frame, 0, height / 2, -depth / 2 + frame / 2))
    geometries.push(box(width, height, frame, 0, height / 2, depth / 2 - frame / 2))
    geometries.push(box(width, frame, depth, 0, height - frame / 2, 0))
  } else if (part.kind === 'arch') {
    const { innerHalf, chamfer, springHeight, soffitHeight } = archProfile(part)
    const shape = new THREE.Shape()
    shape.moveTo(-depth / 2, 0)
    shape.lineTo(-innerHalf, 0)
    shape.lineTo(-innerHalf, springHeight)
    shape.lineTo(-(innerHalf - chamfer), soffitHeight)
    shape.lineTo(innerHalf - chamfer, soffitHeight)
    shape.lineTo(innerHalf, springHeight)
    shape.lineTo(innerHalf, 0)
    shape.lineTo(depth / 2, 0)
    shape.lineTo(depth / 2, height)
    shape.lineTo(-depth / 2, height)
    geometries.push(extrudeProfile(shape, width))
  } else if (part.kind === 'corner') {
    const arm = cornerArmThickness()
    geometries.push(box(arm, height, depth, -(width - arm) / 2, height / 2, 0))
    geometries.push(box(width, height, arm, 0, height / 2, -(depth - arm) / 2))
  } else if (part.kind === 'round') {
    const radius = roundPartRadius(part)
    const cylinder = new THREE.CylinderGeometry(radius, radius, height, ROUND_SEGMENTS)
    cylinder.translate(0, height / 2, 0)
    geometries.push(cylinder)
  } else if (part.kind === 'cone') {
    const radius = roundPartRadius(part)
    const base = conePartBaseHeight(part)
    const collar = new THREE.CylinderGeometry(radius, radius, base, ROUND_SEGMENTS)
    collar.translate(0, base / 2, 0)
    const cone = new THREE.ConeGeometry(radius, height - base, ROUND_SEGMENTS)
    cone.translate(0, base + (height - base) / 2, 0)
    geometries.push(collar, cone)
  } else if (part.kind === 'stair') {
    for (let step = 0; step < part.depth; step += 1) {
      const stepHeight = ((step + 1) / part.depth) * height
      geometries.push(box(width, stepHeight, STUD - 0.03, 0, stepHeight / 2, (step - (part.depth - 1) / 2) * STUD))
    }
  } else if (part.kind === 'slope') {
    const shape = new THREE.Shape()
    shape.moveTo(-depth / 2, height)
    shape.lineTo(-depth / 2, 0)
    shape.lineTo(depth / 2, 0)
    geometries.push(extrudeProfile(shape, width))
  } else if (part.kind === 'invertedSlope') {
    const shape = new THREE.Shape()
    shape.moveTo(depth / 2, height)
    shape.lineTo(-depth / 2, height)
    shape.lineTo(-depth / 2, 0)
    geometries.push(extrudeProfile(shape, width))
  } else {
    geometries.push(box(width, height, depth, 0, height / 2, 0))
  }

  if (hasStuds(part)) {
    for (const [x, z] of partFootprintCells(part)) {
      const stud = new THREE.CylinderGeometry(STUD * 0.235, STUD * 0.235, STUD_HEIGHT, 16)
      stud.translate(
        (x - (part.width - 1) / 2) * STUD,
        height + STUD_HEIGHT / 2,
        (z - (part.depth - 1) / 2) * STUD,
      )
      geometries.push(stud)
    }
  }

  // ExtrudeGeometry is unindexed while the primitives are indexed; mergeGeometries
  // refuses mixed inputs, so level them before merging.
  const indexed = geometries.every((geometry) => geometry.getIndex() !== null)
  const merged = mergeGeometries(
    indexed ? geometries : geometries.map((geometry) => geometry.getIndex() ? geometry.toNonIndexed() : geometry),
    false,
  )
  if (!merged) throw new Error(`Could not merge geometry for part ${part.id}`)
  merged.computeVertexNormals()
  geometryCache.set(part.id, merged)
  return merged
}
