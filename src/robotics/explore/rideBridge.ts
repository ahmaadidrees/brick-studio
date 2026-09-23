/**
 * The one seam between the Explore character (`ExplorerAvatar` in the studio scene) and
 * riding a creation (checkpoint 4). Kept in a tiny module with no imports so an unflagged
 * studio pays nothing for it: nothing registers a handler, and `exploreRideFrame` is null.
 *
 * The character calls `exploreRideFrame(body)` once per frame (after its spawn checks,
 * before it reads its keys) and does what the answer says:
 * - `null`: walk as usual;
 * - `seat`: sit at `position` facing `facingYaw` (the character controller pauses, its keys
 *   are dropped, the camera follows the body, so it follows the creation);
 * - `place`: put the character down at `position` once (a hop-off), facing `facingYaw`.
 *
 * `facingYaw` uses the character's convention: facing (sin yaw, cos yaw) on the ground.
 */
export type RideVector = { x: number; y: number; z: number }
export type RideAvatarFrame = { mode: 'seat' | 'place'; position: RideVector; facingYaw: number }
/** What the handler needs from the character's rigid body (a Rapier `RigidBody`). */
export type RideAvatarBody = { translation(): RideVector; readonly handle: number }

type Handler = (avatar: RideAvatarBody) => RideAvatarFrame | null
let handler: Handler | null = null

export function setExploreRideHandler(next: Handler | null) {
  handler = next
}

export function exploreRideFrame(avatar: RideAvatarBody): RideAvatarFrame | null {
  return handler ? handler(avatar) : null
}
