import { BRICK_PART_MAP, GRID_SIZE, PLATE_HEIGHT, STUD, rotatedSize } from './parts'
import type { BrickDraft, BrickInstance } from './types'

/**
 * A raycast already identifies the surface the builder intended. Preserve its
 * elevation instead of searching every storey for the highest overlapping roof.
 * Rounding absorbs the rendered body inset and decorative studs (less than
 * half a plate); normal layout validation still decides whether the ghost fits.
 */
export function draftFromSurfacePoint(
  point: { x: number; y: number; z: number },
  draft: BrickDraft,
  originals?: readonly BrickInstance[],
  hitBrick?: BrickInstance,
): Pick<BrickDraft, 'x' | 'y' | 'z'> {
  const size = rotatedSize(BRICK_PART_MAP[draft.partId], draft.rotation)
  const anchor = originals?.[0]
  const lowestOffset = anchor && originals?.length
    ? Math.min(...originals.map((brick) => brick.y - anchor.y))
    : 0
  const hitTop = hitBrick ? hitBrick.y + BRICK_PART_MAP[hitBrick.partId].height : null
  // Rendered top includes a -0.015 body inset and up to 0.1 decorative stud.
  // Tie that narrow top band to the actual brick grid height when available.
  const surfaceY = hitTop !== null && Math.abs(point.y - hitTop * PLATE_HEIGHT) <= 0.105
    ? hitTop
    : Math.max(0, Math.round(point.y / PLATE_HEIGHT))
  return {
    x: Math.round(point.x / STUD + GRID_SIZE / 2 - size.width / 2),
    y: surfaceY - lowestOffset,
    z: Math.round(point.z / STUD + GRID_SIZE / 2 - size.depth / 2),
  }
}
