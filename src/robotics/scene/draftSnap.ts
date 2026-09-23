import type { BrickDraft, BrickInstance } from '../../brick/types'

/**
 * The second thing the shared build scene needs from the robotics layer: where the armed
 * ghost should sit when it is near a place it connects to. Kept in a tiny module with
 * type-only imports so an unflagged studio pays nothing; the robotics layer registers the
 * real snapper (`model/snap.ts`) while it is mounted, and with nothing registered every
 * call answers null and placement is exactly the studio's.
 *
 * The studio asks on every pointer move, over a brick or over the bare baseplate
 * (`hitBrick` null). The last answer is kept here, observable, so the scene can draw the
 * snapped ghost and its target differently, and a refused placement can be explained.
 */
export type SnapPose = { x: number; y: number; z: number; rotation: 0 | 1 | 2 | 3 }
export type SnapPoint = { x: number; y: number; z: number }
/** Which target the ghost snapped to (a socket, a wheel hole, an axle end, a plate edge). */
export type SnapTargetRef = { key: string; kind: string; brickId: string }
export type SnapResult = SnapPose & { target?: SnapTargetRef }
/** No snap, but the pointer is at a connector that cannot take the part yet (the scene says why). */
export type SnapHint = { partId: string; kind: string; brickId: string; point: SnapPoint }
export type DraftSnapper = (draft: BrickDraft, hitBrick: BrickInstance | null, hitPoint: SnapPoint, bricks: readonly BrickInstance[], plateSize: number) => SnapResult | null

let snapper: DraftSnapper | null = null

/** The last connector the ghost snapped to, so a blocked placement there can be explained by name. */
export type LastSnap = { partId: string; pose: SnapPose; targetBrickId: string; targetKey: string | null; kind: string | null }
export type DraftSnapState = { snap: LastSnap | null; hint: SnapHint | null }

let state: DraftSnapState = { snap: null, hint: null }
let pendingHint: SnapHint | null = null
const listeners = new Set<() => void>()

const samePose = (a: SnapPose, b: SnapPose) => a.x === b.x && a.y === b.y && a.z === b.z && a.rotation === b.rotation
const sameSnap = (a: LastSnap | null, b: LastSnap | null) => a === b || Boolean(a && b && a.partId === b.partId && a.targetKey === b.targetKey && a.targetBrickId === b.targetBrickId && samePose(a.pose, b.pose))
const sameHint = (a: SnapHint | null, b: SnapHint | null) => a === b || Boolean(a && b && a.partId === b.partId && a.kind === b.kind && a.brickId === b.brickId)

function publish(next: DraftSnapState) {
  if (sameSnap(next.snap, state.snap) && sameHint(next.hint, state.hint)) return
  state = { snap: sameSnap(next.snap, state.snap) ? state.snap : next.snap, hint: sameHint(next.hint, state.hint) ? state.hint : next.hint }
  for (const listener of listeners) listener()
}

export function registerDraftSnapper(next: DraftSnapper | null) {
  snapper = next
  if (!next) publish({ snap: null, hint: null })
}

export function snapDraft(draft: BrickDraft, hitBrick: BrickInstance | null, hitPoint: SnapPoint, bricks: readonly BrickInstance[], plateSize: number): SnapResult | null {
  pendingHint = null
  const pose = snapper ? snapper(draft, hitBrick, hitPoint, bricks, plateSize) : null
  const hint = pendingHint as SnapHint | null
  pendingHint = null
  publish({
    snap: pose ? { partId: draft.partId, pose: { x: pose.x, y: pose.y, z: pose.z, rotation: pose.rotation }, targetBrickId: pose.target?.brickId ?? hitBrick?.id ?? '', targetKey: pose.target?.key ?? null, kind: pose.target?.kind ?? null } : null,
    hint: pose ? null : hint,
  })
  return pose
}

/** Called by the registered snapper while it answers: why the pointer's connector cannot take the part yet. */
export function reportSnapHint(hint: SnapHint | null) {
  pendingHint = hint
}

export function lastDraftSnap(): LastSnap | null {
  return state.snap
}

export function clearDraftSnap() {
  publish({ snap: null, hint: null })
}

/** The snap state as one stable object (for `useSyncExternalStore`); replaced only when it changes. */
export function draftSnapState(): DraftSnapState {
  return state
}

export function subscribeDraftSnap(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
