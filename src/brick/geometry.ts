import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PLATE_HEIGHT, STUD } from './parts'
import type { BrickPart } from './types'

const geometryCache = new Map<string, THREE.BufferGeometry>()

function box(width: number, height: number, depth: number, x: number, y: number, z: number) {
  const geometry = new THREE.BoxGeometry(width, height, depth)
  geometry.translate(x, y, z)
  return geometry
}

export function createBrickGeometry(part: BrickPart) {
  const cached = geometryCache.get(part.id)
  if (cached) return cached

  const width = part.width * STUD - 0.035
  const depth = part.depth * STUD - 0.035
  const height = part.height * PLATE_HEIGHT - 0.015
  const geometries: THREE.BufferGeometry[] = []

  if (part.kind === 'window') {
    const frame = 0.13
    geometries.push(box(width, frame, depth, 0, frame / 2, 0))
    geometries.push(box(width, frame, depth, 0, height - frame / 2, 0))
    geometries.push(box(frame, height - frame * 2, depth, -width / 2 + frame / 2, height / 2, 0))
    geometries.push(box(frame, height - frame * 2, depth, width / 2 - frame / 2, height / 2, 0))
  } else if (part.kind === 'door') {
    const frame = 0.16
    geometries.push(box(frame, height, depth, -width / 2 + frame / 2, height / 2, 0))
    geometries.push(box(frame, height, depth, width / 2 - frame / 2, height / 2, 0))
    geometries.push(box(width, frame, depth, 0, height - frame / 2, 0))
  } else if (part.kind === 'stair') {
    for (let step = 0; step < part.depth; step += 1) {
      const stepHeight = ((step + 1) / part.depth) * height
      geometries.push(box(width, stepHeight, STUD - 0.03, 0, stepHeight / 2, (step - (part.depth - 1) / 2) * STUD))
    }
  } else if (part.kind === 'slope') {
    const shape = new THREE.Shape()
    shape.moveTo(-depth / 2, 0)
    shape.lineTo(depth / 2, 0)
    shape.lineTo(depth / 2, height)
    shape.lineTo(-depth / 2, 0)
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false })
    geometry.rotateY(Math.PI / 2)
    geometry.translate(-width / 2, 0, 0)
    geometries.push(geometry)
  } else {
    geometries.push(box(width, height, depth, 0, height / 2, 0))
  }

  if (part.kind !== 'slope' && part.kind !== 'stair') {
    for (let x = 0; x < part.width; x += 1) {
      for (let z = 0; z < part.depth; z += 1) {
        const stud = new THREE.CylinderGeometry(STUD * 0.235, STUD * 0.235, 0.1, 16)
        stud.translate((x - (part.width - 1) / 2) * STUD, height + 0.05, (z - (part.depth - 1) / 2) * STUD)
        geometries.push(stud)
      }
    }
  }

  const merged = mergeGeometries(geometries, false)
  merged.computeVertexNormals()
  geometryCache.set(part.id, merged)
  return merged
}
