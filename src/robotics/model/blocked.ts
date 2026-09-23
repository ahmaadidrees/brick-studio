import type { BrickDraft, BrickInstance } from '../../brick/types'
import { brickCells, type PartMap } from './grid'

/**
 * The bricks a draft would overlap: a shared stud column and overlapping heights.
 * Same rule as the studio's layout validation, used only to name what is in the way
 * when a connector snap is refused, so the student can find the cause.
 */
export function overlappingBricks(draft: Pick<BrickDraft, 'partId' | 'x' | 'y' | 'z' | 'rotation'>, bricks: readonly BrickInstance[], partMap: PartMap): BrickInstance[] {
  const part = partMap[draft.partId]
  if (!part) return []
  const cells = new Set(brickCells(draft, part))
  const bottom = draft.y
  const top = draft.y + part.height
  return bricks.filter((brick) => {
    const other = partMap[brick.partId]
    if (!other) return false
    if (brick.y >= top || brick.y + other.height <= bottom) return false
    return brickCells(brick, other).some((cell) => cells.has(cell))
  })
}
