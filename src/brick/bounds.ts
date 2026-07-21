import { BRICK_PART_MAP, GRID_SIZE, PLATE_HEIGHT, STUD, brickWorldPosition, rotatedSize } from './parts'
import type { BrickInstance } from './types'

export type BuildBounds = {
  min: [number, number, number]
  max: [number, number, number]
  center: [number, number, number]
  size: [number, number, number]
  empty: boolean
}

const HORIZONTAL_PADDING = STUD * 2
const VERTICAL_PADDING = PLATE_HEIGHT * 3

export function getBuildBounds(bricks: BrickInstance[]): BuildBounds {
  let minX: number
  let minY: number
  let minZ: number
  let maxX: number
  let maxY: number
  let maxZ: number

  if (bricks.length === 0) {
    const halfPlate = GRID_SIZE * STUD / 2
    minX = -halfPlate
    minY = -PLATE_HEIGHT
    minZ = -halfPlate
    maxX = halfPlate
    maxY = PLATE_HEIGHT
    maxZ = halfPlate
  } else {
    minX = Number.POSITIVE_INFINITY
    minY = Number.POSITIVE_INFINITY
    minZ = Number.POSITIVE_INFINITY
    maxX = Number.NEGATIVE_INFINITY
    maxY = Number.NEGATIVE_INFINITY
    maxZ = Number.NEGATIVE_INFINITY

    for (const brick of bricks) {
      const part = BRICK_PART_MAP[brick.partId]
      const rotated = rotatedSize(part, brick.rotation)
      const position = brickWorldPosition(brick)
      const halfWidth = rotated.width * STUD / 2
      const halfDepth = rotated.depth * STUD / 2
      minX = Math.min(minX, position[0] - halfWidth)
      minY = Math.min(minY, position[1])
      minZ = Math.min(minZ, position[2] - halfDepth)
      maxX = Math.max(maxX, position[0] + halfWidth)
      maxY = Math.max(maxY, position[1] + part.height * PLATE_HEIGHT)
      maxZ = Math.max(maxZ, position[2] + halfDepth)
    }
  }

  minX -= HORIZONTAL_PADDING
  minY -= VERTICAL_PADDING
  minZ -= HORIZONTAL_PADDING
  maxX += HORIZONTAL_PADDING
  maxY += VERTICAL_PADDING
  maxZ += HORIZONTAL_PADDING

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    size: [maxX - minX, maxY - minY, maxZ - minZ],
    empty: bricks.length === 0,
  }
}

export function getFrameDistance(bounds: BuildBounds, verticalFovDegrees: number, aspect: number) {
  const halfVerticalFov = verticalFovDegrees * Math.PI / 360
  const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * Math.max(aspect, 0.1))
  const halfWidth = bounds.size[0] / 2
  const halfHeight = bounds.size[1] / 2
  const halfDepth = bounds.size[2] / 2
  const horizontalDistance = (halfWidth + halfDepth * 0.5) / Math.tan(halfHorizontalFov)
  const verticalDistance = (halfHeight + halfDepth * 0.55) / Math.tan(halfVerticalFov)
  return Math.max(5, horizontalDistance, verticalDistance) * 1.08
}
