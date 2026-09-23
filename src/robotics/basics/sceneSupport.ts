import { getBuildPlateSize } from '../../brick/buildPlate'
import { BRICK_PART_MAP, PLATE_HEIGHT } from '../../brick/parts'
import { selectionDrafts, type BrickState } from '../../brick/store'
import type { BrickDraft, BrickInstance } from '../../brick/types'
import { isFarDrop, type Point3 } from './farDrop'
import { isConnectorPart, settlePieces } from './support'
import { useBasicsStore } from './basicsState'

/**
 * Kid basics (Robot Workshop prototype only): the build scene's side of "parts sit on something"
 * and "no surprise far-away drops". The scene calls these from its pointer paths when the prototype
 * is on; they read the brick store's state it passes and the view the build camera publishes here.
 */

/** Everything that is not moving: the armed draft's own originals (a move, not a copy) are left out. */
export function stationaryBricks(state: Pick<BrickState, 'bricks' | 'movingId' | 'movingSelection'>): BrickInstance[] {
  const moving = new Set(state.movingSelection && !state.movingSelection.duplicate ? state.movingSelection.originals.map((brick) => brick.id) : state.movingId ? [state.movingId] : [])
  return moving.size ? state.bricks.filter((brick) => !moving.has(brick.id)) : state.bricks
}

/** A kit in hand (lane K stands it on the ground) and a lone axle or wheel (held by what it connects to) keep the studio's placement. */
export function keepsStudioPlacement(state: Pick<BrickState, 'movingSelection'>, draft: BrickDraft): boolean {
  if (state.movingSelection?.name) return true
  return (!state.movingSelection || state.movingSelection.originals.length === 1) && isConnectorPart(draft.partId)
}

/**
 * The draft's position once let go: every piece falls onto the highest thing under it at or below
 * where the pointer put it (the studio already puts it on the surface under the pointer; this only
 * drops a part aimed at the side of a brick instead of leaving it in the air beside it).
 */
export function settledPosition(state: BrickState, draft: BrickDraft, position: Pick<BrickDraft, 'x' | 'y' | 'z'>): Pick<BrickDraft, 'x' | 'y' | 'z'> {
  if (keepsStudioPlacement(state, draft)) return position
  const pieces = selectionDrafts({ draft: { ...draft, ...position }, movingSelection: state.movingSelection })
  if (!pieces.length) return position
  const settled = settlePieces(pieces, stationaryBricks(state))
  return { x: position.x, y: settled[0].y, z: position.z }
}

/** The surface height (plates) a pointer hit stands for: a brick's top when it hit that top, else the rounded hit height. */
export function surfaceHeight(point: Point3, hitBrick?: Pick<BrickInstance, 'partId' | 'y'> | null): number {
  const part = hitBrick ? BRICK_PART_MAP[hitBrick.partId] : undefined
  const hitTop = hitBrick && part ? hitBrick.y + part.height : null
  if (hitTop !== null && Math.abs(point.y - hitTop * PLATE_HEIGHT) <= 0.105) return hitTop
  return Math.max(0, Math.round(point.y / PLATE_HEIGHT))
}

type ViewSource = { position: Point3 }
let view: { camera: ViewSource; target: Point3 } | null = null

/** The build camera publishes what it looks from and at, while it is mounted (null clears). */
export function publishBuildView(camera: ViewSource | null, target?: Point3) {
  if (view && view.camera === camera && view.target === target) return
  view = camera && target ? { camera, target } : null
}

/** A pointer spot too far from the build to place at (farDrop.ts); false when the view is unknown. */
export function isFarSpot(state: Pick<BrickState, 'bricks' | 'documentMetadata' | 'movingId' | 'movingSelection'>, point: Point3): boolean {
  if (!view) return false
  return isFarDrop(view.camera.position, view.target, point, stationaryBricks(state), getBuildPlateSize(state.documentMetadata))
}

/** Remembers whether the pointer is over a far spot, for the caption at the ghost. */
export function setFarHover(far: boolean) {
  if (useBasicsStore.getState().farHover !== far) useBasicsStore.setState({ farHover: far })
}
