import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createBrickGeometry } from './geometry'
import {
  BRICK_PARTS,
  BRICK_PART_MAP,
  STUD,
  partFootprintCells,
  partWorldSize,
  walkableSurfaceHeight,
} from './parts'
import type { BrickPart } from './types'

const STUD_HEIGHT = 0.1

function bounds(part: BrickPart) {
  const positions = createBrickGeometry(part).getAttribute('position')
  return new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute)
}

/** Highest rendered vertex within one half of the part's depth. */
function renderedTop(part: BrickPart, half: 'front' | 'back') {
  const positions = createBrickGeometry(part).getAttribute('position')
  let top = Number.NEGATIVE_INFINITY
  for (let index = 0; index < positions.count; index += 1) {
    const z = positions.getZ(index)
    if (half === 'front' ? z <= 0 : z >= 0) top = Math.max(top, positions.getY(index))
  }
  return top
}

/** Lowest rendered vertex within one half of the part's depth. */
function renderedFloor(part: BrickPart, half: 'front' | 'back') {
  const positions = createBrickGeometry(part).getAttribute('position')
  let floor = Number.POSITIVE_INFINITY
  for (let index = 0; index < positions.count; index += 1) {
    const z = positions.getZ(index)
    if (half === 'front' ? z <= 0 : z >= 0) floor = Math.min(floor, positions.getY(index))
  }
  return floor
}

describe('createBrickGeometry', () => {
  it('merges a usable mesh for every catalogue part', () => {
    for (const part of BRICK_PARTS) {
      const geometry = createBrickGeometry(part)
      const positions = geometry.getAttribute('position')
      expect(positions, part.id).toBeDefined()
      expect(positions.count, part.id).toBeGreaterThan(0)
      expect(geometry.getAttribute('normal'), part.id).toBeDefined()
    }
  })

  it('caches one geometry per part id', () => {
    for (const part of BRICK_PARTS) {
      expect(createBrickGeometry(part)).toBe(createBrickGeometry(part))
    }
  })

  it('keeps every part inside its footprint and stud height', () => {
    for (const part of BRICK_PARTS) {
      const { width, depth, height } = partWorldSize(part)
      const box = bounds(part)
      const studTop = part.kind === 'slope' || part.kind === 'stair' || part.kind === 'cone'
        ? height
        : height + STUD_HEIGHT
      // Stair treads use the narrower STEP_INSET, so allow a hair past the inset footprint.
      expect(box.min.x, part.id).toBeGreaterThanOrEqual(-width / 2 - 0.005)
      expect(box.max.x, part.id).toBeLessThanOrEqual(width / 2 + 0.005)
      expect(box.min.z, part.id).toBeGreaterThanOrEqual(-depth / 2 - 0.005)
      expect(box.max.z, part.id).toBeLessThanOrEqual(depth / 2 + 0.005)
      expect(box.min.y, part.id).toBeGreaterThanOrEqual(-0.001)
      expect(box.max.y, part.id).toBeCloseTo(studTop, 3)
    }
  })

  it('renders the corner as an L that leaves its diagonal cell open', () => {
    const part = BRICK_PART_MAP.corner_2x2
    expect(partFootprintCells(part)).toEqual([[0, 0], [0, 1], [1, 0]])

    const positions = createBrickGeometry(part).getAttribute('position')
    let cellsInDiagonal = 0
    for (let index = 0; index < positions.count; index += 1) {
      // The open cell is +x/+z of centre; only stud-free empty space belongs there.
      if (positions.getX(index) > STUD * 0.4 && positions.getZ(index) > STUD * 0.4) cellsInDiagonal += 1
    }
    expect(cellsInDiagonal).toBe(0)
  })

  it('gives round bricks a stud and cones a bare point', () => {
    const roundTop = bounds(BRICK_PART_MAP.round_1x1).max.y
    expect(roundTop).toBeCloseTo(partWorldSize(BRICK_PART_MAP.round_1x1).height + STUD_HEIGHT, 3)

    const cone = BRICK_PART_MAP.cone_1x1
    expect(bounds(cone).max.y).toBeCloseTo(partWorldSize(cone).height, 3)
  })

  it('opens the arch under its beam', () => {
    const part = BRICK_PART_MAP.arch_1x4
    const positions = createBrickGeometry(part).getAttribute('position')
    let lowestOnAxis = Number.POSITIVE_INFINITY
    for (let index = 0; index < positions.count; index += 1) {
      if (Math.abs(positions.getZ(index)) < 0.05) lowestOnAxis = Math.min(lowestOnAxis, positions.getY(index))
    }
    // Nothing but the soffit sits on the arch centre line.
    expect(lowestOnAxis).toBeGreaterThan(1)
  })

  it('renders sloped parts on the same z end their walkable surface reports', () => {
    for (const partId of ['slope_2x2', 'stair_2x3']) {
      const part = BRICK_PART_MAP[partId]
      const { depth } = partWorldSize(part)
      expect(walkableSurfaceHeight(part, depth / 4), partId)
        .toBeGreaterThan(walkableSurfaceHeight(part, -depth / 4))
      expect(renderedTop(part, 'back'), partId).toBeGreaterThan(renderedTop(part, 'front'))
    }
  })

  it('renders the overhang wedge flat on top and open underneath its thin end', () => {
    const part = BRICK_PART_MAP.slope_inv_2x2
    const { height } = partWorldSize(part)
    expect(walkableSurfaceHeight(part, -0.5)).toBeCloseTo(height, 5)
    expect(walkableSurfaceHeight(part, 0.5)).toBeCloseTo(height, 5)
    // Solid down to the base at +z, hollow above the ground at −z.
    expect(renderedFloor(part, 'back')).toBeCloseTo(0, 5)
    expect(renderedFloor(part, 'front')).toBeGreaterThan(0.2)
  })
})
