import type { BrickDraft, BrickInstance } from '../../brick/types'

/**
 * The second thing the shared build scene needs from the robotics layer: when the
 * armed ghost hovers a part it can connect to, where it should sit. Kept in a tiny
 * module with type-only imports so an unflagged studio pays nothing; the robotics
 * layer registers the real snapper (`model/snap.ts`) while it is mounted, and with
 * nothing registered every call answers null and placement is exactly the studio's.
 */
export type SnapPose = { x: number; y: number; z: number; rotation: 0 | 1 | 2 | 3 }
export type SnapPoint = { x: number; y: number; z: number }
export type DraftSnapper = (draft: BrickDraft, hitBrick: BrickInstance, hitPoint: SnapPoint, bricks: readonly BrickInstance[], plateSize: number) => SnapPose | null

let snapper: DraftSnapper | null = null

/** The last connector the ghost snapped to, so a blocked placement there can be explained by name. */
export type LastSnap = { partId: string; pose: SnapPose; hitBrickId: string }
let lastSnap: LastSnap | null = null

export function registerDraftSnapper(next: DraftSnapper | null) {
  snapper = next
  if (!next) lastSnap = null
}

export function snapDraft(draft: BrickDraft, hitBrick: BrickInstance, hitPoint: SnapPoint, bricks: readonly BrickInstance[], plateSize: number): SnapPose | null {
  const pose = snapper ? snapper(draft, hitBrick, hitPoint, bricks, plateSize) : null
  lastSnap = pose ? { partId: draft.partId, pose, hitBrickId: hitBrick.id } : null
  return pose
}

export function lastDraftSnap(): LastSnap | null {
  return lastSnap
}

export function clearDraftSnap() {
  lastSnap = null
}
