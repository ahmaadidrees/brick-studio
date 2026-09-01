import { BRICK_PART_MAP, GRID_SIZE, rotatedSize } from './parts'
import type { BrickDraft, BrickInstance, BrickPart } from './types'

export type BrickPartMap = Readonly<Record<string, BrickPart>>

function brickBounds(brick: BrickInstance, partMap: BrickPartMap) {
  const part = partMap[brick.partId]
  if (!part) return null
  const size = rotatedSize(part, brick.rotation)
  return {
    part,
    width: size.width,
    depth: size.depth,
    maxX: brick.x + size.width,
    maxY: brick.y + part.height,
    maxZ: brick.z + size.depth,
  }
}

function overlapsVertically(brick: BrickInstance, maxY: number, otherBrick: BrickInstance, otherPart: BrickPart) {
  return brick.y < otherBrick.y + otherPart.height && maxY > otherBrick.y
}

/**
 * A validation-only spatial index for an entire document. Brick coordinates
 * and dimensions are integral grid values, so two volumes overlap exactly when
 * they share an X/Z cell and their vertical spans overlap. Each stud column
 * stores sorted vertical spans, making stacked-world checks logarithmic without
 * allocating one index entry per plate of brick volume.
 */
export class BrickLayoutIndex {
  private readonly columns = new Map<number, Array<{ start: number; end: number }>>()

  constructor(private readonly partMap: BrickPartMap = BRICK_PART_MAP) {}

  add(brick: BrickInstance): boolean {
    const bounds = brickBounds(brick, this.partMap)
    if (!bounds
      || brick.x < 0
      || brick.z < 0
      || brick.y < 0
      || bounds.maxX > GRID_SIZE
      || bounds.maxZ > GRID_SIZE) return false

    const placements: Array<{
      spans: Array<{ start: number; end: number }>
      index: number
      key: number
    }> = []
    for (let x = brick.x; x < bounds.maxX; x += 1) {
      for (let z = brick.z; z < bounds.maxZ; z += 1) {
        const key = x * GRID_SIZE + z
        const spans = this.columns.get(key) ?? []
        let low = 0
        let high = spans.length
        while (low < high) {
          const middle = (low + high) >>> 1
          if (spans[middle].start < brick.y) low = middle + 1
          else high = middle
        }
        if ((low > 0 && spans[low - 1].end > brick.y)
          || (low < spans.length && spans[low].start < bounds.maxY)) return false
        placements.push({ spans, index: low, key })
      }
    }
    for (const { spans, index, key } of placements) {
      spans.splice(index, 0, { start: brick.y, end: bounds.maxY })
      if (!this.columns.has(key)) this.columns.set(key, spans)
    }
    return true
  }
}

export function brickFitsLayout(
  brick: BrickInstance,
  staged: BrickInstance[],
  partMap: BrickPartMap = BRICK_PART_MAP,
): boolean {
  const bounds = brickBounds(brick, partMap)
  if (!bounds) return false
  const { width, depth, maxX, maxY, maxZ } = bounds
  if (
    brick.x < 0
    || brick.z < 0
    || brick.y < 0
    || maxX > GRID_SIZE
    || maxZ > GRID_SIZE
  ) return false

  for (const otherBrick of staged) {
    const otherPart = partMap[otherBrick.partId]
    if (!otherPart) return false
    const otherSize = rotatedSize(otherPart, otherBrick.rotation)
    const overlapX = brick.x < otherBrick.x + otherSize.width && brick.x + width > otherBrick.x
    const overlapZ = brick.z < otherBrick.z + otherSize.depth && brick.z + depth > otherBrick.z
    const overlapY = overlapsVertically(brick, maxY, otherBrick, otherPart)
    if (overlapX && overlapZ && overlapY) return false
  }
  return true
}

export function draftIsValid(
  draft: BrickDraft,
  bricks: BrickInstance[],
  ignoredId: string | null = null,
  partMap: BrickPartMap = BRICK_PART_MAP,
): boolean {
  const staged = ignoredId ? bricks.filter((brick) => brick.id !== ignoredId) : bricks
  return brickFitsLayout({ ...draft, id: ignoredId ?? '__draft__' }, staged, partMap)
}
