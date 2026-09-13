import type { BrickState } from './store'
import { BRICK_STUDIO_MAX_Y } from './brickDocument'

/** Screen-space vertical dragging stays useful even in the top camera preset. */
export function verticalDragHeight(startY: number, lowestY: number, startClientY: number, clientY: number, pixelsPerPlate: number, highestY = startY) {
  const scale = Number.isFinite(pixelsPerPlate) ? Math.max(4, Math.min(40, Math.abs(pixelsPerPlate))) : 8
  const delta = Math.round((startClientY - clientY) / scale)
  return startY + Math.max(-lowestY, Math.min(BRICK_STUDIO_MAX_Y - highestY, delta))
}

/** Rejected drops restore the original selection rather than leaving an armed ghost. */
export function finishVerticalSelectionMove(store: Pick<BrickState, 'placeDraft' | 'cancelInteraction'>, commit: boolean) {
  if (commit && store.placeDraft()) return true
  store.cancelInteraction()
  return false
}
