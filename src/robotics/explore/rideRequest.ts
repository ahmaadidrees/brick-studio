/**
 * A ride asked for from Build: the robot panel's "Ride it in Explore" opens Explore with the
 * student already on that robot's seat. The panel leaves the request here and switches to
 * Explore; the ride store takes it on the character's first frame there (`rideStore.ts`,
 * `rideAvatarFrame`) and rides. Kept in a module with no imports so the build panel does not
 * load the ride store and its physics. A request left untaken (Explore never opened) goes stale.
 */
export const RIDE_REQUEST_SECONDS = 20

let pending: { creationId: string; at: number } | null = null

export function requestRide(creationId: string, now = Date.now()) {
  pending = { creationId, at: now }
}

/** The robot to ride now, once: null when nothing was asked for or the request went stale. */
export function takeRideRequest(now = Date.now()): string | null {
  const request = pending
  pending = null
  return request && now - request.at <= RIDE_REQUEST_SECONDS * 1000 ? request.creationId : null
}

export function clearRideRequest() {
  pending = null
}
