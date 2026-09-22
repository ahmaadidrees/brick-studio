import { GRID_SIZE, PLATE_HEIGHT, STUD, partFootprintCells, rotateLocalPoint, rotatedSize } from '../../brick/parts'
import type { BrickInstance, BrickPart } from '../../brick/types'
import type { Vec3 } from './vec'

export type PartMap = Readonly<Record<string, BrickPart>>

/** Everything the model needs to place one brick: its part, and its world frame. */
export type BrickFrame = {
  brick: BrickInstance
  part: BrickPart
  /** Footprint centre at the bottom face, world units (same rule as `brickWorldPosition`). */
  origin: Vec3
}

/**
 * Part-map-explicit twin of the core's `brickWorldPosition`: the model resolves
 * parts through the map it was given rather than the mutable global, so a document
 * validates the same way whether or not custom parts are registered. Same maths.
 */
export function brickOriginFor(brick: Pick<BrickInstance, 'x' | 'y' | 'z' | 'rotation'>, part: BrickPart, plateSize: number = GRID_SIZE): Vec3 {
  const size = rotatedSize(part, brick.rotation)
  return {
    x: (brick.x + size.width / 2 - plateSize / 2) * STUD,
    y: brick.y * PLATE_HEIGHT,
    z: (brick.z + size.depth / 2 - plateSize / 2) * STUD,
  }
}

export function brickFrame(brick: BrickInstance, part: BrickPart, plateSize: number = GRID_SIZE): BrickFrame {
  return { brick, part, origin: brickOriginFor(brick, part, plateSize) }
}

/** A part-local point (rotation 0 frame) in world units. */
export function toWorldPoint(frame: BrickFrame, local: Vec3): Vec3 {
  const [x, y, z] = rotateLocalPoint([local.x, local.y, local.z], frame.brick.rotation)
  return { x: x + frame.origin.x, y: y + frame.origin.y, z: z + frame.origin.z }
}

/** A part-local direction rotated into the world (no translation). */
export function toWorldDirection(frame: BrickFrame, local: Vec3): Vec3 {
  const [x, y, z] = rotateLocalPoint([local.x, local.y, local.z], frame.brick.rotation)
  return { x, y, z }
}

/** Cell key for a stud column. */
export const cellKey = (x: number, z: number) => `${x},${z}`

/**
 * The stud columns a placed brick fills, rotation- and corner-aware. Each local
 * footprint cell is mapped through the same quarter-turn the renderer uses, so a
 * rotated corner brick keeps its L in the right place.
 */
export function brickCells(brick: Pick<BrickInstance, 'x' | 'z' | 'rotation'>, part: BrickPart): string[] {
  const size = rotatedSize(part, brick.rotation)
  const centreX = brick.x + size.width / 2
  const centreZ = brick.z + size.depth / 2
  return partFootprintCells(part).map(([cx, cz]) => {
    const local: [number, number, number] = [cx + 0.5 - part.width / 2, 0, cz + 0.5 - part.depth / 2]
    const [x, , z] = rotateLocalPoint(local, brick.rotation)
    return cellKey(Math.floor(centreX + x), Math.floor(centreZ + z))
  })
}

/** Top face height in plates. */
export const brickTop = (brick: Pick<BrickInstance, 'y'>, part: BrickPart) => brick.y + part.height

export function indexBricks(bricks: readonly BrickInstance[]): Map<string, BrickInstance> {
  return new Map(bricks.map((brick) => [brick.id, brick]))
}
