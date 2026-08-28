import { BRICK_PART_MAP, GRID_SIZE, rotatedSize } from './parts'
import type { BrickDraft, BrickInstance, BrickPart } from './types'

export type BrickPartMap = Readonly<Record<string, BrickPart>>

export function brickFitsLayout(
  brick: BrickInstance,
  staged: BrickInstance[],
  partMap: BrickPartMap = BRICK_PART_MAP,
): boolean {
  const part = partMap[brick.partId]
  if (!part) return false
  const size = rotatedSize(part, brick.rotation)
  if (
    brick.x < 0
    || brick.z < 0
    || brick.y < 0
    || brick.x + size.width > GRID_SIZE
    || brick.z + size.depth > GRID_SIZE
  ) return false

  for (const otherBrick of staged) {
    const otherPart = partMap[otherBrick.partId]
    if (!otherPart) return false
    const otherSize = rotatedSize(otherPart, otherBrick.rotation)
    const overlapX = brick.x < otherBrick.x + otherSize.width && brick.x + size.width > otherBrick.x
    const overlapZ = brick.z < otherBrick.z + otherSize.depth && brick.z + size.depth > otherBrick.z
    const overlapY = brick.y < otherBrick.y + otherPart.height && brick.y + part.height > otherBrick.y
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
