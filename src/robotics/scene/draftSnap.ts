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

export function registerDraftSnapper(next: DraftSnapper | null) {
  snapper = next
}

export function snapDraft(draft: BrickDraft, hitBrick: BrickInstance, hitPoint: SnapPoint, bricks: readonly BrickInstance[], plateSize: number): SnapPose | null {
  return snapper ? snapper(draft, hitBrick, hitPoint, bricks, plateSize) : null
}
